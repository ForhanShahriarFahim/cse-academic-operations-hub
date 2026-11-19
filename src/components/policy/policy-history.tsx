/** SET-01B — presentational policy history and impact (no hooks; usable from server and client components). */
import type { PolicyHistoryRow } from "@/lib/policy-store";
import {
  SHORT_LABELS, VERSION_FIELDS, changedFields, formatTaka, versionLabel, type PolicyFigures, type PolicyImpact, type VersionField,
} from "@/lib/policy-versions";

const STATUS: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "border-[var(--color-pine)]/30 bg-pine-tint text-[var(--color-pine)]" },
  proposed: { label: "Awaiting approval", className: "border-[var(--color-gold)]/40 bg-gold-tint text-gold-text" },
  rejected: { label: "Rejected", className: "border-[var(--color-line)] bg-wash text-ink-2" },
  withdrawn: { label: "Withdrawn", className: "border-[var(--color-line)] bg-wash text-ink-2" },
  stale: { label: "Stale after term switch", className: "border-[var(--color-clay)]/30 bg-clay-tint text-[var(--color-clay)]" },
};

export function StatusTag({ status }: { status: string }) {
  const tag = STATUS[status] ?? { label: status, className: "border-[var(--color-line)] bg-wash text-ink-2" };
  return <span className={`inline-block rounded-[10px] border px-2 py-px text-[11px] font-semibold ${tag.className}`}>{tag.label}</span>;
}

export const formatFigure = (key: VersionField, value: number) => key === "extraClassRate" ? `৳${formatTaka(value)}` : key === "extraLoadThresholdCredits" ? `${value.toFixed(1)} h` : value.toFixed(1);
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export function FigureChanges({ before, after }: { before: PolicyFigures | null; after: PolicyFigures }) {
  const keys = before ? changedFields(before, after) : [...VERSION_FIELDS];
  return <span className="font-mono text-[12px] tabular-nums">{keys.map((key, index) => <span key={key}>{index > 0 && " · "}{SHORT_LABELS[key]}{" "}
    {before && <><del className="text-muted">{formatFigure(key, before[key])}</del> → </>}<strong>{formatFigure(key, after[key])}</strong></span>)}</span>;
}

/** Newest first: open and decided versions, then the baseline. `before` figures are those in force on each row's date before it. */
export function PolicyHistory({ termStart, baseline, history, priorFigures, compact = false }: {
  termStart: string;
  baseline: PolicyFigures | null;
  history: readonly PolicyHistoryRow[];
  priorFigures: Record<number, PolicyFigures | null>;
  compact?: boolean;
}) {
  if (!baseline && history.length === 0) return <p className="text-[12.5px] text-muted">No policy recorded for this term.</p>;
  return <ol className="relative ml-1.5 border-l-2 border-[var(--color-line)] pl-4">
    {history.map((row) => <li key={row.id} className="relative pb-4 last:pb-1">
      <span aria-hidden="true" className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 bg-white ${row.status === "proposed" ? "border-[var(--color-gold)]" : row.status === "approved" ? "border-[var(--color-pine)]" : "border-[var(--color-line)]"}`} />
      <p className="flex flex-wrap items-center gap-2 text-[12.5px]"><StatusTag status={row.status} />
        <strong>{row.status === "approved" ? versionLabel(row.version!) : row.version === null && !baseline && row.effectiveFrom === termStart ? "Baseline proposal" : "Proposal"}</strong>
        <span className="text-muted">from {row.effectiveFrom}</span></p>
      <p className="mt-1"><FigureChanges before={priorFigures[row.id] ?? null} after={row.figures} /></p>
      {!compact && <p className="mt-1 text-[11.5px] text-muted">Proposed by {row.proposedBy}, {shortDate(row.proposedAt)} — “{row.reason}”
        {row.decidedAt && row.status !== "stale" && <><br />{row.status === "withdrawn" ? "Withdrawn" : row.status === "approved" ? "Approved" : "Rejected"} by {row.decidedBy}, {shortDate(row.decidedAt)}{row.decisionNote ? ` — “${row.decisionNote}”` : ""}</>}
        {row.status === "stale" && row.decidedAt && <><br />Closed when the active term changed, {shortDate(row.decidedAt)}.</>}</p>}
    </li>)}
    {baseline && !history.some((row) => row.version === 1 && row.status === "approved") && <li className="relative pb-1">
      <span aria-hidden="true" className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-[var(--color-pine)] bg-white" />
      <p className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="inline-block rounded-[10px] border border-[var(--color-pine)]/30 bg-pine-tint px-2 py-px text-[11px] font-semibold text-[var(--color-pine)]">Baseline</span>
        <strong>Version 1</strong><span className="text-muted">from term start, {termStart}</span></p>
      <p className="mt-1"><FigureChanges before={null} after={baseline} /></p>
    </li>}
  </ol>;
}

export function ImpactSummary({ impact, baseline }: { impact: PolicyImpact | null; baseline: boolean }) {
  if (!impact) return <p className="text-[12.5px]">{baseline
    ? "This records the term's first policy. Every recorded extra class, manual row and attendance mark is priced and marked from it once approved."
    : "No impact available."}</p>;
  if (impact.empty) return <p className="text-[12.5px]">Nothing recorded so far is affected. A future-dated change takes effect on its date.</p>;
  const { payments, threshold, attendance } = impact;
  const delta = payments.totalAfter - payments.totalBefore;
  return <div className="space-y-4 text-[12.5px]">
    {(payments.classIds.length > 0 || payments.manual.length > 0) && <div>
      <h4 className="font-semibold">Payments that change</h4>
      <div role="region" aria-label="Payments that change" tabIndex={0} className="table-region mt-1 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[12px] tabular-nums [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
          <thead><tr className="border-b border-[var(--color-line)] text-left"><th>Teacher</th><th className="text-right">Classes</th><th className="text-right">Before</th><th className="text-right">After</th></tr></thead>
          <tbody>
            {payments.teachers.map((row) => <tr key={row.teacherId} className="border-b border-[var(--color-line-soft)]"><td>{row.teacherName}</td><td className="text-right font-mono">{row.classes}</td><td className="text-right font-mono">৳{formatTaka(row.before)}</td><td className="text-right font-mono">৳{formatTaka(row.after)}</td></tr>)}
            {payments.manual.map((row) => <tr key={`m${row.id}`} className="border-b border-[var(--color-line-soft)]"><td>{row.teacherName} <span className="text-muted">(manual row)</span></td><td className="text-right font-mono">—</td><td className="text-right font-mono">৳{formatTaka(row.before)}</td><td className="text-right font-mono">৳{formatTaka(row.after)}</td></tr>)}
            <tr className="font-semibold"><td>Total</td><td className="text-right font-mono">{payments.classIds.length}</td><td className="text-right font-mono">৳{formatTaka(payments.totalBefore)}</td><td className="text-right font-mono">৳{formatTaka(payments.totalAfter)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1">Total change {delta >= 0 ? "+" : "−"}৳{formatTaka(Math.abs(delta))}</p>
    </div>}
    {(threshold.changed.length > 0 || threshold.recordedUnderEarlier.length > 0) && <div>
      <h4 className="font-semibold">Extra-load eligibility</h4>
      {threshold.changed.length > 0 && <ul className="mt-1 list-disc pl-5">{threshold.changed.map((row) => <li key={row.teacherId}>{row.teacherName} ({row.units} h): {row.after ? "becomes eligible" : "no longer eligible"} as of {threshold.evaluationDate}</li>)}</ul>}
      {threshold.recordedUnderEarlier.length > 0 && <p className="mt-1">{threshold.recordedUnderEarlier.length} recorded class(es) on or after the date were recorded under the earlier threshold. They stay recorded and priced.</p>}
    </div>}
    {attendance.courses.length > 0 && <div>
      <h4 className="font-semibold">Attendance marks (whole term, as of {attendance.evaluationDate})</h4>
      <ul className="mt-1 list-disc pl-5">{attendance.courses.map((row) => <li key={row.groupId}><span className="font-mono">{row.courseCode}</span> {row.audience}: out of {row.maxBefore} → {row.maxAfter}; {row.studentsChanged} student(s) change, largest by {row.largestChange}
        {row.lockedSessions > 0 && <strong className="text-[var(--color-clay)]"> · {row.lockedSessions} locked session(s)</strong>}</li>)}</ul>
    </div>}
  </div>;
}
