"use client";

import { fmtRange } from "@/lib/time";
import type { MeetingView } from "@/lib/serialize";
import type { RoutineDayProjection } from "@/lib/routine-projection";
import type { ClassStatus } from "./grid";

const batchName = (stream: string, label: string) => `${stream === "HSC" ? "HSC" : "DIP"}-${label}`;

/** Phone layout: the chosen day as a list per batch. Editing opens the full-screen panel. */
export function RoutineAgenda({ day, meetings, statusById, showWarnings, matches, onSelect, onAdd }: {
  day: RoutineDayProjection;
  meetings: MeetingView[];
  statusById: Map<number, ClassStatus>;
  showWarnings: boolean;
  matches: (m: MeetingView) => boolean;
  onSelect: (meeting: MeetingView, trigger: HTMLElement) => void;
  onAdd: (batchId: number, trigger: HTMLElement) => void;
}) {
  return (
    <div className="space-y-2">
      {day.rows.map(({ batch }) => {
        const list = meetings.filter((m) => m.audiences.some((a) => a.batchId === batch.id)).sort((a, b) => a.startMinutes - b.startMinutes);
        const clashes = list.filter((m) => statusById.get(m.id) === "blocker").length;
        return (
          <details key={batch.id} open={clashes > 0} className="rounded-lg border border-[var(--color-line)] bg-sheet">
            <summary className="flex cursor-pointer items-baseline gap-2 px-3.5 py-3 text-[14px]">
              <span className="font-mono font-semibold">{batchName(batch.stream, batch.label)}</span>
              {batch.semester ? <span className="text-ink-2">Semester {batch.semester}</span> : null}
              {clashes ? <span className="text-[12.5px] font-semibold text-[var(--color-clay)]">{clashes} clash{clashes === 1 ? "" : "es"}</span> : null}
              <span className="ml-auto text-[12.5px] text-muted">{list.length} class{list.length === 1 ? "" : "es"}</span>
            </summary>
            <ol className="px-2.5 pb-2.5">
              {list.map((m) => {
                const raw = statusById.get(m.id) ?? "clear";
                const status = raw === "warning" && !showWarnings ? "clear" : raw;
                return (
                  <li key={m.id} className={`border-t border-[var(--color-line-soft)] ${matches(m) ? "" : "opacity-40"}`}>
                    <button type="button" onClick={(event) => onSelect(m, event.currentTarget)} className="grid w-full grid-cols-[104px_minmax(0,1fr)] gap-2 px-1 py-2.5 text-left text-[13px]">
                      <span className="font-mono text-[12.5px] text-ink-2">{fmtRange(m.startMinutes, m.endMinutes)}</span>
                      <span>
                        <span className={`font-mono font-semibold ${status === "blocker" ? "text-[var(--color-clay)]" : ""}`}>
                          {status === "blocker" ? "✕ " : status === "warning" ? "! " : ""}{m.courseCode}
                        </span>
                        <span className="block font-mono text-[12px] text-muted">
                          {m.teachers.map((t) => t.shortCode).join(" + ") || "No teacher"} · {m.rooms.map((r) => r.code).join(" / ") || "No room"}
                          {status === "blocker" ? " · clash" : status === "warning" ? " · check" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={(event) => onAdd(batch.id, event.currentTarget)} className="mt-1.5 w-full rounded-md border border-dashed border-[var(--color-line)] py-2 text-[13px] font-medium text-[var(--color-pine)]">
                  + Add a class to {batchName(batch.stream, batch.label)}
                </button>
              </li>
            </ol>
          </details>
        );
      })}
    </div>
  );
}
