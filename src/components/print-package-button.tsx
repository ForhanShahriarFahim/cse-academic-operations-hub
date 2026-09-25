"use client";

import { Printer } from "lucide-react";

export function PrintPackageButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white">
      <Printer size={14} /> Print / Save PDF
    </button>
  );
}
