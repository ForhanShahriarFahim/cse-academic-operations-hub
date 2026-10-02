import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseOfferings, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { getPortalData } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { RoutineExportMenu, RoutineWorkbench, type WorkbenchGroup } from "@/components/routine-workbench/workbench";
import { RoutineDocument } from "@/components/routine-document";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { draftRoutineSource } from "@/lib/routine-sources";
import { streamDays } from "@/lib/time-grid";
import type { GroupTemplate } from "@/lib/routine-workbench";

export const dynamic = "force-dynamic";

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPortalData();
  const source = draftRoutineSource(data);
  const { selection } = parseRoutineSelection(await searchParams, source);
  const projection = projectRoutine({ source, selection });

  const [links, groupRows] = await Promise.all([
    db.select({ teachingGroupId: teachingGroupOfferings.teachingGroupId, batchId: courseOfferings.batchId })
      .from(teachingGroupOfferings)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId)),
    db.select().from(teachingGroups),
  ]);

  // Everything needed to place a class for each teaching group, built once for the browser's pre-check.
  const groups: WorkbenchGroup[] = data.coverage.flatMap((coverage) => {
    const group = groupRows.find((row) => row.id === coverage.teachingGroupId);
    const course = group ? data.courses.find((c) => c.id === group.courseId) : undefined;
    if (!group || !course) return [];
    const batchIds = links.filter((link) => link.teachingGroupId === group.id).map((link) => link.batchId);
    const template: GroupTemplate = {
      teachingGroupId: group.id,
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
      audiences: data.batches.filter((b) => batchIds.includes(b.id)).map((b) => ({
        batchId: b.id, batchLabel: b.label, stream: b.stream, semester: b.semester, studentCount: b.studentCount,
      })),
      externalAudienceLabel: group.externalAudienceLabel,
      externalStudentCount: group.externalStudentCount,
    };
    const teacherIds = data.teachers.filter((t) => coverage.teacherCodes.includes(t.shortCode)).map((t) => t.id);
    return [{ template, coverage, teacherIds }];
  });

  // Blocking issues per day for this stream, for the day tabs.
  const streamMeetingIds = new Set(source.meetings.filter((m) => m.audiences.some((a) => a.stream === selection.stream)).map((m) => m.id));
  const blockersByDay = Object.fromEntries(streamDays(source.timeGrid, selection.stream).map((day) => [day,
    source.issues.filter((issue) => issue.severity === "blocker" && issue.dayOfWeek === day && issue.meetingIds.some((id) => streamMeetingIds.has(id))).length]));

  return (
    <div>
      <PageHeader
        context="Routine · Working draft"
        title="Routine builder"
        actions={
          <>
            <RoutineExportMenu selection={selection} />
            <Link href="/routine/auto" className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">Suggest placements</Link>
            <Link href="/public/routine" target="_blank" className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">
              Public view<span className="sr-only"> (opens in a new tab)</span>
            </Link>
          </>
        }
      />
      <RoutineWorkbench
        projection={projection}
        groups={groups}
        teachers={data.teachers.map((t) => ({
          id: t.id, shortCode: t.shortCode, fullName: t.fullName, homeDepartmentCode: t.homeDepartmentCode, designation: t.designation, status: t.status,
        }))}
        rooms={data.rooms.filter((r) => r.isActive).map((r) => ({
          id: r.id, code: r.code, building: r.building, roomType: r.roomType, capabilities: r.capabilities, capacity: r.capacity,
          owningDepartmentCode: r.owningDepartmentCode,
        }))}
        windows={data.windows}
        blockersByDay={blockersByDay}
        weekTotals={projection.issueCount}
      >
        {selection.view === "week" ? <RoutineDocument projection={projection} /> : <RoutineDocument projection={projection} printOnly />}
      </RoutineWorkbench>
    </div>
  );
}
