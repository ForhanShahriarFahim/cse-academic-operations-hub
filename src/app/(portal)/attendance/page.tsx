import { AttendanceManager } from "@/components/attendance-manager";
import { PageHeader } from "@/components/ui";
import { getAttendanceData } from "@/lib/academic-operations";
import { can, requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const query = await searchParams;
  const requestedGroup = query.group ? Number(query.group) : undefined;
  const source = await getAttendanceData(requestedGroup);
  const actor = await requireActor();
  const canManageRosters = source.selectedGroup
    ? await can(actor, "manage_rosters", { kind: "teaching_group", teachingGroupId: source.selectedGroup.id }) : false;
  const canTakeAttendance = source.selectedGroup
    ? await can(actor, "take_attendance", { kind: "teaching_group", teachingGroupId: source.selectedGroup.id }) : false;
  return <div>
    <PageHeader
      context="Classes"
      title="Attendance"
      description="Keep each teaching group's roster, record attendance for Midterm and Final sessions, and see each student's totals. Students from other departments can join any group."
    />
    {source.selectedGroup ? <AttendanceManager
      groups={source.groups}
      selectedGroup={source.selectedGroup}
      teachers={source.data.teachers.filter((teacher) => source.selectedGroup?.teacherIds.includes(teacher.id))}
      canManageRosters={canManageRosters}
      canTakeAttendance={canTakeAttendance}
      roster={source.roster}
      sessions={source.sessions}
      summaries={source.summaries}
      termStart={source.data.term.startDate}
      termEnd={source.data.term.endDate}
    /> : <p>No teaching groups are available.</p>}
  </div>;
}
