"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium hover:bg-wash"
    >
      <Printer size={15} strokeWidth={1.8} aria-hidden="true" /> Print or save PDF
    </button>
  );
}
