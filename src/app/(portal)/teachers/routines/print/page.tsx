import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IndividualRoutineSheets } from "@/components/teacher-routine/sheet";
import { PrintRoutineButton } from "@/components/teacher-routine/print-button";
import { EmptyNote, PageHeader } from "@/components/ui";
import { getPortalData } from "@/lib/data";
import { chooseRoutineSource, teacherRoutineFor } from "@/lib/teacher-routine-data";

export const dynamic = "force-dynamic";

export default async function TeacherRoutinesPrintPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const data = await getPortalData();
  const chosen = chooseRoutineSource(data, query.source);
  const ids = new Set((Array.isArray(query.id) ? query.id : query.id ? [query.id] : []).map(Number).filter((id) => Number.isInteger(id) && id > 0));
  const teachers = data.teachers.filter((teacher) => ids.has(teacher.id)).sort((a, b) => a.shortCode.localeCompare(b.shortCode));
  const printedAt = new Date().toISOString();
  const back = `/teachers/routines?source=${chosen.kind}`;
  return (
    <div>
      <div className="no-print">
        <Link href={back} className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
          <ArrowLeft size={13} aria-hidden="true" /> Choose teachers
        </Link>
        <PageHeader
          context={`Teachers · ${data.term.name} · ${chosen.kind === "published" ? `Publication v${chosen.source.versionNumber}` : "Working draft"}`}
          title={teachers.length === 1 ? "1 teacher routine" : `${teachers.length} teacher routines`}
          description="Each routine starts on a new A4 page. Use “Save as PDF” in the print dialog for a file."
          actions={teachers.length ? <PrintRoutineButton label={teachers.length === 1 ? "Print 1 routine" : `Print ${teachers.length} routines`} /> : undefined}
        />
      </div>
      {teachers.length ? (
        <div className="teacher-routine-sheets" role="region" aria-label="Teacher routines, A4 sheets" tabIndex={0}>
          {teachers.map((teacher) => (
            <IndividualRoutineSheets key={teacher.id} routine={teacherRoutineFor(data, chosen.source, teacher)} printedAt={printedAt} />
          ))}
        </div>
      ) : (
        <EmptyNote>No teachers were chosen. <Link href={back} className="font-medium text-[var(--color-pine)] underline underline-offset-2">Choose teachers to print</Link>.</EmptyNote>
      )}
    </div>
  );
}
