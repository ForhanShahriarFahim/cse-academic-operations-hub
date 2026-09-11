"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { createPermittedWindowAction, deletePermittedWindowAction, updateAcademicPolicyAction } from "@/lib/academic-actions";
import type { ExtraLoadPolicy } from "@/lib/extra-load";
import { DAY_NAMES, fmtRange } from "@/lib/time";

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12px]";

export function PolicyManager({ policy, windows, batches }: {
  policy: ExtraLoadPolicy;
  windows: Array<{ id: number; batchId: number | null; stream: string; dayOfWeek: number; startMinutes: number; endMinutes: number; note: string | null }>;
  batches: Array<{ id: number; stream: string; label: string }>;
}) {
  const [stream, setStream] = useState("HSC");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const policyForm = useRef<HTMLFormElement>(null);
  const windowForm = useRef<HTMLFormElement>(null);
  function submit(form: HTMLFormElement, action: (data: FormData) => Promise<ActionResult>) {
    startTransition(async () => { const response = await action(new FormData(form)); setResult(response); if (response.ok && form === windowForm.current) form.reset(); });
  }
  return <div className="space-y-4">
    {result && <p className={`rounded-md border px-3 py-2 text-[12px] ${result.ok ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]" : "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"}`}>{result.message}</p>}
    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Academic, attendance & payment policy</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Saved per Spring/Summer term so historical calculations do not change.</p></header>
      <form ref={policyForm} onSubmit={(event) => { event.preventDefault(); submit(policyForm.current!, updateAcademicPolicyAction); }} className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ["theoryCreditHours", "Theory course credits", policy.theoryCreditHours],
          ["sessionalCreditHours", "Sessional course credits", policy.sessionalCreditHours],
          ["extraLoadThresholdCredits", "Extra-load threshold", policy.extraLoadThresholdCredits],
          ["extraClassRate", "Payment per extra class (Tk)", policy.extraClassRate],
          ["theoryAttendanceMarks", "Theory attendance marks", policy.theoryAttendanceMarks],
          ["sessionalAttendanceMarks", "Sessional attendance marks", policy.sessionalAttendanceMarks],
        ].map(([name, label, value]) => <label key={String(name)}><span className="micro-label mb-1 block">{label}</span><input name={String(name)} type="number" min="0" step="0.1" defaultValue={Number(value)} className={control} required /></label>)}
        <button disabled={pending} className="inline-flex items-center justify-center gap-1.5 self-end rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12px] font-semibold text-white"><Save size={13} />Save term policy</button>
      </form>
    </section>

    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Editable class days & time windows</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Leave batch blank for a stream default. A batch-specific window replaces that stream default on the selected day.</p></header>
      <div className="grid gap-4 p-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form ref={windowForm} onSubmit={(event) => { event.preventDefault(); submit(windowForm.current!, createPermittedWindowAction); }} className="grid grid-cols-2 gap-2">
          <label><span className="micro-label mb-1 block">Stream</span><select name="stream" value={stream} onChange={(event) => setStream(event.target.value)} className={control}><option value="HSC">HSC</option><option value="DIPLOMA">Diploma</option></select></label>
          <label><span className="micro-label mb-1 block">Batch override</span><select name="batchId" className={control}><option value="">All {stream} batches</option>{batches.filter((batch) => batch.stream === stream).map((batch) => <option key={batch.id} value={batch.id}>{stream}-{batch.label}</option>)}</select></label>
          <label><span className="micro-label mb-1 block">Day</span><select name="dayOfWeek" className={control}>{DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
          <span />
          <label><span className="micro-label mb-1 block">Start</span><input name="startTime" type="time" className={control} required /></label>
          <label><span className="micro-label mb-1 block">End</span><input name="endTime" type="time" className={control} required /></label>
          <label className="col-span-2"><span className="micro-label mb-1 block">Policy note (optional)</span><input name="note" placeholder="e.g. approved Friday classes for this batch" className={control} /></label>
          <button disabled={pending} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-[var(--color-pine)]"><Plus size={13} />Add permitted window</button>
        </form>
        <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-line-soft)] bg-white px-3">
          {windows.map((window) => { const batch = batches.find((row) => row.id === window.batchId); return <div key={window.id} className="flex items-center gap-2 border-b border-[var(--color-line-soft)] py-2 text-[12px]"><strong>{batch ? `${window.stream}-${batch.label}` : `${window.stream} (all batches)`}</strong><span>{DAY_NAMES[window.dayOfWeek]}</span><span className="font-mono text-[11px]">{fmtRange(window.startMinutes, window.endMinutes)}</span>{window.note && <span className="min-w-0 flex-1 truncate text-[10.5px] text-[#8a6a25]" title={window.note}>{window.note}</span>}<button title="Remove" disabled={pending} onClick={() => confirm("Remove this permitted class window?") && startTransition(async () => setResult(await deletePermittedWindowAction(window.id)))} className="ml-auto rounded p-1 text-[var(--color-clay)]"><Trash2 size={13} /></button></div>; })}
        </div>
      </div>
    </section>
  </div>;
}

