import { Badge, type Tone } from "@/components/ui";
import { REGULAR_CLASS_LABELS, dateRange, isExamKind, kindLabel, type CalendarEntry } from "@/lib/calendar-records";

/** A source reference as text, with its public link only when it is a safe HTTP(S) URL. */
export function SourceRef({ source, url, print = false }: { source: string; url: string | null; print?: boolean }) {
  const safe = url && /^https?:\/\//i.test(url) ? url : null;
  return <span className="break-words">{source}{safe && (print
    ? <span className="block break-all text-[8pt]">{safe}</span>
    : <> · <a className="underline" href={safe} target="_blank" rel="noopener noreferrer nofollow">Open notice<span className="sr-only"> (opens a new tab)</span></a></>)}</span>;
}

const KIND_TONE: Record<string, Tone> = { public_holiday: "clay", university_holiday: "clay", class_suspension: "clay", midterm: "gold", final: "gold" };
export const kindTone = (kind: string): Tone => KIND_TONE[kind] ?? "neutral";

export function effectText(entry: Pick<CalendarEntry, "kind" | "regularClasses">) {
  if (isExamKind(entry.kind)) return entry.regularClasses === "continue" || entry.regularClasses === "suspended" ? REGULAR_CLASS_LABELS[entry.regularClasses] : "Effect not recorded";
  return REGULAR_CLASS_LABELS.suspended;
}

export function EntrySummary({ entry }: { entry: CalendarEntry }) {
  return <div className="min-w-0 break-words">
    <p className="text-[12.5px] font-semibold text-muted">{dateRange(entry.startDate, entry.endDate)}</p>
    <p className="text-[14.5px] font-semibold leading-snug">{entry.title}</p>
    <p className="mt-1 flex flex-wrap items-center gap-1.5"><Badge tone={kindTone(entry.kind)}>{kindLabel(entry.kind)}</Badge><span className="text-[12.5px] text-ink-2">{effectText(entry)}</span></p>
    <p className="mt-1 text-[12.5px] text-muted"><SourceRef source={entry.source} url={entry.sourceUrl} /></p>
  </div>;
}
