/** Shared transaction seams. Mutations lock parent room, then entry; never meeting rows. */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { academicTerms, auditEvents, courses, externalCommitments, meetingRooms, meetings, rooms, roomUnavailability, scheduleVersions, teachingGroups } from "@/db/schema";
import type { Actor } from "./auth/policy";
import { invalid, stale, succeeded, type ActionResult } from "./action-result";
import { lockRooms, RoomAssignmentChanged, type RoomReader, type RoomTransaction } from "./room-transaction";
import { positiveInteger } from "./room-records";
import { snapshotRoomEvidence } from "./room-lifecycle";
import { maintenanceOverlap, normalizedMaintenance, overlappingMaintenance, physicalOD, type DateBounds, type MaintenanceValues } from "./room-maintenance";
import { DAY_NAMES, fmtRange } from "./time";

export interface MaintenanceImpactItem { key: string; kind: "meeting" | "physicalOD" | "uncertainOD" | "publication"; label: string; detail: string; href: string }
export interface MaintenanceImpact {
  items: MaintenanceImpactItem[];
  totals: Record<MaintenanceImpactItem["kind"], number>;
  overlapping: number[];
}
export interface MaintenanceResult extends ActionResult { impact?: MaintenanceImpact; fingerprint?: string }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const valuesOf = (entry: MaintenanceValues): MaintenanceValues => ({ startDate: entry.startDate, endDate: entry.endDate, weekdays: [...entry.weekdays].sort(), startMinutes: entry.startMinutes, endMinutes: entry.endMinutes, reason: entry.reason });
export async function readMaintenanceImpact(reader: RoomReader, room: { id: number; code: string }, values: MaintenanceValues, excludeId?: number) {
  const refs = await reader.select({ id: meetings.id, groupId: meetings.teachingGroupId, role: meetingRooms.roomRole, dayOfWeek: meetings.dayOfWeek, startMinutes: meetings.startMinutes, endMinutes: meetings.endMinutes, effectiveFrom: meetings.effectiveFrom, effectiveTo: meetings.effectiveTo,
    termId: academicTerms.id, termName: academicTerms.name, termStart: academicTerms.startDate, termEnd: academicTerms.endDate, courseCode: courses.code })
    .from(meetingRooms).innerJoin(meetings, eq(meetings.id, meetingRooms.meetingId)).innerJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId))
    .innerJoin(academicTerms, eq(academicTerms.id, teachingGroups.termId)).innerJoin(courses, eq(courses.id, teachingGroups.courseId))
    .where(and(eq(meetingRooms.roomId, room.id), eq(meetings.status, "active"))).orderBy(meetings.id, meetingRooms.id);
  const ods = await reader.select({ id: externalCommitments.id, kind: externalCommitments.kind, dayOfWeek: externalCommitments.dayOfWeek, startMinutes: externalCommitments.startMinutes, endMinutes: externalCommitments.endMinutes,
    termId: academicTerms.id, termName: academicTerms.name, termStart: academicTerms.startDate, termEnd: academicTerms.endDate, course: externalCommitments.courseLabel, counterpart: externalCommitments.counterpartDepartment, verification: externalCommitments.verificationStatus })
    .from(externalCommitments).innerJoin(academicTerms, eq(academicTerms.id, externalCommitments.termId)).where(eq(externalCommitments.roomId, room.id)).orderBy(externalCommitments.id);
  const versions = await reader.select({ id: scheduleVersions.id, termId: scheduleVersions.termId, number: scheduleVersions.versionNumber, snapshot: scheduleVersions.snapshot, effectiveFrom: scheduleVersions.effectiveFrom,
    termName: academicTerms.name, termStart: academicTerms.startDate, termEnd: academicTerms.endDate })
    .from(scheduleVersions).innerJoin(academicTerms, eq(academicTerms.id, scheduleVersions.termId)).where(eq(scheduleVersions.state, "published")).orderBy(desc(scheduleVersions.versionNumber), desc(scheduleVersions.id));
  const history = await reader.select({ before: auditEvents.before, after: auditEvents.after }).from(auditEvents).where(and(eq(auditEvents.entity, "room"), eq(auditEvents.entityId, room.id))).orderBy(auditEvents.id);
  const aliases = [room.code];
  for (const event of history) for (const value of [event.before, event.after]) { const code = (value as { code?: unknown } | null)?.code; if (typeof code === "string") aliases.push(code); }
  const items: MaintenanceImpactItem[] = [];
  for (const ref of [...new Map(refs.map((r) => [r.id, r])).values()]) {
    const overlap = maintenanceOverlap(values, ref);
    if (overlap.kind !== "clear") items.push({ key: `m${ref.id}`, kind: "meeting", label: `Class #${ref.id} · ${ref.termName} · ${ref.courseCode}`, detail: `${DAY_NAMES[ref.dayOfWeek]} ${fmtRange(ref.startMinutes, ref.endMinutes)} · ${refs.filter((r) => r.id === ref.id).map((r) => r.role).join(", ")} · ${overlap.kind === "overlap" ? `First overlap ${overlap.firstDate}; ${overlap.occurrences} occurrence(s)` : overlap.reason}`, href: "/routine" });
  }
  for (const od of ods) {
    if (od.kind === "teaching") continue;
    const overlap = maintenanceOverlap(values, { ...od, ...(!physicalOD(od.kind) ? { dayOfWeek: null, startMinutes: null, endMinutes: null } : {}) });
    if (overlap.kind !== "clear") items.push({ key: `e${od.id}`, kind: physicalOD(od.kind) && overlap.kind === "overlap" ? "physicalOD" : "uncertainOD", label: `OD #${od.id} · ${od.termName} · ${od.counterpart} · ${od.course ?? od.kind}`, detail: overlap.kind === "overlap" ? `First overlap ${overlap.firstDate}; ${overlap.occurrences} occurrence(s) · ${od.verification}` : overlap.reason, href: "/od" });
  }
  const seenTerms = new Set<number>();
  const currentVersions = versions.filter((v) => { if (seenTerms.has(v.termId)) return false; seenTerms.add(v.termId); return true; });
  for (const version of currentVersions) {
    const overlap = maintenanceOverlap(values, { ...version, dayOfWeek: null, startMinutes: null, endMinutes: null });
    const evidence = snapshotRoomEvidence(version.snapshot, room.id, aliases);
    if (overlap.kind !== "clear" && evidence !== "clear") items.push({ key: `v${version.id}`, kind: "publication", label: `${version.termName} · current publication v${version.number}`, detail: "Potential/unverified impact: frozen publications lack occurrence bounds. Review a replacement separately; saved screen, CSV and print remain unchanged.", href: "/publications" });
  }
  const entries = await reader.select().from(roomUnavailability).where(eq(roomUnavailability.roomId, room.id)).orderBy(roomUnavailability.id);
  const impact: MaintenanceImpact = { items, totals: { meeting: 0, physicalOD: 0, uncertainOD: 0, publication: 0 }, overlapping: entries.filter((e) => e.id !== excludeId && overlappingMaintenance(values, e)).map((e) => e.id) };
  for (const item of items) impact.totals[item.kind]++;
  // Bind raw date/use evidence too, including newly changed uncertainty, not just display summaries.
  return { impact, evidence: { refs, ods, versions: currentVersions, entries } };
}
export async function saveMaintenanceInTransaction(tx: RoomTransaction, actor: Actor, raw: Record<string, unknown>): Promise<MaintenanceResult> {
  const roomId = positiveInteger(raw.roomId), revision = positiveInteger(raw.revision);
  const action = raw.action;
  const id = raw.entryId === "" || raw.entryId == null ? null : positiveInteger(raw.entryId);
  if (!roomId || !revision || typeof action !== "string" || !["create", "edit", "cancel"].includes(action) || (action !== "create" && (!id || !positiveInteger(raw.entryRevision))) || (action === "create" && id != null)) return invalid("Invalid maintenance command. Reload the room and try again.");
  const correctionReason = typeof raw.correctionReason === "string" ? raw.correctionReason.trim() : "";
  if (action !== "create" && (!correctionReason || correctionReason.length > 300)) return invalid("Enter a correction reason.", { correctionReason: ["Enter a correction reason of 1–300 characters."] });
  const parsed = action === "cancel" ? null : normalizedMaintenance(raw);
  if (parsed && !parsed.values) return invalid("Check the highlighted maintenance fields.", parsed.errors);
  const [room] = await lockRooms(tx, [roomId]);
  if (!room) return stale("This room no longer exists.", "missing");
  const [entry] = id ? await tx.select().from(roomUnavailability).where(and(eq(roomUnavailability.id, id), eq(roomUnavailability.roomId, roomId))).for("update") : [];
  if (action !== "create" && !entry) return stale("This maintenance record no longer exists.", "missing");
  if (entry?.cancelled && action === "cancel") return succeeded("Already cancelled. History is retained.", { entityId: entry.id });
  if (room.revision !== revision || (entry && entry.revision !== positiveInteger(raw.entryRevision))) return stale("Room or maintenance changed. Reload the latest record and review again; your input is kept.");
  if (entry?.cancelled) return invalid("Cancelled records cannot be edited or reinstated. Add a new outage.");
  const values = parsed?.values;
  if (entry && values && JSON.stringify(valuesOf(entry)) === JSON.stringify(values)) return succeeded("Nothing changed.", { entityId: entry.id });
  let impact: MaintenanceImpact | undefined;
  if (values) {
    const review = await readMaintenanceImpact(tx, room, values, id ?? undefined);
    impact = review.impact;
    const fingerprint = hash({ room: { id: room.id, revision: room.revision }, entry, values, correctionReason, evidence: review.evidence });
    if (impact.items.length && (raw.acknowledge !== "on" || raw.fingerprint !== fingerprint)) return { ...invalid("Review the current bookings and explicitly confirm saving despite them. Changed evidence requires a fresh review."), impact, fingerprint };
  } else if (raw.confirmCancellation !== "on") return invalid("Confirm cancellation. The record and its reasons will be retained.");
  const [saved] = entry ? await tx.update(roomUnavailability).set({ ...(values ?? { cancelled: true }), revision: entry.revision + 1, updatedAt: new Date() }).where(eq(roomUnavailability.id, entry.id)).returning()
    : await tx.insert(roomUnavailability).values({ roomId, ...values! }).returning();
  await tx.update(rooms).set({ isDraft: false, revision: room.revision + 1 }).where(eq(rooms.id, roomId));
  const audit = { actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", entity: "room", entityId: roomId };
  if (room.isDraft) await tx.insert(auditEvents).values({ ...audit, action: "room.retain", before: { isDraft: true, revision: room.revision }, after: { isDraft: false, revision: room.revision + 1 }, detail: { reason: "First maintenance use" } });
  await tx.insert(auditEvents).values({ ...audit, action: `room.maintenance.${action}`, before: entry ?? null, after: saved, detail: { reason: correctionReason || values?.reason, entryId: saved.id, revision: room.revision + 1, impact, publicationAdvisory: (impact?.totals.publication ?? 0) > 0 } });
  return { ...succeeded(`Maintenance ${action === "cancel" ? "cancelled; history retained" : "saved"}.${impact?.overlapping.length ? ` Warning: overlaps maintenance ${impact.overlapping.map((id) => `#${id}`).join(", ")}; minutes are unioned.` : ""}${impact?.totals.publication ? " Affected published routines may need a separately reviewed replacement." : ""}`, { entityId: saved.id }), impact };
}

/** Parent rooms must already be locked. Fresh checks use stored bounds for existing placements. */
export async function assertMaintenanceClear(tx: RoomTransaction, roomIds: number[], bounds: DateBounds, use: { dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null }) {
  if (!roomIds.length) return [];
  const entries = await tx.select().from(roomUnavailability).where(and(inArray(roomUnavailability.roomId, roomIds), eq(roomUnavailability.cancelled, false))).orderBy(asc(roomUnavailability.id));
  const reasons = entries.flatMap((entry) => {
    const overlap = maintenanceOverlap(entry, { ...bounds, ...use });
    return overlap.kind === "clear" ? [] : [`Room #${entry.roomId} maintenance #${entry.id}: ${overlap.kind === "overlap" ? `${overlap.firstDate}–${overlap.lastDate} ${fmtRange(entry.startMinutes, entry.endMinutes)}` : overlap.reason} · ${entry.reason} · /rooms/${entry.roomId}/maintenance`];
  });
  if (reasons.length) throw new RoomAssignmentChanged(reasons);
  return entries.map((e) => ({ id: e.id, revision: e.revision }));
}
export async function assertGroupMaintenanceClear(tx: RoomTransaction, groupId: number, roomIds: number[], use: { dayOfWeek: number; startMinutes: number; endMinutes: number }, meetingId?: number) {
  const [term] = await tx.select({ termStart: academicTerms.startDate, termEnd: academicTerms.endDate }).from(teachingGroups).innerJoin(academicTerms, eq(academicTerms.id, teachingGroups.termId)).where(eq(teachingGroups.id, groupId));
  const [meeting] = meetingId ? await tx.select({ effectiveFrom: meetings.effectiveFrom, effectiveTo: meetings.effectiveTo }).from(meetings).where(eq(meetings.id, meetingId)) : [];
  return assertMaintenanceClear(tx, roomIds, { termStart: term?.termStart ?? null, termEnd: term?.termEnd ?? null, ...meeting }, use);
}
export async function assertMeetingMaintenanceClear(tx: RoomTransaction, meetingId: number, use: { dayOfWeek?: number; startMinutes: number; endMinutes: number }) {
  const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new RoomAssignmentChanged(["The class no longer exists"]);
  const assigned = await tx.select().from(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
  return assertGroupMaintenanceClear(tx, meeting.teachingGroupId, assigned.map((r) => r.roomId), { ...use, dayOfWeek: use.dayOfWeek ?? meeting.dayOfWeek }, meetingId);
}
