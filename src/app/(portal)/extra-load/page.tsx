import { TermWriteProvider } from "@/components/term-write-context";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { ExtraLoadManager } from "@/components/extra-load-manager";
import { getExtraLoadData } from "@/lib/academic-operations";
import { can, requireActor } from "@/lib/auth";
import { isExtraLoadEligible } from "@/lib/extra-load";
import { formatWorkloadUnits } from "@/lib/workload";
import { formatTaka, fromPaisa, rateTrace, toPaisa, versionLabel } from "@/lib/policy-versions";

export const dynamic = "force-dynamic";

export default async function ExtraLoadPage() {
  const source = await getExtraLoadData();
  const actor = await requireActor();
  const canReview = await can(actor, "review_extra_load") || await can(actor, "view_payment_reports");
  const canSubmit = actor.teacherId != null && await can(actor, "submit_extra_load", { kind: "teacher", teacherId: actor.teacherId })
    || actor.assignments.some((assignment) => assignment.role === "system_administrator");
  const threshold = source.policy?.extraLoadThresholdCredits ?? null;
  const eligibleCount = threshold == null ? 0 : source.teacherSummaries.filter((row) => isExtraLoadEligible(row.assignedWorkloadUnits, threshold)).length;
  const totalClasses = source.classes.length + source.manualSummaries.reduce((sum, row) => sum + row.classCount, 0);
  // SET-01B: each class is priced on its own date, so the total is the sum of priced lines, in paisa.
  const amounts = [...source.teacherSummaries.map((row) => row.amount), ...source.manualSummaries.map((row) => row.amount)];
  const totalAmount = amounts.some((amount) => amount == null) ? null : fromPaisa(amounts.reduce((sum: number, amount) => sum + toPaisa(amount!), 0));
  return <TermWriteProvider value={source.data.writeContext}>{<div>
    <PageHeader
      context="Classes"
      title="Extra class load"
      description="Record extra classes for teachers above the workload credit-hours threshold, then print each teacher's sheet and the department top sheet for signature."
      actions={source.policy ? <Badge tone="gold">{formatTaka(source.policy.extraClassRate)} Tk / class today · {versionLabel(source.policyVersion!)}</Badge> : <Badge tone="clay">Payment policy not recorded</Badge>}
    />
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <StatCard label="Eligible teachers" value={eligibleCount} sub={threshold == null ? "threshold not recorded" : `workload credit-hours > ${formatWorkloadUnits(threshold)} today`} />
      <StatCard label="Classes in ledger" value={totalClasses} sub="app records + manual top-sheet count" />
      <StatCard label="Calculated amount" value={totalAmount == null ? "Not priced" : `৳${formatTaka(totalAmount)}`} sub={source.versionsUsed.length > 1 ? "rates by class date · overrides included" : "manual amount overrides included"} tone="good" />
    </div>
    {source.policyMissing && <p role="status" className="mb-4 rounded-md border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/5 px-4 py-3 text-[12.5px]">This term has no approved payment policy, so nothing is priced and new extra classes cannot be checked against a threshold. An administrator can propose the baseline on <a href="/settings#policy" className="font-semibold underline underline-offset-2">Settings</a>; a second administrator approves it.</p>}
    {source.versionsUsed.length > 1 && <p className="mb-4 text-[12px] text-muted">Rates applied by class date: {rateTrace(source.versionsUsed)}.</p>}
    <ExtraLoadManager
      canReview={canReview}
      canSubmit={canSubmit}
      groups={source.groups}
      entries={source.classes}
      summaries={source.teacherSummaries}
      manualRows={source.manualSummaries}
      threshold={threshold}
      rate={source.policy?.extraClassRate ?? null}
      multipleRates={source.versionsUsed.length > 1}
      termStart={source.data.term.startDate}
      termEnd={source.data.term.endDate}
    />
  </div>}</TermWriteProvider>;
}
