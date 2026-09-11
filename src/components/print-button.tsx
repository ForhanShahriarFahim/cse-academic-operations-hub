"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print flex items-center gap-1.5 rounded-md bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-black"
    >
      <Printer size={14} /> Print / PDF
    </button>
  );
}
