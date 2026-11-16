"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";
import { Badge, Notice } from "@/components/ui";
import { fmtInstant } from "@/lib/auth/display";
import { changeOfferingsAction, loadOfferingChangesAction } from "@/lib/offering-actions";
import type { OfferingChange } from "@/lib/offering-data";
import { OFFERING_ACTION_LABELS, offeringStatusLabel, type ProposalReason } from "@/lib/offering-records";
import type { OfferingCohortView, OfferingCourseView, OfferingResult } from "@/lib/offering-store";

/** Shared submit plumbing: one action, success returns to the list with its message, failures keep input and take focus. */
function useOfferingAction(returnHref: string, onFailure?: () => void) {
  const router = useRouter(), summary = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState<OfferingResult | null, FormData>(async (previous, form) => {
    const next = await changeOfferingsAction(previous, form);
    if (next.ok) { const [path, search = ""] = returnHref.split("?"); const query = new URLSearchParams(search); query.set("done", next.message); router.push(`${path}?${query}`); router.refresh(); }
    else onFailure?.();
    return next;
  }, null);
  useEffect(() => { if (result && !result.ok) summary.current?.focus(); }, [result]);
  // Submitting through the form's `action` prop makes React reset the form afterwards, which unticks controlled
  // checkboxes while their state still says ticked. Dispatching the action ourselves keeps every entry as typed.
  const [, startTransition] = useTransition();
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form)); };
  return { result, submit, pending, summary };
}
function Feedback({ result, summary }: { result: OfferingResult | null; summary: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={summary} tabIndex={-1} className="outline-none">
    <ResultNotice result={result} />
    {result?.issues?.map(issue => <p key={issue.title} className="mt-2 text-[13px]"><strong>{issue.title}.</strong> {issue.detail}</p>)}
    {result?.outcome?.kind === "stale" && <p className="mt-2 text-[13px]">Your entries are kept. Nothing was saved. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Show current list</button></p>}
  </div>;
}
function ReasonField({ id, value, onChange, result, required, hint }: { id: string; value: string; onChange: (value: string) => void; result: OfferingResult | null; required: boolean; hint?: string }) {
  const errors = fieldErrors(result, "reason");
  return <div className="grid gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold">Reason {required ? "(required)" : "(optional)"}</label>
    <textarea id={id} name="reason" value={value} onChange={event => onChange(event.target.value)} maxLength={300} rows={2} className={`${inputClass} py-2`} aria-describedby={`${id}-hint ${id}-error`} aria-invalid={errors.length > 0} />
    <p id={`${id}-hint`} className="text-xs text-muted">{hint ?? "Up to 300 plain-text characters; no student details. Recorded in the change history."}</p>
    <FieldError id={`${id}-error`} messages={errors} />
  </div>;
}
const Pending = ({ pending }: { pending: boolean }) => <span className="sr-only" role="status">{pending ? "Saving…" : ""}</span>;

const REASON_TEXT: Record<ProposalReason, string> = { carried: "Carried", partial: "Offered to some cohorts", existing: "Already offered here", cancelled_here: "Cancelled this term", inactive: "Course inactive" };

export function OfferingStartForm({ termId, termName, source, cohorts, fingerprint, returnHref }: { termId: number; termName: string; source: { id: number; name: string }; cohorts: OfferingCohortView[]; fingerprint: string; returnHref: string }) {
  const initial = useMemo(() => new Set(cohorts.flatMap(cohort => cohort.proposal.filter(item => item.ticked).map(item => `${cohort.batchId}:${item.courseId}`))), [cohorts]);
  const [picks, setPicks] = useState(initial), [reason, setReason] = useState("");
  const { result, submit, pending, summary } = useOfferingAction(returnHref);
  const toggle = (key: string, on: boolean) => setPicks(previous => { const next = new Set(previous); if (on) next.add(key); else next.delete(key); return next; });
  const chosenCohorts = new Set([...picks].map(key => key.split(":")[0])).size;
  return <form onSubmit={submit} noValidate className="grid min-w-0 gap-5">
    <input type="hidden" name="command" value="start" /><input type="hidden" name="termId" value={termId} /><input type="hidden" name="sourceId" value={source.id} /><input type="hidden" name="fingerprint" value={fingerprint} />
    {cohorts.map(cohort => {
      const selectable = cohort.proposal.filter(item => item.selectable);
      return <fieldset key={cohort.batchId} className="ruled min-w-0 rounded-lg px-4 pb-3 pt-3">
        <legend className="sr-only">{cohort.name}</legend>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-[var(--color-line-soft)] pb-3">
          <div><p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{cohort.stream === "DIPLOMA" ? "Diploma stream" : `${cohort.stream} stream`}</p><h2 className="font-display text-[18px] font-semibold tracking-tight">{cohort.name} · Semester {cohort.semester}</h2></div>
          <p className="text-[12.5px] text-muted">{cohort.hasBasis ? `Basis: ${cohort.basisCohorts.join(" and ")} at semester ${cohort.semester}` : "No basis"}</p>
        </div>
        {!cohort.hasBasis && <Notice tone="warn" className="mt-3" title={`${source.name} had no ${cohort.stream === "DIPLOMA" ? "Diploma" : cohort.stream} cohort at semester ${cohort.semester}.`}>Nothing is proposed. Add this cohort&apos;s courses individually, or copy from another term.</Notice>}
        {cohort.hasBasis && !cohort.proposal.length && <p className="pt-3 text-sm text-muted">{source.name} offered no courses in this slot.</p>}
        {cohort.batchStatus !== "active" && <Notice tone="warn" className="mt-3">This cohort is {cohort.batchStatus}; courses cannot be offered to it.</Notice>}
        <ul className="divide-y divide-[var(--color-line-soft)]">{cohort.proposal.map(item => {
          const key = `${cohort.batchId}:${item.courseId}`, id = `pick-${cohort.batchId}-${item.courseId}`, allowed = item.selectable && cohort.batchStatus === "active";
          const note = item.reason === "carried" ? `Offered to ${item.sourceCohorts.length === 1 ? item.sourceCohorts[0] : "every cohort in this slot"} last term`
            : item.reason === "partial" ? `Only ${item.sourceCohorts.join(", ")} took it. Tick to include.`
            : item.reason === "existing" ? "Nothing to create." : item.reason === "cancelled_here" ? "Restore it from the offerings list if it should run." : "Cannot be offered. It will show as dropped.";
          return <li key={key} className={`grid grid-cols-[22px_minmax(0,1fr)] gap-3 py-3 ${allowed ? "" : "text-muted"}`}>
            {allowed ? <input id={id} type="checkbox" name="pick" value={key} checked={picks.has(key)} onChange={event => toggle(key, event.target.checked)} className="mt-1 h-4 w-4" aria-describedby={`${id}-note`} /> : <span aria-hidden="true" className="mt-0.5 text-center">—</span>}
            <div className="min-w-0 break-words">
              <label htmlFor={allowed ? id : undefined} className="text-[14px]"><span className="font-mono text-[13px] font-bold">{item.course.code}</span> {item.course.title}</label>
              <p id={`${id}-note`} className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted"><Badge tone={item.reason === "partial" ? "gold" : "neutral"}>{REASON_TEXT[item.reason]}</Badge><span>{note}</span></p>
            </div>
          </li>;
        })}</ul>
        {selectable.length > 1 && cohort.batchStatus === "active" && <p className="no-print border-t border-[var(--color-line-soft)] pt-2 text-[12.5px]"><button type="button" className="font-semibold underline" onClick={() => setPicks(previous => { const next = new Set(previous); for (const item of selectable) next.add(`${cohort.batchId}:${item.courseId}`); return next; })}>Tick all</button> · <button type="button" className="font-semibold underline" onClick={() => setPicks(previous => { const next = new Set(previous); for (const item of selectable) next.delete(`${cohort.batchId}:${item.courseId}`); return next; })}>Untick all</button> for {cohort.name}</p>}
      </fieldset>;
    })}
    <section className="ruled grid min-w-0 gap-3 rounded-lg p-4" aria-labelledby="start-confirm">
      <h2 id="start-confirm" className="font-display text-[18px] font-semibold tracking-tight">Confirm</h2>
      <p className="text-sm" aria-live="polite"><strong>{picks.size} offering{picks.size === 1 ? "" : "s"} will be created for {chosenCohorts} cohort{chosenCohorts === 1 ? "" : "s"} in {termName}.</strong> No existing offering in any term is changed, cancelled or removed.</p>
      <Feedback result={result} summary={summary} /><FieldError id="pick-error" messages={fieldErrors(result, "pick")} />
      <ReasonField id="start-reason" value={reason} onChange={setReason} result={result} required />
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending || !picks.size} className={buttonClass.primary}>{pending ? "Saving…" : `Create ${picks.size} offering${picks.size === 1 ? "" : "s"}`}</button><Link className={buttonClass.secondary} href={returnHref}>Cancel</Link></div>
      <Pending pending={pending} />
    </section>
  </form>;
}

export function OfferingAddForm({ termId, cohorts, courses, initialCohort, initialCourse, returnHref }: { termId: number; cohorts: OfferingCohortView[]; courses: OfferingCourseView[]; initialCohort: number | null; initialCourse: number | null; returnHref: string }) {
  const [batchId, setBatchId] = useState(initialCohort && cohorts.some(cohort => cohort.batchId === initialCohort) ? String(initialCohort) : cohorts.length === 1 ? String(cohorts[0].batchId) : "");
  const [courseId, setCourseId] = useState(initialCourse && courses.some(course => course.id === initialCourse) ? String(initialCourse) : "");
  const [reason, setReason] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const { result, submit, pending, summary } = useOfferingAction(returnHref, () => setAcknowledged(false));
  const cohort = cohorts.find(item => String(item.batchId) === batchId), course = courses.find(item => String(item.id) === courseId);
  const existing = cohort && course ? cohort.offerings.find(row => row.course.id === course.id) : undefined;
  const outOfSemester = !!cohort && !!course && course.semester !== cohort.semester;
  const duplicate = !!existing && existing.status !== "cancelled";
  const ordered = cohort ? [...courses.filter(item => item.semester === cohort.semester), ...courses.filter(item => item.semester !== cohort.semester)] : courses;
  const sameSemester = cohort ? ordered.filter(item => item.semester === cohort.semester) : [], otherSemesters = cohort ? ordered.filter(item => item.semester !== cohort.semester) : ordered;
  const option = (item: OfferingCourseView) => <option key={item.id} value={item.id}>{item.code} · {item.title}{cohort && item.semester !== cohort.semester ? ` (semester ${item.semester})` : ""}</option>;
  return <form onSubmit={submit} noValidate className="ruled grid min-w-0 gap-4 rounded-lg p-4">
    <input type="hidden" name="command" value="add" /><input type="hidden" name="termId" value={termId} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? cohort?.fingerprint ?? ""} />
    <Feedback result={result} summary={summary} />
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <div className="grid content-start gap-1.5"><label htmlFor="add-cohort" className="text-sm font-semibold">Cohort</label>
        <select id="add-cohort" name="batchId" value={batchId} onChange={event => { setBatchId(event.target.value); setAcknowledged(false); }} className={inputClass} aria-describedby="add-cohort-error" aria-invalid={fieldErrors(result, "batchId").length > 0}><option value="">Choose a cohort</option>{cohorts.map(item => <option key={item.batchId} value={item.batchId}>{item.name} · Semester {item.semester}</option>)}</select>
        <FieldError id="add-cohort-error" messages={fieldErrors(result, "batchId")} /></div>
      <div className="grid content-start gap-1.5"><label htmlFor="add-course" className="text-sm font-semibold">Course</label>
        <select id="add-course" name="courseId" value={courseId} onChange={event => { setCourseId(event.target.value); setAcknowledged(false); }} className={inputClass} aria-describedby="add-course-hint add-course-error" aria-invalid={fieldErrors(result, "courseId").length > 0}>
          <option value="">Choose a course</option>
          {cohort ? <><optgroup label={`Semester ${cohort.semester} courses`}>{sameSemester.map(option)}</optgroup><optgroup label="Other semesters">{otherSemesters.map(option)}</optgroup></> : otherSemesters.map(option)}
        </select>
        <p id="add-course-hint" className="text-xs text-muted">Active catalog courses{cohort ? `, semester ${cohort.semester} first` : ""}. Type a code to jump to it.</p>
        <FieldError id="add-course-error" messages={fieldErrors(result, "courseId")} /></div>
    </div>
    {duplicate && <Notice tone="warn">{course!.code} is already offered to {cohort!.name} this term.</Notice>}
    {existing && !duplicate && <Notice title="Already cancelled this term">{course!.code} was cancelled for {cohort!.name}. Adding it again restores that offering instead of creating a second one.</Notice>}
    {outOfSemester && !duplicate && <div className="grid gap-2"><Notice tone="warn" title="Different curriculum semester.">{course!.code} is a semester {course!.semester} course; {cohort!.name} is in semester {cohort!.semester} this term.</Notice>
      <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" name="acknowledge" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4" aria-describedby="add-ack-error" /><span>Offer this course outside its curriculum semester</span></label><FieldError id="add-ack-error" messages={fieldErrors(result, "acknowledge")} /></div>}
    <ReasonField id="add-reason" value={reason} onChange={setReason} result={result} required={outOfSemester} hint={outOfSemester ? undefined : "Optional for an ordinary add. Up to 300 plain-text characters; no student details."} />
    <p className="text-xs text-muted">Creates the offering only. No class group, teacher, timetable or enrollment is created.</p>
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending || duplicate} className={buttonClass.primary}>{pending ? "Saving…" : existing && !duplicate ? "Restore offering" : "Add offering"}</button><Link className={buttonClass.secondary} href={returnHref}>Cancel</Link></div>
    <Pending pending={pending} />
  </form>;
}

const CHANGE_COPY = {
  cancel: { title: "Cancel this offering", body: "The offering stays in the record as cancelled and can be restored.", button: "Cancel offering", back: "Keep it" },
  restore: { title: "Restore this offering", body: "The course is offered to this cohort again. No class group, teacher or timetable is created.", button: "Restore offering", back: "Leave cancelled" },
  remove: { title: "Remove this offering", body: "Available because this term is a draft and the offering has no class group. The row is deleted; the change history keeps who removed it and why.", button: "Remove offering", back: "Keep it" },
} as const;
export function OfferingChangeForm({ command, termId, offeringId, courseCode, fingerprint, returnHref }: { command: keyof typeof CHANGE_COPY; termId: number; offeringId: number; courseCode: string; fingerprint: string; returnHref: string }) {
  const [reason, setReason] = useState(""), [confirmation, setConfirmation] = useState("");
  const { result, submit, pending, summary } = useOfferingAction(returnHref);
  const copy = CHANGE_COPY[command], id = `change-${command}`;
  return <form onSubmit={submit} noValidate className="ruled grid min-w-0 gap-3 rounded-lg p-4" aria-labelledby={`${id}-title`}>
    <input type="hidden" name="command" value={command} /><input type="hidden" name="termId" value={termId} /><input type="hidden" name="offeringId" value={offeringId} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? fingerprint} />
    <h2 id={`${id}-title`} className="font-display text-[17px] font-semibold tracking-tight">{copy.title}</h2>
    <p className="text-sm">{copy.body}</p>
    <Feedback result={result} summary={summary} />
    {command === "remove" && <div className="grid gap-1.5"><label htmlFor={`${id}-code`} className="text-sm font-semibold">Type {courseCode} to confirm</label><input id={`${id}-code`} name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} autoComplete="off" aria-describedby={`${id}-code-error`} aria-invalid={fieldErrors(result, "confirmation").length > 0} /><FieldError id={`${id}-code-error`} messages={fieldErrors(result, "confirmation")} /></div>}
    <ReasonField id={`${id}-reason`} value={reason} onChange={setReason} result={result} required />
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending} className={command === "restore" ? buttonClass.primary : buttonClass.danger}>{pending ? "Saving…" : copy.button}</button><Link className={buttonClass.secondary} href={returnHref}>{copy.back}</Link></div>
    <Pending pending={pending} />
  </form>;
}

export function OfferingHistory({ termId, initial }: { termId: number; initial: { changes: OfferingChange[]; next: number | null } }) {
  const [page, setPage] = useState(initial), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const status = (value: Record<string, unknown> | null) => typeof value?.status === "string" ? offeringStatusLabel(value.status) : null;
  return <section className="ruled min-w-0 rounded-lg p-4" aria-label="Offering changes">
    <ol className="grid gap-4">{page.changes.map(event => <li key={event.id} className="min-w-0 break-words border-t border-[var(--color-line-soft)] pt-3 text-sm first:border-t-0 first:pt-0">
      <p><strong>{OFFERING_ACTION_LABELS[event.action] ?? event.action}</strong> · {fmtInstant(event.at)} · {event.actor}</p>
      {event.course && <p className="mt-1"><span className="font-mono font-bold">{event.course}</span> for {event.cohort ?? "unknown cohort"}{status(event.before) || status(event.after) ? ` — ${status(event.before) ?? "not offered"} → ${status(event.after) ?? "removed"}` : ""}</p>}
      {event.action === "term_offerings.start" && <><p className="mt-1">{event.created.length} offering{event.created.length === 1 ? "" : "s"} created from {event.source ?? "an earlier term"}.</p><details className="mt-1"><summary className="cursor-pointer text-[13px]">Show created offerings</summary><ul className="mt-1 grid gap-0.5 text-[13px]">{event.created.map(item => <li key={`${item.cohort}-${item.course}`}><span className="font-mono font-bold">{item.course}</span> for {item.cohort}</li>)}</ul></details></>}
      {event.reason && <p className="mt-1 text-muted">Reason: {event.reason}</p>}
    </li>)}</ol>
    {!page.changes.length && <p className="text-sm">No offering changes are recorded for this term. Imported offerings have no fabricated history.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {page.next && <button className={`${buttonClass.secondary} mt-4`} type="button" disabled={pending} onClick={() => start(async () => { try { const older = await loadOfferingChangesAction(termId, page.next!); setPage(current => ({ changes: [...current.changes, ...older.changes], next: older.next })); setError(""); } catch { setError("Changes could not be loaded. Reload to check your access."); } })}>{pending ? "Loading…" : "Load older"}</button>}
  </section>;
}
