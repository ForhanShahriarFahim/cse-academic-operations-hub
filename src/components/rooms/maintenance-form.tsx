"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveMaintenanceAction } from "@/lib/room-maintenance-actions";
import type { MaintenanceEntry } from "@/lib/room-maintenance";
import type { MaintenanceImpact } from "@/lib/room-maintenance-transaction";
import { DAY_NAMES, fmtRange } from "@/lib/time";
import { buttonClass, inputClass } from "@/components/account/styles";

export function ImpactReview({ impact }: { impact: MaintenanceImpact }) {
  const [page, setPage] = useState(0);
  const count = Math.ceil(impact.items.length / 10), current = Math.min(page, Math.max(0, count - 1));
  return <section className="my-3 min-w-0 rounded-lg border border-[var(--color-line)] p-3" aria-label="Impact review"><h3 className="font-semibold">Impact across all terms</h3><p className="mt-2 text-sm">{impact.totals.meeting} active canonical classes · {impact.totals.physicalOD} complete physical OD reservations · {impact.totals.uncertainOD} uncertain OD records · {impact.totals.publication} current publications with potential/unverified impact.</p>
    {impact.overlapping.length > 0 && <p className="mt-2 text-sm">Warning: overlaps maintenance {impact.overlapping.map((id) => `#${id}`).join(", ")}. Records keep separate reasons; minutes are unioned.</p>}
    <ol className="mt-3 grid gap-3">{impact.items.slice(current * 10, (current + 1) * 10).map((item) => <li key={item.key} className="break-words text-sm"><Link href={item.href} className="font-semibold underline">{item.label}</Link><p>{item.detail}</p></li>)}</ol>
    {count > 1 && <nav aria-label="Impact pages" className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={!current} className={buttonClass.secondary} onClick={() => setPage(current - 1)}>Previous</button><span className="text-sm" aria-live="polite">Page {current + 1} of {count} · {impact.items.length} records</span><button type="button" disabled={current + 1 >= count} className={buttonClass.secondary} onClick={() => setPage(current + 1)}>Next</button></nav>}
    <p className="mt-3 text-sm">Bookings will remain in place. Affected published routines may need a separately reviewed replacement; frozen public output stays unchanged.</p>
  </section>;
}
const timeValue = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minuteValue = (time: string) => /^\d{2}:\d{2}$/.test(time) ? String(Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) : "";
export function MaintenanceForm({ room, entry, cancel = false }: { room: { id: number; code: string; revision: number; isActive: boolean }; entry?: MaintenanceEntry; cancel?: boolean }) {
  const [result, submit, pending] = useActionState(saveMaintenanceAction, null);
  const router = useRouter(), message = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (cancel && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [cancel]);
  const [allDay, setAllDay] = useState(!entry || (entry.startMinutes === 0 && entry.endMinutes === 1440));
  const [endOfDay, setEndOfDay] = useState(entry?.endMinutes === 1440);
  const [start, setStart] = useState(timeValue(entry?.startMinutes ?? 540));
  const [end, setEnd] = useState(timeValue(entry?.endMinutes === 1440 ? 1020 : entry?.endMinutes ?? 1020));
  const [startDate, setStartDate] = useState(entry?.startDate ?? ""), [endDate, setEndDate] = useState(entry?.endDate ?? "");
  const [days, setDays] = useState(entry?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [reason, setReason] = useState(entry?.reason ?? ""), [correction, setCorrection] = useState("");
  // Input changes invalidate the visible acknowledgement immediately; the server also fingerprints it.
  const [reviewInput, setReviewInput] = useState("");
  const inputKey = JSON.stringify([startDate, endDate, allDay, endOfDay, start, end, days, reason, correction]);
  const reviewValid = reviewInput === inputKey;
  const [revision] = useState(room.revision), [entryRevision] = useState(entry?.revision);
  useEffect(() => { if (result) { message.current?.focus(); if (result.ok) router.push(`/rooms/${room.id}?done=${encodeURIComponent(result.message)}`); } }, [result, router, room.id]);
  const errors = result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};
  const error = (field: string) => <p id={`maintenance-${field}-error`} className="mt-1 text-sm text-[var(--color-clay)]">{errors[field]?.join(" ")}</p>;
  const fieldProps = (field: string) => ({ id: `maintenance-${field}`, "aria-invalid": !!errors[field], "aria-describedby": `maintenance-${field}-error` });
  const content = <form action={submit} className="room-maintenance-form ruled mt-5 min-w-0 rounded-lg p-4" onSubmit={() => setReviewInput(inputKey)} noValidate>
    <h2 id="maintenance-form-title" className="font-display text-xl font-semibold">{cancel ? "Cancel maintenance" : entry ? "Correct maintenance" : "Add maintenance"}</h2><p className="mt-2 text-sm">{room.code} is independently {room.isActive ? "active" : "inactive"}. Dates are inclusive, in Asia/Dhaka. Even one outage occurrence blocks a whole recurring placement.</p>
    <input type="hidden" name="roomId" value={room.id} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="action" value={cancel ? "cancel" : entry ? "edit" : "create"} /><input type="hidden" name="entryId" value={entry?.id ?? ""} /><input type="hidden" name="entryRevision" value={entryRevision ?? ""} />
    {entry?.cancelled && <p className="mt-3 text-sm">This record is already cancelled. Its history is retained; add a new outage for further work.</p>}
    <fieldset disabled={pending || (!!entry?.cancelled && !cancel)} className="min-w-0"><legend className="sr-only">Maintenance details</legend>
      {!cancel ? <><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0"><label htmlFor="maintenance-startDate" className="block text-sm font-semibold">Start date</label><input {...fieldProps("startDate")} type="date" name="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />{error("startDate")}</div><div className="min-w-0"><label htmlFor="maintenance-endDate" className="block text-sm font-semibold">End date</label><input {...fieldProps("endDate")} type="date" name="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />{error("endDate")}</div></div>
      <fieldset className="mt-4" aria-describedby="maintenance-weekdays-error"><legend className="text-sm font-semibold">Days within the date range</legend><button type="button" className={`${buttonClass.secondary} my-2`} onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>All days</button><div className="flex flex-wrap gap-x-4">{DAY_NAMES.map((label, day) => <label key={day} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="weekdays" value={day} checked={days.includes(day)} onChange={(e) => setDays(e.target.checked ? [...days, day].sort() : days.filter((d) => d !== day))} />{label}</label>)}</div>{error("weekdays")}</fieldset>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />All day (00:00–24:00)</label>
      <input type="hidden" name="startMinutes" value={allDay ? "0" : minuteValue(start)} /><input type="hidden" name="endMinutes" value={allDay || endOfDay ? "1440" : minuteValue(end)} />
      {!allDay && <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0"><label className="block text-sm font-semibold" htmlFor="maintenance-startMinutes">Start time</label><input {...fieldProps("startMinutes")} type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></div><div className="min-w-0"><label className="block text-sm font-semibold" htmlFor="maintenance-endTime">End time</label><input id="maintenance-endTime" type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={endOfDay} className={inputClass} /><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={endOfDay} onChange={(e) => setEndOfDay(e.target.checked)} />End of day (24:00)</label></div></div>}{error("startMinutes")}
      <div className="mt-3"><label htmlFor="maintenance-reason" className="block text-sm font-semibold">Operational reason</label><textarea {...fieldProps("reason")} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} rows={3} /><p className="mt-1 text-xs">1–300 characters; visible to internal portal viewers. Split overnight work or different daily hours into separate records.</p>{error("reason")}</div></> : <p className="my-4 text-sm">#{entry?.id} · {entry?.startDate}–{entry?.endDate} · {fmtRange(entry!.startMinutes, entry!.endMinutes)} · {entry?.reason}. Cancellation retains this entry and history.</p>}
      {entry && <div className="mt-3"><label htmlFor="maintenance-correctionReason" className="block text-sm font-semibold">Correction reason</label><textarea {...fieldProps("correctionReason")} name="correctionReason" value={correction} onChange={(e) => setCorrection(e.target.value)} maxLength={300} className={inputClass} rows={2} />{error("correctionReason")}</div>}
      {cancel && <label className="my-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirmCancellation" />Confirm cancellation and retain history</label>}
      {result?.impact && <ImpactReview key={result.fingerprint} impact={result.impact} />}
      {result?.fingerprint && reviewValid && <><input type="hidden" name="fingerprint" value={result.fingerprint} /><label className="my-3 flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="acknowledge" required />Save maintenance despite these bookings</label></>}
      {result?.fingerprint && !reviewValid && <p className="my-3 text-sm">Input changed. Review impact again before confirming.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className={buttonClass.primary}>{pending ? "Checking and saving…" : cancel ? "Cancel maintenance" : result?.fingerprint && reviewValid ? "Save maintenance despite these bookings" : "Review impact and save"}</button><Link href={`/rooms/${room.id}/maintenance`} className={buttonClass.secondary}>Back to maintenance</Link></div>
    </fieldset>
    <div ref={message} tabIndex={-1} role={result?.ok ? "status" : "alert"} className="mt-3 break-words text-sm">{result?.message}{result?.outcome?.kind === "stale" && <p className="mt-2"><button type="button" className={buttonClass.secondary} onClick={() => window.location.reload()}>Reload latest record (discard this input)</button></p>}</div>
  </form>;
  return cancel ? <dialog ref={dialog} aria-labelledby="maintenance-form-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[44rem] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-sheet p-0 text-ink backdrop:bg-black/30" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex="0"]')].filter((node) => !node.matches(":disabled") && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (first && last && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  }} onCancel={(event) => { event.preventDefault(); if (!pending) router.push(`/rooms/${room.id}/maintenance`); }}>{content}</dialog> : content;
}
