/** Maintenance-versus-publication ordering only; BUG-25 owns general publication serialization. */
import { and, eq, inArray } from "drizzle-orm";
import { academicTerms, externalCommitments, meetings, roomUnavailability } from "@/db/schema";
import type { PortalData } from "./data";
import { lockRooms, RoomAssignmentChanged, type RoomTransaction } from "./room-transaction";
import { assertMaintenanceClear } from "./room-maintenance-transaction";
import { physicalOD } from "./room-maintenance";

export async function checkPublicationMaintenance(tx: RoomTransaction, candidate: Pick<PortalData, "term" | "meetings" | "externals" | "maintenance">) {
  const readOD = () => tx.select().from(externalCommitments).where(eq(externalCommitments.termId, candidate.term.id)).orderBy(externalCommitments.id);
  const beforeOD = await readOD();
  const ids = [...new Set([...candidate.meetings.flatMap((m) => m.rooms.map((r) => r.id)), ...candidate.externals.flatMap((e) => e.roomId != null && e.kind !== "teaching" ? [e.roomId] : []), ...beforeOD.flatMap((e) => e.roomId != null && e.kind !== "teaching" ? [e.roomId] : [])])];
  await lockRooms(tx, ids);
  const [term] = await tx.select().from(academicTerms).where(eq(academicTerms.id, candidate.term.id));
  if (!term || term.startDate !== candidate.term.startDate || term.endDate !== candidate.term.endDate) throw new RoomAssignmentChanged(["Term dates changed during publication. Refresh and review again"]);
  const ods = await readOD();
  if (ods.some((e) => e.roomId != null && e.kind !== "teaching" && !ids.includes(e.roomId))) throw new RoomAssignmentChanged(["Room use changed during publication. Refresh and review again"]);
  const bounds = { termStart: term.startDate, termEnd: term.endDate };
  const meetingIds = candidate.meetings.map((m) => m.id);
  const rows = meetingIds.length ? await tx.select().from(meetings).where(inArray(meetings.id, meetingIds)) : [];
  for (const meeting of candidate.meetings) {
    const current = rows.find((m) => m.id === meeting.id), original = candidate.maintenance?.meetingDates[meeting.id];
    if (!current || !original || current.effectiveFrom !== original.effectiveFrom || current.effectiveTo !== original.effectiveTo) throw new RoomAssignmentChanged([`Class #${meeting.id} date context changed; refresh before publishing`]);
    // Validate the exact candidate being frozen, using verified corresponding bounds.
    await assertMaintenanceClear(tx, meeting.rooms.map((r) => r.id), { ...bounds, ...original }, meeting);
  }
  for (const e of ods.filter((e) => e.roomId != null && e.kind !== "teaching")) await assertMaintenanceClear(tx, [e.roomId!], bounds, physicalOD(e.kind) ? e : { dayOfWeek: null, startMinutes: null, endMinutes: null });
  // The frozen projection may include a just-deleted/changed OD; validate it as well.
  for (const e of candidate.externals.filter((e) => e.roomId != null && e.kind !== "teaching")) await assertMaintenanceClear(tx, [e.roomId!], bounds, physicalOD(e.kind) ? e : { dayOfWeek: null, startMinutes: null, endMinutes: null });
  return ids.length ? (await tx.select({ id: roomUnavailability.id, revision: roomUnavailability.revision, cancelled: roomUnavailability.cancelled }).from(roomUnavailability).where(and(inArray(roomUnavailability.roomId, ids))).orderBy(roomUnavailability.id)) : [];
}
