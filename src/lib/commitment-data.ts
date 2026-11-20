/**
 * OD-01A — reads for the commitment register, edit form and history (D-1, D-2, D-6).
 * Every read requires `manage_external_commitments` and stays in the current
 * active term, matching the write actions.
 */
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, externalCommitments, rooms, teachers, workloadAllocations } from "@/db/schema";
import { authorize, can, getOptionalActor } from "./auth";
import { getPortalData } from "./data";
import {
  FIELD_LABELS, HISTORY_ACTIONS, availableCommands, blocksText, choiceOf, completenessLevel, levelSummary, reviewReasons, scheduleText,
  type ClashMeeting, type LifecycleCommand, type LinkMeeting,
} from "./commitment-records";
import { DAY_NAMES, fmtTime } from "./time";

const CAPABILITY = "manage_external_commitments" as const;

export async function requireCommitmentManager(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await can(actor, CAPABILITY)) redirect("/forbidden");
  return actor;
}

export interface CommitmentRow {
  id: number; kind: string; choice: string; lifecycleStatus: string; verificationStatus: string; revision: number;
  counterpartDepartment: string; teacherId: number | null; teacherCode: string | null; teacherName: string | null;
  roomId: number | null; roomCode: string | null; dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null;
  effectiveFrom: string | null; effectiveTo: string | null;
  linkedTeachingGroupId: number | null; linkedCoverage: boolean; carriedFromTermId: number | null; carriedFromCommitmentId: number | null;
  schedule: string | null; courseLabel: string | null; audienceLabel: string | null; credits: string | null; notes: string | null; source: string | null;
  storedLevel: string; derivedLevel: string; levelText: string; blocks: string; reviewReasons: string[];
  lastVerifiedAt: string | null; verificationNote: string | null; archivedAt: string | null; archiveReason: string | null;
  workload: Array<{ shortCode: string; units: string }>; commands: LifecycleCommand[];
  /** Form values in the shape the guided form submits. */
  form: { startTime: string; endTime: string };
}

/** HH:MM for a native time input. */
const timeValue = (minutes: number | null) => (minutes == null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);

async function rowsFor(termId: number, covered: number[]): Promise<CommitmentRow[]> {
  const base = eq(externalCommitments.termId, termId);
  const records = await db.select({ e: externalCommitments, teacherCode: teachers.shortCode, teacherName: teachers.fullName, roomCode: rooms.code })
    .from(externalCommitments)
    .leftJoin(teachers, eq(teachers.id, externalCommitments.teacherId))
    .leftJoin(rooms, eq(rooms.id, externalCommitments.roomId))
    .where(base)
    .orderBy(asc(externalCommitments.dayOfWeek), asc(externalCommitments.startMinutes), asc(externalCommitments.id));
  const ids = records.map((r) => r.e.id);
  const allocations = ids.length
    ? await db.select({ id: workloadAllocations.externalCommitmentId, shortCode: teachers.shortCode, units: workloadAllocations.units })
      .from(workloadAllocations).innerJoin(teachers, eq(teachers.id, workloadAllocations.teacherId))
      .where(inArray(workloadAllocations.externalCommitmentId, ids)).orderBy(asc(teachers.shortCode))
    : [];
  return records.map(({ e, teacherCode, teacherName, roomCode }) => {
    const facts = { kind: e.kind as never, teacherId: e.teacherId, roomId: e.roomId, courseLabel: e.courseLabel, credits: e.credits };
    const derived = completenessLevel(facts);
    return {
      id: e.id, kind: e.kind, choice: choiceOf(e.kind)?.short ?? e.kind, lifecycleStatus: e.lifecycleStatus, verificationStatus: e.verificationStatus,
      revision: e.revision, counterpartDepartment: e.counterpartDepartment, teacherId: e.teacherId, teacherCode, teacherName,
      roomId: e.roomId, roomCode, dayOfWeek: e.dayOfWeek, startMinutes: e.startMinutes, endMinutes: e.endMinutes, schedule: scheduleText(e),
      effectiveFrom: e.effectiveFrom, effectiveTo: e.effectiveTo,
      linkedTeachingGroupId: e.linkedTeachingGroupId, linkedCoverage: covered.includes(e.id), carriedFromTermId: e.carriedFromTermId, carriedFromCommitmentId: e.carriedFromCommitmentId,
      courseLabel: e.courseLabel, audienceLabel: e.audienceLabel, credits: e.credits, notes: e.notes, source: e.source,
      storedLevel: e.completenessLevel, derivedLevel: derived, levelText: levelSummary(e.completenessLevel, facts),
      blocks: covered.includes(e.id) ? "Covered by the formal meeting" : blocksText(e, { teacher: teacherCode, room: roomCode }), reviewReasons: reviewReasons(e),
      lastVerifiedAt: e.lastVerifiedAt?.toISOString() ?? null, verificationNote: e.verificationNote,
      archivedAt: e.archivedAt?.toISOString() ?? null, archiveReason: e.archiveReason,
      workload: allocations.filter((a) => a.id === e.id).map(({ shortCode, units }) => ({ shortCode, units })),
      commands: availableCommands(e), form: { startTime: timeValue(e.startMinutes), endTime: timeValue(e.endMinutes) },
    };
  });
}

export interface FormOptions {
  teachers: Array<{ id: number; shortCode: string; fullName: string; homeDepartmentCode: string | null }>;
  rooms: Array<{ id: number; code: string }>;
  meetings: Array<ClashMeeting & LinkMeeting>;
  bounds: { termStart: string; termEnd: string };
}

/** The register and the form options for the current active term. */
export async function getCommitmentWorkspace() {
  await authorize(CAPABILITY);
  const data = await getPortalData();
  const rows = await rowsFor(data.term.id, data.coveredCommitmentIds ?? []);
  const options: FormOptions = {
    bounds: { termStart: data.term.startDate, termEnd: data.term.endDate },
    teachers: data.teachers.filter((t) => t.status !== "inactive").map((t) => ({ id: t.id, shortCode: t.shortCode, fullName: t.fullName, homeDepartmentCode: t.homeDepartmentCode })),
    rooms: data.rooms.filter((r) => r.isActive).map((r) => ({ id: r.id, code: r.code })),
    meetings: data.meetings.map((m) => ({ id: m.id, dayOfWeek: m.dayOfWeek, startMinutes: m.startMinutes, endMinutes: m.endMinutes, courseCode: m.courseCode,
      teachingGroupId: m.teachingGroupId, deliveryMode: m.deliveryMode, pendingReconciliation: m.pendingReconciliation,
      ...data.maintenance?.meetingDates[m.id],
      teachers: m.teachers.map((t) => ({ id: t.id, shortCode: t.shortCode })), rooms: m.rooms.map((r) => ({ id: r.id, code: r.code })),
      audience: m.audiences.map((a) => a.batchLabel).join(" + ") || m.externalAudienceLabel || "" })),
  };
  return { term: data.term, writeContext: data.writeContext, rows, options };
}

/** One record of the current active term, or null when missing or in another term. */
export async function getCommitment(id: number) {
  const workspace = await getCommitmentWorkspace();
  const row = workspace.rows.find((r) => r.id === id) ?? null;
  return row ? { ...workspace, row } : null;
}

export interface HistoryEvent {
  id: number; at: string; actor: string; action: string; label: string;
  reason: string | null; changes: Array<{ field: string; before: string; after: string }>; returnedToPending: boolean; note: string | null;
}

/** D-6: audit events for one commitment of the current term, newest first. */
export async function getCommitmentHistory(id: number): Promise<{ row: CommitmentRow; events: HistoryEvent[] } | null> {
  const found = await getCommitment(id);
  if (!found) return null;
  const names = new Map<string, string>();
  const events = await db.select().from(auditEvents)
    .where(and(eq(auditEvents.entity, "external_commitment"), eq(auditEvents.entityId, id)))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(200);
  const ids = (key: "teacherId" | "roomId") => [...new Set(events.flatMap((e) => [e.before, e.after].map((v) => (v as Record<string, unknown> | null)?.[key]).filter((v): v is number => typeof v === "number")))];
  const teacherIds = ids("teacherId"), roomIds = ids("roomId");
  for (const t of teacherIds.length ? await db.select({ id: teachers.id, code: teachers.shortCode }).from(teachers).where(inArray(teachers.id, teacherIds)) : []) names.set(`teacherId:${t.id}`, t.code);
  for (const r of roomIds.length ? await db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, roomIds)) : []) names.set(`roomId:${r.id}`, r.code);
  const show = (field: string, value: unknown): string => {
    if (value == null || value === "") return "—";
    if (field === "teacherId" || field === "roomId") return names.get(`${field}:${value}`) ?? `#${value}`;
    if (field === "dayOfWeek") return DAY_NAMES[Number(value)] ?? String(value);
    if (field === "startMinutes" || field === "endMinutes") return fmtTime(Number(value));
    if (field === "kind") return choiceOf(String(value))?.short ?? String(value);
    return String(value);
  };
  return {
    row: found.row,
    events: events.map((e) => {
      const before = (e.before ?? {}) as Record<string, unknown>, after = (e.after ?? {}) as Record<string, unknown>;
      const detail = (e.detail ?? {}) as { changed?: string[]; returnedToPending?: boolean; reason?: string; note?: string };
      const changed = detail.changed ?? [];
      return {
        id: e.id, at: e.at.toISOString(), actor: e.actorDisplayName ?? e.actor, action: e.action,
        label: HISTORY_ACTIONS[e.action] ?? e.action,
        reason: detail.reason ?? null, note: detail.note ?? null, returnedToPending: detail.returnedToPending === true,
        changes: changed.map((field) => ({ field: FIELD_LABELS[field] ?? field, before: show(field, before[field]), after: show(field, after[field]) })),
      };
    }),
  };
}
