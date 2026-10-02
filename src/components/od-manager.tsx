"use client";

import { useRef, useState, useTransition } from "react";
import { BadgeCheck, CirclePlus, Trash2, X, XCircle } from "lucide-react";
import { DAY_NAMES } from "@/lib/time";
import type { ExternalCommitmentView } from "@/lib/serialize";
import { useConfirm } from "@/components/confirm-dialog";
import {
  createExternalAction, verifyExternalAction, deleteExternalAction, type ActionResult,
} from "@/lib/actions";

interface TeacherOpt { id: number; shortCode: string; fullName: string; homeDepartmentCode: string | null }
interface RoomOpt { id: number; code: string }

export function OdManager({
  teachers, rooms,
}: {
  teachers: TeacherOpt[];
  rooms: RoomOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[var(--color-pine-2)]"
      >
        <CirclePlus size={14} /> Record commitment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-[640px] max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-sheet shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] px-4 py-3">
              <h3 className="font-display text-[16px] font-semibold">Record external commitment (OD)</h3>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-black/5"><X size={16} /></button>
            </div>
            <form
              ref={formRef}
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(formRef.current!);
                startTransition(async () => {
                  const r = await createExternalAction(fd);
                  setResult(r);
                  if (r.ok) { setOpen(false); setResult(null); }
                });
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="micro-label mb-1 block">Kind</label>
                  <select name="kind" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]">
                    <option value="teaching">Outgoing teaching (CSE teacher elsewhere)</option>
                    <option value="room_reservation">External room reservation (blocks room only)</option>
                    <option value="combined">Combined teacher + room</option>
                    <option value="unresolved_note">Unresolved source note (level D)</option>
                  </select>
                </div>
                <div>
                  <label className="micro-label mb-1 block">Counterpart department *</label>
                  <input name="counterpartDepartment" required placeholder="e.g. Mathematics"
                    className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="micro-label mb-1 block">Teacher (if known)</label>
                  <select name="teacherId" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]">
                    <option value="">— unknown / N/A —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.shortCode} · {t.fullName}{t.homeDepartmentCode !== "CSE" ? ` (${t.homeDepartmentCode})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="micro-label mb-1 block">Room (if known)</label>
                  <select name="roomId" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]">
                    <option value="">— unknown / N/A —</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="micro-label mb-1 block">Day</label>
                  <select name="dayOfWeek" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]">
                    <option value="">—</option>
                    {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="micro-label mb-1 block">Start</label>
                  <input name="startTime" placeholder="9:00 AM" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 font-mono text-[12.5px]" />
                </div>
                <div>
                  <label className="micro-label mb-1 block">End</label>
                  <input name="endTime" placeholder="10:15 AM" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 font-mono text-[12.5px]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="micro-label mb-1 block">Course label</label>
                  <input name="courseLabel" placeholder="MAT-2201 …" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]" />
                </div>
                <div>
                  <label className="micro-label mb-1 block">Audience</label>
                  <input name="audienceLabel" placeholder="MATH 2nd year" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]" />
                </div>
                <div>
                  <label className="micro-label mb-1 block">Credits</label>
                  <input name="credits" placeholder="3.0" className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 font-mono text-[12.5px]" />
                </div>
              </div>
              <div>
                <label className="micro-label mb-1 block">Notes / source reference</label>
                <textarea name="notes" rows={2} placeholder="How was this learned? What is unconfirmed?"
                  className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12.5px]" />
              </div>
              <p className="text-[10.5px] leading-snug text-muted">
                Completeness level (A–D) is derived from what you actually supply. A room-only entry blocks the
                room and invents no teacher conflict; unresolved notes never become fabricated reservations.
              </p>
              {result && !result.ok && (
                <p className="rounded-md border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 px-3 py-2 text-[12px] text-[var(--color-clay)]">{result.message}</p>
              )}
              <div className="flex justify-end gap-2 border-t border-[var(--color-line-soft)] pt-3">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--color-line)] px-3.5 py-2 text-[12.5px] font-semibold text-muted">Cancel</button>
                <button disabled={pending} className="rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[var(--color-pine-2)] disabled:opacity-50">
                  {pending ? "Saving…" : "Record (starts unverified)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function OdRowActions({ e }: { e: ExternalCommitmentView }) {
  const [ask, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<ActionResult | null>(null);
  // Keep a refused result next to the row that was acted on (BUG-27); a success needs no note.
  function run(action: () => Promise<ActionResult>) {
    setFailed(null);
    startTransition(async () => {
      const result = await action();
      setFailed(result.ok ? null : result);
    });
  }
  return (
    <span className="block">
      <span className="flex items-center justify-end gap-1">{confirmDialog}
        {e.verificationStatus !== "verified" && (
          <button
            disabled={pending}
            title="Mark verified"
            onClick={() => run(() => verifyExternalAction(e.id))}
            className="rounded p-1 text-[var(--color-pine)] hover:bg-[var(--color-pine)]/10 disabled:opacity-50"
          >
            <BadgeCheck size={14} />
          </button>
        )}
        <button
          disabled={pending}
          title="Remove"
          aria-label="Remove this external commitment"
          onClick={async () => {
            if (!await ask({ title: "Remove this external commitment?", body: "The booking will disappear from the OD row and will no longer block the room or teacher at that time.", confirmLabel: "Remove commitment" })) return;
            run(() => deleteExternalAction(e.id));
          }}
          className="rounded p-1 text-[var(--color-clay)] hover:bg-[var(--color-clay)]/10 disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </span>
      {failed ? (
        <span role="alert" className="mt-1 block w-[230px] rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-2 py-1.5 text-left text-[11.5px] leading-snug text-[var(--color-clay)]">
          <span className="block font-semibold">{failed.message}</span>
          {failed.issues?.map((issue, index) => (
            <span key={index} className="mt-0.5 flex items-start gap-1">
              <XCircle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="text-[#7c2a17]">{issue.detail}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
