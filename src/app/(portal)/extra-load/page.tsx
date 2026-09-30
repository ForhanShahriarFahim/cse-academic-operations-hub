import { Badge, PageHeader, StatCard } from "@/components/ui";
import { ExtraLoadManager } from "@/components/extra-load-manager";
import { getExtraLoadData } from "@/lib/academic-operations";
import { can, requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExtraLoadPage() {
  const source = await getExtraLoadData();
  const actor = await requireActor();
  const canReview = await can(actor, "review_extra_load") || await can(actor, "view_payment_reports");
  const canSubmit = actor.teacherId != null && await can(actor, "submit_extra_load", { kind: "teacher", teacherId: actor.teacherId })
    || actor.assignments.some((assignment) => assignment.role === "system_administrator");
  const eligibleCount = source.teacherSummaries.filter((row) => row.assignedCredits > source.policy.extraLoadThresholdCredits).length;
  const totalClasses = source.classes.length + source.manualSummaries.reduce((sum, row) => sum + row.classCount, 0);
  const totalAmount = source.classes.length * source.policy.extraClassRate + source.manualSummaries.reduce((sum, row) => sum + row.amount, 0);
  return <div>
    <PageHeader
      context="Classes"
      title="Extra class load"
      description="Record extra classes for teachers above the credit threshold, then print each teacher's sheet and the department top sheet for signature."
      actions={<Badge tone="gold">{source.policy.extraClassRate.toLocaleString()} Tk / class</Badge>}
    />
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <StatCard label="Eligible teachers" value={eligibleCount} sub={`assigned credits > ${source.policy.extraLoadThresholdCredits.toFixed(1)}`} />
      <StatCard label="Classes in ledger" value={totalClasses} sub="app records + manual top-sheet count" />
      <StatCard label="Calculated amount" value={`৳${totalAmount.toLocaleString()}`} sub="manual amount overrides included" tone="good" />
    </div>
    <ExtraLoadManager
      canReview={canReview}
      canSubmit={canSubmit}
      groups={source.groups}
      entries={source.classes}
      summaries={source.teacherSummaries}
      manualRows={source.manualSummaries}
      threshold={source.policy.extraLoadThresholdCredits}
      rate={source.policy.extraClassRate}
      termStart={source.data.term.startDate}
      termEnd={source.data.term.endDate}
    />
  </div>;
}
