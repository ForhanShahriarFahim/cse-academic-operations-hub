"use client";

import { XCircle, AlertTriangle } from "lucide-react";
import { DAY_NAMES } from "@/lib/time";
import type { Issue } from "@/lib/conflicts";
import type { MeetingView } from "@/lib/serialize";
import type { WorkbenchGroup } from "./workbench";

/** What needs doing on this day: clashes to fix, then groups still to place. */
export function AttentionList({ day, issues, meetings, unplaced, fitGroupId, fitCount, onShow, onFit, headingId }: {
  day: number;
  issues: Issue[];
  meetings: MeetingView[];
  unplaced: WorkbenchGroup[];
  fitGroupId: number | null;
  fitCount: number;
  onShow: (meetingId: number) => void;
  onFit: (groupId: number | null) => void;
  headingId: string;
}) {
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const code = (id: number) => meetings.find((m) => m.id === id)?.courseCode;

  return (
    <div className="p-4">
      <h2 id={headingId} className="font-display text-[17px] font-semibold">Needs attention</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">{DAY_NAMES[day]} in this stream, and classes not yet fully placed.</p>

      <section aria-labelledby="att-clashes" className="mt-4">
        <h3 id="att-clashes" className="text-[13px] font-semibold">Clashes on {DAY_NAMES[day]} · {blockers.length}</h3>
        {blockers.length === 0 ? <p className="mt-1 text-[13px] text-ink-2">No blocking clashes on this day.</p> : (
          <ul className="mt-1 divide-y divide-[var(--color-line-soft)]">
            {blockers.map((issue) => (
              <li key={issue.id} className="py-2 text-[13px]">
                <p className="flex items-start gap-1.5 font-medium"><XCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-clay)]" />{issue.title}</p>
                <p className="mt-0.5 pl-5 text-[12.5px] leading-relaxed text-muted">{issue.detail}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 pl-5">
                  {issue.meetingIds.filter((id) => code(id)).map((id) => (
                    <button key={id} type="button" onClick={() => onShow(id)} className="rounded border border-[var(--color-line)] bg-white px-2 py-0.5 font-mono text-[12px] hover:border-[var(--color-pine)]">
                      Show {code(id)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {warnings.length ? <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-gold-text"><AlertTriangle size={13} aria-hidden="true" />{warnings.length} warnings on this day are listed in Validation.</p> : null}
      </section>

      <section aria-labelledby="att-unplaced" className="mt-5">
        <h3 id="att-unplaced" className="text-[13px] font-semibold">Not fully placed · {unplaced.length}</h3>
        {unplaced.length === 0 ? <p className="mt-1 text-[13px] text-ink-2">Every class in this stream is placed.</p> : (
          <ul className="mt-1 divide-y divide-[var(--color-line-soft)]">
            {unplaced.map((group) => {
              const { coverage } = group;
              const active = fitGroupId === group.template.teachingGroupId;
              return (
                <li key={group.template.teachingGroupId} className="py-2 text-[13px]">
                  <p><span className="font-mono font-semibold">{coverage.courseCode}</span> <span className="text-ink-2">{coverage.audience}</span></p>
                  <p className="text-[12.5px] text-muted">
                    {coverage.deliveryMode === "teacher_managed" ? "Arranged by the teacher; no fixed time needed."
                      : coverage.status === "vacancy" ? "No teacher assigned yet. Assign one in Courses before placing it."
                      : `${coverage.scheduledMinutes} of ${coverage.expectedWeeklyMinutes ?? "?"} weekly minutes placed.`}
                  </p>
                  {coverage.deliveryMode !== "teacher_managed" && coverage.status !== "vacancy" ? (
                    <button type="button" aria-pressed={active} onClick={() => onFit(active ? null : group.template.teachingGroupId)}
                      className={`mt-1 rounded-md border px-2.5 py-1 text-[12.5px] font-medium ${active ? "border-[var(--color-pine)] bg-pine-tint text-[var(--color-pine)]" : "border-[var(--color-line)] bg-white"}`}>
                      {active ? `Showing ${fitCount} place${fitCount === 1 ? "" : "s"} it fits · hide` : "Where does it fit?"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
