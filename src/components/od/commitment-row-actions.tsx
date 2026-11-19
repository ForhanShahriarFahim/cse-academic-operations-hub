"use client";

/** OD-01A D-4: per-record actions. Each change asks for its note or reason in a modal dialog. */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTermActions } from "@/components/term-write-context";
import type { ActionResult } from "@/lib/action-result";
import type { LifecycleCommand } from "@/lib/commitment-records";

interface Row {
  id: number; title: string; revision: number; commands: LifecycleCommand[];
  roomCode: string | null; teacherCode: string | null; workload: Array<{ shortCode: string; units: string }>;
}
type DialogCommand = "verify" | "return" | "archive" | "reactivate" | "delete";

const COPY: Record<DialogCommand, { title: (t: string) => string; body: (r: Row) => string; field?: { name: "note" | "reason"; label: string; placeholder: string }; confirm: string; danger?: boolean; notice: string }> = {
  verify: { title: (t) => `Verify ${t}?`, body: () => "Verification confirms these facts with the other department. Editing who, which room, the day or the time later returns it to Pending.", field: { name: "note", label: "How was this confirmed?", placeholder: "e.g. Confirmed by phone with the EEE routine coordinator" }, confirm: "Mark verified", notice: "verified" },
  return: { title: (t) => `Return ${t} to Pending?`, body: () => "It keeps blocking what it blocks now, but is shown as needing confirmation again.", field: { name: "reason", label: "Reason", placeholder: "e.g. The department says the time may change" }, confirm: "Return to pending", notice: "returned" },
  archive: { title: (t) => `Archive ${t}?`, body: (r) => `It stops blocking ${[r.teacherCode, r.roomCode && `room ${r.roomCode}`].filter(Boolean).join(" and ") || "anything"} and leaves the OD row, the teacher agenda and future publications. Published routines keep it as published. You can reactivate it later, and it then returns as Pending.`, field: { name: "reason", label: "Reason", placeholder: "e.g. The department moved this class to their own building" }, confirm: "Archive commitment", danger: true, notice: "archived" },
  reactivate: { title: (t) => `Reactivate ${t}?`, body: () => "It returns to planning as Pending. The teacher, room and room maintenance are checked again first.", field: { name: "reason", label: "Reason", placeholder: "e.g. The arrangement resumes from next week" }, confirm: "Reactivate as Pending", notice: "reactivated" },
  delete: { title: (t) => `Delete ${t} as a mistaken entry?`, body: () => "Deleting removes the record completely; only its audit history remains. If the commitment really existed and has ended, archive it instead.", confirm: "Delete mistaken entry", danger: true, notice: "deleted" },
};

export function CommitmentRowActions({ row, returnTo, layout = "t" }: { row: Row; returnTo: string; layout?: "t" | "m" }) {
  const uid = `${layout}-${row.id}`;
  const actions = useTermActions();
  const router = useRouter();
  const [open, setOpen] = useState<DialogCommand | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => { const d = dialog.current; if (open && d && !d.open) d.showModal(); }, [open]);
  function close() {
    dialog.current?.close(); setOpen(null); setResult(null);
    if (opener.current?.isConnected) opener.current.focus();
  }
  function start(command: DialogCommand, event: React.MouseEvent<HTMLElement>) {
    opener.current = (menu.current?.querySelector("summary") as HTMLElement | null) ?? event.currentTarget;
    if (menu.current) menu.current.open = false;
    setResult(null); setOpen(command);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open) return;
    const form = new FormData(event.currentTarget);
    const command = open;
    startTransition(async () => {
      const r = command === "verify" ? await actions.verifyExternalAction(row.id, form)
        : command === "return" ? await actions.returnExternalAction(row.id, form)
        : command === "archive" ? await actions.archiveExternalAction(row.id, form)
        : command === "reactivate" ? await actions.reactivateExternalAction(row.id, form)
        : await actions.deleteExternalAction(row.id);
      setResult(r);
      if (r.ok) {
        dialog.current?.close(); setOpen(null);
        const joiner = returnTo.includes("?") ? "&" : "?";
        router.push(`${returnTo}${joiner}${command === "delete" ? "" : `changed=${row.id}&`}notice=${COPY[command].notice}${command === "archive" && row.workload.length ? "-workload" : ""}`);
      }
    });
  }

  const primary: LifecycleCommand | undefined = row.commands.find((c) => c === "verify" || c === "resolve" || c === "reactivate") ?? row.commands.find((c) => c === "edit");
  const editHref = (resolve: boolean) => `/od/${row.id}/edit?${resolve ? "resolve=1&" : ""}return=${encodeURIComponent(returnTo)}`;
  const button = "inline-flex min-h-[2.25rem] items-center rounded-md border px-2.5 text-[12.5px] font-semibold";
  const primaryClass = `${button} border-[var(--color-pine)] text-[var(--color-pine)] hover:bg-pine-tint`;
  const more = row.commands.filter((c) => c !== primary);
  const copy = open ? COPY[open] : null;

  return (
    <div className="relative flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
      {primary === "edit" || primary === "resolve"
        ? <Link href={editHref(primary === "resolve")} className={primaryClass}>{primary === "edit" ? "Edit" : "Resolve note"}<span className="sr-only">: {row.title}</span></Link>
        : primary
          ? <button type="button" onClick={(e) => start(primary as DialogCommand, e)} className={primaryClass}>{primary === "verify" ? "Verify" : "Reactivate"}<span className="sr-only">: {row.title}</span></button>
          : null}
      <details ref={menu} className="relative">
        <summary className={`${button} cursor-pointer list-none border-[var(--color-line)] text-ink-2 hover:bg-wash`} aria-label={`More actions: ${row.title}`}>More ▾</summary>
        <div className="absolute right-0 z-20 mt-1 grid min-w-[13rem] gap-0.5 rounded-md border border-[var(--color-line)] bg-sheet p-1 shadow-lg">
          {more.map((command) => command === "edit" || command === "resolve"
            ? <Link key={command} href={editHref(command === "resolve")} className="rounded px-2.5 py-2 text-left text-[13px] hover:bg-wash">{command === "edit" ? "Edit" : "Resolve note"}</Link>
            : <button key={command} type="button" onClick={(e) => start(command as DialogCommand, e)} className={`rounded px-2.5 py-2 text-left text-[13px] hover:bg-wash ${command === "delete" || command === "archive" ? "text-[var(--color-clay)]" : ""}`}>
              {{ verify: "Verify", return: "Return to pending", archive: "Archive", reactivate: "Reactivate", delete: "Delete mistaken entry" }[command as DialogCommand]}
            </button>)}
          <Link href={`/od/${row.id}/history?return=${encodeURIComponent(returnTo)}`} className="rounded px-2.5 py-2 text-left text-[13px] hover:bg-wash">History</Link>
        </div>
      </details>
      <dialog ref={dialog} onClose={() => open && close()} aria-labelledby={`od-dialog-${uid}`} className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-[var(--color-line)] bg-sheet p-0 text-left shadow-2xl backdrop:bg-black/40">
        {open && copy ? (
          <form onSubmit={submit} className="space-y-3 p-4">
            <input type="hidden" name="revision" value={row.revision} />
            <h2 id={`od-dialog-${uid}`} className="font-display text-[17px] font-semibold leading-snug">{copy.title(row.title)}</h2>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{copy.body(row)}</p>
            {open === "archive" && row.workload.length ? (
              <p className="rounded-md border border-[var(--color-gold)]/40 bg-gold-tint px-3 py-2 text-[13px] text-gold-text">
                {row.workload.map((w) => `${w.shortCode}'s workload counts this commitment (${w.units} units)`).join("; ")}. Archiving does not change workload.
              </p>
            ) : null}
            {copy.field ? (
              <div>
                <label htmlFor={`od-${open}-${uid}`} className="mb-1 block text-[12.5px] font-semibold">{copy.field.label} *</label>
                <input id={`od-${open}-${uid}`} name={copy.field.name} required maxLength={300} autoFocus placeholder={copy.field.placeholder}
                  aria-invalid={result?.outcome?.kind === "validation" || undefined} aria-describedby={result && !result.ok ? `od-dialog-error-${uid}` : undefined}
                  className="min-h-[2.75rem] w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[13.5px]" />
              </div>
            ) : null}
            {result && !result.ok ? (
              <div id={`od-dialog-error-${uid}`} role="alert" className="rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-3 py-2 text-[13px] text-[var(--color-clay)]">
                <p className="font-semibold">{result.message}</p>
                {result.issues?.map((issue, i) => <p key={i}>{issue.detail}</p>)}
                {result.outcome?.kind === "stale" ? <button type="button" className="mt-1 font-semibold underline" onClick={() => { close(); router.refresh(); }}>Reload the register</button> : null}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={close} autoFocus={!copy.field} className="min-h-[2.75rem] rounded-md border border-[var(--color-line)] px-3.5 text-[13px] font-semibold text-ink-2">Cancel</button>
              <button disabled={pending} className={`min-h-[2.75rem] rounded-md px-4 text-[13px] font-semibold text-white disabled:opacity-50 ${copy.danger ? "bg-[var(--color-clay)]" : "bg-[var(--color-pine)] hover:bg-[var(--color-pine-2)]"}`}>
                {pending ? "Saving…" : copy.confirm}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
