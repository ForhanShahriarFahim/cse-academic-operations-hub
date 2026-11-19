"use client";

/** SET-01B — Settings policy section: figures in force, open proposal with impact and decision, propose form, history. */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTermActions } from "@/components/term-write-context";
import type { ActionResult } from "@/lib/action-result";
import type { PolicyHistoryRow } from "@/lib/policy-store";
import type { PolicyPreview } from "@/lib/policy-actions";
import { ROUNDING_NOTE, VERSION_FIELDS, VERSION_LABELS, versionLabel, type PolicyFigures, type PolicyImpact } from "@/lib/policy-versions";
import { ATTENDANCE_CALCULATION } from "@/lib/attendance";
import { FigureChanges, ImpactSummary, PolicyHistory, StatusTag, formatFigure } from "./policy-history";

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[13px] min-h-11";
const primary = "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60";
const quiet = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-line)] bg-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-60";
const danger = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-clay)] bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--color-clay)] disabled:opacity-60";

export interface PolicyPanelProps {
  term: { name: string; startDate: string; endDate: string };
  current: { version: number; effectiveFrom: string; figures: PolicyFigures } | null;
  evaluationDate: string;
  baseline: PolicyFigures | null;
  legacy: { theory: number; sessional: number } | null;
  history: PolicyHistoryRow[];
  priorFigures: Record<number, PolicyFigures | null>;
  open: { row: PolicyHistoryRow; impact: PolicyImpact | null; fingerprint: string; prior: PolicyFigures | null } | null;
  abilities: { propose: boolean; approve: boolean; actorId: number };
  otherApprovers: number;
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  const tone = result.ok ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]" : "border-[var(--color-clay)]/40 bg-[var(--color-clay)]/5 text-[var(--color-clay)]";
  return <p role={result.ok ? "status" : "alert"} aria-live="polite" className={`rounded-md border px-3 py-2 text-[12.5px] ${tone}`}>{result.message}</p>;
}
const fieldErrors = (result: ActionResult | null) => result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};

export function PolicyPanel(props: PolicyPanelProps) {
  const { term, current, evaluationDate, baseline, legacy, history, priorFigures, open, abilities, otherApprovers } = props;
  const [receipt, setReceipt] = useState<ActionResult | null>(null);
  return <section id="policy" aria-labelledby="policy-heading" className="ruled scroll-mt-20 rounded-lg">
    <header className="border-b border-[var(--color-line-soft)] px-4 py-3">
      <h2 id="policy-heading" className="font-display text-[15px] font-semibold">Academic, attendance &amp; payment policy</h2>
      <p className="mt-0.5 text-[11.5px] text-muted">{term.name}. Changes are proposed with a date and a reason, and take effect only after a second administrator approves them. Earlier figures never change silently.</p>
    </header>
    <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-5">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 font-display text-[14px] font-semibold">In force today
            {current && <span className="rounded-[10px] border border-[var(--color-pine)]/25 bg-pine-tint px-2 py-px text-[11px] font-semibold text-[var(--color-pine)]">{versionLabel(current.version)}</span>}</h3>
          {current ? <>
            <p className="text-[11.5px] text-muted">As of {evaluationDate} · effective from {current.effectiveFrom}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              {VERSION_FIELDS.map((key) => <div key={key} className="rounded-md border border-[var(--color-line)] px-3 py-2">
                <dt className="micro-label">{VERSION_LABELS[key]}</dt>
                <dd className="mt-0.5 font-display text-[18px] font-semibold tabular-nums">{formatFigure(key, current.figures[key])}</dd>
              </div>)}
            </dl>
            {legacy && <p className="mt-1 text-[11.5px] text-muted">Legacy metadata (read-only, not versioned): theory {legacy.theory}; sessional {legacy.sessional}.</p>}
          </> : <p role="status" className="mt-2 rounded-md border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/5 px-3 py-2 text-[12.5px]">No policy is recorded for this term. Extra-class payments and attendance marks are not priced or marked until a baseline is proposed and approved.</p>}
          <p className="mt-2 text-[11.5px] text-muted">{ROUNDING_NOTE}</p>
          <p className="mt-1 text-[11.5px] text-muted">Attendance calculation. {ATTENDANCE_CALCULATION}</p>
        </div>
        <div>
          <h3 className="font-display text-[14px] font-semibold">History</h3>
          <div className="mt-2"><PolicyHistory termStart={term.startDate} baseline={baseline} history={history} priorFigures={priorFigures} /></div>
        </div>
      </div>
      <div className="min-w-0 space-y-5">
        <Feedback result={receipt} />
        {open ? <OpenProposal key={`${open.row.id}:${open.fingerprint}`} open={open} abilities={abilities} otherApprovers={otherApprovers} baseline={!baseline} onCommit={setReceipt} />
          : abilities.propose ? <ProposeForm term={term} current={current} baseline={!baseline} onCommit={setReceipt} />
            : <p className="text-[12.5px] text-muted">No proposal is waiting. Only administrators with policy permission can propose changes.</p>}
        {open && abilities.propose && <p className="text-[11.5px] text-muted">One proposal at a time: a new change can be proposed once this one is decided or withdrawn.</p>}
        <p className="text-[12px]">Class days, periods and class hours are set per term in <Link href="/routine/periods" className="font-semibold text-[var(--color-pine)] underline underline-offset-2">Days &amp; periods</Link>.</p>
      </div>
    </div>
  </section>;
}

function OpenProposal({ open, abilities, otherApprovers, baseline, onCommit }: { open: NonNullable<PolicyPanelProps["open"]>; abilities: PolicyPanelProps["abilities"]; otherApprovers: number; baseline: boolean; onCommit: (result: ActionResult | null) => void }) {
  const { decidePolicyChangeAction } = useTermActions();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const { row, impact, fingerprint, prior } = open;
  const own = row.proposedById === abilities.actorId;
  const canDecide = abilities.approve && !own;
  const decide = (command: "approve" | "reject" | "withdraw") => start(async () => {
    onCommit(null);
    const next = await decidePolicyChangeAction(row.id, { command, note: note || null, fingerprint });
    if (next.ok) onCommit(next);
    setResult(next.ok ? null : next);
  });
  const errors = fieldErrors(result);
  const affected = impact ? impact.payments.classIds.length + impact.payments.manual.length : 0;
  return <div role="region" aria-labelledby="open-proposal-heading" className="rounded-lg border border-[var(--color-gold)]/60 bg-[#fffaf0] p-4">
    <p className="flex flex-wrap items-center gap-2"><StatusTag status="proposed" /><span className="text-[11.5px] text-muted">from {row.effectiveFrom}</span></p>
    <h3 id="open-proposal-heading" className="mt-1 font-display text-[15px] font-semibold">{baseline ? "Baseline proposal — review impact" : "Proposed change — review impact"}</h3>
    <p className="mt-1"><FigureChanges before={prior} after={row.figures} /></p>
    <p className="mt-2 rounded-md border-l-[3px] border-[var(--color-pine)] bg-pine-tint px-3 py-2 text-[12.5px]"><strong>Reason.</strong> {row.reason} <span className="text-muted">— {row.proposedBy}</span></p>
    <div className="mt-3"><ImpactSummary impact={impact} baseline={baseline} /></div>
    <div className="mt-4 space-y-3 border-t border-[var(--color-line-soft)] pt-3">
      <Feedback result={result} />
      {canDecide && <>
        <label className="grid gap-1 text-[12.5px] font-semibold">Decision note <span className="font-normal text-muted">Required to reject; optional to approve. Up to 500 characters.</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? "note-error" : undefined} className={control} />
          {errors.note && <span id="note-error" className="text-[12px] font-normal text-[var(--color-clay)]">{errors.note[0]}</span>}
        </label>
        <label className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>{baseline ? "I reviewed the baseline values for this term." : `I reviewed this impact${affected ? ` (${affected} payment line${affected === 1 ? "" : "s"})` : ""} and the effective date ${row.effectiveFrom}.`}</span></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={pending || !acknowledged} onClick={() => decide("approve")}>{pending ? "Saving…" : baseline ? "Approve baseline" : "Approve change"}</button>
          <button type="button" className={danger} disabled={pending} onClick={() => decide("reject")}>Reject</button>
        </div>
      </>}
      {own && <>
        <p className="text-[12.5px]">You proposed this change, so another person with policy approval must decide it.{otherApprovers === 0 && <strong> No one else can approve policy changes yet. Ask a system administrator to grant policy approval to a second person.</strong>}</p>
        <button type="button" className={quiet} disabled={pending} onClick={() => decide("withdraw")}>{pending ? "Saving…" : "Withdraw proposal"}</button>
      </>}
      {!own && !abilities.approve && <p className="text-[12.5px] text-muted">Waiting for an administrator with policy approval.</p>}
    </div>
  </div>;
}

function ProposeForm({ term, current, baseline, onCommit }: { term: PolicyPanelProps["term"]; current: PolicyPanelProps["current"]; baseline: boolean; onCommit: (result: ActionResult | null) => void }) {
  const { previewPolicyChangeAction, proposePolicyChangeAction } = useTermActions();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PolicyPreview | null>(null);
  const [preview, setPreview] = useState<PolicyPreview["preview"] | null>(null);
  const reset = () => { if (preview) setPreview(null); };
  const run = (action: "preview" | "propose") => start(async () => {
    onCommit(null);
    const data = new FormData(form.current!);
    if (action === "preview") {
      const next = await previewPolicyChangeAction(data);
      setResult(next); setPreview(next.ok ? next.preview ?? null : null);
    } else {
      const next = await proposePolicyChangeAction(data);
      if (next.ok) {
        onCommit(next);
        setPreview(null);
      }
      setResult(next.ok ? null : next);
    }
  });
  const errors = fieldErrors(result);
  const field = (name: string, label: string, hint: string, input: React.ReactNode) => <label className="grid min-w-0 gap-1 text-[12.5px] font-semibold">{label}
    <span className="font-normal text-muted">{hint}</span>{input}
    {errors[name] && <span id={`${name}-error`} className="text-[12px] font-normal text-[var(--color-clay)]">{errors[name][0]}</span>}</label>;
  const describe = (name: string) => ({ "aria-invalid": errors[name] ? true : undefined, "aria-describedby": errors[name] ? `${name}-error` : undefined });
  return <form ref={form} onChange={reset} onSubmit={(event) => { event.preventDefault(); run(preview ? "propose" : "preview"); }} className="space-y-3" aria-labelledby="propose-heading">
    <h3 id="propose-heading" className="font-display text-[14px] font-semibold">{baseline ? "Propose the term's baseline policy" : "Propose a change"}</h3>
    <p className="text-[11.5px] text-muted">{baseline ? `The baseline starts on the term start, ${term.startDate}. Blank values are not zero.` : "Saving creates a proposal; nothing in force changes until a second administrator approves it."}</p>
    <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {VERSION_FIELDS.map((key) => <div key={key}>{field(key, VERSION_LABELS[key], current ? `Now ${formatFigure(key, current.figures[key])}` : "Enter explicitly",
        <input name={key} inputMode="decimal" required defaultValue={current ? String(current.figures[key]) : ""} className={control} {...describe(key)} />)}</div>)}
      <div>{baseline ? <><input type="hidden" name="effectiveFrom" value={term.startDate} />{field("effectiveFrom", "Effective from", "Term start (baseline)", <input value={term.startDate} readOnly className={`${control} bg-wash`} aria-readonly="true" />)}</>
        : field("effectiveFrom", "Effective from", `After ${term.startDate}, by ${term.endDate}`, <input name="effectiveFrom" type="date" required min={term.startDate} max={term.endDate} className={control} {...describe("effectiveFrom")} />)}</div>
      <div className="sm:col-span-2">{field("reason", "Reason", "1–500 characters. Shown to the approver and kept in history.", <textarea name="reason" required rows={2} maxLength={500} className={control} {...describe("reason")} />)}</div>
    </fieldset>
    <Feedback result={result} />
    {preview && <div role="region" aria-label="Impact preview" className="rounded-md border border-[var(--color-line)] bg-white p-3">
      <p className="mb-2 text-[12px] font-semibold">Impact if approved, from {preview.effectiveFrom}{preview.changed.length ? ` (${preview.changed.join(", ").toLowerCase()})` : ""}</p>
      <ImpactSummary impact={preview.impact} baseline={preview.baseline} />
    </div>}
    <div className="flex flex-wrap gap-2">
      {preview ? <>
        <button className={primary} disabled={pending}>{pending ? "Saving…" : "Submit proposal"}</button>
        <button type="button" className={quiet} disabled={pending} onClick={() => setPreview(null)}>Edit values</button>
      </> : <button className={primary} disabled={pending}>{pending ? "Checking…" : "Preview impact"}</button>}
    </div>
  </form>;
}
