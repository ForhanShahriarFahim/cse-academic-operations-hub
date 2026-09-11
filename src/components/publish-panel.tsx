"use client";

import { useState, useTransition } from "react";
import { FileCheck2, ShieldAlert } from "lucide-react";
import { publishAction, type ActionResult } from "@/lib/actions";

export function PublishPanel({ disabled, blockerCount }: { disabled: boolean; blockerCount: number }) {
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="Change summary for this revision (e.g. “Move CSE-2203 26B to NB-304, add makeup slot for 28B”)…"
        className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[var(--color-pine)]"
      />
      <button
        disabled={pending || disabled}
        onClick={() => {
          if (!confirm("Publish this working draft as a new immutable version? The previous version will be superseded, not deleted.")) return;
          startTransition(async () => {
            const r = await publishAction(summary.trim());
            setResult(r);
          });
        }}
        className="flex items-center gap-2 rounded-md bg-[var(--color-pine)] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-pine-2)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <FileCheck2 size={15} />
        {pending ? "Validating & publishing…" : "Validate & publish new version"}
      </button>
      {disabled && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-clay)]">
          <ShieldAlert size={13} /> Publication is gated: {blockerCount} blocking issue(s) must be resolved in the Routine Builder first.
        </p>
      )}
      {result && (
        <div className={`rounded-md border px-3 py-2.5 text-[12px] ${
          result.ok
            ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]"
            : "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"
        }`}>
          <p className="font-semibold">{result.message}</p>
          {result.issues && result.issues.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {result.issues.slice(0, 8).map((i, k) => (
                <li key={k}>• <strong>{i.title}</strong> — {i.detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
