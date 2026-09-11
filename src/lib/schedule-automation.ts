import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseOfferings, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { getPortalData } from "./data";
import { suggestSchedule, type AutoScheduleGroup } from "./auto-schedule";

export async function buildAutoSchedulePlan() {
  const data = await getPortalData();
  const [rawGroups, links] = await Promise.all([
    db.select().from(teachingGroups).where(eq(teachingGroups.termId, data.term.id)),
    db.select({ teachingGroupId: teachingGroupOfferings.teachingGroupId, batchId: courseOfferings.batchId })
      .from(teachingGroupOfferings)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId))
      .where(eq(courseOfferings.termId, data.term.id)),
  ]);
  const groups: AutoScheduleGroup[] = data.coverage.map((coverage) => {
    const raw = rawGroups.find((row) => row.id === coverage.teachingGroupId)!;
    const course = data.courses.find((row) => row.code === coverage.courseCode)!;
    const audiences = links.filter((link) => link.teachingGroupId === coverage.teachingGroupId).map((link) => data.batches.find((batch) => batch.id === link.batchId)).filter((batch): batch is NonNullable<typeof batch> => !!batch).map((batch) => ({
      batchId: batch.id,
      batchLabel: batch.label,
      stream: batch.stream,
      semester: batch.semester,
      studentCount: batch.studentCount,
    }));
    const teacherIds = [...new Set(data.allocations.filter((allocation) => allocation.teachingGroupId === coverage.teachingGroupId).map((allocation) => allocation.teacherId))];
    const teachers = data.teachers.filter((teacher) => teacherIds.includes(teacher.id)).map((teacher) => ({
      id: teacher.id,
      shortCode: teacher.shortCode,
      fullName: teacher.fullName,
      homeDepartmentCode: teacher.homeDepartmentCode,
      designation: teacher.designation,
      isExternalCse: teacher.homeDepartmentCode != null && teacher.homeDepartmentCode !== "CSE",
      role: "instructor",
    }));
    return {
      teachingGroupId: coverage.teachingGroupId,
      courseCode: coverage.courseCode,
      courseTitle: coverage.courseTitle,
      courseType: coverage.courseType,
      courseCredits: course.credits,
      owningDepartmentCode: course.owningDepartmentCode,
      requiredRoomCapability: course.requiredRoomCapability,
      deliveryMode: coverage.deliveryMode,
      pendingReconciliation: coverage.pendingReconciliation,
      externalAudienceLabel: raw.externalAudienceLabel,
      externalStudentCount: raw.externalStudentCount,
      audiences,
      teachers,
      expectedWeeklyMinutes: coverage.expectedWeeklyMinutes,
      requiredMeetings: coverage.requiredMeetings,
      scheduledMeetings: coverage.scheduledMeetings,
      scheduledMinutes: coverage.scheduledMinutes,
      status: coverage.status,
    };
  });
  const plan = suggestSchedule({
    meetings: data.meetings,
    groups,
    rooms: data.rooms.filter((room) => room.isActive).map((room) => ({ id: room.id, code: room.code, building: room.building, roomType: room.roomType, capabilities: room.capabilities, capacity: room.capacity })),
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  });
  return { data, groups, plan };
}
