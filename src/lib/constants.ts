/**
 * Institution configuration — values read from the corrected v2.0 spec.
 *
 * Items marked provisional are pending institutional decisions (spec §31)
 * and are displayed as such in the UI. Nothing here silently becomes policy:
 * breaks and permitted windows also exist as database rows so coordinators
 * can change them; these constants drive grid layout only.
 */

export const INSTITUTION = {
  universityName: "Pundra University of Science & Technology",
  departmentName: "Department of Computer Science & Engineering",
  programme: "B.Sc. in CSE",
  // Branding acronym pending confirmation — do not print "PUST" as official.
  acronymProvisional: "PUST (provisional)",
  timeZone: "Asia/Dhaka",
} as const;

export const TERM = {
  name: "Summer 2026",
  academicYear: 2026,
  startDate: "2026-07-19",
  endDate: "2026-11-30",
  effectiveFrom: "2026-08-14", // printed effective date from supplied routine
} as const;

export type Stream = "HSC" | "DIPLOMA";
export const STREAMS: Stream[] = ["HSC", "DIPLOMA"];

export interface SlotDef {
  start: number;
  end: number;
  breakAfter?: string;
}

/** HSC Saturday pattern — confirmed from the supplied routine. */
export const HSC_SATURDAY_SLOTS: SlotDef[] = [
  { start: 570, end: 645 }, // 09:30–10:45
  { start: 645, end: 720 }, // 10:45–12:00
  { start: 720, end: 795 }, // 12:00–13:15
  { start: 870, end: 945 }, // 14:30–15:45
];

/** HSC Sunday–Tuesday pattern shown in the supplied routine. */
export const HSC_WEEKDAY_SLOTS: SlotDef[] = [
  { start: 540, end: 600 }, // 09:00–10:00
  { start: 600, end: 660 }, // 10:00–11:00
  { start: 660, end: 720 }, // 11:00–12:00
  { start: 720, end: 795 }, // 12:00–13:15
];

/** Tuesday adds the approved replacement slot for HSC-25B's former Friday class. */
export const HSC_TUESDAY_SLOTS: SlotDef[] = [
  ...HSC_WEEKDAY_SLOTS,
  { start: 810, end: 885 }, // 13:30–14:45
];

/**
 * Diploma Friday pattern — corrected per spec: 12:00–13:00 is a CLASS column,
 * the prayer break is 13:00–14:00, then 14:00–15:00 and 15:00–16:00.
 */
export const DIPLOMA_FRIDAY_SLOTS: SlotDef[] = [
  { start: 540, end: 600 }, // 09:00–10:00
  { start: 600, end: 660 }, // 10:00–11:00
  { start: 660, end: 720 }, // 11:00–12:00
  { start: 720, end: 780 }, // 12:00–13:00  (class — NOT the prayer break)
  { start: 840, end: 900, breakAfter: undefined }, // 14:00–15:00
  { start: 900, end: 960 }, // 15:00–16:00
];

/** The corrected Diploma Friday Jumu'ah break. */
export const DIPLOMA_FRIDAY_BREAK = { start: 780, end: 840, name: "Prayer Break (Jumu'ah)" };

/**
 * Diploma Saturday visible populated slots (afternoon). Morning headers are
 * provisional pending source review — the window 09:00–17:00 is permitted
 * but no morning classes were visible in the supplied routine.
 */
export const DIPLOMA_SATURDAY_SLOTS: SlotDef[] = [
  { start: 720, end: 780 },
  { start: 780, end: 840 },
  { start: 840, end: 900 },
  { start: 900, end: 960 },
];

/** Institution lunch break (both streams, every day). */
export const LUNCH_BREAK = { start: 795, end: 870, name: "Lunch Break" };

/** HSC regular teaching days: Saturday–Tuesday (Friday requires exception). */
export const HSC_REGULAR_DAYS = [0, 1, 2, 3];
/** Diploma teaching days: Friday and Saturday. */
export const DIPLOMA_DAYS = [6, 0];

/** Advisory threshold for workload units (configurable; no universal 18 max). */
export const WORKLOAD_ADVISORY_UNITS = 15;

/** Grid day sets shown per stream. */
export function daysForStream(stream: Stream): number[] {
  return stream === "HSC" ? HSC_REGULAR_DAYS : DIPLOMA_DAYS;
}

export function slotsFor(stream: Stream, day: number): SlotDef[] {
  if (stream === "HSC") {
    if (day === 0) return HSC_SATURDAY_SLOTS;
    return day === 3 ? HSC_TUESDAY_SLOTS : HSC_WEEKDAY_SLOTS;
  }
  return day === 6 ? DIPLOMA_FRIDAY_SLOTS : DIPLOMA_SATURDAY_SLOTS;
}
