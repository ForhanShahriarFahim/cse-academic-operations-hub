"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { applyAutoScheduleAction } from "@/lib/academic-actions";

export function AutoScheduleApply({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return <div className="flex flex-col items-end gap-2">
    <button disabled={pending || count === 0} onClick={() => startTransition(async () => setResult(await applyAutoScheduleAction()))} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"><Sparkles size={14} />{pending ? "Rechecking & applying…" : `Apply ${count} safe suggestion${count === 1 ? "" : "s"}`}</button>
    {result && <p className={`max-w-sm text-right text-[11.5px] ${result.ok ? "text-[var(--color-pine)]" : "text-[var(--color-clay)]"}`}>{result.message}</p>}
  </div>;
}
