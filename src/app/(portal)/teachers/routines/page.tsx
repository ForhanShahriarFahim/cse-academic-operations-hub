import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BulkRoutinePicker, type BulkTeacher } from "@/components/teacher-routine/bulk-picker";
import { PageHeader } from "@/components/ui";
import { getPortalData } from "@/lib/data";
import { unitsText } from "@/lib/teacher-routine";
import { chooseRoutineSource, hasRoutineContent, teacherRoutineFor } from "@/lib/teacher-routine-data";

export const dynamic = "force-dynamic";

export default async function TeacherRoutinesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPortalData();
  const chosen = chooseRoutineSource(data, (await searchParams).source);
  const teachers: BulkTeacher[] = data.teachers
    .map((teacher) => {
      const routine = teacherRoutineFor(data, chosen.source, teacher);
      return {
        id: teacher.id,
        shortCode: teacher.shortCode,
        fullName: teacher.fullName,
        designation: teacher.designation,
        cse: teacher.homeDepartmentCode === "CSE",
        classes: routine.figures.classes,
        credits: unitsText(routine.credits.total),
        status: hasRoutineContent(routine),
      };
    })
    // Teachers from other departments are listed only when they have CSE work.
    .filter((teacher) => teacher.cse || teacher.status !== "none")
    .sort((a, b) => a.shortCode.localeCompare(b.shortCode));
  const sourceLabel = chosen.kind === "published" ? `Publication v${chosen.source.versionNumber}` : "the working draft";
  const switchClass = "inline-flex min-h-8 items-center whitespace-nowrap rounded-[5px] px-3 text-[13px] font-medium";
  return (
    <div>
      <Link href="/teachers" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
        <ArrowLeft size={13} aria-hidden="true" /> Teachers
      </Link>
      <PageHeader
        context={`Teachers · ${data.term.name}`}
        title="Print teacher routines"
        description="Print each selected teacher's Individual Class Routine, one A4 page each, in one print run. Choose “Save as PDF” in the print dialog for a file."
        actions={
          <nav aria-label="Which routine" className="inline-flex rounded-[7px] border border-[var(--color-line)] bg-sheet p-0.5">
            {chosen.hasPublished
              ? <Link href="/teachers/routines?source=published" aria-current={chosen.kind === "published" ? "page" : undefined} className={`${switchClass} ${chosen.kind === "published" ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>Published</Link>
              : <span aria-disabled="true" className={`${switchClass} text-muted`}>Not published yet</span>}
            <Link href="/teachers/routines?source=draft" aria-current={chosen.kind === "draft" ? "page" : undefined} className={`${switchClass} ${chosen.kind === "draft" ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>Working draft</Link>
          </nav>
        }
      />
      <BulkRoutinePicker teachers={teachers} source={chosen.kind} sourceLabel={sourceLabel} />
    </div>
  );
}
