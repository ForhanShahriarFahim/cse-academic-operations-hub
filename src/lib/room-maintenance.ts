/** ROM-01C: finite Dhaka civil dates and typed recurrence evidence. No DB/host-zone dependency. */
import { validInterval, validWeekday } from "./room-lifecycle";

const DAY = 86_400_000;
export function civilDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / DAY : null;
}
export const civilDate = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const academicWeekday = (day: number) => ((day + 5) % 7 + 7) % 7;
export function firstWeekday(start: number, end: number, weekdays: number[]): number | null {
  if (start > end || !weekdays.length) return null;
  const first = Math.min(...weekdays.map((d) => start + (d - academicWeekday(start) + 7) % 7));
  return first <= end ? first : null;
}
export interface MaintenanceValues {
  startDate: string; endDate: string; weekdays: number[]; startMinutes: number; endMinutes: number; reason: string;
}
export interface MaintenanceEntry extends MaintenanceValues { id: number; roomId: number; revision: number; cancelled: boolean }
export interface DateBounds { termStart: string | null; termEnd: string | null; effectiveFrom?: string | null; effectiveTo?: string | null }
export interface MaintenanceContext extends DateBounds {
  entries: MaintenanceEntry[];
  meetingDates: Record<number, { effectiveFrom: string | null; effectiveTo: string | null }>;
}
export type DatedOverlap = { kind: "clear" } | { kind: "unverified"; reason: string } | { kind: "overlap"; firstDate: string; lastDate: string; occurrences: number };
export function normalizedMaintenance(raw: Record<string, unknown>): { values?: MaintenanceValues; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const start = civilDay(raw.startDate), end = civilDay(raw.endDate);
  if (start == null) errors.startDate = ["Enter a real ISO date, year 0001–9999."];
  if (end == null || (start != null && end < start)) errors.endDate = ["Enter a finite end date on or after the start date."];
  const weekdays = Array.isArray(raw.weekdays) && raw.weekdays.every((d) => typeof d === "string" && /^[0-6]$/.test(d)) ? raw.weekdays.map(Number).sort() : [];
  if (!weekdays.length || new Set(weekdays).size !== weekdays.length || (start != null && end != null && firstWeekday(start, end, weekdays) == null)) errors.weekdays = ["Choose unique weekdays including at least one actual date in this range."];
  const startMinutes = typeof raw.startMinutes === "string" && /^\d+$/.test(raw.startMinutes) ? Number(raw.startMinutes) : NaN;
  const endMinutes = typeof raw.endMinutes === "string" && /^\d+$/.test(raw.endMinutes) ? Number(raw.endMinutes) : NaN;
  if (!validInterval(startMinutes, endMinutes)) errors.startMinutes = ["Use whole minutes 0 ≤ start < end ≤ 1440. Split overnight work into two records."];
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!reason || reason.length > 300) errors.reason = ["Enter an operational reason of 1–300 characters."];
  return Object.keys(errors).length ? { errors } : { values: { startDate: raw.startDate as string, endDate: raw.endDate as string, weekdays, startMinutes, endMinutes, reason }, errors };
}
export function dateBounds(bounds: DateBounds): { start: number; end: number } | null {
  const termStart = civilDay(bounds.termStart), termEnd = civilDay(bounds.termEnd);
  const from = bounds.effectiveFrom == null ? termStart : civilDay(bounds.effectiveFrom);
  const to = bounds.effectiveTo == null ? termEnd : civilDay(bounds.effectiveTo);
  if (termStart == null || termEnd == null || from == null || to == null || termStart > termEnd || (bounds.effectiveFrom != null && bounds.effectiveTo != null && from > to)) return null;
  return { start: Math.max(termStart, from), end: Math.min(termEnd, to) };
}
/** Unknown weekday/timing is conservative only after the known bounds exclude unrelated dates. */
export function maintenanceOverlap(entry: MaintenanceEntry | MaintenanceValues, use: DateBounds & { dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null }): DatedOverlap {
  if ("cancelled" in entry && entry.cancelled) return { kind: "clear" };
  const a = civilDay(entry.startDate), b = civilDay(entry.endDate), range = dateBounds(use);
  if (a == null || b == null || a > b || !entry.weekdays.length || entry.weekdays.some((d) => !validWeekday(d)) || !validInterval(entry.startMinutes, entry.endMinutes)) return { kind: "unverified", reason: "Invalid stored maintenance dates/weekday/time; clearance cannot be verified." };
  if (validInterval(use.startMinutes, use.endMinutes) && (use.endMinutes! <= entry.startMinutes || use.startMinutes! >= entry.endMinutes)) return { kind: "clear" };
  if (validWeekday(use.dayOfWeek) && !entry.weekdays.includes(use.dayOfWeek)) return { kind: "clear" };
  if (!range) return { kind: "unverified", reason: "Invalid or missing term/effective date bounds; clearance cannot be verified." };
  const start = Math.max(a, range.start), end = Math.min(b, range.end);
  const days = validWeekday(use.dayOfWeek) ? [use.dayOfWeek] : entry.weekdays;
  const first = firstWeekday(start, end, days);
  if (first == null) return { kind: "clear" };
  if (!validWeekday(use.dayOfWeek) || !validInterval(use.startMinutes, use.endMinutes)) return { kind: "unverified", reason: "Room-associated use has unknown weekday/time or kind; occupancy cannot be verified." };
  const occurrences = Math.floor((end - first) / 7) + 1;
  return { kind: "overlap", firstDate: civilDate(first), lastDate: civilDate(first + (occurrences - 1) * 7), occurrences };
}
export function maintenanceOnDate(entry: MaintenanceEntry, date: string) {
  const day = civilDay(date), start = civilDay(entry.startDate), end = civilDay(entry.endDate);
  return !entry.cancelled && day != null && start != null && end != null && day >= start && day <= end && entry.weekdays.includes(academicWeekday(day));
}
export const physicalOD = (kind: string) => kind === "room_reservation" || kind === "combined";
export function overlappingMaintenance(a: MaintenanceValues, b: MaintenanceEntry) {
  if (b.cancelled || a.endMinutes <= b.startMinutes || b.endMinutes <= a.startMinutes) return false;
  const start = Math.max(civilDay(a.startDate)!, civilDay(b.startDate)!);
  const end = Math.min(civilDay(a.endDate)!, civilDay(b.endDate)!);
  return firstWeekday(start, end, a.weekdays.filter((d) => b.weekdays.includes(d))) != null;
}
