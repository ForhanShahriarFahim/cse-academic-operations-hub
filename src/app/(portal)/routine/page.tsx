import { db } from "@/db";
import { courseOfferings, teachingGroupOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortalData } from "@/lib/data";
import { analyzeSchedule } from "@/lib/conflicts";
import { PageHeader } from "@/components/ui";
import { RoutineBuilder } from "@/components/routine-builder";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoutinePage() {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  });

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
      <RoutineBuilder
        termName={data.term.name}
        effectiveFrom={data.term.effectiveFrom}
        batches={data.batches}
        meetings={data.meetings}
        externals={data.externals}
        breaks={data.breaks}
        issueCount={{ blockers: issues.filter((i) => i.severity === "blocker").length, warnings: issues.filter((i) => i.severity === "warning").length }}
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
    </div>
  );
}
