import Link from "next/link";
import { EmptyNote, PageHeader } from "@/components/ui";
import { TeacherRoutineScreen } from "@/components/teacher-routine/screen";
import { getOptionalActor } from "@/lib/auth";
import { getPortalData } from "@/lib/data";
import { chooseRoutineSource, draftChangesFor, teacherRoutineFor, todayIndex } from "@/lib/teacher-routine-data";

export const dynamic = "force-dynamic";

export default async function MyRoutinePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // getPortalData sends signed-out and unauthorised visitors away first.
  const data = await getPortalData();
  const actor = await getOptionalActor();
  const teacher = actor?.teacherId != null ? data.teachers.find((row) => row.id === actor.teacherId) : undefined;
  if (!teacher) {
    return (
      <div>
        <PageHeader context={`My routine · ${data.term.name}`} title="My routine" />
        <EmptyNote>
          Your account is not linked to a teacher record, so there is no routine to show.
          An administrator can link it in People &amp; access. You can still open any teacher&apos;s routine from{" "}
          <Link href="/teachers" className="font-medium text-[var(--color-pine)] underline underline-offset-2">Teachers</Link>.
        </EmptyNote>
      </div>
    );
  }
  const chosen = chooseRoutineSource(data, (await searchParams).source);
  const routine = teacherRoutineFor(data, chosen.source, teacher);
  return (
    <TeacherRoutineScreen
      routine={routine}
      kind={chosen.kind}
      hasPublished={chosen.hasPublished}
      basePath="/my-routine"
      draftChanges={draftChangesFor(data, chosen, teacher.id)}
      today={todayIndex()}
      printedAt={new Date().toISOString()}
      context={`My routine · ${data.term.name}`}
      intro={`${[teacher.designation, teacher.shortCode].filter(Boolean).join(" · ")}. ${chosen.kind === "published" ? "Your classes from the published routine." : "Your classes in the working draft."}`}
    />
  );
}
