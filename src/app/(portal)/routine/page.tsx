import { db } from "@/db";
import { courseOfferings, teachingGroupOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortalData } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { RoutineBuilder } from "@/components/routine-builder";
import { RoutineViewControls } from "@/components/routine-view-controls";
import { RoutineDocument } from "@/components/routine-document";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { draftRoutineSource } from "@/lib/routine-sources";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPortalData();
  const source = draftRoutineSource(data);
  const { selection } = parseRoutineSelection(await searchParams, source.batches);
  const projection = projectRoutine({ source, selection });

  const links = await db
    .select({
      teachingGroupId: teachingGroupOfferings.teachingGroupId,
      batchId: courseOfferings.batchId,
    })
    .from(teachingGroupOfferings)
    .innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId));

  const groups = data.coverage.map((c) => ({
    id: c.teachingGroupId,
    courseCode: c.courseCode,
    courseTitle: c.courseTitle,
    courseType: c.courseType,
    audience: c.audience,
    status: c.status,
    deliveryMode: c.deliveryMode,
    batchIds: links.filter((l) => l.teachingGroupId === c.teachingGroupId).map((l) => l.batchId),
  }));

  return (
    <div>
      <PageHeader
        kicker="Draft workspace — exact-time conflict checking"
        title="Routine Builder"
        description="Drag-free, click-to-edit builder. One physical class is stored once and appears in every relevant stream, teacher and room view. Blocking conflicts are rejected by the server; advised placements are recorded with their warnings."
        actions={<Link href="/routine/auto" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 py-2 text-[12.5px] font-semibold text-white"><Sparkles size={14} />Auto-schedule gaps</Link>}
      />
      <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-wash p-3">
        <RoutineViewControls selection={selection} batches={projection.availableBatches} exportPath="/routine/export" officialPath="/routine/official" />
      </div>
      {selection.view === "week" ? (
        <RoutineDocument projection={projection} />
      ) : (
        <>
          <RoutineBuilder
            projection={projection}
            groups={groups}
            teachers={data.teachers.map((t) => ({
              id: t.id, shortCode: t.shortCode, fullName: t.fullName,
              homeDepartmentCode: t.homeDepartmentCode, designation: t.designation,
            }))}
            rooms={data.rooms.filter((r) => r.isActive).map((r) => ({
              id: r.id, code: r.code, roomType: r.roomType, capacity: r.capacity,
              owningDepartmentCode: r.owningDepartmentCode, building: r.building,
            }))}
            coverage={data.coverage.filter((c) => ["vacancy", "unscheduled", "partial", "over_scheduled", "teacher_managed"].includes(c.status))}
          />
          <RoutineDocument projection={projection} printOnly />
        </>
      )}
    </div>
  );
}
