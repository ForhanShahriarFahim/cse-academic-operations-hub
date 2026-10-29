"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { lifecycleRoomAction } from "@/lib/room-actions";
import { deletionReasons } from "@/lib/room-lifecycle";
import type { RoomLifecycleEvidence, RoomLifecycleResult } from "@/lib/room-lifecycle-transaction";
import { buttonClass, inputClass } from "@/components/account/styles";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";

export function RoomLifecycle({ room, evidence: initialEvidence, returnQuery = "" }: { room: { id: number; code: string; revision: number; isActive: boolean; isDraft: boolean }; evidence: RoomLifecycleEvidence; returnQuery?: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState<"deactivate" | "reactivate" | "delete">(room.isActive ? "deactivate" : "reactivate");
  const [visible, setVisible] = useState(20);
  const summary = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState<RoomLifecycleResult | null, FormData>(async (previous, data) => {
    const next = await lifecycleRoomAction(previous, data);
    if (next.ok) {
      const query = new URLSearchParams(returnQuery); query.set("done", next.message);
      if (mode === "delete") router.push(`/rooms?${query}`);
      else { setReason(""); router.push(`/rooms/${room.id}?${query}`); router.refresh(); }
    }
    return next;
  }, null);
  useEffect(() => { if (result) summary.current?.focus(); }, [result]);
  const evidence = result?.evidence ?? initialEvidence;
  const reasons = deletionReasons(room, evidence.totals);
  const title = mode === "delete" ? "Permanently delete draft" : mode === "deactivate" ? "Deactivate room" : "Reactivate room";
  return <section className="ruled no-print mt-5 min-w-0 rounded-lg p-4" aria-label="Room lifecycle">
    <h2 className="font-display text-lg font-semibold">Status & retention</h2>
    <p className="mt-2 text-sm">{room.isActive ? "Active" : "Inactive"} · {room.isDraft ? "Never assigned draft" : "Retained record"}. Inactive codes stay reserved. Published routines keep their saved values.</p>
    <p className="mt-2 text-sm text-muted">All-term check through today and later, including today ({evidence.today}, Asia/Dhaka). {evidence.totals.meetings} class room-role references · {evidence.totals.externals} OD references · {evidence.totals.snapshots} saved snapshot references · {evidence.totals.uncertainSnapshots} ambiguous snapshots.</p>
    {evidence.blocking.length > 0 && <details className="mt-4" open><summary className="cursor-pointer font-semibold">{evidence.blocking.length} current/future or unverified use records</summary><p className="mt-2 text-xs text-muted">Old-term records are identified here; the builder does not switch terms.</p><ol className="mt-3 grid gap-3 text-sm">{evidence.blocking.slice(0, visible).map((item) => <li className="min-w-0 break-words" key={item.key}><strong>{item.title}</strong><p>{item.detail}</p>{item.href && <Link href={item.href} className="underline">Open OD register</Link>}</li>)}</ol>{visible < evidence.blocking.length && <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => setVisible((v) => v + 20)}>Show next 20 ({evidence.blocking.length - visible} remaining)</button>}</details>}
    <div className="my-4 flex flex-wrap gap-3"><button type="button" disabled={pending} className={buttonClass.secondary} onClick={() => setMode(room.isActive ? "deactivate" : "reactivate")}>{room.isActive ? "Deactivate…" : "Reactivate…"}</button><button type="button" disabled={pending} className={buttonClass.secondary} onClick={() => setMode("delete")}>Permanent deletion…</button></div>
    <form action={action} className="grid min-w-0 gap-3 rounded border border-[var(--color-line)] p-3" noValidate>
      <h3 className="font-semibold">{title}: {room.code}</h3>
      <div ref={summary} tabIndex={-1} className="outline-none"><ResultNotice result={result} />{result?.outcome?.kind === "stale" && <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => { if (window.confirm("Discard this reason and reload the latest room?")) window.location.reload(); }}>Reload latest</button>}</div>
      <input type="hidden" name="roomId" value={room.id} /><input type="hidden" name="revision" value={room.revision} /><input type="hidden" name="action" value={mode} />
      {mode === "delete" ? <><p className="text-sm">{room.isDraft ? "Never assigned draft" : "Retained record"}. Deletion is irreversible. The audit history remains; this room ID cannot be recovered through the directory.</p>{reasons.length > 0 && <ul className="list-disc pl-5 text-sm">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}<label htmlFor="rl-code" className="text-sm font-semibold">Type {room.code.trim().toUpperCase()} to confirm</label><input id="rl-code" name="confirmation" className={inputClass} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-invalid={fieldErrors(result, "confirmation").length > 0} aria-describedby="rl-code-error" /><FieldError id="rl-code-error" messages={fieldErrors(result, "confirmation")} /></> : <p className="text-sm">{mode === "deactivate" ? "Current/future or uncertain use prevents deactivation. Correct the referenced records first; nothing is reassigned automatically." : "Reactivation makes the room eligible for new assignments subject to ordinary fit and conflict checks."}</p>}
      <label htmlFor="rl-reason" className="text-sm font-semibold">Reason (required, 1–300 characters)</label><textarea id="rl-reason" name="reason" className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required aria-invalid={fieldErrors(result, "reason").length > 0} aria-describedby="rl-reason-error" /><FieldError id="rl-reason-error" messages={fieldErrors(result, "reason")} />
      <button type="submit" disabled={pending || (mode === "delete" && reasons.length > 0)} className={`${buttonClass.primary} justify-self-start`}>{pending ? "Saving…" : title}</button><span role="status" className="sr-only">{pending ? "Saving room change…" : ""}</span>
    </form>
  </section>;
}
