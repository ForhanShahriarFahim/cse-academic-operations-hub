import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TeacherRoutineScreen } from "@/components/teacher-routine/screen";
import { getPortalData } from "@/lib/data";
import { chooseRoutineSource, draftChangesFor, teacherRoutineFor, todayIndex } from "@/lib/teacher-routine-data";

export const dynamic = "force-dynamic";

export default async function TeacherRoutinePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const teacherId = Number(id);
  if (!Number.isInteger(teacherId) || teacherId <= 0) notFound();
  const data = await getPortalData();
  const teacher = data.teachers.find((row) => row.id === teacherId);
  if (!teacher) notFound();
  const chosen = chooseRoutineSource(data, (await searchParams).source);
  const routine = teacherRoutineFor(data, chosen.source, teacher);
  return (
    <TeacherRoutineScreen
      routine={routine}
      kind={chosen.kind}
      hasPublished={chosen.hasPublished}
      basePath={`/teachers/${teacher.id}/routine`}
      draftChanges={draftChangesFor(data, chosen, teacher.id)}
      today={todayIndex()}
      printedAt={new Date().toISOString()}
      context={`Teachers · ${data.term.name} · Individual routine`}
      intro={[teacher.designation, teacher.shortCode].filter(Boolean).join(" · ")}
      back={<Link href={`/teachers/${teacher.id}`} className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
        <ArrowLeft size={13} aria-hidden="true" /> {teacher.fullName}
      </Link>}
    />
  );
}
