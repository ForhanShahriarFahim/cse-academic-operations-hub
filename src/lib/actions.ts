"use server";

/**
 * Server actions — every mutation is validated server-side. Conflict
 * validation runs within the commit path; client-side checks are advisory
 * only (spec §18.3). All actions write an audit event.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  meetings,
  meetingTeachers,
  meetingRooms,
  teachingGroups,
  teachingGroupOfferings,
  courseOfferings,
  externalCommitments,
  scheduleVersions,
  auditEvents,
} from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getPortalData } from "./data";
import { analyzeSchedule, type Issue } from "./conflicts";
import { buildSnapshot, type MeetingView } from "./serialize";
import { parseTimeToMinutes } from "./time";

export interface ActionResult {
  ok: boolean;
  message: string;
  issues?: Pick<Issue, "severity" | "title" | "detail">[];
}

async function audit(action: string, entity: string, entityId: number | null, detail?: unknown) {
  await db.insert(auditEvents).values({
    actor: "coordinator", // auth integration pending — actor recorded for audit trail
    action,
    entity,
    entityId,
    detail: detail === undefined ? null : (detail as object),
  });
}

// ---------------------------------------------------------------------------
// Meeting creation / move / delete
// ---------------------------------------------------------------------------

async function buildCandidateView(groupId: number): Promise<MeetingView | null> {
  const [group] = await db.select().from(teachingGroups).where(eq(teachingGroups.id, groupId));
  if (!group) return null;
  const data = await getPortalData();
  const course = data.courses.find((c) => c.id === group.courseId);
  if (!course) return null;
  const links = await db.select().from(teachingGroupOfferings).where(eq(teachingGroupOfferings.teachingGroupId, groupId));
  const offerings = await Promise.all(
    links.map((l) => db.select().from(courseOfferings).where(eq(courseOfferings.id, l.offeringId)).then((r) => r[0])),
  );
  const audiences = offerings
    .map((o) => {
      const b = o ? data.batches.find((x) => x.id === o.batchId) : null;
      return b
        ? { batchId: b.id, batchLabel: b.label, stream: b.stream, semester: b.semester, studentCount: b.studentCount }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => !!a);
  return {
    id: -1,
    teachingGroupId: group.id,
    dayOfWeek: 0,
    startMinutes: 0,
    endMinutes: 0,
    courseCode: course.code,
    courseTitle: course.title,
    courseType: course.courseType,
    courseCredits: course.credits,
    requiredRoomCapability: course.requiredRoomCapability,
    owningDepartmentCode: course.owningDepartmentCode,
    deliveryMode: group.deliveryMode,
    isException: false,
    exceptionNote: null,
    customTimeLabel: null,
    highlightColor: null,
    pendingReconciliation: group.pendingReconciliation,
    teachers: [],
    rooms: [],
    audiences,
    externalAudienceLabel: group.externalAudienceLabel,
    externalStudentCount: group.externalStudentCount,
  };
}

export async function createMeetingAction(formData: FormData): Promise<ActionResult> {
  const groupId = Number(formData.get("teachingGroupId"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const start = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
  const end = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
  const teacherIds = formData.getAll("teacherIds").map((v) => Number(v)).filter((n) => n > 0);
  const roomIds = formData.getAll("roomIds").map((v) => Number(v)).filter((n) => n > 0);
  const isException = formData.get("isException") === "on";
  const exceptionNote = String(formData.get("exceptionNote") ?? "").trim() || null;
  const customTimeLabel = String(formData.get("customTimeLabel") ?? "").trim() || null;

  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, message: "Select a teaching group." };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return { ok: false, message: "Invalid day." };
  if (start == null || end == null) return { ok: false, message: "Enter valid times, e.g. 9:30 AM and 10:45 AM." };
  if (end <= start) return { ok: false, message: "End time must be after start time." };
  if (teacherIds.length === 0) return { ok: false, message: "Assign at least one teacher." };
  if (roomIds.length === 0) return { ok: false, message: "Reserve at least one room." };

  const data = await getPortalData();
  const candidate = await buildCandidateView(groupId);
  if (!candidate) return { ok: false, message: "Teaching group not found." };
  candidate.dayOfWeek = dayOfWeek;
  candidate.startMinutes = start;
  candidate.endMinutes = end;
  candidate.isException = isException;
  candidate.exceptionNote = exceptionNote;
  candidate.teachers = data.teachers
    .filter((t) => teacherIds.includes(t.id))
    .map((t) => ({
      id: t.id, shortCode: t.shortCode, fullName: t.fullName,
      homeDepartmentCode: t.homeDepartmentCode, designation: t.designation,
      isExternalCse: t.homeDepartmentCode !== "CSE", role: "instructor",
    }));
  candidate.rooms = data.rooms
    .filter((r) => roomIds.includes(r.id))
    .map((r) => ({ id: r.id, code: r.code, building: r.building, roomType: r.roomType, capabilities: r.capabilities, capacity: r.capacity }));

  const issues = analyzeSchedule({
    meetings: [...data.meetings, candidate],
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  }).filter((i) => i.meetingIds.includes(-1));
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, message: `${blockers.length} blocking conflict(s) — placement rejected.`, issues };
  }

  const [m] = await db.insert(meetings).values({
    teachingGroupId: groupId,
    dayOfWeek,
    startMinutes: start,
    endMinutes: end,
    isException,
    exceptionNote,
    customTimeLabel,
  }).returning();
  await db.insert(meetingTeachers).values(teacherIds.map((tid) => ({ meetingId: m.id, teacherId: tid })));
  await db.insert(meetingRooms).values(roomIds.map((rid) => ({ meetingId: m.id, roomId: rid })));
  await audit("meeting.create", "meeting", m.id, { groupId, dayOfWeek, start, end, teacherIds, roomIds });

  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting scheduled.", issues };
}

export async function moveMeetingAction(
  meetingId: number,
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
): Promise<ActionResult> {
  if (!Number.isInteger(meetingId)) return { ok: false, message: "Invalid meeting." };
  if (endMinutes <= startMinutes) return { ok: false, message: "End time must be after start time." };
  const data = await getPortalData();
  const existing = data.meetings.find((m) => m.id === meetingId);
  if (!existing) return { ok: false, message: "Meeting not found — it may have been changed by another user. Reload and try again." };

  const moved: MeetingView = { ...existing, dayOfWeek, startMinutes, endMinutes };
  const issues = analyzeSchedule({
    meetings: [...data.meetings.filter((m) => m.id !== meetingId), moved],
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  }).filter((i) => i.meetingIds.includes(meetingId));
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, message: `${blockers.length} blocking conflict(s) — move rejected, original placement kept.`, issues };
  }

  await db.update(meetings)
    .set({ dayOfWeek, startMinutes, endMinutes })
    .where(eq(meetings.id, meetingId));
  await audit("meeting.move", "meeting", meetingId, { dayOfWeek, startMinutes, endMinutes });
  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting moved.", issues };
}

export async function deleteMeetingAction(meetingId: number): Promise<ActionResult> {
  await db.delete(meetingTeachers).where(eq(meetingTeachers.meetingId, meetingId));
  await db.delete(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
  await db.delete(meetings).where(eq(meetings.id, meetingId));
  await audit("meeting.delete", "meeting", meetingId, null);
  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting removed from the working draft." };
}

// ---------------------------------------------------------------------------
// External commitments (OD)
// ---------------------------------------------------------------------------

export async function createExternalAction(formData: FormData): Promise<ActionResult> {
  const kind = String(formData.get("kind") ?? "");
  const counterpartDepartment = String(formData.get("counterpartDepartment") ?? "").trim();
  const teacherId = Number(formData.get("teacherId")) || null;
  const roomId = Number(formData.get("roomId")) || null;
  const dayRaw = formData.get("dayOfWeek");
  const dayOfWeek = dayRaw === "" || dayRaw == null ? null : Number(dayRaw);
  const start = formData.get("startTime") ? parseTimeToMinutes(String(formData.get("startTime"))) : null;
  const end = formData.get("endTime") ? parseTimeToMinutes(String(formData.get("endTime"))) : null;
  const courseLabel = String(formData.get("courseLabel") ?? "").trim() || null;
  const audienceLabel = String(formData.get("audienceLabel") ?? "").trim() || null;
  const creditsRaw = String(formData.get("credits") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!["teaching", "room_reservation", "combined", "unresolved_note"].includes(kind)) {
    return { ok: false, message: "Invalid commitment kind." };
  }
  if (!counterpartDepartment) return { ok: false, message: "Counterpart department is required." };
  if (kind !== "unresolved_note" && (dayOfWeek == null || start == null || end == null || end <= start)) {
    return { ok: false, message: "Structured commitments need a day and a valid time range." };
  }

  // Completeness level derived from actual data — not from the printed OD row.
  let level = "D";
  if (kind === "unresolved_note") level = "D";
  else if (kind === "room_reservation") level = teacherId ? "A" : "C";
  else if (teacherId && courseLabel && roomId && creditsRaw) level = "A";
  else if (teacherId) level = "B";
  else level = "C";

  const term = (await getPortalData()).term;
  const [row] = await db.insert(externalCommitments).values({
    termId: term.id,
    kind,
    completenessLevel: level,
    counterpartDepartment,
    teacherId,
    roomId,
    courseLabel,
    audienceLabel,
    dayOfWeek: kind === "unresolved_note" ? null : dayOfWeek,
    startMinutes: kind === "unresolved_note" ? null : start,
    endMinutes: kind === "unresolved_note" ? null : end,
    credits: creditsRaw || null,
    verificationStatus: "pending",
    source: "Manual entry via OD manager",
    notes,
  }).returning();
  await audit("external.create", "external_commitment", row.id, { kind, counterpartDepartment, level });
  revalidatePath("/", "layout");
  return { ok: true, message: `External commitment recorded (completeness level ${level}).` };
}

export async function verifyExternalAction(id: number): Promise<ActionResult> {
  await db.update(externalCommitments)
    .set({ verificationStatus: "verified", lastVerifiedAt: new Date() })
    .where(eq(externalCommitments.id, id));
  await audit("external.verify", "external_commitment", id, null);
  revalidatePath("/", "layout");
  return { ok: true, message: "Commitment verified." };
}

export async function deleteExternalAction(id: number): Promise<ActionResult> {
  await db.delete(externalCommitments).where(eq(externalCommitments.id, id));
  await audit("external.delete", "external_commitment", id, null);
  revalidatePath("/", "layout");
  return { ok: true, message: "Commitment removed." };
}

// ---------------------------------------------------------------------------
// Publication — atomic version cut with full server-side validation
// ---------------------------------------------------------------------------

export async function publishAction(changeSummary: string): Promise<ActionResult> {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return {
      ok: false,
      message: `Publication blocked — ${blockers.length} blocking issue(s) must be resolved first.`,
      issues: blockers,
    };
  }

  const [latest] = await db.select().from(scheduleVersions)
    .where(eq(scheduleVersions.termId, data.term.id))
    .orderBy(desc(scheduleVersions.versionNumber)).limit(1);
  const nextVersion = (latest?.versionNumber ?? 0) + 1;
  const snapshot = buildSnapshot({
    meetings: data.meetings,
    term: {
      id: data.term.id,
      name: data.term.name,
      academicYear: data.term.academicYear,
      effectiveFrom: data.term.effectiveFrom,
    },
    versionNumber: nextVersion,
    batches: data.batches,
    breaks: data.breaks,
      externals: data.externals,
      issues,
      metadata: data.publicationMetadata,
  });

  // Atomic state transition: supersede the old published version, insert new.
  await db.transaction(async (tx) => {
    await tx.update(scheduleVersions)
      .set({ state: "superseded", effectiveTo: data.term.effectiveFrom })
      .where(and(
        eq(scheduleVersions.termId, data.term.id),
        eq(scheduleVersions.state, "published"),
      ));
    const [v] = await tx.insert(scheduleVersions).values({
      termId: data.term.id,
      versionNumber: nextVersion,
      state: "published",
      effectiveFrom: data.term.effectiveFrom,
      publishedAt: new Date(),
      publishedBy: "CSE Coordinator",
      changeSummary: changeSummary || `Version ${nextVersion}`,
      snapshot,
    }).returning();
    await tx.insert(auditEvents).values({
      actor: "coordinator",
      action: "publish",
      entity: "schedule_version",
      entityId: v.id,
      detail: { version: nextVersion, warnings: issues.length },
    });
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Version ${nextVersion} published (${data.meetings.length} canonical meetings, ${issues.length} advisory warning(s) acknowledged).`,
  };
}
