"use client";

import { useTermActions } from "@/components/term-write-context";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, ShieldAlert } from "lucide-react";
import { type ActionResult } from "@/lib/actions";
import { useConfirm } from "@/components/confirm-dialog";

/** `latestVersionId` is the highest-numbered version this page shows; the server refuses if a newer one exists (BUG-25). */
export function PublishPanel({ disabled, blockerCount, latestVersionId }: { disabled: boolean; blockerCount: number; latestVersionId: number | null }) {
  const { publishAction } = useTermActions();
  const router = useRouter();
  const [ask, confirmDialog] = useConfirm();
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
{confirmDialog}      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="Change summary for this revision (e.g. “Move CSE-2203 26B to NB-304, add makeup slot for 28B”)…"
        className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[var(--color-pine)]"
      />
      <button
        disabled={pending || disabled}
        onClick={async () => {
          if (!await ask({ title: "Publish the working draft as a new version?", body: "Students and teachers will see this version on the public routine from its effective date. The current version is kept in the archive, not deleted, and a published version cannot be edited.", confirmLabel: "Publish version", tone: "primary" })) return;
          startTransition(async () => {
            const r = await publishAction(summary.trim(), latestVersionId);
            setResult(r);
            // Show the version that appeared meanwhile; the message stays visible.
            if (r.outcome?.kind === "stale") router.refresh();
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
        <div role={result.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2.5 text-[12px] ${
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
