"use client";

import { Printer } from "lucide-react";

export function PrintRoutineButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--color-pine-2)] max-sm:w-full max-sm:justify-center"
    >
      <Printer size={15} strokeWidth={1.8} aria-hidden="true" /> {label}
    </button>
  );
}
