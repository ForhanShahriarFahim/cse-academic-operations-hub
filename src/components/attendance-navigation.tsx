"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLinkStatus } from "next/link";
import { attendanceHref, type Choice } from "@/lib/attendance-selection";

const fields = ["department", "stream", "batch"] as const;
type Field = typeof fields[number];
const labels: Record<Field, string> = { department: "Department", stream: "Stream", batch: "Batch" };

export function AttendanceFilters({ filters, options }: { filters: Record<Field, string | undefined>; options: Record<Field, Choice[]> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div aria-busy={pending} className="grid min-w-0 gap-3 sm:grid-cols-3">
    {fields.map((field, index) => <div key={field} className="min-w-0">
      <label htmlFor={`attendance-filter-${field}`} className="block text-sm font-semibold">{labels[field]}</label>
      <select id={`attendance-filter-${field}`} value={filters[field] ?? ""} disabled={options[field].length === 0} aria-disabled={pending || undefined}
        className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-white px-2 text-sm font-normal"
        onChange={event => {
          if (pending) return;
          const next: Record<string, string | undefined> = { view: "find" };
          for (const previous of fields.slice(0, index)) next[previous] = filters[previous];
          next[field] = event.target.value || undefined;
          startTransition(() => router.push(attendanceHref(next), { scroll: false }));
        }}>
        <option value="">Choose a {field}</option>
        {options[field].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>)}
    <span role="status" className="sr-only">{pending ? "Updating course choices…" : ""}</span>
  </div>;
}

export function AttendanceLinkPending() {
  const { pending } = useLinkStatus();
  return <span role="status" className="sr-only">{pending ? "Opening attendance…" : ""}</span>;
}

export function AttendanceFocus({ target }: { target: string }) {
  useEffect(() => {
    document.getElementById(target)?.focus();
  }, [target]);
  return null;
}
