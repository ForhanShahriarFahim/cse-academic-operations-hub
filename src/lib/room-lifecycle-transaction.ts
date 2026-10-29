import { and, asc, eq, inArray } from "drizzle-orm";
import { academicTerms, auditEvents, courses, externalCommitments, meetingRooms, meetings, rooms, scheduleVersions, teachingGroups } from "@/db/schema";
import type { Actor } from "./auth/policy";
import { conflicted, invalid, stale, succeeded } from "./action-result";
import { groupEvidence, lockRooms, RoomAssignmentChanged, type RoomReader, type RoomResult, type RoomTransaction } from "./room-transaction";
import { deletionReasons, dhakaToday, futureOccurrence, futureOD, lifecycleCommand, snapshotRoomEvidence } from "./room-lifecycle";
import { DAY_NAMES, fmtRange } from "./time";

export interface RoomLifecycleEvidence {
  today: string;
  totals: { meetings: number; externals: number; snapshots: number; uncertainSnapshots: number };
  blocking: Array<{ key: string; title: string; detail: string; href?: string }>;
}
export interface RoomLifecycleResult extends RoomResult { evidence?: RoomLifecycleEvidence }
/** All terms/statuses/roles, including cancelled references for deletion; no active-term shortcut. */
export async function readRoomLifecycleEvidence(reader: RoomReader, room: { id: number; code: string }, today = dhakaToday()): Promise<RoomLifecycleEvidence> {
  const rows = await reader.select({ id: meetings.id, groupId: meetings.teachingGroupId, status: meetings.status, role: meetingRooms.roomRole,
    dayOfWeek: meetings.dayOfWeek, startMinutes: meetings.startMinutes, endMinutes: meetings.endMinutes,
    effectiveFrom: meetings.effectiveFrom, effectiveTo: meetings.effectiveTo, termName: academicTerms.name, termStart: academicTerms.startDate, termEnd: academicTerms.endDate, courseCode: courses.code })
    .from(meetingRooms).innerJoin(meetings, eq(meetings.id, meetingRooms.meetingId))
    .leftJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId)).leftJoin(courses, eq(courses.id, teachingGroups.courseId))
    .leftJoin(academicTerms, eq(academicTerms.id, teachingGroups.termId)).where(eq(meetingRooms.roomId, room.id)).orderBy(meetings.id, meetingRooms.id);
  const audience = await groupEvidence(reader, [...new Set(rows.map((r) => r.groupId))]);
  const blocking: RoomLifecycleEvidence["blocking"] = [];
  for (const id of new Set(rows.map((r) => r.id))) {
    const row = rows.find((r) => r.id === id)!;
    if (row.status !== "active") continue;
    const future = futureOccurrence(row, today);
    if (future.kind === "past") continue;
    blocking.push({ key: `m${id}`, title: `Class #${id} · ${row.termName ?? "Missing term"} · ${row.courseCode ?? "Unknown course"}`,
      detail: `${audience.get(row.groupId)?.audience ?? "Audience unknown"} · ${rows.filter((r) => r.id === id).map((r) => r.role).join(", ")} · ${DAY_NAMES[row.dayOfWeek] ?? "Invalid day"} ${fmtRange(row.startMinutes, row.endMinutes)} · term ${row.termStart ?? "?"}–${row.termEnd ?? "?"} · effective ${row.effectiveFrom ?? "term start"}–${row.effectiveTo ?? "term end"} · ${future.kind === "future" ? `First blocking date ${future.firstDate}` : future.reason}` });
  }
  const externals = await reader.select({ id: externalCommitments.id, termName: academicTerms.name, termStart: academicTerms.startDate, termEnd: academicTerms.endDate,
    kind: externalCommitments.kind, counterpart: externalCommitments.counterpartDepartment, course: externalCommitments.courseLabel,
    dayOfWeek: externalCommitments.dayOfWeek, startMinutes: externalCommitments.startMinutes, endMinutes: externalCommitments.endMinutes })
    .from(externalCommitments).leftJoin(academicTerms, eq(academicTerms.id, externalCommitments.termId)).where(eq(externalCommitments.roomId, room.id)).orderBy(externalCommitments.id);
  for (const row of externals) {
    const future = futureOD(row, today);
    if (future.kind !== "past") blocking.push({ key: `e${row.id}`, title: `OD #${row.id} · ${row.termName ?? "Missing term"} · ${row.counterpart} · ${row.course ?? row.kind}`,
      detail: `${row.dayOfWeek == null ? "Day unknown" : DAY_NAMES[row.dayOfWeek] ?? "Invalid day"} · ${row.startMinutes != null && row.endMinutes != null ? fmtRange(row.startMinutes, row.endMinutes) : "Time unknown"} · term ${row.termStart ?? "?"}–${row.termEnd ?? "?"} · ${future.kind === "future" ? `First blocking date ${future.firstDate}` : future.reason}`, href: "/od" });
  }
  const aliases = new Set([room.code]);
  const audits = await reader.select({ before: auditEvents.before, after: auditEvents.after }).from(auditEvents).where(and(eq(auditEvents.entity, "room"), eq(auditEvents.entityId, room.id)));
  for (const event of audits) for (const values of [event.before, event.after]) {
    const code = (values as { code?: unknown } | null)?.code;
    if (typeof code === "string") aliases.add(code);
  }
  let snapshots = 0, uncertainSnapshots = 0;
  for (const version of await reader.select({ snapshot: scheduleVersions.snapshot }).from(scheduleVersions)) {
    const evidence = snapshotRoomEvidence(version.snapshot, room.id, [...aliases]);
    if (evidence === "reference") snapshots++;
    if (evidence === "uncertain") uncertainSnapshots++;
  }
  return { today, totals: { meetings: rows.length, externals: externals.length, snapshots, uncertainSnapshots }, blocking };
}
export async function lifecycleRoomInTransaction(tx: RoomTransaction, actor: Actor, raw: Record<string, unknown>): Promise<RoomLifecycleResult> {
  const command = lifecycleCommand(raw);
  if (!command) return invalid("Choose an explicit action and a valid room/revision; enter a reason of 1–300 characters.", typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.trim().length > 300 ? { reason: ["Enter a reason of 1–300 characters."] } : {});
  const [room] = await lockRooms(tx, [command.roomId]);
  if (!room) return stale("This room no longer exists. Return to Rooms.", "missing");
  if (room.revision !== command.revision) return stale("Someone else changed this room. Reload the latest record before continuing.");
  if (command.action !== "delete" && room.isActive === (command.action === "reactivate")) return succeeded(`Nothing changed. Room is already ${room.isActive ? "active" : "inactive"}.`, { entityId: room.id });
  const evidence = command.action === "reactivate" ? null : await readRoomLifecycleEvidence(tx, room, dhakaToday());
  if (command.action === "deactivate" && evidence!.blocking.length) return { evidence: evidence!, ...conflicted(`${evidence!.blocking.length} current/future or unverified use record(s) prevent deactivation. Review all references on this page.`, [{ severity: "blocker", title: "Current/future or unverified use", detail: `${evidence!.blocking.length} records; see the paged evidence list above.` }]) };
  if (command.action === "delete") {
    if (command.confirmation !== room.code.trim().toUpperCase()) return invalid("Type the exact canonical room code to confirm permanent deletion.", { confirmation: ["The code does not match."] });
    const reasons = deletionReasons(room, evidence!.totals);
    if (reasons.length) return { evidence: evidence!, ...conflicted("This room must be kept. Review the references; deactivate when safe.", reasons.map((detail) => ({ severity: "blocker", title: "Deletion refused", detail }))) };
    await tx.delete(rooms).where(eq(rooms.id, room.id));
  } else await tx.update(rooms).set({ isActive: command.action === "reactivate", revision: room.revision + 1 }).where(eq(rooms.id, room.id));
  await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
    action: `room.${command.action}`, entity: "room", entityId: room.id,
    before: command.action === "delete" ? room : { isActive: room.isActive, revision: room.revision },
    after: command.action === "delete" ? null : { isActive: command.action === "reactivate", revision: room.revision + 1 },
    detail: { reason: command.reason, today: evidence?.today ?? dhakaToday(), revision: room.revision + (command.action === "delete" ? 0 : 1) } });
  return succeeded(`Room ${room.code} ${command.action === "delete" ? "permanently deleted" : command.action === "deactivate" ? "deactivated" : "reactivated"}.`, { entityId: room.id });
}
/** Caller holds the complete sorted room union. Reading here is authoritative after locks. */
export async function assertActiveRooms(tx: RoomTransaction, ids: number[]) {
  const unique = [...new Set(ids)];
  const current = unique.length ? await tx.select().from(rooms).where(inArray(rooms.id, unique)) : [];
  if (current.length !== unique.length || current.some((r) => !r.isActive)) throw new RoomAssignmentChanged(["A selected room is inactive or missing. Replace/remove it, or refresh room choices before trying again"]);
  return current;
}
export async function retainAssignedRooms(tx: RoomTransaction, actor: Actor, ids: number[], source: string) {
  for (const room of await assertActiveRooms(tx, ids)) if (room.isDraft) {
    await tx.update(rooms).set({ isDraft: false, revision: room.revision + 1 }).where(eq(rooms.id, room.id));
    await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action: "room.retain", entity: "room", entityId: room.id,
      before: { isDraft: true, revision: room.revision }, after: { isDraft: false, revision: room.revision + 1 }, detail: { reason: `First successful assignment: ${source}` } });
  }
}
/** Multi-move contract: ALL meetings ascending, fresh assignments, then ALL rooms ascending. */
export async function lockMoveRooms(tx: RoomTransaction, meetingIds: number[]) {
  const ids = [...new Set(meetingIds)].sort((a, b) => a - b);
  if (!ids.length) return;
  const current = await tx.select().from(meetings).where(inArray(meetings.id, ids)).orderBy(asc(meetings.id)).for("update");
  if (current.length !== ids.length) throw new RoomAssignmentChanged(["A class no longer exists; reload the placements"]);
  const assigned = await tx.select({ roomId: meetingRooms.roomId }).from(meetingRooms).where(inArray(meetingRooms.meetingId, ids));
  const roomIds = assigned.map((r) => r.roomId);
  await lockRooms(tx, roomIds);
  await assertActiveRooms(tx, roomIds);
}
