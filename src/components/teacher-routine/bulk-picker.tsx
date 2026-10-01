"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { RoutineChoice } from "@/lib/teacher-routine-data";

export interface BulkTeacher {
  id: number;
  shortCode: string;
  fullName: string;
  designation: string | null;
  cse: boolean;
  classes: number;
  credits: string;
  status: "classes" | "no_fixed_time" | "none";
}

const STATUS_TEXT = {
  classes: "Ready",
  no_fixed_time: "No scheduled classes; prints the no-fixed-time list only",
  none: "No classes or assignments; skipped",
} as const;

/** Teacher selection for bulk printing. A plain GET form, so it also works before scripts load. */
export function BulkRoutinePicker({ teachers, source, sourceLabel }: { teachers: BulkTeacher[]; source: RoutineChoice; sourceLabel: string }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"cse" | "all">("cse");
  const [picked, setPicked] = useState<Set<number>>(() => new Set(teachers.filter((teacher) => teacher.cse && teacher.status !== "none").map((teacher) => teacher.id)));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teachers.filter((teacher) => (scope === "all" || teacher.cse)
      && (!needle || teacher.shortCode.toLowerCase().includes(needle) || teacher.fullName.toLowerCase().includes(needle)));
  }, [teachers, query, scope]);
  const ready = visible.filter((teacher) => teacher.status !== "none");
  const chosen = ready.filter((teacher) => picked.has(teacher.id));
  const allChosen = ready.length > 0 && chosen.length === ready.length;

  const toggle = (id: number, on: boolean) => setPicked((current) => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (on: boolean) => setPicked((current) => {
    const next = new Set(current);
    for (const teacher of ready) { if (on) next.add(teacher.id); else next.delete(teacher.id); }
    return next;
  });

  return (
    <form method="get" action="/teachers/routines/print" className="ruled rounded-lg">
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-[var(--color-line-soft)] px-4 py-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--color-pine)]" checked={allChosen} onChange={(event) => toggleAll(event.target.checked)} />
          All ready
        </label>
        <label className="inline-flex flex-1 items-center gap-2 text-[13px] text-ink-2 max-sm:basis-full">
          Find
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code"
            className="min-h-9 w-full max-w-[240px] rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[13.5px] max-sm:max-w-none" />
        </label>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          Teachers
          <select value={scope} onChange={(event) => setScope(event.target.value as "cse" | "all")}
            className="min-h-9 rounded-md border border-[var(--color-line)] bg-white px-2 text-[13.5px]">
            <option value="cse">CSE teachers</option>
            <option value="all">Everyone with CSE classes</option>
          </select>
        </label>
      </div>
      <div role="region" aria-label="Teachers to print" tabIndex={0} className="table-region max-h-[62vh] overflow-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col" className="w-11"><span className="sr-only">Include</span></th>
              <th scope="col">Teacher</th>
              <th scope="col" className="max-md:hidden">Designation</th>
              <th scope="col" className="num">Classes a week</th>
              <th scope="col" className="num">Credit hours</th>
              <th scope="col">Page</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((teacher) => {
              const skipped = teacher.status === "none";
              return (
                <tr key={teacher.id} className={skipped ? "text-muted" : undefined}>
                  <td>
                    <input type="checkbox" name="id" value={teacher.id} disabled={skipped} checked={!skipped && picked.has(teacher.id)}
                      onChange={(event) => toggle(teacher.id, event.target.checked)}
                      aria-label={`Include ${teacher.fullName}`} className="size-4 accent-[var(--color-pine)]" />
                  </td>
                  <td><span className="font-mono text-[12.5px] font-semibold">{teacher.shortCode}</span> <span className="text-ink-2">{teacher.fullName}</span></td>
                  <td className="max-md:hidden">{teacher.designation ?? "—"}</td>
                  <td className="num">{teacher.classes}</td>
                  <td className="num">{teacher.credits}</td>
                  <td className="whitespace-normal">{STATUS_TEXT[teacher.status]}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? <tr><td colSpan={6} className="text-muted">No teachers match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-[var(--color-line)] bg-sheet px-4 py-3">
        <p className="text-[13px] text-ink-2" aria-live="polite">
          <strong>{chosen.length === 1 ? "1 teacher selected" : `${chosen.length} teachers selected`}</strong> · one page each · from {sourceLabel}. Pages print in the order shown.
        </p>
        <button type="submit" disabled={chosen.length === 0}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--color-pine-2)] disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full max-sm:justify-center">
          <Printer size={15} strokeWidth={1.8} aria-hidden="true" /> {chosen.length === 1 ? "Open 1 routine to print" : `Open ${chosen.length} routines to print`}
        </button>
      </div>
    </form>
  );
}
