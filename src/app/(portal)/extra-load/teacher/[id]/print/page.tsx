import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { INSTITUTION } from "@/lib/constants";
import { getExtraLoadData } from "@/lib/academic-operations";
import { can, requireActor } from "@/lib/auth";
import { fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year.slice(2)}`;
}

export default async function TeacherExtraLoadPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const teacherId = Number(id);
  if (!Number.isInteger(teacherId) || teacherId <= 0) notFound();
  const actor = await requireActor();
  const canViewOwn = actor.teacherId === teacherId && await can(actor, "submit_extra_load", { kind: "teacher", teacherId });
  if (!await can(actor, "view_payment_reports") && !canViewOwn) redirect("/forbidden");
  const query = await searchParams;
  const source = await getExtraLoadData(query.from, query.to);
  const teacher = source.data.teachers.find((row) => row.id === teacherId);
  if (!teacher) notFound();
  const entries = source.classes.filter((row) => row.teacherId === teacherId);
  const courses = [...new Map(entries.map((row) => [row.courseCodeSnapshot, { code: row.courseCodeSnapshot, title: row.courseTitleSnapshot }])).values()];
  const blankCount = Math.max(0, 18 - entries.length);
  return <div className="teacher-sheet mx-auto max-w-[210mm] bg-white text-black">
    <div className="no-print mb-4 flex items-center justify-between rounded-md border border-[var(--color-line)] bg-sheet p-3 font-sans"><Link href="/extra-load" className="text-[12px] font-semibold text-[var(--color-pine)]">← Extra class load</Link><PrintButton /></div>
    <article className="extra-load-document min-h-[297mm] px-[12mm] py-[10mm] font-['Times_New_Roman',serif] text-[12pt]">
      <header className="text-center leading-tight">
        <h1 className="text-[18pt] font-bold">Extra Class Load</h1>
        <p className="mt-1 text-[13pt] font-bold">{INSTITUTION.departmentName}</p>
        <p className="text-[12pt]">{INSTITUTION.universityName}</p>
        <p className="text-[11pt]">Gokul, Bogura-5800</p>
      </header>
      <p className="mt-5 font-bold">{teacher.designation ?? "Teacher"}: {teacher.fullName}</p>
      <table className="official-grid mt-3 w-full table-fixed">
        <colgroup><col className="w-[8%]" /><col className="w-[19%]" /><col /></colgroup>
        <thead><tr><th>S.N</th><th>Course Code</th><th>Course Title</th></tr></thead>
        <tbody>{courses.length ? courses.map((course, index) => <tr key={course.code}><td>{index + 1}</td><td>{course.code}</td><td className="text-left">{course.title}</td></tr>) : <tr><td>1</td><td>&nbsp;</td><td>&nbsp;</td></tr>}</tbody>
      </table>
      <table className="official-grid mt-4 w-full table-fixed">
        <colgroup><col className="w-[8%]" /><col className="w-[19%]" /><col className="w-[19%]" /><col className="w-[15%]" /><col className="w-[18%]" /><col /></colgroup>
        <thead><tr><th>S.N</th><th>Date</th><th>Course Code</th><th>Batch</th><th>Time</th><th>Signature</th></tr></thead>
        <tbody>
          {entries.map((entry, index) => <tr key={entry.id}><td>{index + 1}</td><td>{displayDate(entry.classDate)}</td><td>{entry.courseCodeSnapshot}</td><td>{entry.batchLabelSnapshot}</td><td>{fmtTime(entry.startMinutes)}–{fmtTime(entry.endMinutes)}</td><td>&nbsp;</td></tr>)}
          {Array.from({ length: blankCount }, (_, index) => <tr key={`blank-${index}`}><td>{entries.length + index + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>)}
        </tbody>
      </table>
    </article>
  </div>;
}
