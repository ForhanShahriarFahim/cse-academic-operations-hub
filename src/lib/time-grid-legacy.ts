/**
 * The period layout that was hard-coded before RUT-04 (Summer 2026). It is used
 * only to backfill terms created before term grids existed and to draw
 * publications whose snapshot predates stored grids, so both look exactly as
 * they did.
 */
import type { DayPlan, GridBreak, GridPeriod, PeriodPattern, Stream, TimeGrid } from "./time-grid";

const HSC_SATURDAY: GridPeriod[] = [
  { start: 570, end: 645 }, // 09:30–10:45
  { start: 645, end: 720 }, // 10:45–12:00
  { start: 720, end: 795 }, // 12:00–13:15
  { start: 870, end: 945 }, // 14:30–15:45
];
const HSC_SUNDAY_MONDAY: GridPeriod[] = [
  { start: 540, end: 600 },
  { start: 600, end: 660 },
  { start: 660, end: 720 },
  { start: 720, end: 795 },
];
/** Tuesday adds the approved replacement slot for HSC-25B's former Friday class. */
const HSC_TUESDAY: GridPeriod[] = [...HSC_SUNDAY_MONDAY, { start: 810, end: 885 }];
/** 12:00–13:00 is a class; the Jumu'ah break (a break rule) is 13:00–14:00. */
const DIPLOMA_FRIDAY: GridPeriod[] = [
  { start: 540, end: 600 },
  { start: 600, end: 660 },
  { start: 660, end: 720 },
  { start: 720, end: 780 },
  { start: 840, end: 900 },
  { start: 900, end: 960 },
];
const DIPLOMA_SATURDAY: GridPeriod[] = [
  { start: 720, end: 780 },
  { start: 780, end: 840 },
  { start: 840, end: 900 },
  { start: 900, end: 960 },
];

/** Stream days and their layouts, in the order the old day tabs used. */
export const LEGACY_LAYOUT: Array<{ stream: Stream; dayOfWeek: number; layout: string; periods: GridPeriod[] }> = [
  { stream: "HSC", dayOfWeek: 0, layout: "HSC Saturday", periods: HSC_SATURDAY },
  { stream: "HSC", dayOfWeek: 1, layout: "HSC Sunday–Monday", periods: HSC_SUNDAY_MONDAY },
  { stream: "HSC", dayOfWeek: 2, layout: "HSC Sunday–Monday", periods: HSC_SUNDAY_MONDAY },
  { stream: "HSC", dayOfWeek: 3, layout: "HSC Tuesday", periods: HSC_TUESDAY },
  { stream: "DIPLOMA", dayOfWeek: 6, layout: "Diploma Friday", periods: DIPLOMA_FRIDAY },
  { stream: "DIPLOMA", dayOfWeek: 0, layout: "Diploma Saturday", periods: DIPLOMA_SATURDAY },
];

const DAY_WORD = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export interface LegacyBreakRule {
  name: string;
  scope: string;
  stream: string | null;
  dayOfWeek: number | null;
  startMinutes: number;
  endMinutes: number;
}

function breaksFor(rules: LegacyBreakRule[], stream: Stream, day: number): GridBreak[] {
  return rules
    .filter((rule) => (rule.dayOfWeek == null || rule.dayOfWeek === day)
      && (rule.scope === "institution" || rule.stream == null || rule.stream === stream))
    .map((rule) => ({ name: rule.name, start: rule.startMinutes, end: rule.endMinutes, blocksClasses: true }))
    .sort((a, b) => a.start - b.start);
}

/**
 * The legacy grid with the given break rules folded into the patterns (as
 * breaks that block classes, which is how break rules were validated). Days
 * that shared a layout but have different breaks get separate patterns.
 * Ids are negative so they never collide with stored rows.
 */
export function legacyTimeGrid(rules: LegacyBreakRule[]): TimeGrid {
  const patterns: PeriodPattern[] = [];
  const dayPlans: DayPlan[] = [];
  const byKey = new Map<string, PeriodPattern>();
  const layoutUse = new Map<string, number>();
  for (const entry of LEGACY_LAYOUT) {
    const breaks = breaksFor(rules, entry.stream, entry.dayOfWeek);
    const key = `${entry.layout}|${JSON.stringify(breaks)}`;
    let pattern = byKey.get(key);
    if (!pattern) {
      pattern = { id: -(patterns.length + 1), name: entry.layout, periods: entry.periods, breaks, updatedAt: null };
      patterns.push(pattern);
      byKey.set(key, pattern);
      layoutUse.set(entry.layout, (layoutUse.get(entry.layout) ?? 0) + 1);
    }
    dayPlans.push({
      id: -(dayPlans.length + 1), stream: entry.stream, batchId: null, dayOfWeek: entry.dayOfWeek,
      patternId: pattern.id, reason: null, updatedAt: null,
    });
  }
  // A layout split by differing breaks is named after its day so names stay unique.
  for (const pattern of patterns) {
    if ((layoutUse.get(pattern.name) ?? 0) > 1) {
      const days = dayPlans.filter((plan) => plan.patternId === pattern.id).map((plan) => DAY_WORD[plan.dayOfWeek]);
      pattern.name = `${pattern.name.split(" ")[0]} ${days.join("–")}`;
    }
  }
  return { patterns, dayPlans };
}
