/** CAL-01 term calendar rules. No database, auth or framework dependency. */
import { validTermDate } from "./term-records";

export const ENTRY_KINDS = ["public_holiday", "university_holiday", "class_suspension", "midterm", "final"] as const;
export type EntryKind = typeof ENTRY_KINDS[number];
export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  public_holiday: "Public holiday", university_holiday: "University holiday", class_suspension: "Class suspension",
  midterm: "Midterm period", final: "Final period",
};
export const kindLabel = (kind: string) => ENTRY_KIND_LABELS[kind as EntryKind] ?? `${kind} (unsupported)`;
export const isExamKind = (kind: string) => kind === "midterm" || kind === "final";
export const REGULAR_CLASSES = ["continue", "suspended"] as const;
export type RegularClasses = typeof REGULAR_CLASSES[number];
export const REGULAR_CLASS_LABELS: Record<RegularClasses, string> = { continue: "Regular classes may continue", suspended: "Regular classes suspended" };

export const TITLE_MAX = 120, SOURCE_MAX = 300, URL_MAX = 500, REASON_MAX = 300;

export interface CalendarTerm { id: number; name: string; status: string; startDate: string; endDate: string }
export interface TeachingRange { start: string; end: string; source: string; sourceUrl: string | null }
export interface CalendarEntry { id: number; kind: string; title: string; startDate: string; endDate: string; regularClasses: string | null; source: string; sourceUrl: string | null }

/** Draft and active term calendars can be changed; completed and legacy statuses are read-only. */
export const calendarEditable = (status: string) => status === "draft" || status === "active";

const control = /[\u0000-\u001f\u007f]/;
/** Collapses whitespace; refuses control characters. */
export function plainText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || control.test(value)) return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return [...text].length <= max ? text : undefined;
}
/** Case-insensitive identity of a title after trimming and collapsing whitespace. */
export const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/** Optional public HTTP(S) link. Blank is null; anything else unsafe is undefined (refused). */
export function sourceUrl(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return null;
  if (text.length > URL_MAX || /\s/.test(text) || !/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:" || !url.hostname || url.username || url.password) return undefined;
    return text;
  } catch { return undefined; }
}

export function calendarReason(value: unknown): string | null | undefined {
  const text = plainText(value, REASON_MAX);
  return text;
}

export function civilDate(value: unknown): string | null {
  return typeof value === "string" && validTermDate(value.trim()) ? value.trim() : null;
}

type Errors = Record<string, string[]>;
export type TeachingParse = { ok: true; range: TeachingRange | null } | { ok: false; errors: Errors };

/**
 * Teaching dates are both set (with a source) or all blank (clearing them).
 * Both must lie within the term's administrative dates.
 */
export function parseTeaching(raw: Record<string, unknown>, term: CalendarTerm): TeachingParse {
  const startText = typeof raw.teachingStart === "string" ? raw.teachingStart.trim() : "", endText = typeof raw.teachingEnd === "string" ? raw.teachingEnd.trim() : "";
  const source = plainText(raw.source, SOURCE_MAX), url = sourceUrl(raw.sourceUrl);
  const errors: Errors = {};
  if (!startText && !endText && !source && !url && source !== undefined && url !== undefined) return { ok: true, range: null };
  const start = civilDate(startText), end = civilDate(endText);
  const within = `Use a date from ${term.startDate} to ${term.endDate}.`;
  if (!start) errors.teachingStart = ["Enter the first regular class day as a real date."];
  else if (start < term.startDate || start > term.endDate) errors.teachingStart = [`The first class day is outside the term. ${within}`];
  if (!end) errors.teachingEnd = ["Enter the last regular class day as a real date."];
  else if (end < term.startDate || end > term.endDate) errors.teachingEnd = [`The last class day is outside the term. ${within}`];
  else if (start && end < start) errors.teachingEnd = ["The last class day must be on or after the first class day."];
  if (source === undefined) errors.source = [`Use up to ${SOURCE_MAX} plain-text characters.`];
  else if (!source) errors.source = ["Enter the approved notice or document these dates come from."];
  if (url === undefined) errors.sourceUrl = ["Enter a public link starting with http:// or https://, or leave it blank."];
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, range: { start: start!, end: end!, source: source!, sourceUrl: url ?? null } };
}

export interface EntryFields { kind: EntryKind; title: string; startDate: string; endDate: string; regularClasses: RegularClasses | null; source: string; sourceUrl: string | null }
export type EntryParse = { ok: true; entry: EntryFields } | { ok: false; errors: Errors };

export function parseEntry(raw: Record<string, unknown>, term: CalendarTerm, fixedKind?: string): EntryParse {
  const errors: Errors = {};
  const kindValue = fixedKind ?? raw.kind;
  const kind = (ENTRY_KINDS as readonly unknown[]).includes(kindValue) ? kindValue as EntryKind : null;
  if (!kind) errors.kind = ["Choose the type of calendar entry."];
  const title = plainText(raw.title, TITLE_MAX);
  if (title === undefined) errors.title = [`Use up to ${TITLE_MAX} plain-text characters.`];
  else if (!title) errors.title = ["Enter a short title, for example the occasion or exam name."];
  const start = civilDate(raw.startDate), end = civilDate(raw.endDate);
  const within = `Use a date from ${term.startDate} to ${term.endDate}.`;
  if (!start) errors.startDate = ["Enter the start date as a real date."];
  else if (start < term.startDate || start > term.endDate) errors.startDate = [`The start date is outside the term. ${within}`];
  if (!end) errors.endDate = ["Enter the end date as a real date. For one day, use the start date again."];
  else if (end < term.startDate || end > term.endDate) errors.endDate = [`The end date is outside the term. ${within}`];
  else if (start && end < start) errors.endDate = ["The end date must be on or after the start date."];
  let regularClasses: RegularClasses | null = null;
  if (kind && isExamKind(kind)) {
    if (raw.regularClasses === "continue" || raw.regularClasses === "suspended") regularClasses = raw.regularClasses;
    else errors.regularClasses = ["Choose whether regular classes continue during this exam period."];
  }
  const source = plainText(raw.source, SOURCE_MAX), url = sourceUrl(raw.sourceUrl);
  if (source === undefined) errors.source = [`Use up to ${SOURCE_MAX} plain-text characters.`];
  else if (!source) errors.source = ["Enter the approved notice or document for this entry."];
  if (url === undefined) errors.sourceUrl = ["Enter a public link starting with http:// or https://, or leave it blank."];
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, entry: { kind: kind!, title: title!, startDate: start!, endDate: end!, regularClasses, source: source!, sourceUrl: url ?? null } };
}

export const sameEntryIdentity = (a: Pick<CalendarEntry, "kind" | "title" | "startDate" | "endDate">, b: Pick<CalendarEntry, "kind" | "title" | "startDate" | "endDate">) =>
  a.kind === b.kind && a.startDate === b.startDate && a.endDate === b.endDate && titleKey(a.title) === titleKey(b.title);

const KIND_ORDER: Record<string, number> = Object.fromEntries(ENTRY_KINDS.map((kind, index) => [kind, index]));
/** Date order with a stable tie-breaker: start, end, type, title, id. */
export function sortEntries<T extends CalendarEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)
    || (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) || titleKey(a.title).localeCompare(titleKey(b.title)) || a.id - b.id);
}

/** Does this entry close regular teaching across the term's audience? */
export const closesRegularClasses = (entry: Pick<CalendarEntry, "kind" | "regularClasses">) =>
  entry.kind === "public_holiday" || entry.kind === "university_holiday" || entry.kind === "class_suspension" || isExamKind(entry.kind) && entry.regularClasses === "suspended";

export type LookupStatus = "outside_term" | "suspended" | "no_teaching_dates" | "outside_teaching" | "teaching";
export const LOOKUP_LABELS: Record<LookupStatus, string> = {
  outside_term: "Outside term dates", suspended: "Regular classes suspended", no_teaching_dates: "Teaching dates have not been recorded",
  outside_teaching: "Outside regular teaching dates", teaching: "Within regular teaching dates",
};
export interface Lookup<T extends CalendarEntry = CalendarEntry> { date: string; status: LookupStatus; label: string; entries: T[]; closures: T[] }

/** The spec's ordered rules. The calendar never asserts weekends, meetings or individual exams. */
export function lookupDate<T extends CalendarEntry>(date: string, term: CalendarTerm, teaching: Pick<TeachingRange, "start" | "end"> | null, entries: readonly T[]): Lookup<T> {
  const matching = sortEntries(entries.filter(entry => entry.startDate <= date && date <= entry.endDate));
  const closures = matching.filter(closesRegularClasses);
  const status: LookupStatus = date < term.startDate || date > term.endDate ? "outside_term"
    : closures.length ? "suspended"
    : !teaching ? "no_teaching_dates"
    : date < teaching.start || date > teaching.end ? "outside_teaching"
    : "teaching";
  return { date, status, label: LOOKUP_LABELS[status], entries: status === "outside_term" ? [] : matching, closures: status === "suspended" ? closures : [] };
}

/** Today's civil date in Asia/Dhaka (no time of day). */
export function dhakaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const split = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d }; };
/** "9 January 2027". */
export function longDate(iso: string): string {
  const { y, m, d } = split(iso);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}
/** "10 March 2027", "8–13 March 2027", "28 February – 3 March 2027", "30 December 2026 – 2 January 2027". */
export function dateRange(start: string, end: string): string {
  if (start === end) return longDate(start);
  const a = split(start), b = split(end);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${longDate(start)} – ${longDate(end)}`;
}

/** Entries or teaching dates that a narrower term would strand. */
export function strandedByTermDates(startDate: string, endDate: string, teaching: Pick<TeachingRange, "start" | "end"> | null, entries: readonly Pick<CalendarEntry, "title" | "startDate" | "endDate">[]): string[] {
  const outside = (a: string, b: string) => a < startDate || b > endDate;
  return [
    ...(teaching && outside(teaching.start, teaching.end) ? [`Regular teaching dates ${dateRange(teaching.start, teaching.end)}`] : []),
    ...entries.filter(entry => outside(entry.startDate, entry.endDate)).map(entry => `${entry.title} (${dateRange(entry.startDate, entry.endDate)})`),
  ];
}

export const CALENDAR_ACTION_LABELS: Record<string, string> = {
  "term_calendar.teaching.set": "Teaching dates recorded", "term_calendar.teaching.update": "Teaching dates corrected", "term_calendar.teaching.clear": "Teaching dates cleared",
  "term_calendar.entry.create": "Calendar entry added", "term_calendar.entry.update": "Calendar entry corrected", "term_calendar.entry.remove": "Calendar entry removed",
};
export const CALENDAR_COMMANDS = ["teaching", "create", "update", "remove"] as const;
