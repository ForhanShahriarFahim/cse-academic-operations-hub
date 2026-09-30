"use client";

import { useId, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { deletePatternAction, savePatternAction } from "@/lib/time-grid-actions";
import {
  analyzeGridChange, fillEvenly, normalizePattern, patternSpan, validatePattern, withPattern,
  type GridBreak, type GridPeriod, type PeriodPattern, type TimeGrid,
} from "@/lib/time-grid";
import { DAY_NAMES } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";
import { FieldError, ImpactNotice, Timeline, fromTimeInput, hoursText, toTimeInput, type GridContext } from "./shared";

interface Row { key: number; kind: "period" | "break"; start: string; end: string; name: string; blocksClasses: boolean }

let rowKey = 0;
const rowsOf = (pattern: PeriodPattern | null): Row[] => [
  ...(pattern?.periods ?? []).map((p) => ({ key: ++rowKey, kind: "period" as const, start: toTimeInput(p.start), end: toTimeInput(p.end), name: "", blocksClasses: false })),
  ...(pattern?.breaks ?? []).map((b) => ({ key: ++rowKey, kind: "break" as const, start: toTimeInput(b.start), end: toTimeInput(b.end), name: b.name, blocksClasses: b.blocksClasses })),
].sort((a, b) => a.start.localeCompare(b.start));

const input = "min-h-[34px] w-full rounded-md border border-[var(--color-line)] bg-white px-2 font-mono text-[13px]";

export function PatternEditor({ grid, pattern, context, onDone, onCancel }: {
  grid: TimeGrid;
  /** null to create a new pattern. */
  pattern: PeriodPattern | null;
  context: GridContext;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [ask, confirmDialog] = useConfirm();
  const [name, setName] = useState(pattern?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsOf(pattern));
  const [fill, setFill] = useState({ first: "09:30", length: "75", count: "4", breakAfter: "3", breakLength: "75" });
  const [showFill, setShowFill] = useState(pattern == null);
  const [updateHours, setUpdateHours] = useState(true);
  const [moveClasses, setMoveClasses] = useState(false);
  const [serverResult, setServerResult] = useState<ActionResult | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  // Periods keep their row order so field errors ("period-2") point at the right inputs.
  const periodRows = rows.filter((r) => r.kind === "period");
  const breakRows = rows.filter((r) => r.kind === "break");
  const periods: GridPeriod[] = periodRows.map((r) => ({ start: fromTimeInput(r.start) ?? NaN, end: fromTimeInput(r.end) ?? NaN }));
  const breaks: GridBreak[] = breakRows.map((r) => ({ name: r.name, start: fromTimeInput(r.start) ?? NaN, end: fromTimeInput(r.end) ?? NaN, blocksClasses: r.blocksClasses }));
  const otherNames = grid.patterns.filter((p) => p.id !== pattern?.id).map((p) => p.name);
  const errors = validatePattern({ name, periods, breaks }, otherNames);
  const localErrors: Record<string, string[]> = {};
  for (const error of errors) (localErrors[error.field] ??= []).push(error.message);
  const serverErrors = serverResult?.outcome?.kind === "validation" ? serverResult.outcome.fieldErrors : {};
  const fieldErrors = { ...localErrors, ...serverErrors };
  const shownErrors = touched ? fieldErrors : serverErrors;

  const users = pattern ? grid.dayPlans.filter((plan) => plan.patternId === pattern.id) : [];
  const valid = errors.length === 0;
  const normalized = normalizePattern({ name, periods, breaks });
  const span = valid ? patternSpan(normalized) : null;

  const impact = (() => {
    if (!pattern || !valid) return null;
    const after = withPattern(grid, { ...pattern, ...normalized });
    let windowsAfter = context.windows;
    if (updateHours && span) {
      for (const plan of users) {
        windowsAfter = [
          ...windowsAfter.filter((w) => !(w.stream === plan.stream && w.batchId === plan.batchId && w.dayOfWeek === plan.dayOfWeek)),
          { stream: plan.stream, batchId: plan.batchId, dayOfWeek: plan.dayOfWeek, startMinutes: span.start, endMinutes: span.end },
        ];
      }
    }
    return analyzeGridChange({ meetings: context.meetings, before: grid, after, windowsBefore: context.windows, windowsAfter });
  })();

  function update(key: number, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  function add(kind: Row["kind"]) {
    const last = [...periods, ...breaks].filter((p) => Number.isFinite(p.end)).sort((a, b) => b.end - a.end)[0];
    const start = last ? last.end : 9 * 60;
    const length = kind === "period" ? (periods[0] && Number.isFinite(periods[0].end - periods[0].start) ? periods[0].end - periods[0].start : 60) : 60;
    setRows((current) => [...current, { key: ++rowKey, kind, start: toTimeInput(start), end: toTimeInput(start + length), name: kind === "break" ? "Break" : "", blocksClasses: false }]);
  }
  function applyFill() {
    const first = fromTimeInput(fill.first);
    const length = Number(fill.length);
    const count = Number(fill.count);
    const breakAfter = fill.breakAfter ? Number(fill.breakAfter) : null;
    const breakLength = Number(fill.breakLength) || 0;
    if (first == null || !(length >= 15 && length <= 240) || !(count >= 1 && count <= 16)) return;
    const generated = fillEvenly(first, length, count, breakAfter && breakAfter < count ? breakAfter : null, breakLength);
    const breakRow = breakAfter && breakAfter < count && breakLength > 0
      ? [{ key: ++rowKey, kind: "break" as const, start: toTimeInput(generated[breakAfter - 1].end), end: toTimeInput(generated[breakAfter].start), name: "Lunch", blocksClasses: false }]
      : [];
    setRows([...generated.map((p) => ({ key: ++rowKey, kind: "period" as const, start: toTimeInput(p.start), end: toTimeInput(p.end), name: "", blocksClasses: false })), ...breakRow]);
    setShowFill(false);
  }

  function save() {
    setTouched(true);
    if (!valid) return;
    startTransition(async () => {
      const result = await savePatternAction({
        patternId: pattern?.id ?? null, expectedUpdatedAt: pattern?.updatedAt ?? null, name, periods, breaks,
        updateHours: !!pattern && updateHours, moveClasses: !!pattern && moveClasses && (impact?.moves.length ?? 0) > 0,
      });
      setServerResult(result.ok ? null : result);
      if (result.ok) onDone(result);
    });
  }
  async function remove() {
    if (!pattern) return;
    if (!await ask({ title: `Delete ${pattern.name}?`, body: "The pattern is removed from this term. It is not used by any day, so no classes change.", confirmLabel: "Delete pattern" })) return;
    startTransition(async () => {
      const result = await deletePatternAction(pattern.id, pattern.updatedAt);
      setServerResult(result.ok ? null : result);
      if (result.ok) onDone(result);
    });
  }

  const describedBy = (field: string) => (shownErrors[field]?.length ? `${id}-${field}-error` : undefined);
  const usedOn = [...new Set(users.map((u) => DAY_NAMES[u.dayOfWeek]))];

  return (
    <div>
      {confirmDialog}
      <header className="border-b border-[var(--color-line-soft)] px-4 pb-2.5 pt-3.5">
        <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-[17px] font-semibold leading-snug outline-none">{pattern ? `Edit periods: ${pattern.name}` : "New period pattern"}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">{pattern ? (usedOn.length ? `Used on ${usedOn.join(", ")}.` : "Not used on any day yet.") : "Name it, then add periods and breaks."}</p>
      </header>
      <div className="px-4 pb-4 pt-3.5">
        {serverResult ? (
          <p role="alert" className="mb-3 rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-3 py-2 text-[13px] text-[var(--color-clay)]">{serverResult.message}</p>
        ) : null}
        <div className="mb-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!shownErrors.name} aria-describedby={describedBy("name")}
              className="min-h-[34px] w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[13px]" placeholder="For example HSC Saturday–Tuesday" />
          </label>
          <FieldError id={`${id}-name-error`} messages={shownErrors.name} />
        </div>

        <fieldset className="mb-2">
          <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Periods and breaks</legend>
          <FieldError id={`${id}-periods-error`} messages={shownErrors.periods} />
          <ol className="space-y-1.5">
            {[...rows].sort((a, b) => (fromTimeInput(a.start) ?? 9999) - (fromTimeInput(b.start) ?? 9999)).map((row) => {
              const index = row.kind === "period" ? periodRows.indexOf(row) : breakRows.indexOf(row);
              const field = `${row.kind}-${index}`;
              const label = row.kind === "period" ? `Period ${index + 1}` : row.name.trim() || `Break ${index + 1}`;
              return (
                <li key={row.key} className={row.kind === "break" ? "rounded-md bg-gold-tint px-1.5 py-1.5" : ""}>
                  <div className="grid grid-cols-[62px_minmax(0,1fr)_12px_minmax(0,1fr)_28px] items-center gap-1.5">
                    <span className={`text-[12.5px] font-medium ${row.kind === "break" ? "text-gold-text" : "text-ink-2"}`}>{row.kind === "period" ? `Period ${index + 1}` : "Break"}</span>
                    <input type="time" value={row.start} onChange={(event) => update(row.key, { start: event.target.value })} aria-label={`${label} start`} aria-invalid={!!shownErrors[field]} aria-describedby={describedBy(field)} className={input} />
                    <span className="text-center text-muted" aria-hidden="true">–</span>
                    <input type="time" value={row.end} onChange={(event) => update(row.key, { end: event.target.value })} aria-label={`${label} end`} aria-invalid={!!shownErrors[field]} aria-describedby={describedBy(field)} className={input} />
                    <button type="button" onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))} aria-label={`Remove ${label}`} className="grid h-7 place-items-center rounded text-muted hover:bg-wash"><X size={15} aria-hidden="true" /></button>
                  </div>
                  {row.kind === "break" ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-[68px] text-[12.5px]">
                      <input value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} aria-label={`Break ${index + 1} name`}
                        aria-invalid={!!shownErrors[`${field}-name`]} className="min-h-[30px] w-32 rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]" />
                      <label className="inline-flex items-center gap-1.5 text-ink-2">
                        <input type="checkbox" checked={row.blocksClasses} onChange={(event) => update(row.key, { blocksClasses: event.target.checked })} className="accent-[var(--color-clay)]" />
                        No classes allowed
                      </label>
                    </div>
                  ) : null}
                  <FieldError id={`${id}-${field}-error`} messages={shownErrors[field]} />
                  <FieldError id={`${id}-${field}-name-error`} messages={shownErrors[`${field}-name`]} />
                </li>
              );
            })}
          </ol>
        </fieldset>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => add("period")} className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-[var(--color-line)] bg-sheet px-2.5 text-[12.5px] font-medium"><Plus size={13} aria-hidden="true" />Period</button>
          <button type="button" onClick={() => add("break")} className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-[var(--color-line)] bg-sheet px-2.5 text-[12.5px] font-medium"><Plus size={13} aria-hidden="true" />Break</button>
          <button type="button" aria-expanded={showFill} onClick={() => setShowFill((v) => !v)} className="inline-flex min-h-[30px] items-center rounded-md border border-[var(--color-line)] bg-sheet px-2.5 text-[12.5px] font-medium">Fill evenly…</button>
        </div>
        {showFill ? (
          <fieldset className="mb-3 rounded-md border border-[var(--color-line)] bg-wash p-2.5">
            <legend className="px-1 text-[12.5px] font-medium">Fill evenly (replaces the list)</legend>
            <div className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-3">
              <label>First starts<input type="time" value={fill.first} onChange={(e) => setFill({ ...fill, first: e.target.value })} className={input} /></label>
              <label>Minutes each<input type="number" min={15} max={240} value={fill.length} onChange={(e) => setFill({ ...fill, length: e.target.value })} className={input} /></label>
              <label>How many<input type="number" min={1} max={16} value={fill.count} onChange={(e) => setFill({ ...fill, count: e.target.value })} className={input} /></label>
              <label>Break after period<input type="number" min={0} max={15} value={fill.breakAfter} onChange={(e) => setFill({ ...fill, breakAfter: e.target.value })} className={input} /></label>
              <label>Break minutes<input type="number" min={0} max={240} value={fill.breakLength} onChange={(e) => setFill({ ...fill, breakLength: e.target.value })} className={input} /></label>
              <button type="button" onClick={applyFill} className="self-end rounded-md border border-[var(--color-pine)] bg-white px-2.5 py-1.5 font-semibold text-[var(--color-pine)]">Fill</button>
            </div>
          </fieldset>
        ) : null}

        <Timeline periods={periods.filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end))} breaks={breaks.filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))}
          label={span ? `${periods.length} periods from ${hoursText(span.start, span.end)}` : "Periods"} showTimes showScale />

        <div className="mt-3">
          {impact ? (
            <ImpactNotice impact={impact} moveClasses={moveClasses} onMoveClasses={setMoveClasses}>
              {users.length && span ? (
                <label className="mt-2 flex items-start gap-2 text-[var(--color-ink)]">
                  <input type="checkbox" checked={updateHours} onChange={(event) => setUpdateHours(event.target.checked)} className="mt-1 accent-[var(--color-pine)]" />
                  <span>Change class hours on these days to {hoursText(span.start, span.end)}.</span>
                </label>
              ) : null}
            </ImpactNotice>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {pattern && users.length === 0 && context.canEdit ? (
            <button type="button" disabled={pending} onClick={remove} className="mr-auto text-[13px] font-semibold text-[var(--color-clay)] underline underline-offset-2">Delete pattern</button>
          ) : null}
          <button type="button" onClick={onCancel} className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">Cancel</button>
          <button type="button" disabled={pending || !context.canEdit} onClick={save}
            className="inline-flex min-h-9 items-center rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-medium text-white disabled:opacity-60">
            {pending ? "Saving…" : pattern ? "Save periods" : "Create pattern"}
          </button>
        </div>
      </div>
    </div>
  );
}
