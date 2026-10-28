"use client";
import { useState, useTransition } from "react";
import { loadRoomChangesAction } from "@/lib/room-actions";
import type { RoomChange } from "@/lib/room-data";
import { ROOM_LABELS, type RoomField } from "@/lib/room-records";
import { fmtInstant } from "@/lib/auth/display";
import { buttonClass } from "@/components/account/styles";

export const roomValue = (value: unknown): string => value == null ? "Not recorded" : Array.isArray(value) ? value.join(", ") || "None" : typeof value === "boolean" ? value ? "Active" : "Inactive" : String(value);
export function RoomHistory({ roomId, initial }: { roomId: number; initial: { changes: RoomChange[]; next: number | null } }) {
  const [page, setPage] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <section className="ruled mt-4 min-w-0 rounded-lg p-4" aria-label="Changes"><h2 className="font-display text-lg font-semibold">Changes</h2>
    <ol className="mt-3 grid gap-4">{page.changes.map((event) => <li key={event.id} className="min-w-0 border-t border-[var(--color-line-soft)] pt-3 text-sm"><p className="break-words"><strong>{event.action === "room.create" ? "Room added" : "Room edited"}</strong> · {fmtInstant(event.at)} · {event.actor}</p><dl className="mt-2 grid gap-1">{Object.keys(event.after ?? {}).map((field) => <div key={field} className="grid min-w-0 gap-1 break-words md:grid-cols-[150px_minmax(0,1fr)]"><dt className="font-semibold">{ROOM_LABELS[field as RoomField] ?? (field === "isActive" ? "Status" : field)}</dt><dd>{event.before ? `${roomValue(event.before[field])} → ` : ""}{roomValue(event.after?.[field])}</dd></div>)}</dl>{event.warnings.map((warning, i) => <p key={i} className="mt-2 break-words text-muted">Acknowledged: {warning.title} · {warning.detail}</p>)}</li>)}</ol>
    {!page.next && !page.changes.some((event) => event.action === "room.create") && <p className="mt-3 text-sm text-muted">Earlier changes were not recorded.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {page.next && <button type="button" disabled={pending} className={`${buttonClass.secondary} mt-4`} onClick={() => start(async () => { try { const older = await loadRoomChangesAction(roomId, page.next!); setPage((current) => ({ changes: [...current.changes, ...older.changes], next: older.next })); setError(""); } catch { setError("Changes could not be loaded. Your access may have changed. Reload to check."); } })}>{pending ? "Loading…" : "Load older"}</button>}
  </section>;
}
