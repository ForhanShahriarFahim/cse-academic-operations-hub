"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";
import { saveRoomAction } from "@/lib/room-actions";
import type { RoomResult } from "@/lib/room-transaction";
import { assessRoomEdit, legacyCapabilities, normalizeRoom, protectedRoom, ROOM_CAPABILITIES, ROOM_FIELDS, ROOM_LABELS, type RoomField, type RoomRecord, type RoomReferences } from "@/lib/room-records";
import { RoomImpact } from "./room-impact";

type Draft = Record<Exclude<RoomField, "capabilities">, string> & { capabilities: string[] };
export function RoomForm({ record, departments, references }: { record: RoomRecord | null; departments: Array<{ id: number; code: string; name: string }>; references: RoomReferences }) {
  const initial: Draft = { code: record?.code ?? "", building: record?.building ?? "", roomType: record?.roomType ?? "",
    capabilities: (record?.capabilities ?? []).filter((token) => (ROOM_CAPABILITIES as readonly string[]).includes(token)),
    capacity: record?.capacity == null ? "" : String(record.capacity), owningDepartmentId: record?.owningDepartmentId == null ? "" : String(record.owningDepartmentId), notes: record?.notes ?? "" };
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  // React resets an action form after it resolves, including refused saves.
  // Remount the submitted form with the controlled draft so selects/checkboxes
  // retain the same values as text inputs after that reset.
  const [submission, setSubmission] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [result, action, pending] = useActionState<RoomResult | null, FormData>(async (previous, data) => {
    setSubmission((value) => value + 1);
    const next = await saveRoomAction(previous, data);
    if (next.ok) {
      setDirty(false);
      const id = next.outcome?.kind === "success" ? next.outcome.entityId : record?.id;
      router.push(`/rooms/${id}?done=${encodeURIComponent(next.message)}`);
    } else setAcknowledged(false);
    return next;
  }, null);
  useEffect(() => { if (result && !result.ok) summary.current?.focus(); }, [result]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const change = (field: keyof Draft, value: string | string[]) => { setDraft((old) => ({ ...old, [field]: value })); setDirty(true); setAcknowledged(false); };
  const parsed = normalizeRoom(draft, new Set(departments.map((d) => d.id)), record);
  const preview = record && parsed.ok ? assessRoomEdit(record, parsed.fields, references) : [];
  const errors = (name: RoomField) => fieldErrors(result, name);
  const renderField = (name: Exclude<RoomField, "capabilities">, hint: string, render?: (props: { id: string; name: string; value: string; onChange: (event: { target: { value: string } }) => void; className: string; "aria-invalid": boolean; "aria-describedby": string }) => ReactNode) => {
    const id = `rf-${name}`;
    const props = { id, name, value: draft[name], onChange: (event: { target: { value: string } }) => change(name, event.target.value), className: inputClass, "aria-invalid": errors(name).length > 0, "aria-describedby": `${id}-hint ${id}-error` };
    return <div className={`grid min-w-0 gap-1.5 ${name === "notes" ? "md:col-span-2" : ""}`}><label className="text-sm font-semibold" htmlFor={id}>{ROOM_LABELS[name]}</label>{render ? render(props) : <input {...props} autoComplete="off" />}<p id={`${id}-hint`} className="text-xs text-muted">{hint}</p><FieldError id={`${id}-error`} messages={errors(name)} /></div>;
  };
  const extra = legacyCapabilities(record?.capabilities ?? []);
  const cancelHref = record ? `/rooms/${record.id}` : "/rooms";
  return <form key={submission} action={action} noValidate className="grid min-w-0 gap-4">
    <input type="hidden" name="roomId" value={record?.id ?? ""} /><input type="hidden" name="revision" value={record?.revision ?? ""} />
    <input type="hidden" name="warningFingerprint" value={result?.warningFingerprint ?? ""} />
    <div ref={summary} tabIndex={-1} className="outline-none">{result && !result.ok && <><ResultNotice result={result} />{ROOM_FIELDS.some((name) => errors(name).length) && <ul className="mt-2 list-disc pl-5 text-sm">{ROOM_FIELDS.filter((name) => errors(name).length).map((name) => <li key={name}><a className="underline" href={`#rf-${name}`}>{ROOM_LABELS[name]}: {errors(name)[0]}</a></li>)}</ul>}
      {result.outcome?.kind === "stale" && <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => { if (window.confirm("Discard entered values and reload the latest room?")) window.location.reload(); }}>Reload latest</button>}</>}
    </div>
    <section className="ruled min-w-0 rounded-lg p-4">
      <h2 className="font-display text-lg font-semibold">{record ? "Room details" : "New room"}</h2><p className="mb-4 mt-1 text-sm text-muted">Status: {record?.isActive === false ? "Inactive" : "Active"}. {record ? "Directory corrections keep its status and references." : "New rooms start Active."}</p>
      {record && protectedRoom(record.code) && <p className="mb-4 rounded bg-gold-tint p-3 text-sm">Source-protected room: keep its code, Lab type and {protectedRoom(record.code)!.join(", ")}. Other directory fields remain editable.</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {renderField("code", "1–30 letters/digits; single hyphens. Saved in uppercase.")}
        {renderField("building", "Required, up to 80 characters.")}
        {renderField("roomType", "Type and capabilities are independent.", (props) => <select {...props}>{!["", "lab", "classroom"].includes(draft.roomType) && <option value={draft.roomType}>{draft.roomType} (unsupported earlier value)</option>}<option value="">Choose…</option><option value="classroom">Classroom</option><option value="lab">Lab</option></select>)}
        {renderField("capacity", "Blank means Unknown. Otherwise a positive whole number.", (props) => <input {...props} inputMode="numeric" />)}
        <fieldset id="rf-capabilities" tabIndex={-1} className="min-w-0 md:col-span-2" aria-describedby="rf-capabilities-error"><legend className="mb-2 text-sm font-semibold">Capabilities</legend><div className="flex flex-wrap gap-x-5 gap-y-3">{ROOM_CAPABILITIES.map((token) => <label key={token} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="capabilities" value={token} checked={draft.capabilities.includes(token)} onChange={(event) => change("capabilities", event.target.checked ? [...draft.capabilities, token] : draft.capabilities.filter((t) => t !== token))} />{token}</label>)}</div><FieldError id="rf-capabilities-error" messages={errors("capabilities")} />{extra.length > 0 && <p className="mt-3 break-words text-sm text-muted">Earlier extra capabilities (kept read-only): {extra.join(", ")}</p>}</fieldset>
        {renderField("owningDepartmentId", "Blank means Owner not recorded. It does not affect editor access.", (props) => <select {...props}><option value="">Owner not recorded</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select>)}
        {renderField("notes", "Optional, plain text, up to 1,000 characters.", (props) => <textarea {...props} rows={3} />)}
      </div>
    </section>
    {record && <><p className="rounded border border-[var(--color-line)] bg-gold-tint p-3 text-sm">Live directory and working records use corrections immediately, including older terms. Code/building corrections can change live labels and travel warnings. Published routines keep their recorded values.</p><RoomImpact references={references} impact={result?.impact ?? preview} /></>}
    {result?.warningFingerprint && <label key={result.warningFingerprint} className="flex items-start gap-2 rounded border border-[var(--color-gold)] bg-gold-tint p-4 text-sm"><input type="checkbox" name="acknowledge" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I reviewed these warnings. Room fit remains unverified; this acknowledgement does not approve publication.</span></label>}
    <div className="flex flex-wrap items-center justify-end gap-3"><Link href={cancelHref} className={buttonClass.secondary} onClick={(event) => { if (dirty && !window.confirm("Discard unsaved room changes?")) event.preventDefault(); }}>Cancel</Link><button type="submit" disabled={pending} className={buttonClass.primary}>{pending ? "Saving…" : result?.warningFingerprint ? "Save with these warnings" : record ? "Save changes" : "Add room"}</button><span className="sr-only" role="status">{pending ? "Saving…" : ""}</span></div>
  </form>;
}
