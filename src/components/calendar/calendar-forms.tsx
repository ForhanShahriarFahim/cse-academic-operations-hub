"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";
import { fmtInstant } from "@/lib/auth/display";
import { changeCalendarAction, loadCalendarChangesAction } from "@/lib/calendar-actions";
import type { CalendarChange } from "@/lib/calendar-data";
import type { CalendarResult } from "@/lib/calendar-store";
import { CALENDAR_ACTION_LABELS, ENTRY_KINDS, ENTRY_KIND_LABELS, REASON_MAX, REGULAR_CLASS_LABELS, SOURCE_MAX, TITLE_MAX, URL_MAX, dateRange, isExamKind, kindLabel, type CalendarEntry, type CalendarTerm, type TeachingRange } from "@/lib/calendar-records";

/** Success returns to the calendar with its message; failures keep every entry and take focus. */
function useCalendarAction(returnHref: string) {
  const router = useRouter(), summary = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState<CalendarResult | null, FormData>(async (previous, form) => {
    const next = await changeCalendarAction(previous, form);
    if (next.ok) { router.push(`${returnHref}?done=${encodeURIComponent(next.message)}`); router.refresh(); }
    return next;
  }, null);
  useEffect(() => { if (result && !result.ok) summary.current?.focus(); }, [result]);
  const [, startTransition] = useTransition();
  // Dispatching from onSubmit avoids React's automatic form reset after a failed save.
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form)); };
  return { result, submit, pending, summary };
}

function Feedback({ result, summary }: { result: CalendarResult | null; summary: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={summary} tabIndex={-1} className="outline-none" aria-live="polite">
    {result && !result.ok && <ResultNotice result={result} />}
    {result?.issues?.map(issue => <p key={`${issue.title}-${issue.detail}`} className="mt-2 text-[13px]"><strong>{issue.title}.</strong> {issue.detail}</p>)}
    {result?.outcome?.kind === "stale" && <p className="mt-2 text-[13px]">Your entries are kept. Nothing was saved. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Reload the current calendar</button></p>}
  </div>;
}

function Field({ label, name, result, hint, children }: { label: string; name: string; result: CalendarResult | null; hint?: string; children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string; className: string }) => React.ReactNode }) {
  const id = useId(), errors = fieldErrors(result, name);
  return <div className="grid min-w-0 gap-1.5 text-[13.5px]">
    <label htmlFor={id} className="font-semibold">{label}</label>
    {children({ id, "aria-invalid": errors.length > 0, "aria-describedby": `${id}-hint ${id}-error`, className: inputClass })}
    <FieldError id={`${id}-error`} messages={errors} />
    {hint && <p id={`${id}-hint`} className="text-[12.5px] text-muted">{hint}</p>}
  </div>;
}

function SourceFields({ result, source, setSource, url, setUrl }: { result: CalendarResult | null; source: string; setSource: (value: string) => void; url: string; setUrl: (value: string) => void }) {
  return <>
    <Field label="Source reference" name="source" result={result} hint="The approved notice or document: issuer, notice number or title, and date. No student names or details.">
      {props => <input {...props} name="source" value={source} onChange={event => setSource(event.target.value)} maxLength={SOURCE_MAX} autoComplete="off" />}
    </Field>
    <Field label="Public source link (optional)" name="sourceUrl" result={result} hint="A link starting with https:// or http://, when the notice is published online.">
      {props => <input {...props} name="sourceUrl" type="url" inputMode="url" value={url} onChange={event => setUrl(event.target.value)} maxLength={URL_MAX} autoComplete="off" />}
    </Field>
  </>;
}

function ReasonField({ result, value, setValue, required }: { result: CalendarResult | null; value: string; setValue: (value: string) => void; required: boolean }) {
  return <Field label={`Reason for correction${required ? "" : " (optional)"}`} name="reason" result={result} hint={`Up to ${REASON_MAX} characters. Recorded in the calendar's change history.`}>
    {props => <textarea {...props} className={`${props.className} py-2`} name="reason" rows={2} value={value} onChange={event => setValue(event.target.value)} maxLength={REASON_MAX} />}
  </Field>;
}

const Pending = ({ pending }: { pending: boolean }) => <span className="sr-only" role="status">{pending ? "Saving…" : ""}</span>;
const sectionClass = "ruled grid min-w-0 gap-4 rounded-lg p-4 sm:p-5";
const Hidden = ({ values }: { values: Record<string, string | number> }) => <>{Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}</>;
const TermBounds = ({ term }: { term: CalendarTerm }) => <p className="text-[13px] text-muted">Term dates: <strong className="text-[var(--color-ink)]">{dateRange(term.startDate, term.endDate)}</strong>. Dates are civil dates in Asia/Dhaka.</p>;

export function TeachingForm({ term, revision, teaching, returnHref }: { term: CalendarTerm; revision: number; teaching: TeachingRange | null; returnHref: string }) {
  const [start, setStart] = useState(teaching?.start ?? ""), [end, setEnd] = useState(teaching?.end ?? "");
  const [source, setSource] = useState(teaching?.source ?? ""), [url, setUrl] = useState(teaching?.sourceUrl ?? ""), [reason, setReason] = useState("");
  const { result, submit, pending, summary } = useCalendarAction(returnHref);
  const clearing = !!teaching && !start && !end && !source && !url;
  return <form onSubmit={submit} className={sectionClass} noValidate>
    <Hidden values={{ command: "teaching", termId: term.id, revision }} />
    <Feedback result={result} summary={summary} />
    <TermBounds term={term} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First regular class day" name="teachingStart" result={result}>{props => <input {...props} type="date" name="teachingStart" min={term.startDate} max={term.endDate} value={start} onChange={event => setStart(event.target.value)} />}</Field>
      <Field label="Last regular class day" name="teachingEnd" result={result} hint="Both may be the same date.">{props => <input {...props} type="date" name="teachingEnd" min={start || term.startDate} max={term.endDate} value={end} onChange={event => setEnd(event.target.value)} />}</Field>
    </div>
    <SourceFields result={result} source={source} setSource={setSource} url={url} setUrl={setUrl} />
    {teaching && <ReasonField result={result} value={reason} setValue={setReason} required />}
    {teaching && <p className="text-[12.5px] text-muted">To clear the teaching dates, empty both dates and the source, then give a reason.</p>}
    <div className="flex flex-wrap gap-2">
      <button className={clearing ? buttonClass.danger : buttonClass.primary} type="submit" disabled={pending}>{pending ? "Saving…" : clearing ? "Clear teaching dates" : "Save teaching dates"}</button>
      <Link className={buttonClass.secondary} href={returnHref}>Back to calendar</Link>
    </div>
    <Pending pending={pending} />
  </form>;
}

export function EntryForm({ term, revision, entry, returnHref }: { term: CalendarTerm; revision: number; entry?: CalendarEntry; returnHref: string }) {
  const editing = !!entry;
  const [kind, setKind] = useState(entry?.kind ?? ""), [title, setTitle] = useState(entry?.title ?? "");
  const [start, setStart] = useState(entry?.startDate ?? ""), [end, setEnd] = useState(entry?.endDate ?? "");
  const [effect, setEffect] = useState(entry?.regularClasses ?? "");
  const [source, setSource] = useState(entry?.source ?? ""), [url, setUrl] = useState(entry?.sourceUrl ?? ""), [reason, setReason] = useState("");
  const { result, submit, pending, summary } = useCalendarAction(returnHref);
  const kindErrors = fieldErrors(result, "kind"), effectErrors = fieldErrors(result, "regularClasses");
  const legendId = useId();
  return <form onSubmit={submit} className={sectionClass} noValidate>
    <Hidden values={{ command: editing ? "update" : "create", termId: term.id, revision, ...(editing ? { entryId: entry!.id } : {}) }} />
    <Feedback result={result} summary={summary} />
    <TermBounds term={term} />
    {editing ? <p className="text-[13.5px]"><span className="font-semibold">Type:</span> {kindLabel(entry!.kind)}<span className="block text-[12.5px] text-muted">A different type is a different notice. Remove this entry and add a new one instead.</span></p>
      : <fieldset className="grid gap-2" aria-describedby={`${legendId}-error`}>
        <legend className="text-[13.5px] font-semibold">Type</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">{ENTRY_KINDS.map(value => <label key={value} className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-line)] bg-white px-3 text-[13.5px]">
          <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} />{ENTRY_KIND_LABELS[value]}
        </label>)}</div>
        <FieldError id={`${legendId}-error`} messages={kindErrors} />
        {(kind === "public_holiday" || kind === "university_holiday" || kind === "class_suspension") && <p className="text-[12.5px] text-muted">Use this type only for a notice that closes regular classes across the whole term audience. A general holiday list still needs an approved local notice.</p>}
      </fieldset>}
    <Field label="Title" name="title" result={result} hint="A short display name, for example “Independence Day” or “Midterm examinations”.">
      {props => <input {...props} name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={TITLE_MAX} autoComplete="off" />}
    </Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Start date" name="startDate" result={result}>{props => <input {...props} type="date" name="startDate" min={term.startDate} max={term.endDate} value={start} onChange={event => setStart(event.target.value)} />}</Field>
      <Field label="End date" name="endDate" result={result} hint="For one day, enter the same date again.">{props => <input {...props} type="date" name="endDate" min={start || term.startDate} max={term.endDate} value={end} onChange={event => setEnd(event.target.value)} />}</Field>
    </div>
    {isExamKind(kind) && <fieldset className="grid gap-2" aria-describedby={`${legendId}-effect-error`}>
      <legend className="text-[13.5px] font-semibold">Regular classes during this period</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">{(["continue", "suspended"] as const).map(value => <label key={value} className="flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-line)] bg-white px-3 text-[13.5px]">
        <input type="radio" name="regularClasses" value={value} checked={effect === value} onChange={() => setEffect(value)} />{REGULAR_CLASS_LABELS[value]}
      </label>)}</div>
      <FieldError id={`${legendId}-effect-error`} messages={effectErrors} />
      <p className="text-[12.5px] text-muted">An exam period does not say that any one exam takes place or is cancelled.</p>
    </fieldset>}
    <SourceFields result={result} source={source} setSource={setSource} url={url} setUrl={setUrl} />
    {editing && <ReasonField result={result} value={reason} setValue={setReason} required />}
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass.primary} type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Save entry"}</button>
      <Link className={buttonClass.secondary} href={returnHref}>Back to calendar</Link>
    </div>
    <Pending pending={pending} />
  </form>;
}

export function RemoveEntryForm({ term, revision, entry, returnHref }: { term: CalendarTerm; revision: number; entry: CalendarEntry; returnHref: string }) {
  const [reason, setReason] = useState("");
  const { result, submit, pending, summary } = useCalendarAction(returnHref);
  return <form onSubmit={submit} className={sectionClass} noValidate aria-labelledby="remove-entry">
    <Hidden values={{ command: "remove", termId: term.id, revision, entryId: entry.id }} />
    <h2 id="remove-entry" className="font-display text-[18px] font-semibold tracking-tight">Remove this entry</h2>
    <Feedback result={result} summary={summary} />
    <p className="text-[13.5px]">Removing <strong>{kindLabel(entry.kind)} “{entry.title}”</strong> ({dateRange(entry.startDate, entry.endDate)}) takes it off the calendar screen and print. The change history keeps what it said.</p>
    <ReasonField result={result} value={reason} setValue={setReason} required />
    <div><button className={buttonClass.danger} type="submit" disabled={pending}>{pending ? "Removing…" : "Remove entry"}</button></div>
    <Pending pending={pending} />
  </form>;
}

function describe(value: unknown): string {
  if (!value || typeof value !== "object") return "None";
  const raw = value as Record<string, unknown>, text = (item: unknown) => typeof item === "string" ? item : "";
  if (typeof raw.start === "string" && typeof raw.end === "string") return `${dateRange(raw.start, raw.end)} · ${text(raw.source)}${raw.sourceUrl ? ` · ${text(raw.sourceUrl)}` : ""}`;
  if (typeof raw.startDate === "string" && typeof raw.endDate === "string") {
    const effect = raw.regularClasses === "continue" || raw.regularClasses === "suspended" ? ` · ${REGULAR_CLASS_LABELS[raw.regularClasses]}` : "";
    return `${kindLabel(text(raw.kind))} “${text(raw.title)}” · ${dateRange(raw.startDate, raw.endDate)}${effect} · ${text(raw.source)}${raw.sourceUrl ? ` · ${text(raw.sourceUrl)}` : ""}`;
  }
  return "Unreadable stored value";
}

export function CalendarHistory({ termId, initial }: { termId: number; initial: { changes: CalendarChange[]; next: number | null } }) {
  const [page, setPage] = useState(initial), [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <section className="ruled min-w-0 rounded-lg p-4" aria-label="Calendar changes">
    <ol className="grid gap-4">{page.changes.map(event => <li key={event.id} className="min-w-0 break-words border-t border-[var(--color-line-soft)] pt-3 text-sm first:border-t-0 first:pt-0">
      <p><strong>{CALENDAR_ACTION_LABELS[event.action] ?? event.action}</strong> · {fmtInstant(event.at)} · {event.actor}</p>
      {event.before != null && event.after != null && <><p className="mt-1">Before: {describe(event.before)}</p><p className="mt-1">After: {describe(event.after)}</p></>}
      {event.before == null && event.after != null && <p className="mt-1">{describe(event.after)}</p>}
      {event.before != null && event.after == null && <p className="mt-1">Was: {describe(event.before)}</p>}
      {event.reason && <p className="mt-1 text-muted">Reason: {event.reason}</p>}
    </li>)}</ol>
    {!page.changes.length && <p className="text-sm">No calendar changes are recorded for this term.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {page.next && <button className={`${buttonClass.secondary} mt-4`} type="button" disabled={pending} onClick={() => start(async () => { try { const older = await loadCalendarChangesAction(termId, page.next!); setPage(current => ({ changes: [...current.changes, ...older.changes], next: older.next })); setError(""); } catch { setError("Changes could not be loaded. Reload to check your access."); } })}>{pending ? "Loading…" : "Load older"}</button>}
  </section>;
}
