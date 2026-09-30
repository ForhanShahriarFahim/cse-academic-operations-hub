"use client";

import { useId, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { removeExceptionAction, setDayPlanAction } from "@/lib/time-grid-actions";
import {
  analyzeGridChange, patternById, patternSpan, streamPlan, withDayPlan,
  type DayPlan, type Stream, type TimeGrid,
} from "@/lib/time-grid";
import { DAY_NAMES } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";
import { FieldError, ImpactNotice, Timeline, batchName, fromTimeInput, hoursText, toTimeInput, type GridContext } from "./shared";

/** What the editor is changing: the stream's own day, or one batch's exception (new when `plan` is null). */
export type PlanTarget =
  | { kind: "day"; stream: Stream; dayOfWeek: number }
  | { kind: "exception"; stream: Stream; plan: DayPlan | null };

const control = "min-h-[34px] w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[13px]";
const WEEK = [0, 1, 2, 3, 4, 5, 6];

export function PlanEditor({ grid, target, context, onDone, onCancel }: {
  grid: TimeGrid;
  target: PlanTarget;
  context: GridContext;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [ask, confirmDialog] = useConfirm();
  const stream = target.stream;
  const existing = target.kind === "day" ? streamPlan(grid, stream, target.dayOfWeek) : target.plan;
  const streamBatches = context.batches.filter((b) => b.stream === stream);

  const [batchId, setBatchId] = useState<number | null>(target.kind === "exception" ? target.plan?.batchId ?? streamBatches[0]?.id ?? null : null);
  const [day, setDay] = useState(target.kind === "day" ? target.dayOfWeek : target.plan?.dayOfWeek ?? 6);
  const [patternId, setPatternId] = useState<number | null>(existing?.patternId ?? (target.kind === "exception" && !target.plan ? grid.patterns[0]?.id ?? null : null));
  const currentHours = context.windows.find((w) => w.stream === stream && w.batchId === (target.kind === "day" ? null : batchId) && w.dayOfWeek === day);
  const [start, setStart] = useState(toTimeInput(currentHours?.startMinutes ?? (patternSpan(patternById(grid, patternId) ?? { periods: [] })?.start ?? null)));
  const [end, setEnd] = useState(toTimeInput(currentHours?.endMinutes ?? (patternSpan(patternById(grid, patternId) ?? { periods: [] })?.end ?? null)));
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [moveClasses, setMoveClasses] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // For a new exception, an existing exception on the same batch and day is edited instead.
  const sameKey = target.kind === "exception" && batchId != null
    ? grid.dayPlans.find((p) => p.batchId === batchId && p.dayOfWeek === day) ?? null : null;
  const editing = target.kind === "day" ? existing : sameKey;
  const pattern = patternById(grid, patternId);
  const hours = { start: fromTimeInput(start), end: fromTimeInput(end) };
  const hoursValid = hours.start != null && hours.end != null && hours.end > hours.start;
  const key = { stream, batchId: target.kind === "day" ? null : batchId, dayOfWeek: day };
  const streamOwn = streamPlan(grid, stream, day);
  const kindWord = target.kind === "day" ? null
    : patternId == null ? "No classes" : streamOwn?.patternId != null ? "Own periods" : "Extra day";

  const impact = (() => {
    if (key.batchId === null && target.kind === "exception") return null;
    if (patternId != null && !hoursValid) return null;
    const plan: DayPlan | null = target.kind === "day" && patternId == null ? null : {
      id: editing?.id ?? -1, stream, batchId: key.batchId, dayOfWeek: day, patternId, reason, updatedAt: null,
    };
    const after = withDayPlan(grid, key, plan);
    const rest = context.windows.filter((w) => !(w.stream === stream && w.batchId === key.batchId && w.dayOfWeek === day));
    const windowsAfter = patternId != null && hoursValid ? [...rest, { stream, batchId: key.batchId, dayOfWeek: day, startMinutes: hours.start!, endMinutes: hours.end! }] : rest;
    return analyzeGridChange({ meetings: context.meetings, before: grid, after, windowsBefore: context.windows, windowsAfter });
  })();

  function choosePattern(value: string) {
    const next = value === "" ? null : Number(value);
    setPatternId(next);
    const span = patternSpan(patternById(grid, next) ?? { periods: [] });
    if (span) { setStart(toTimeInput(span.start)); setEnd(toTimeInput(span.end)); }
  }

  const errors = result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};
  function save() {
    startTransition(async () => {
      const response = await setDayPlanAction({
        stream, batchId: key.batchId, dayOfWeek: day, patternId,
        hours: patternId != null && hoursValid ? { start: hours.start!, end: hours.end! } : null,
        reason, expectedUpdatedAt: editing?.updatedAt ?? null,
        moveClasses: moveClasses && (impact?.moves.length ?? 0) > 0,
      });
      setResult(response.ok ? null : response);
      if (response.ok) onDone(response);
    });
  }
  async function remove() {
    if (!editing || editing.batchId == null) return;
    const batch = context.batches.find((b) => b.id === editing.batchId);
    if (!await ask({
      title: `Remove the ${DAY_NAMES[editing.dayOfWeek]} exception for ${batch ? batchName(batch.stream, batch.label) : "this batch"}?`,
      body: `The batch follows the ${stream === "HSC" ? "HSC" : "Diploma"} week again on ${DAY_NAMES[editing.dayOfWeek]}. Classes are not moved; any that no longer fit show as clashes.`,
      confirmLabel: "Remove exception",
    })) return;
    startTransition(async () => {
      const response = await removeExceptionAction(editing.id, editing.updatedAt);
      setResult(response.ok ? null : response);
      if (response.ok) onDone(response);
    });
  }

  const title = target.kind === "day"
    ? `${DAY_NAMES[day]} for ${stream === "HSC" ? "HSC" : "Diploma"}`
    : editing ? "Edit batch exception" : "New batch exception";
  const invalidHours = patternId != null && !hoursValid;

  return (
    <div>
      {confirmDialog}
      <header className="border-b border-[var(--color-line-soft)] px-4 pb-2.5 pt-3.5">
        <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-[17px] font-semibold leading-snug outline-none">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {target.kind === "day" ? "Applies to every batch in the stream, except batches with their own exception that day." : "Changes one batch only. Every other batch keeps the stream's week."}
        </p>
      </header>
      <div className="space-y-3 px-4 pb-4 pt-3.5">
        {result ? <p role="alert" className="rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-3 py-2 text-[13px] text-[var(--color-clay)]">{result.message}</p> : null}

        {target.kind === "exception" ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block">
                <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Batch</span>
                <select value={batchId ?? ""} onChange={(event) => setBatchId(Number(event.target.value))} disabled={!!target.plan}
                  aria-invalid={!!errors.batchId} aria-describedby={errors.batchId ? `${id}-batch-error` : undefined} className={control}>
                  {streamBatches.map((b) => <option key={b.id} value={b.id}>{batchName(b.stream, b.label)}</option>)}
                </select>
              </label>
              <FieldError id={`${id}-batch-error`} messages={errors.batchId} />
            </div>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Day</span>
              <select value={day} onChange={(event) => setDay(Number(event.target.value))} disabled={!!target.plan} className={control}>
                {WEEK.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        {target.kind === "exception" && !target.plan && sameKey ? (
          <p className="text-[12.5px] text-gold-text">This batch already has an exception on {DAY_NAMES[day]}; saving replaces it.</p>
        ) : null}

        <div>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">{target.kind === "day" ? "Periods" : "What happens that day"}</span>
            <select value={patternId ?? ""} onChange={(event) => choosePattern(event.target.value)}
              aria-invalid={!!errors.patternId} aria-describedby={errors.patternId ? `${id}-pattern-error` : undefined} className={control}>
              <option value="">{target.kind === "day" ? "No classes" : "No classes for this batch"}</option>
              {grid.patterns.map((p) => <option key={p.id} value={p.id}>Classes, using {p.name}</option>)}
            </select>
          </label>
          <FieldError id={`${id}-pattern-error`} messages={errors.patternId} />
          {kindWord ? <span className="mt-1 block text-[12.5px] text-muted">Shown as: <b className="text-ink-2">{kindWord}</b></span> : null}
        </div>

        {pattern ? (
          <>
            <Timeline periods={pattern.periods} breaks={pattern.breaks} label={`${pattern.name}: ${pattern.periods.length} periods`} showTimes showScale />
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Class hours (when classes may be placed)</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_12px_minmax(0,1fr)] items-center gap-1.5">
                <input type="time" value={start} onChange={(event) => setStart(event.target.value)} aria-label="Class hours start" aria-invalid={invalidHours || !!errors.hours}
                  aria-describedby={invalidHours || errors.hours ? `${id}-hours-error` : undefined} className={`${control} font-mono`} />
                <span className="text-center text-muted" aria-hidden="true">–</span>
                <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="Class hours end" aria-invalid={invalidHours || !!errors.hours}
                  aria-describedby={invalidHours || errors.hours ? `${id}-hours-error` : undefined} className={`${control} font-mono`} />
              </div>
              <FieldError id={`${id}-hours-error`} messages={errors.hours ?? (invalidHours ? ["Class hours must end after they start."] : undefined)} />
              {hoursValid ? <span className="mt-1 block text-[12.5px] text-muted">{hoursText(hours.start!, hours.end!)}</span> : null}
            </fieldset>
          </>
        ) : null}

        {target.kind === "exception" ? (
          <div>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Reason</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300}
                aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${id}-reason-error` : undefined}
                placeholder="For example: replacement slot agreed with the batch" className={control} />
            </label>
            <FieldError id={`${id}-reason-error`} messages={errors.reason} />
          </div>
        ) : null}

        {impact ? <ImpactNotice impact={impact} moveClasses={moveClasses} onMoveClasses={setMoveClasses} /> : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {editing && editing.batchId != null && target.kind === "exception" && context.canEdit ? (
            <button type="button" disabled={pending} onClick={remove} className="mr-auto text-[13px] font-semibold text-[var(--color-clay)] underline underline-offset-2">Remove exception</button>
          ) : null}
          <button type="button" onClick={onCancel} className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">Cancel</button>
          <button type="button" disabled={pending || !context.canEdit || invalidHours || (target.kind === "exception" && batchId == null)} onClick={save}
            className="inline-flex min-h-9 items-center rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-medium text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
