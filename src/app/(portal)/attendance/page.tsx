import { AttendanceManager } from "@/components/attendance-manager";
import { PageHeader } from "@/components/ui";
import { getAttendanceData } from "@/lib/academic-operations";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const query = await searchParams;
  const requestedGroup = query.group ? Number(query.group) : undefined;
  const source = await getAttendanceData(requestedGroup);
  return <div>
    <PageHeader
      kicker="Classroom operations"
      title="Attendance"
      description="Import or edit a loosely coupled roster, take attendance with one smooth grid, and see midterm, final-term and full-semester totals. Other-department students can enroll in any local or merged teaching group."
    />
    {source.selectedGroup ? <AttendanceManager
      groups={source.groups}
      selectedGroup={source.selectedGroup}
      teachers={source.data.teachers}
      roster={source.roster}
      sessions={source.sessions}
      summaries={source.summaries}
      termStart={source.data.term.startDate}
      termEnd={source.data.term.endDate}
    /> : <p>No teaching groups are available.</p>}
  </div>;
}
