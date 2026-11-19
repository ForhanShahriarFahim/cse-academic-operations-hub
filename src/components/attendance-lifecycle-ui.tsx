"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { attendanceSessionHistoryAction, type SessionHistoryEvent } from "@/lib/academic-actions";
import { REASON_HINT, REASON_MAX, REASON_MIN, stateLabel } from "@/lib/attendance-lifecycle";

const STATUS_WORDS: Record<string, string> = { present: "Present", absent: "Absent", late: "Late", excused: "Excused" };
export const statusWord = (status: string) => STATUS_WORDS[status] ?? status;

const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
/** Asia/Dhaka date and time for an ISO instant, e.g. "16 Jan 2027, 11:08 am". */
export const dhakaStamp = (iso: string) => stamp.format(new Date(iso));

const STATE_TONE: Record<string, string> = {
  draft: "text-muted", submitted: "text-[var(--color-pine)]", locked: "text-[var(--color-pine)]",
  reopened: "text-[var(--color-gold-text)]", voided: "text-[var(--color-clay)]",
};
/** The state is always spelled out; the mark shape is a secondary cue, never colour alone. */
export function StateBadge({ state }: { state: string }) {
  const mark = state === "locked" ? "rounded-[1px] bg-current" : state === "submitted" ? "rounded-full bg-current" : state === "voided" ? "h-[2px] bg-current" : "rounded-full border-2 border-current";
  return <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide ${STATE_TONE[state] ?? ""}`}>
    <span aria-hidden="true" className={`inline-block h-2 w-2 ${mark}`} />{stateLabel(state)}
  </span>;
}

export interface ReasonRequest {
  title: string;
  body: ReactNode;
  label: string;
  confirmLabel: string;
  requirement: "required" | "optional";
  tone?: "danger" | "primary";
  initial?: string;
}

/** Labelled reason/note dialog. Resolves the trimmed text, "" for an empty optional note, or null when cancelled. */
export function useReasonDialog(): [(request: ReasonRequest) => Promise<string | null>, ReactNode] {
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((value: string | null) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const settle = useCallback((result: string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
    dialog.current?.close();
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (request && element && !element.open) { element.showModal(); field.current?.focus(); }
  }, [request]);

  const ask = useCallback((next: ReasonRequest) => {
    resolver.current?.(null);
    returnFocus.current = document.activeElement as HTMLElement | null;
    setValue(next.initial ?? "");
    setError(null);
    setRequest(next);
    return new Promise<string | null>((resolve) => { resolver.current = resolve; });
  }, []);

  function confirm() {
    const text = value.replace(/\s+/g, " ").trim();
    if (request?.requirement === "required" && text.length < REASON_MIN) { setError(`Enter at least ${REASON_MIN} characters.`); field.current?.focus(); return; }
    if (text.length > REASON_MAX) { setError(`Keep it to ${REASON_MAX} characters or fewer.`); field.current?.focus(); return; }
    settle(text);
  }

  const element = <dialog ref={dialog} aria-labelledby="reason-title" aria-describedby="reason-body"
    onCancel={(event) => { event.preventDefault(); settle(null); }}
    className="m-auto w-[min(480px,calc(100vw-32px))] rounded-xl border border-[var(--color-line)] bg-sheet p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[rgba(16,29,22,0.45)]">
    {request ? <form className="p-5" onSubmit={(event) => { event.preventDefault(); confirm(); }}>
      <h2 id="reason-title" className="font-display text-[18px] font-semibold leading-snug">{request.title}</h2>
      <div id="reason-body" className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{request.body}</div>
      <label htmlFor="reason-text" className="mt-4 block text-[13px] font-semibold">{request.label}{request.requirement === "optional" ? " (optional)" : ""}</label>
      <textarea id="reason-text" ref={field} name="reason" value={value} maxLength={REASON_MAX + 50} rows={3}
        aria-invalid={error ? true : undefined} aria-describedby={error ? "reason-hint reason-error" : "reason-hint"}
        onChange={(event) => { setValue(event.target.value); setError(null); }}
        className="mt-1 block w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[13px]" />
      <p id="reason-hint" className="mt-1 text-[11.5px] text-muted">{request.requirement === "required" ? REASON_HINT : `Up to ${REASON_MAX} characters.`}</p>
      {error && <p id="reason-error" role="alert" className="mt-1 text-[12px] font-semibold text-[var(--color-clay)]">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => settle(null)} className="min-h-9 rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">Cancel</button>
        <button type="submit" className={`min-h-9 rounded-md px-4 text-[13.5px] font-semibold text-white ${request.tone === "danger" ? "bg-[var(--color-clay)]" : "bg-[var(--color-pine)]"}`}>{request.confirmLabel}</button>
      </div>
    </form> : null}
  </dialog>;
  return [ask, element];
}

/** Newest-first history for one session, loaded only when opened and reloaded when the session changes. */
export function SessionHistory({ sessionId, revision }: { sessionId: number; revision: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ key: string; events: SessionHistoryEvent[]; next: number | null; error?: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${sessionId}:${revision}`;

  useEffect(() => {
    if (!open || state?.key === key) return;
    let cancelled = false;
    attendanceSessionHistoryAction(sessionId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { key, events: result.events, next: result.next } : { key, events: [], next: null, error: result.message });
    }).catch(() => { if (!cancelled) setState({ key, events: [], next: null, error: "History could not be loaded. Try again." }); });
    return () => { cancelled = true; };
  }, [open, key, sessionId, state?.key]);

  async function more() {
    if (!state?.next) return;
    setLoadingMore(true);
    const result = await attendanceSessionHistoryAction(sessionId, state.next).catch(() => null);
    setLoadingMore(false);
    if (result?.ok) setState({ ...state, events: [...state.events, ...result.events], next: result.next });
  }

  const current = state?.key === key ? state : null;
  return <details className="border-t border-[var(--color-line-soft)] px-4 py-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center text-[12.5px] font-semibold text-[var(--color-pine)]">Session history</summary>
    <div role="status" aria-live="polite" className="pb-2">
      {!current ? <p className="text-[12px] text-muted">{open ? "Loading history…" : ""}</p>
        : current.error ? <p className="text-[12px] text-[var(--color-clay)]">{current.error}</p>
        : !current.events.length ? <p className="text-[12px] text-muted">No recorded events for this session.</p>
        : <ol className="ml-1 border-l-2 border-[var(--color-line)]">
          {current.events.map((event) => <li key={event.id} className="relative ml-4 pb-3 text-[12.5px]">
            <span aria-hidden="true" className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-pine)] bg-sheet" />
            <strong>{event.label}</strong> · {event.actor} · <time dateTime={event.at}>{dhakaStamp(event.at)}</time>
            {event.reason && <p className="mt-0.5 border-l-2 border-[var(--color-gold)] pl-2 italic">Reason: {event.reason}</p>}
            {event.note && <p className="mt-0.5 border-l-2 border-[var(--color-line)] pl-2 italic">Note: {event.note}</p>}
            {event.captured != null && <p className="mt-0.5 text-[11.5px] text-muted">{event.captured} student(s) captured</p>}
            {event.changes.length > 0 && <p className="mt-0.5 font-mono text-[11.5px] text-muted [overflow-wrap:anywhere]">
              {event.changes.map((change) => `${change.studentCode} ${statusWord(change.from)} → ${statusWord(change.to)}`).join(" · ")}</p>}
          </li>)}
        </ol>}
      {current?.next && <button type="button" disabled={loadingMore} onClick={more} className="min-h-9 rounded-md border border-[var(--color-line)] px-3 text-[12px] font-semibold">{loadingMore ? "Loading…" : "Show older events"}</button>}
    </div>
  </details>;
}
