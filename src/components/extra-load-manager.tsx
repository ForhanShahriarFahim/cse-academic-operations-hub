"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { FileText, Plus, Printer, Trash2 } from "lucide-react";
import {
  createExtraLoadClassAction,
  createManualTopSheetRowAction,
  deleteExtraLoadClassAction,
  deleteManualTopSheetRowAction,
} from "@/lib/academic-actions";
import { fmtRange } from "@/lib/time";
import type { ActionResult } from "@/lib/actions";

interface Teacher { id: number; fullName: string; shortCode: string; designation: string | null }
interface Group { id: number; courseCode: string; courseTitle: string; audience: string; teacherIds: number[] }
interface Entry {
  id: number; teacherId: number; teacherName: string; teacherShortCode: string;
  classDate: string; startMinutes: number; endMinutes: number;
  courseCodeSnapshot: string; batchLabelSnapshot: string;
}
interface Summary { teacher: Teacher; assignedCredits: number; classCount: number; amount: number }
interface Manual { id: number; teacherName: string; classCount: number; amount: number; notes: string | null }

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12.5px]";

export function ExtraLoadManager({
  teachers, groups, entries, summaries, manualRows, threshold, rate, termStart, termEnd,
}: {
  teachers: Teacher[];
  groups: Group[];
  entries: Entry[];
  summaries: Summary[];
  manualRows: Manual[];
  threshold: number;
  rate: number;
  termStart: string;
  termEnd: string;
}) {
  const eligible = summaries.filter((row) => row.assignedCredits > threshold);
  const [teacherId, setTeacherId] = useState(eligible[0]?.teacher.id ?? 0);
  const [from, setFrom] = useState(termStart);
  const [to, setTo] = useState(termEnd);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const classForm = useRef<HTMLFormElement>(null);
  const manualForm = useRef<HTMLFormElement>(null);
  const assignedGroups = useMemo(() => groups.filter((group) => group.teacherIds.includes(teacherId)), [groups, teacherId]);

  const submit = (form: HTMLFormElement, action: (data: FormData) => Promise<ActionResult>) => {
    startTransition(async () => {
      const response = await action(new FormData(form));
      setResult(response);
      if (response.ok) form.reset();
    });
  };

  return (
    <div className="space-y-4">
      {result && <p className={`rounded-md border px-3 py-2 text-[12px] ${result.ok ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]" : "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"}`}>{result.message}</p>}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <section className="ruled rounded-lg">
          <header className="border-b border-[var(--color-line-soft)] px-4 py-3">
            <h2 className="font-display text-[15px] font-semibold">Record a daily extra class</h2>
            <p className="mt-0.5 text-[11.5px] text-[#6b7564]">Only teachers above {threshold.toFixed(1)} assigned credits are eligible.</p>
          </header>
          <form ref={classForm} className="grid gap-3 p-4" onSubmit={(event) => { event.preventDefault(); submit(classForm.current!, createExtraLoadClassAction); }}>
            <label>
              <span className="micro-label mb-1 block">Teacher</span>
              <select name="teacherId" value={teacherId} onChange={(event) => setTeacherId(Number(event.target.value))} className={control} required>
                {eligible.length === 0 && <option value="">No teacher is currently above the threshold</option>}
                {eligible.map((row) => <option key={row.teacher.id} value={row.teacher.id}>{row.teacher.shortCode} · {row.teacher.fullName} ({row.assignedCredits.toFixed(1)} cr.)</option>)}
              </select>
            </label>
            <label>
              <span className="micro-label mb-1 block">Extra-load course</span>
              <select name="teachingGroupId" className={control} required>
                <option value="">Choose assigned course…</option>
                {assignedGroups.map((group) => <option key={group.id} value={group.id}>{group.courseCode} · {group.audience} · {group.courseTitle}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label><span className="micro-label mb-1 block">Date</span><input name="classDate" type="date" min={termStart} max={termEnd} className={control} required /></label>
              <label><span className="micro-label mb-1 block">Start</span><input name="startTime" type="time" className={control} required /></label>
              <label><span className="micro-label mb-1 block">End</span><input name="endTime" type="time" className={control} required /></label>
            </div>
            <label><span className="micro-label mb-1 block">Notes (optional)</span><input name="notes" placeholder="e.g. replacement class" className={control} /></label>
            <button disabled={pending || eligible.length === 0} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-pine)] px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"><Plus size={14} />{pending ? "Saving…" : "Add extra class"}</button>
          </form>
        </section>

        <section className="ruled rounded-lg">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
            <div><h2 className="font-display text-[15px] font-semibold">Print center</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Top sheet combines app records and manually entered teachers.</p></div>
            <Link href={`/extra-load/top-sheet/print?from=${from}&to=${to}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-ink)] px-3 py-2 text-[12px] font-semibold text-white"><Printer size={13} />Top sheet</Link>
          </header>
          <div className="p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label><span className="micro-label mb-1 block">From</span><input type="date" value={from} min={termStart} max={termEnd} onChange={(e) => setFrom(e.target.value)} className={control} /></label>
              <label><span className="micro-label mb-1 block">To</span><input type="date" value={to} min={termStart} max={termEnd} onChange={(e) => setTo(e.target.value)} className={control} /></label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-[var(--color-line)] text-left"><th className="py-1.5">Teacher</th><th>Credits</th><th>Classes</th><th>Amount</th><th className="text-right">Sheet</th></tr></thead>
                <tbody>{eligible.map((row) => <tr key={row.teacher.id} className="border-b border-[var(--color-line-soft)]">
                  <td className="py-2 font-medium">{row.teacher.fullName}</td><td className="font-mono">{row.assignedCredits.toFixed(1)}</td><td className="font-mono">{row.classCount}</td><td className="font-mono">৳{row.amount.toLocaleString()}</td>
                  <td className="text-right"><Link href={`/extra-load/teacher/${row.teacher.id}/print?from=${from}&to=${to}`} target="_blank" className="inline-flex items-center gap-1 text-[var(--color-pine)] hover:underline"><FileText size={12} />Print</Link></td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="mt-2 text-[10.5px] text-[#8a8571]">Default payment: ৳{rate.toLocaleString()} per recorded class. Signatures remain blank on print.</p>
          </div>
        </section>
      </div>

      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Recorded extra classes</h2></header>
        <div className="overflow-x-auto p-4">
          <table className="routine-table text-[12px]"><thead><tr>{["Date", "Teacher", "Course", "Batch / audience", "Time", ""].map((h) => <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead>
            <tbody>{entries.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-[#8a8571]">No extra classes recorded yet.</td></tr> : entries.map((entry) => <tr key={entry.id}>
              <td className="px-2.5 py-2 font-mono">{entry.classDate}</td><td className="px-2.5 py-2">{entry.teacherShortCode} · {entry.teacherName}</td><td className="px-2.5 py-2 font-mono font-semibold">{entry.courseCodeSnapshot}</td><td className="px-2.5 py-2">{entry.batchLabelSnapshot}</td><td className="px-2.5 py-2 font-mono">{fmtRange(entry.startMinutes, entry.endMinutes)}</td>
              <td className="px-2.5 py-2 text-right"><button title="Delete" disabled={pending} onClick={() => confirm("Remove this extra class?") && startTransition(async () => setResult(await deleteExtraLoadClassAction(entry.id)))} className="rounded p-1 text-[var(--color-clay)] hover:bg-[var(--color-clay)]/10"><Trash2 size={13} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Manual top-sheet entries</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">For teachers who keep their detailed sheet outside this application.</p></header>
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_1.2fr]">
          <form ref={manualForm} className="grid grid-cols-2 gap-2" onSubmit={(event) => { event.preventDefault(); submit(manualForm.current!, createManualTopSheetRowAction); }}>
            <label className="col-span-2"><span className="micro-label mb-1 block">Teacher name</span><input name="teacherName" placeholder="e.g. Md. Forhan Shahriar Fahim" className={control} required /></label>
            <label><span className="micro-label mb-1 block">Number of classes</span><input name="classCount" type="number" min="0" step="1" className={control} required /></label>
            <label><span className="micro-label mb-1 block">Rate override (optional)</span><input name="rateOverride" type="number" min="0" step="0.01" placeholder={String(rate)} className={control} /></label>
            <label><span className="micro-label mb-1 block">Amount override</span><input name="amountOverride" type="number" min="0" step="0.01" placeholder="auto" className={control} /></label>
            <label><span className="micro-label mb-1 block">Note</span><input name="notes" placeholder="optional" className={control} /></label>
            <button disabled={pending} className="col-span-2 rounded-md border border-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-[var(--color-pine)]">Add manual row</button>
          </form>
          <div>{manualRows.length === 0 ? <p className="rounded-md border border-dashed border-[var(--color-line)] p-4 text-center text-[12px] text-[#8a8571]">No manual teachers added.</p> : manualRows.map((row) => <div key={row.id} className="flex items-center gap-3 border-b border-[var(--color-line-soft)] py-2 text-[12px]"><span className="font-medium">{row.teacherName}</span><span className="ml-auto font-mono">{row.classCount} × class</span><span className="font-mono font-semibold">৳{row.amount.toLocaleString()}</span><button onClick={() => startTransition(async () => setResult(await deleteManualTopSheetRowAction(row.id)))} className="text-[var(--color-clay)]"><Trash2 size={13} /></button></div>)}</div>
        </div>
      </section>
    </div>
  );
}

