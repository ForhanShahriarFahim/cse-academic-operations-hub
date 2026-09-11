/**
 * Time helpers. All operational times are stored as integer minutes since
 * midnight and rendered in Asia/Dhaka. Intervals are half-open: [start, end).
 */

export const DAY_NAMES = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export const DAY_SHORT = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/** Convert minutes since midnight to "h:mm AM/PM". */
export function fmtTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "9:30 – 10:45 AM" compact pair. */
export function fmtRange(start: number, end: number): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/** Compact header style: "09:30–10:45" in 24h. */
export function fmtRange24(start: number, end: number): string {
  const p = (v: number) =>
    `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
  return `${p(start)}–${p(end)}`;
}

/** Half-open interval overlap: [aStart,aEnd) vs [bStart,bEnd). */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function overlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  if (!overlaps(aStart, aEnd, bStart, bEnd)) return 0;
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/** Parse "13:15" or "1:15 PM" into minutes. Returns null if invalid. */
export function parseTimeToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59 || h > 24) return null;
  if (m[3] === "pm" && h !== 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (!m[3] && h < 7) h += 12; // routine convention: 1:00–6:59 means PM
  return h * 60 + min;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an ISO date (YYYY-MM-DD) as "14 Aug 2026" (locale-independent). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, mo, d] = iso.split("-").map((v) => parseInt(v, 10));
  if (!y || !mo || !d) return iso;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

/** JS getDay() (0=Sun … 6=Sat) → our academic day index (0=Sat … 6=Fri). */
export function jsDayToAcademic(jsDay: number): number {
  return (jsDay + 1) % 7;
}
