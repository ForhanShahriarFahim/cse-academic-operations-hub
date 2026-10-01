"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, Copy, Plus } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { copyGridFromTermAction } from "@/lib/time-grid-actions";
import {
  dayGroups, exceptionKind, patternById, streamDays, streamPlan,
  type DayPlan, type PeriodPattern, type Stream, type TimeGrid,
} from "@/lib/time-grid";
import { DAY_NAMES, fmtTime, overlaps } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";
import { Notice } from "@/components/ui";
import { PatternEditor } from "./pattern-editor";
import { PlanEditor, type PlanTarget } from "./plan-editor";
import { Timeline, batchName, hoursText, type GridContext } from "./shared";

type Editor = { kind: "pattern"; pattern: PeriodPattern | null } | { kind: "plan"; target: PlanTarget };

const WEEK = [0, 1, 2, 3, 4, 5, 6];
const KIND_WORD = { extra_day: "Extra day", own_periods: "Own periods", no_classes: "No classes" } as const;
const KIND_TONE = {
  extra_day: "bg-pine-tint text-[var(--color-pine)]",
  own_periods: "bg-gold-tint text-gold-text",
  no_classes: "bg-clay-tint text-[var(--color-clay)]",
} as const;
const streamWord = (stream: Stream) => (stream === "HSC" ? "HSC" : "Diploma");

export function DaysAndPeriods({ grid, context, termName, otherTerms, initialStream }: {
  grid: TimeGrid;
  context: GridContext;
  termName: string;
  otherTerms: Array<{ id: number; name: string; patternCount: number }>;
  initialStream: Stream;
}) {
  const [stream, setStream] = useState<Stream>(initialStream);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [previewDay, setPreviewDay] = useState<number | null>(null);
  const [copySource, setCopySource] = useState<number>(otherTerms.find((t) => t.patternCount > 0)?.id ?? 0);
  const [ask, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const editorRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  /** The trigger's accessible name, to find it again when the list it sat in was re-created. */
  const returnTo = useRef<string | null>(null);

  const days = streamDays(grid, stream);
  const day = previewDay != null && days.includes(previewDay) ? previewDay : days[0] ?? null;
  const exceptions = grid.dayPlans
    .filter((p) => p.batchId != null && p.stream === stream)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || (a.batchId ?? 0) - (b.batchId ?? 0));
  const batchOf = (plan: DayPlan) => context.batches.find((b) => b.id === plan.batchId);
  const hoursFor = (batchId: number | null, dayOfWeek: number) =>
    context.windows.filter((w) => w.stream === stream && w.batchId === batchId && w.dayOfWeek === dayOfWeek);

  useEffect(() => {
    if (!editor) return;
    const heading = editorRef.current?.querySelector<HTMLElement>("h2[tabindex='-1']");
    heading?.focus();
    if (window.matchMedia("(max-width: 1179px)").matches) editorRef.current?.scrollIntoView({ block: "start" });
  }, [editor]);

  function open(next: Editor, from: HTMLElement) {
    trigger.current = from;
    returnTo.current = from.getAttribute("aria-label") ?? from.textContent;
    setNotice(null);
    setEditor(next);
  }
  function close() {
    setEditor(null);
    const target = trigger.current;
    trigger.current = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
    else pendingFocus.current = returnTo.current;
  }
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const label = pendingFocus.current;
    if (editor || !label) return;
    pendingFocus.current = null;
    const again = [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent) === label);
    again?.focus();
  }, [editor]);
  function done(result: ActionResult) {
    setEditor(null);
    setNotice(result);
  }
  // The result replaces the editor, so focus moves to it once it is on screen.
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  async function copy() {
    const source = otherTerms.find((t) => t.id === copySource);
    if (!source) return;
    if (!await ask({
      title: `Replace ${termName}'s days and periods with ${source.name}'s?`,
      body: `All period patterns, stream days, batch exceptions and class hours for ${termName} are replaced by a copy from ${source.name}. Classes are not moved; any that no longer fit show as clashes. ${source.name} is not changed.`,
      confirmLabel: "Replace and copy",
      tone: "danger",
    })) return;
    startTransition(async () => done(await copyGridFromTermAction(source.id, grid.patterns.length)));
  }

  const editorPanel = editor?.kind === "pattern" ? (
    <PatternEditor key={`p-${editor.pattern?.id ?? "new"}`} grid={grid} pattern={editor.pattern} context={context} onDone={done} onCancel={close} />
  ) : editor?.kind === "plan" ? (
    <PlanEditor key={`d-${JSON.stringify(editor.target)}`} grid={grid} target={editor.target} context={context} onDone={done} onCancel={close} />
  ) : null;

  return (
    <div>
      {confirmDialog}
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Stream" className="inline-flex rounded-[7px] border border-[var(--color-line)] bg-sheet p-0.5">
          {(["HSC", "DIPLOMA"] as Stream[]).map((value) => (
            <button key={value} type="button" aria-pressed={stream === value} onClick={() => { setStream(value); setPreviewDay(null); }}
              className={`rounded-[5px] px-3 py-1.5 text-[13px] font-medium ${stream === value ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>
              {streamWord(value)}
            </button>
          ))}
        </div>
        {!context.canEdit ? <span className="text-[13px] text-muted">You can view these settings. Routine coordinators and administrators can change them.</span> : null}
      </div>

      {notice ? (
        <div ref={noticeRef} tabIndex={-1} className="mb-3 outline-none">
          <Notice tone={notice.ok ? "success" : "error"}>
            <span>{notice.message}</span>
            {notice.outcome?.kind === "stale" ? <button type="button" onClick={() => window.location.reload()} className="ml-2 font-semibold underline underline-offset-2">Reload</button> : null}
          </Notice>
        </div>
      ) : null}

      {grid.patterns.length === 0 ? (
        <div className="mb-4 rounded-lg border border-dashed border-[var(--color-line)] bg-sheet p-5 text-[13.5px] text-ink-2">
          <p className="font-display text-[17px] font-semibold text-[var(--color-ink)]">No periods are set up for {termName} yet</p>
          <p className="mt-1">Copy them from another term below, or create a period pattern and then choose which days use it.</p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="dp-week" className="rounded-lg border border-[var(--color-line)] bg-sheet">
            <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2.5 pt-3.5">
              <h2 id="dp-week" className="font-display text-[16px] font-semibold">{streamWord(stream)} week</h2>
              <span className="text-[12.5px] text-muted">{days.length ? `Teaches ${days.map((d) => DAY_NAMES[d]).join(", ")}` : "No teaching days yet"}</span>
            </header>
            <ul className="border-t border-[var(--color-line-soft)]">
              {WEEK.map((d) => {
                const plan = streamPlan(grid, stream, d);
                const pattern = patternById(grid, plan?.patternId);
                const hours = hoursFor(null, d);
                const dayExceptions = exceptions.filter((e) => e.dayOfWeek === d);
                return (
                  <li key={d} className={`grid gap-x-4 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3 last:border-b-0 sm:grid-cols-[96px_minmax(170px,210px)_minmax(0,1fr)_auto] sm:items-center ${pattern ? "" : "bg-[repeating-linear-gradient(-45deg,rgba(86,97,90,.045)_0_6px,transparent_6px_12px)]"}`}>
                    <p className={`text-[13.5px] font-semibold ${pattern ? "" : "text-muted"}`}>{DAY_NAMES[d]}</p>
                    {pattern ? (
                      <>
                        <div className="min-w-0 text-[13px]">
                          <p className="truncate font-semibold">{pattern.name}</p>
                          <p className="text-[12px] text-muted">{hours.length ? `Class hours ${hours.map((w) => hoursText(w.startMinutes, w.endMinutes)).join(", ")}` : "No class hours set"}</p>
                        </div>
                        <Timeline periods={pattern.periods} breaks={pattern.breaks} label={`${DAY_NAMES[d]}: ${pattern.periods.length} periods, ${hoursText(pattern.periods[0].start, pattern.periods.at(-1)!.end)}`} />
                      </>
                    ) : (
                      <p className="text-[13px] text-muted sm:col-span-2">No {streamWord(stream)} classes</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:justify-end">
                      {dayExceptions.length ? (
                        <span className="text-[12.5px] font-semibold text-gold-text">
                          {dayExceptions.map((e) => `${batchOf(e) ? batchName(stream, batchOf(e)!.label) : "Batch"}: ${KIND_WORD[exceptionKind(grid, e)].toLowerCase()}`).join(" · ")}
                        </span>
                      ) : null}
                      {context.canEdit ? (
                        <button type="button" onClick={(event) => open({ kind: "plan", target: { kind: "day", stream, dayOfWeek: d } }, event.currentTarget)}
                          aria-label={`${pattern ? "Edit" : "Add classes on"} ${DAY_NAMES[d]} for ${streamWord(stream)}`}
                          className="text-[13px] font-semibold text-[var(--color-pine)] underline-offset-2 hover:underline">{pattern ? "Edit" : "Add"}</button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="dp-exceptions" className="rounded-lg border border-[var(--color-line)] bg-sheet">
            <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3.5">
              <h2 id="dp-exceptions" className="font-display text-[16px] font-semibold">Batch exceptions</h2>
              {context.canEdit ? (
                <button type="button" onClick={(event) => open({ kind: "plan", target: { kind: "exception", stream, plan: null } }, event.currentTarget)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-pine)]"><Plus size={14} aria-hidden="true" />Add exception</button>
              ) : null}
            </header>
            <p className="px-4 pb-2 text-[13px] text-ink-2">An exception changes one batch only, for example an extra Friday, its own periods, or no classes on a day.</p>
            {exceptions.length === 0 ? (
              <p className="mx-4 mb-4 rounded-md border border-dashed border-[var(--color-line)] bg-wash px-3 py-2.5 text-[13px] text-ink-2">Every {streamWord(stream)} batch follows the week above.</p>
            ) : (
              <ul className="px-4 pb-1">
                {exceptions.map((plan) => {
                  const kind = exceptionKind(grid, plan);
                  const pattern = patternById(grid, plan.patternId);
                  const batch = batchOf(plan);
                  const hours = hoursFor(plan.batchId, plan.dayOfWeek);
                  return (
                    <li key={plan.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-[var(--color-line-soft)] py-3 first:border-t-0 sm:grid-cols-[96px_minmax(0,1fr)_auto]">
                      <b className="font-mono text-[13px]">{batch ? batchName(stream, batch.label) : "Unknown batch"}</b>
                      <p className="col-span-2 row-start-2 text-[13.5px] sm:col-span-1 sm:row-start-auto">
                        <span className={`mr-1.5 inline-block rounded px-1.5 py-px text-[11.5px] font-semibold ${KIND_TONE[kind]}`}>{KIND_WORD[kind]}</span>
                        <b>{DAY_NAMES[plan.dayOfWeek]}</b>
                        {pattern ? <> · periods <b>{pattern.name}</b>{hours.length ? ` (class hours ${hours.map((w) => hoursText(w.startMinutes, w.endMinutes)).join(", ")})` : ""}</> : null}
                        {plan.reason ? <span className="block text-[12.5px] text-muted">Reason: {plan.reason}</span> : null}
                      </p>
                      {context.canEdit ? (
                        <button type="button" onClick={(event) => open({ kind: "plan", target: { kind: "exception", stream, plan } }, event.currentTarget)}
                          aria-label={`Edit the ${DAY_NAMES[plan.dayOfWeek]} exception for ${batch ? batchName(stream, batch.label) : "this batch"}`}
                          className="col-start-2 row-start-1 self-start text-right text-[13px] font-semibold text-[var(--color-pine)] underline-offset-2 hover:underline sm:col-start-3">Edit</button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="dp-preview" className="rounded-lg border border-[var(--color-line)] bg-sheet">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3.5">
              <h2 id="dp-preview" className="font-display text-[16px] font-semibold">Preview{day != null ? `: ${streamWord(stream)} ${DAY_NAMES[day]}` : ""}</h2>
              {days.length ? (
                <span className="flex items-center gap-3 text-[13px]">
                  <label className="flex items-center gap-1.5 text-ink-2">Day
                    <select value={day ?? ""} onChange={(event) => setPreviewDay(Number(event.target.value))} className="min-h-[32px] rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]">
                      {days.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                    </select>
                  </label>
                  <Link href={`/routine?stream=${stream}&view=day&day=${day ?? ""}`} className="font-semibold text-[var(--color-pine)] underline underline-offset-2">Open in builder</Link>
                </span>
              ) : null}
            </header>
            <p className="px-4 pb-2.5 text-[13px] text-ink-2">When batches on one day use different periods, each group gets its own header row, like the separate tables in a printed individual routine.</p>
            {day != null ? <Preview grid={grid} stream={stream} day={day} context={context} /> : (
              <p className="mx-4 mb-4 rounded-md border border-dashed border-[var(--color-line)] bg-wash px-3 py-2.5 text-[13px] text-ink-2">Add a teaching day to see the grid.</p>
            )}
          </section>
        </div>

        <aside ref={editorRef} aria-label={editor ? "Editor" : "Period patterns"} className="scroll-mt-4 rounded-lg border border-[var(--color-line)] bg-sheet min-[1180px]:sticky min-[1180px]:top-4 min-[1180px]:max-h-[calc(100vh-32px)] min-[1180px]:overflow-y-auto">
          {editorPanel ?? (
            <div>
              <header className="flex items-baseline justify-between gap-2 border-b border-[var(--color-line-soft)] px-4 pb-2.5 pt-3.5">
                <h2 className="font-display text-[16px] font-semibold">Period patterns</h2>
                {context.canEdit ? (
                  <button type="button" onClick={(event) => open({ kind: "pattern", pattern: null }, event.currentTarget)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-pine)]"><Plus size={14} aria-hidden="true" />New pattern</button>
                ) : null}
              </header>
              {grid.patterns.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-2">None yet for {termName}.</p> : (
                <ul>
                  {grid.patterns.map((pattern) => {
                    const usedOn = grid.dayPlans.filter((p) => p.patternId === pattern.id);
                    const words = [...new Set(usedOn.map((p) => (p.batchId == null ? `${streamWord(p.stream)} ${DAY_NAMES[p.dayOfWeek]}` : `${batchName(p.stream, context.batches.find((b) => b.id === p.batchId)?.label ?? "?")} ${DAY_NAMES[p.dayOfWeek]}`)))];
                    return (
                      <li key={pattern.id} className="border-b border-[var(--color-line-soft)] px-4 py-3 last:border-b-0">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <p className="min-w-0 truncate text-[13.5px] font-semibold">{pattern.name}</p>
                          {context.canEdit ? (
                            <button type="button" onClick={(event) => open({ kind: "pattern", pattern }, event.currentTarget)} aria-label={`Edit ${pattern.name}`}
                              className="text-[13px] font-semibold text-[var(--color-pine)] underline-offset-2 hover:underline">Edit</button>
                          ) : null}
                        </div>
                        <Timeline periods={pattern.periods} breaks={pattern.breaks} label={`${pattern.name}: ${pattern.periods.map((p) => `${fmtTime(p.start)} to ${fmtTime(p.end)}`).join(", ")}`} showTimes />
                        <p className="mt-1.5 text-[12px] text-muted">{words.length ? `Used on ${words.join(", ")}` : "Not used on any day"}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {context.canEdit && otherTerms.some((t) => t.patternCount > 0) ? (
                <div className="border-t border-[var(--color-line)] px-4 py-3.5">
                  <h3 className="text-[13.5px] font-semibold">Copy from another term</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">Start a new term from an earlier one, then change what differs.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor="dp-copy-source">Term to copy from</label>
                    <select id="dp-copy-source" value={copySource} onChange={(event) => setCopySource(Number(event.target.value))} className="min-h-[34px] rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]">
                      {otherTerms.filter((t) => t.patternCount > 0).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.patternCount} pattern{t.patternCount === 1 ? "" : "s"})</option>)}
                    </select>
                    <button type="button" disabled={pending} onClick={copy} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-sheet px-3 text-[13px] font-medium"><Copy size={14} aria-hidden="true" />Copy…</button>
                  </div>
                </div>
              ) : null}
              <div className="border-t border-[var(--color-line)] px-4 py-3.5">
                <Link href="/routine" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-pine)]"><CalendarDays size={14} aria-hidden="true" />Open Routine builder</Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The chosen day's grid by period group, with classes at their periods (a light version of the builder grid). */
function Preview({ grid, stream, day, context }: { grid: TimeGrid; stream: Stream; day: number; context: GridContext }) {
  const groups = dayGroups(grid, stream, day, context.batches);
  const classesOf = (batchId: number) => context.meetings.filter((m) => m.dayOfWeek === day && m.audiences.some((a) => a.batchId === batchId));
  if (groups.length === 0) return <p className="mx-4 mb-4 text-[13px] text-muted">No batches teach this day.</p>;
  return (
    <div role="region" aria-label={`${DAY_NAMES[day]} preview`} tabIndex={0} className="table-region mx-4 mb-4 overflow-x-auto rounded-md border border-[var(--color-line)]">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[12.5px]">
        {groups.map((group) => {
          const periods = group.pattern.periods;
          return (
            <Fragment key={group.pattern.id}>
              <thead>
                <tr><th colSpan={periods.length + 1} className="bg-[var(--color-ink)] px-2.5 py-1.5 text-left text-[12px] font-semibold text-white">
                  {group.pattern.name}<span className="ml-2 font-normal text-[#c8d0cb]">{group.batches.map((b) => batchName(b.stream, b.label)).join(" · ")}</span>
                </th></tr>
                <tr>
                  <th scope="col" className="w-[88px] border-b border-r border-[var(--color-line-soft)] bg-wash px-2 py-1.5 text-left font-semibold">Batch</th>
                  {periods.map((p) => <th key={p.start} scope="col" className="border-b border-r border-[var(--color-line-soft)] bg-wash px-2 py-1.5 text-left font-mono text-[12px] font-semibold text-ink-2">{hoursText(p.start, p.end)}</th>)}
                </tr>
              </thead>
              <tbody>
                {group.batches.map((batch) => {
                  const classes = classesOf(batch.id);
                  return (
                    <tr key={batch.id}>
                      <th scope="row" className="border-b border-r border-[var(--color-line-soft)] px-2 py-1.5 text-left font-mono font-semibold">{batchName(batch.stream, batch.label)}</th>
                      {periods.map((p) => {
                        const here = classes.filter((m) => overlaps(m.startMinutes, m.endMinutes, p.start, p.end));
                        return (
                          <td key={p.start} className="border-b border-r border-[var(--color-line-soft)] px-1.5 py-1 align-top">
                            {here.map((m) => (
                              <span key={m.id} className="mb-0.5 block rounded border border-[var(--color-line)] border-l-[3px] border-l-[var(--color-pine)] bg-white px-1.5 py-0.5 font-mono text-[12px] font-semibold">
                                {m.courseCode}{m.startMinutes !== p.start ? <span className="block font-sans text-[11px] font-normal text-muted">{hoursText(m.startMinutes, m.endMinutes)}</span> : null}
                              </span>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </Fragment>
          );
        })}
      </table>
    </div>
  );
}
