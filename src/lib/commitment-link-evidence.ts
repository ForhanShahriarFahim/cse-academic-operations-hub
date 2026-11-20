import { and, eq, inArray } from "drizzle-orm";
import { meetingRooms, meetingTeachers, meetings, teachingGroups } from "@/db/schema";
import { meetingCoversCommitment } from "./commitment-records";
import type { RoomReader } from "./room-transaction";

type LinkedUse = {
  id: number; termId: number; linkedTeachingGroupId: number | null; lifecycleStatus: string; kind: string; teacherId: number | null; roomId: number | null;
  dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null; termStart: string | null; termEnd: string | null;
  effectiveFrom: string | null; effectiveTo: string | null;
};

/** Room views span terms, so evaluate coverage against each booking's own term bounds. */
export async function readCoveredCommitmentIds(reader: RoomReader, uses: readonly LinkedUse[]): Promise<Set<number>> {
  const linked = uses.filter((row) => row.lifecycleStatus === "active" && row.linkedTeachingGroupId !== null);
  if (!linked.length) return new Set();
  const groupIds = [...new Set(linked.map((row) => row.linkedTeachingGroupId!))];
  const candidates = await reader.select({
    meeting: meetings, deliveryMode: teachingGroups.deliveryMode, pendingReconciliation: teachingGroups.pendingReconciliation,
    termId: teachingGroups.termId, teacherId: meetingTeachers.teacherId, roomId: meetingRooms.roomId,
  }).from(meetings).innerJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId))
    .leftJoin(meetingTeachers, eq(meetingTeachers.meetingId, meetings.id)).leftJoin(meetingRooms, eq(meetingRooms.meetingId, meetings.id))
    .where(and(inArray(meetings.teachingGroupId, groupIds), eq(meetings.status, "active")));
  return new Set(linked.filter((row) => candidates.some(({ meeting, deliveryMode, pendingReconciliation, termId, teacherId, roomId }) =>
    termId === row.termId && meeting.teachingGroupId === row.linkedTeachingGroupId && meetingCoversCommitment(row, {
      ...meeting, deliveryMode, pendingReconciliation, teachers: teacherId === null ? [] : [{ id: teacherId }], rooms: roomId === null ? [] : [{ id: roomId }],
    }, row))).map((row) => row.id));
}
