import { db } from "@/db";
import { academicTerms, periodPatterns } from "@/db/schema";
import { getPortalData } from "@/lib/data";
import { can, getOptionalActor } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { DaysAndPeriods } from "@/components/days-periods/days-periods";

export const dynamic = "force-dynamic";

export default async function DaysAndPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPortalData();
  const actor = await getOptionalActor();
  // Decision D-1: routine coordinators and policy administrators may edit; the actions enforce this too.
  const canEdit = !!actor && (await can(actor, "manage_routine") || await can(actor, "manage_policy"));
  const [terms, patternRows] = await Promise.all([
    db.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms),
    db.select({ termId: periodPatterns.termId }).from(periodPatterns),
  ]);
  const otherTerms = terms.filter((t) => t.id !== data.term.id)
    .map((t) => ({ ...t, patternCount: patternRows.filter((row) => row.termId === t.id).length }));
  const params = await searchParams;
  const initialStream = params.stream === "DIPLOMA" ? "DIPLOMA" : "HSC";

  return (
    <div>
      <PageHeader
        context={`Routine · ${data.term.name}`}
        title="Days & periods"
        description={`Choose which days each stream has classes and the periods it uses. Any batch can have its own days or periods. Changes apply only to ${data.term.name}; other terms and published versions keep theirs.`}
      />
      <DaysAndPeriods
        grid={data.timeGrid}
        termName={data.term.name}
        otherTerms={otherTerms}
        initialStream={initialStream}
        context={{
          canEdit,
          batches: data.batches.map((b) => ({ id: b.id, stream: b.stream, label: b.label })),
          windows: data.windows.map((w) => ({ batchId: w.batchId, stream: w.stream, dayOfWeek: w.dayOfWeek, startMinutes: w.startMinutes, endMinutes: w.endMinutes })),
          meetings: data.meetings.map((m) => ({
            id: m.id, courseCode: m.courseCode, dayOfWeek: m.dayOfWeek, startMinutes: m.startMinutes, endMinutes: m.endMinutes,
            audiences: m.audiences.map((a) => ({ batchId: a.batchId, stream: a.stream, batchLabel: a.batchLabel })),
          })),
        }}
      />
    </div>
  );
}
