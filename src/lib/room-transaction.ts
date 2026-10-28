/** ROM-01A: shared room locking, reference reads and atomic saves. No global DB is opened here. */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, auditEvents, batches, courseOfferings, courses, departments, externalCommitments, meetingRooms, meetings, rooms, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import type { Actor } from "./auth/policy";
import { conflicted, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { assessRoomEdit, normalizeRoom, positiveInteger, roomChanges, roomFit, type RoomImpactItem, type RoomMeetingUse, type RoomReferences } from "./room-records";

export type RoomReader = Pick<typeof db, "select">;
export type RoomTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface RoomResult extends ActionResult { impact?: RoomImpactItem[]; warningFingerprint?: string }
export class RoomAssignmentChanged extends Error {
  constructor(readonly reasons: string[]) { super(`Room suitability changed. ${reasons.join("; ")}. Review the room selection and try again.`); }
}
export async function roomAssignmentGuard(work: () => Promise<void>): Promise<ActionResult | null> {
  try { await work(); return null; }
  catch (error) {
    if (error instanceof RoomAssignmentChanged) return conflicted(error.message, error.reasons.map((detail) => ({ severity: "blocker", title: "Room suitability changed", detail })));
    throw error;
  }
}

/** All room-reference writers take these locks BEFORE reading suitability or writing references.
 * Meeting updates lock their meeting row first, then the sorted union of stored/new rooms.
 * Room editors never take meeting locks. No caller may acquire additional room locks out of order.
 * PostgreSQL uses row locks; PGlite serializes transactions on its single connection.
 */
export async function lockRooms(tx: RoomTransaction, roomIds: number[]) {
  const ids = [...new Set(roomIds)].sort((a, b) => a - b);
  if (!ids.length) return [];
  return tx.select().from(rooms).where(inArray(rooms.id, ids)).orderBy(asc(rooms.id)).for("update");
}

async function groupEvidence(reader: RoomReader, groupIds: number[]) {
  if (!groupIds.length) return new Map<number, { audience: string; audienceSize: number | null; audienceEvidence: Array<{ label: string; count: number | null }> }>();
  const groups = await reader.select().from(teachingGroups).where(inArray(teachingGroups.id, groupIds));
  const local = await reader.select({ groupId: teachingGroupOfferings.teachingGroupId, batchId: batches.id, label: batches.label, stream: batches.stream, count: batches.studentCount })
    .from(teachingGroupOfferings).innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId))
    .innerJoin(batches, eq(batches.id, courseOfferings.batchId)).where(inArray(teachingGroupOfferings.teachingGroupId, groupIds)).orderBy(batches.id);
  return new Map(groups.map((group) => {
    const audience = [...new Map(local.filter((row) => row.groupId === group.id).map((row) => [row.batchId, row])).values()];
    const hasExternal = !!group.externalAudienceLabel;
    const known = (audience.length > 0 || hasExternal) && audience.every((row) => row.count != null) && (!hasExternal || group.externalStudentCount != null);
    return [group.id, {
      audience: [...audience.map((row) => `${row.stream}-${row.label}`), ...(hasExternal ? [group.externalAudienceLabel!] : [])].join(" + ") || "Audience unknown",
      audienceSize: known ? audience.reduce((sum, row) => sum + row.count!, 0) + (hasExternal ? group.externalStudentCount! : 0) : null,
      audienceEvidence: [...audience.map((row) => ({ label: `${row.stream}-${row.label}`, count: row.count })), ...(hasExternal ? [{ label: group.externalAudienceLabel!, count: group.externalStudentCount }] : [])],
    }];
  }));
}

/** Every term, all room roles, active canonical events only. No getPortalData active-term filter. */
export async function readRoomReferences(reader: RoomReader, roomId: number): Promise<RoomReferences> {
  const rows = await reader.select({ id: meetings.id, teachingGroupId: meetings.teachingGroupId, termName: academicTerms.name,
    courseCode: courses.code, courseType: courses.courseType, requiredRoomCapability: courses.requiredRoomCapability,
    dayOfWeek: meetings.dayOfWeek, startMinutes: meetings.startMinutes, endMinutes: meetings.endMinutes, roomRole: meetingRooms.roomRole })
    .from(meetingRooms).innerJoin(meetings, eq(meetings.id, meetingRooms.meetingId))
    .innerJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId)).innerJoin(courses, eq(courses.id, teachingGroups.courseId))
    .innerJoin(academicTerms, eq(academicTerms.id, teachingGroups.termId))
    .where(and(eq(meetingRooms.roomId, roomId), eq(meetings.status, "active"))).orderBy(academicTerms.id, meetings.id, meetingRooms.id);
  const evidence = await groupEvidence(reader, [...new Set(rows.map((row) => row.teachingGroupId))]);
  const uses = [...new Map(rows.map((row) => [row.id, { ...row, ...evidence.get(row.teachingGroupId)! }])).values()];
  const externals = await reader.select({ id: externalCommitments.id, termName: academicTerms.name,
    counterpartDepartment: externalCommitments.counterpartDepartment, kind: externalCommitments.kind, courseLabel: externalCommitments.courseLabel,
    dayOfWeek: externalCommitments.dayOfWeek, startMinutes: externalCommitments.startMinutes, endMinutes: externalCommitments.endMinutes, audienceLabel: externalCommitments.audienceLabel })
    .from(externalCommitments).innerJoin(academicTerms, eq(academicTerms.id, externalCommitments.termId))
    .where(eq(externalCommitments.roomId, roomId)).orderBy(externalCommitments.id);
  return { meetings: uses, externals };
}

/** Caller already holds ALL involved room locks. Re-read course/audience and current rooms. */
export async function validateRoomAssignment(tx: RoomTransaction, groupId: number, roomIds: number[]) {
  const [group] = await tx.select({ courseType: courses.courseType, requiredRoomCapability: courses.requiredRoomCapability })
    .from(teachingGroups).innerJoin(courses, eq(courses.id, teachingGroups.courseId)).where(eq(teachingGroups.id, groupId));
  const evidence = (await groupEvidence(tx, [groupId])).get(groupId);
  if (!group || !evidence) throw new RoomAssignmentChanged(["Teaching group no longer exists"]);
  const current = roomIds.length ? await tx.select().from(rooms).where(inArray(rooms.id, roomIds)) : [];
  if (!roomIds.length || new Set(roomIds).size !== current.length || current.some((room) => !room.isActive)) throw new RoomAssignmentChanged(["A selected room is unavailable"]);
  const use: Pick<RoomMeetingUse, "courseType" | "requiredRoomCapability" | "audienceSize"> = { ...group, audienceSize: evidence.audienceSize };
  const reasons = current.flatMap((room) => roomFit(room, use).map((reason) => `${room.code}: ${reason}`));
  if (reasons.length) throw new RoomAssignmentChanged(reasons);
}

export async function saveRoomInTransaction(tx: RoomTransaction, actor: Actor, raw: Record<string, unknown>): Promise<RoomResult> {
  if (("roomId" in raw && typeof raw.roomId !== "string") || ("revision" in raw && typeof raw.revision !== "string")) return invalid("Invalid room or revision. Reload the room before saving.");
  const idText = typeof raw.roomId === "string" ? raw.roomId : "";
  const roomId = idText ? positiveInteger(idText) : null;
  const revision = positiveInteger(raw.revision);
  if ((idText && roomId == null) || (raw.revision && revision == null) || (roomId != null && revision == null)) return invalid("Invalid room or revision. Reload the room before saving.");
  const [existing] = roomId == null ? [] : await lockRooms(tx, [roomId]);
  if (roomId != null && !existing) return stale("This room no longer exists. Go back to Rooms.", "missing");
  if (existing && existing.revision !== revision) return stale("Someone else changed this room. Review the latest values before saving.");
  if (existing && (!Array.isArray(existing.capabilities) || existing.capabilities.some((value) => typeof value !== "string"))) return invalid("This room has unsupported legacy capability data. A directory correction needs an owner decision.");
  const departmentIds = new Set((await tx.select({ id: departments.id }).from(departments)).map((row) => row.id));
  const parsed = normalizeRoom(raw, departmentIds, existing ?? null);
  if (!parsed.ok) return invalid("Check the highlighted fields.", parsed.errors);
  const values = parsed.fields;
  const changes = existing ? roomChanges(existing, values) : null;
  if (existing && !changes!.fields.length) return succeeded("Nothing changed.", { entityId: existing.id });
  const refs = existing ? await readRoomReferences(tx, existing.id) : { meetings: [], externals: [] };
  const impact = existing ? assessRoomEdit(existing, values, refs) : [];
  if (impact.some((item) => item.severity === "blocker")) return { ...conflicted("This change would make assigned use less safe. Review the affected records.", impact.filter((item) => item.severity !== "existing").map((item) => ({ ...item, severity: item.severity as "blocker" | "warning" }))), impact };
  const warnings = impact.filter((item) => item.severity === "warning");
  const fingerprint = createHash("sha256").update(JSON.stringify({ id: roomId, revision, values, refs, warnings })).digest("hex");
  if (warnings.length && (raw.acknowledge !== "on" || raw.warningFingerprint !== fingerprint)) return {
    ...invalid("Review and acknowledge these warnings before saving."), impact, warningFingerprint: fingerprint,
  };
  const [saved] = existing
    ? await tx.update(rooms).set({ ...values, revision: existing.revision + 1 }).where(eq(rooms.id, existing.id)).returning()
    : await tx.insert(rooms).values({ ...values, revision: 1, isActive: true }).returning();
  await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
    action: existing ? "room.update" : "room.create", entity: "room", entityId: saved.id,
    before: changes?.before ?? null, after: changes?.after ?? { ...values, isActive: true },
    detail: { fields: changes?.fields ?? [...Object.keys(values), "isActive"], acknowledgedWarnings: warnings, revision: saved.revision },
  });
  return succeeded(existing ? `Room saved: ${changes!.fields.length} field${changes!.fields.length === 1 ? "" : "s"} changed.` : `Room added: ${saved.code}.`, { entityId: saved.id });
}
