"use client";

import Link from "next/link";
import { useEffect } from "react";
import { XCircle } from "lucide-react";

/** Unexpected failure inside a portal page. The shell stays usable; details stay in server logs. */
export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="max-w-xl rounded-lg border border-[var(--color-line)] bg-sheet p-5">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-clay)]">
        <XCircle size={16} strokeWidth={2} aria-hidden="true" /> This page could not be loaded
      </p>
      <h1 className="font-display mt-2 text-[22px] font-semibold leading-snug">Something went wrong while preparing this page</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
        No changes were saved by this error. Try again; if it keeps happening, tell the portal administrator what you were doing
        {error.digest ? <> and quote reference <span className="font-mono">{error.digest}</span></> : null}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className="min-h-9 rounded-md bg-[var(--color-pine)] px-4 text-[13.5px] font-semibold text-white">Try again</button>
        <Link href="/" className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">Go to dashboard</Link>
      </div>
    </div>
  );
}
