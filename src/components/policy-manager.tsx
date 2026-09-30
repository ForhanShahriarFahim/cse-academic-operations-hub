"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { updateAcademicPolicyAction } from "@/lib/academic-actions";
import type { ExtraLoadPolicy } from "@/lib/extra-load";

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12px]";

export function PolicyManager({ policy }: { policy: ExtraLoadPolicy }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const policyForm = useRef<HTMLFormElement>(null);
  function submit(form: HTMLFormElement, action: (data: FormData) => Promise<ActionResult>) {
    startTransition(async () => setResult(await action(new FormData(form))));
  }
  return <div className="space-y-4">
    {result && <p className={`rounded-md border px-3 py-2 text-[12px] ${result.ok ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]" : "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"}`}>{result.message}</p>}
    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Academic, attendance & payment policy</h2><p className="mt-0.5 text-[11.5px] text-muted">Saved per Spring/Summer term so historical calculations do not change.</p></header>
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

    <section className="ruled rounded-lg px-4 py-3">
      <h2 className="font-display text-[15px] font-semibold">Class days, periods and class hours</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-2">These are set per term, for each stream and for any batch that differs, in <Link href="/routine/periods" className="font-semibold text-[var(--color-pine)] underline underline-offset-2">Days &amp; periods</Link>.</p>
    </section>
  </div>;
}

