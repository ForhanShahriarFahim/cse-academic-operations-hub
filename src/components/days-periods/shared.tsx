"use client";

import type { GridBreak, GridImpact, GridPeriod, ImpactMeeting, WindowLike } from "@/lib/time-grid";
import { fmtTime } from "@/lib/time";

/** Everything the Days & periods editors need, serializable from the server page. */
export interface GridContext {
  meetings: ImpactMeeting[];
  windows: WindowLike[];
  batches: Array<{ id: number; stream: "HSC" | "DIPLOMA"; label: string }>;
  canEdit: boolean;
}

export const batchName = (stream: string, label: string) => `${stream === "HSC" ? "HSC" : "DIP"}-${label}`;

/** "HH:MM" for <input type="time">. */
export const toTimeInput = (minutes: number | null | undefined) =>
  minutes == null || !Number.isFinite(minutes) ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function fromTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** "9:30 AM – 3:45 PM" without repeating the period when it is the same. */
export function hoursText(start: number, end: number): string {
  const a = fmtTime(start);
  const b = fmtTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

const TRACK_START = 8 * 60;
const TRACK_END = 18 * 60;

/** A day drawn from 8 AM to 6 PM (wider when periods fall outside), with periods and breaks as blocks. */
export function Timeline({ periods, breaks, label, showTimes = false, showScale = false }: {
  periods: GridPeriod[];
  breaks: GridBreak[];
  label: string;
  showTimes?: boolean;
  showScale?: boolean;
}) {
  const all = [...periods, ...breaks];
  const start = Math.min(TRACK_START, ...all.map((p) => Math.floor(p.start / 60) * 60));
  const end = Math.max(TRACK_END, ...all.map((p) => Math.ceil(p.end / 60) * 60));
  const pct = (minutes: number) => ((minutes - start) / (end - start)) * 100;
  const hours: number[] = [];
  for (let hour = start; hour <= end; hour += 120) hours.push(hour);
  return (
    <div>
      <div role="img" aria-label={label} className="relative h-[30px] rounded bg-wash">
        {periods.map((p, index) => (
          <span key={`p${index}`} className="absolute bottom-[3px] top-[3px] overflow-hidden rounded-[3px] border border-[#b9ccb9] bg-pine-tint"
            style={{ left: `${pct(p.start)}%`, width: `${pct(p.end) - pct(p.start)}%` }}>
            {showTimes && pct(p.end) - pct(p.start) >= 9 ? <span className="absolute inset-0 grid place-items-center whitespace-nowrap font-mono text-[10.5px] font-semibold text-[var(--color-pine)]">{fmtTime(p.start).replace(/ [AP]M$/, "")}</span> : null}
          </span>
        ))}
        {breaks.map((b, index) => (
          <span key={`b${index}`} title={`${b.name}${b.blocksClasses ? " (no classes)" : ""}`}
            className={`absolute bottom-[3px] top-[3px] rounded-[3px] border border-dashed ${b.blocksClasses ? "border-[var(--color-clay)] bg-[repeating-linear-gradient(-45deg,rgba(163,52,27,.22)_0_3px,transparent_3px_6px)]" : "border-[var(--color-gold)] bg-[repeating-linear-gradient(-45deg,rgba(122,82,18,.22)_0_3px,transparent_3px_6px)]"}`}
            style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }} />
        ))}
      </div>
      {showScale ? (
        <div aria-hidden="true" className="relative mt-0.5 h-4 font-mono text-[10.5px] text-muted">
          {hours.map((hour) => (
            <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${Math.min(97, Math.max(3, pct(hour)))}%` }}>
              {((Math.floor(hour / 60) + 11) % 12) + 1}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** What a change would do to existing classes, with the opt-in move. */
export function ImpactNotice({ impact, moveClasses, onMoveClasses, children }: {
  impact: GridImpact;
  moveClasses: boolean;
  onMoveClasses: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  if (impact.affected === 0 && !children) return null;
  const left = impact.misaligned.length;
  const breaking = moveClasses ? impact.breaking.filter((item) => !item.resolvedByMove) : impact.breaking;
  const fixed = impact.breaking.length - breaking.length;
  return (
    <div role="status" className="mb-3 rounded-[7px] border border-[#e3cf9e] bg-gold-tint px-3 py-2.5 text-[13px] text-[#4e3a12]">
      <p><b className="text-gold-text">Before you save:</b>{" "}
        {impact.affected === 0 ? "no existing classes are affected."
          : left ? `${left} class${left === 1 ? "" : "es"} no longer start${left === 1 ? "s" : ""} at a period. They keep their exact times until moved.`
            : `${impact.affected} class${impact.affected === 1 ? " is" : "es are"} on the days this changes, and still line up.`}
      </p>
      {breaking.length ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {breaking.slice(0, 6).map((item) => <li key={item.meeting.id}>{item.reason}</li>)}
          {breaking.length > 6 ? <li>and {breaking.length - 6} more.</li> : null}
        </ul>
      ) : null}
      {fixed ? <p className="mt-1.5">Moving the classes also fixes {fixed} that would otherwise fall outside the rules.</p> : null}
      {children}
      {impact.moves.length ? (
        <label className="mt-2 flex items-start gap-2 text-[var(--color-ink)]">
          <input type="checkbox" checked={moveClasses} onChange={(event) => onMoveClasses(event.target.checked)} className="mt-1 accent-[var(--color-pine)]" />
          <span>Move each class to the new period in the same position (period 1 → period 1). {impact.moves.length} can move{impact.manual.length ? `; ${impact.manual.length} need${impact.manual.length === 1 ? "s" : ""} placing by hand` : ""}.</span>
        </label>
      ) : left ? <p className="mt-1.5">The number of periods changed, so classes are not moved automatically. Place them in the Routine builder.</p> : null}
    </div>
  );
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return <p id={id} className="mt-1 text-[12.5px] font-medium text-[var(--color-clay)]">{messages.join(" ")}</p>;
}
