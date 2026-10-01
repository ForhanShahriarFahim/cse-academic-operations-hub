/**
 * Term time grids (RUT-04). A term owns period patterns (named lists of
 * periods and breaks) and day plans that say which pattern a stream, or one
 * batch, uses on each day. Pure module: shared by the server, the browser,
 * validation, projections and publication snapshots.
 *
 * Exact class minutes stay authoritative. Periods are the grid a routine is
 * drawn on and the times offered when placing a class; class hours (permitted
 * windows) remain the validation rule for where classes may sit.
 */
import { DAY_NAMES, fmtRange, overlaps } from "./time";

export type Stream = "HSC" | "DIPLOMA";
export const STREAMS: Stream[] = ["HSC", "DIPLOMA"];

export interface GridPeriod { start: number; end: number }
export interface GridBreak { name: string; start: number; end: number; blocksClasses: boolean }

export interface PeriodPattern {
  id: number;
  name: string;
  periods: GridPeriod[];
  breaks: GridBreak[];
  updatedAt: string | null;
}

/**
 * A stream plan has `batchId: null` and a pattern (a stream day without a plan
 * has no classes). A batch exception has a batch and either a pattern (extra
 * day or own periods) or `patternId: null` (no classes that day).
 */
export interface DayPlan {
  id: number;
  stream: Stream;
  batchId: number | null;
  dayOfWeek: number;
  patternId: number | null;
  reason: string | null;
  updatedAt: string | null;
}

export interface TimeGrid {
  patterns: PeriodPattern[];
  dayPlans: DayPlan[];
}

export const EMPTY_GRID: TimeGrid = { patterns: [], dayPlans: [] };

/** Earliest and latest times a period or break may use. */
export const GRID_DAY_START = 7 * 60;
export const GRID_DAY_END = 21 * 60;

export interface EffectivePlan {
  pattern: PeriodPattern | null;
  source: "batch" | "stream" | "none";
  plan: DayPlan | null;
}

export function patternById(grid: TimeGrid, id: number | null | undefined): PeriodPattern | null {
  return id == null ? null : grid.patterns.find((p) => p.id === id) ?? null;
}

export function streamPlan(grid: TimeGrid, stream: Stream, day: number): DayPlan | null {
  return grid.dayPlans.find((p) => p.batchId == null && p.stream === stream && p.dayOfWeek === day) ?? null;
}

export function batchException(grid: TimeGrid, batchId: number, day: number): DayPlan | null {
  return grid.dayPlans.find((p) => p.batchId === batchId && p.dayOfWeek === day) ?? null;
}

/** The plan that applies to a batch (or the whole stream when `batchId` is null) on a day. */
export function effectivePlan(grid: TimeGrid, stream: Stream, batchId: number | null, day: number): EffectivePlan {
  const exception = batchId == null ? null : batchException(grid, batchId, day);
  if (exception) return { pattern: patternById(grid, exception.patternId), source: "batch", plan: exception };
  const plan = streamPlan(grid, stream, day);
  if (plan) return { pattern: patternById(grid, plan.patternId), source: "stream", plan };
  return { pattern: null, source: "none", plan: null };
}

/** Days are ordered from the start of the stream's own week (the day after its longest gap). */
function weekOrder(anchorDays: number[]): number[] {
  const set = new Set(anchorDays);
  if (set.size === 0 || set.size === 7) return [0, 1, 2, 3, 4, 5, 6];
  let bestStart = 0;
  let bestGap = -1;
  for (let day = 0; day < 7; day++) {
    if (!set.has(day)) continue;
    let gap = 0;
    for (let back = 1; back < 7 && !set.has((day - back + 7) % 7); back++) gap++;
    if (gap > bestGap) { bestGap = gap; bestStart = day; }
  }
  return Array.from({ length: 7 }, (_, index) => (bestStart + index) % 7);
}

/**
 * Teaching days for a stream: days with a stream plan, plus days where one of
 * its batches has an extra-day exception. Ordered by the stream's own week, so
 * Diploma reads Friday then Saturday and an HSC extra Friday comes last.
 */
export function streamDays(grid: TimeGrid, stream: Stream): number[] {
  const streamOwn = grid.dayPlans.filter((p) => p.batchId == null && p.stream === stream && p.patternId != null).map((p) => p.dayOfWeek);
  const extra = grid.dayPlans.filter((p) => p.batchId != null && p.stream === stream && p.patternId != null).map((p) => p.dayOfWeek);
  const days = new Set([...streamOwn, ...extra]);
  return weekOrder(streamOwn.length ? streamOwn : [...days]).filter((day) => days.has(day));
}

/** Whether a stream day exists only through batch exceptions (for example HSC Friday for one batch). */
export function isExceptionOnlyDay(grid: TimeGrid, stream: Stream, day: number): boolean {
  const plan = streamPlan(grid, stream, day);
  return !(plan && plan.patternId != null) && streamDays(grid, stream).includes(day);
}

/** Teaching days for both streams, for day tabs. */
export function teachingDays(grid: TimeGrid): Record<Stream, { all: number[]; exceptionOnly: number[] }> {
  const of = (stream: Stream) => {
    const all = streamDays(grid, stream);
    return { all, exceptionOnly: all.filter((day) => isExceptionOnlyDay(grid, stream, day)) };
  };
  return { HSC: of("HSC"), DIPLOMA: of("DIPLOMA") };
}

export interface DayGroup<B> {
  pattern: PeriodPattern;
  batches: B[];
  /** True for the stream's own pattern that day. */
  isStreamDefault: boolean;
}

/**
 * Batches teaching on a day, grouped by the pattern they use. The stream's own
 * pattern comes first; other patterns follow in batch order. Batches without
 * classes that day are left out.
 */
export function dayGroups<B extends { id: number; stream: Stream }>(
  grid: TimeGrid, stream: Stream, day: number, batches: B[],
): DayGroup<B>[] {
  const defaultId = streamPlan(grid, stream, day)?.patternId ?? null;
  const groups = new Map<number, DayGroup<B>>();
  for (const batch of batches) {
    if (batch.stream !== stream) continue;
    const { pattern } = effectivePlan(grid, stream, batch.id, day);
    if (!pattern) continue;
    const group = groups.get(pattern.id) ?? { pattern, batches: [], isStreamDefault: pattern.id === defaultId };
    group.batches.push(batch);
    groups.set(pattern.id, group);
  }
  return [...groups.values()].sort((a, b) => Number(b.isStreamDefault) - Number(a.isStreamDefault));
}

/** Periods a class for these batches may be placed in on a day (the first batch with a plan decides). */
export function periodsFor(grid: TimeGrid, audiences: Array<{ batchId: number; stream: Stream }>, day: number): GridPeriod[] {
  for (const audience of audiences) {
    const { pattern } = effectivePlan(grid, audience.stream, audience.batchId, day);
    if (pattern) return pattern.periods;
  }
  return [];
}

/** Days any of these batches teach, in their stream's week order. */
export function daysFor(grid: TimeGrid, audiences: Array<{ batchId: number; stream: Stream }>): number[] {
  const stream = audiences[0]?.stream ?? "HSC";
  return streamDays(grid, stream).filter((day) =>
    audiences.some((a) => effectivePlan(grid, a.stream, a.batchId, day).pattern != null));
}

// ---------------------------------------------------------------------------
// Validation support
// ---------------------------------------------------------------------------

export interface ResolvedBreak {
  key: string;
  name: string;
  start: number;
  end: number;
  appliesTo: string;
}

/** Breaks marked "No classes allowed" that apply to one batch on one day. */
export function blockingBreaks(grid: TimeGrid, stream: Stream, batchId: number, batchLabel: string, day: number): ResolvedBreak[] {
  const { pattern, source } = effectivePlan(grid, stream, batchId, day);
  if (!pattern) return [];
  return pattern.breaks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.blocksClasses)
    .map(({ item, index }) => ({
      key: `p${pattern.id}b${index}`,
      name: item.name,
      start: item.start,
      end: item.end,
      appliesTo: source === "batch" ? `${stream}-${batchLabel}` : stream,
    }));
}

/** A batch with a "No classes" exception on a day. */
export function isClosedDay(grid: TimeGrid, batchId: number, day: number): DayPlan | null {
  const exception = batchException(grid, batchId, day);
  return exception && exception.patternId == null ? exception : null;
}

// ---------------------------------------------------------------------------
// Pattern validation
// ---------------------------------------------------------------------------

export interface PatternInput {
  name: string;
  periods: GridPeriod[];
  breaks: GridBreak[];
}

export interface PatternError { field: string; message: string }

const isMinute = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Field errors for a pattern; empty when it can be saved. Field names match the editor's inputs. */
export function validatePattern(input: PatternInput, otherNames: string[]): PatternError[] {
  const errors: PatternError[] = [];
  const name = input.name.trim();
  if (!name) errors.push({ field: "name", message: "Enter a name." });
  else if (name.length > 60) errors.push({ field: "name", message: "Use 60 characters or fewer." });
  else if (otherNames.some((other) => other.trim().toLowerCase() === name.toLowerCase())) {
    errors.push({ field: "name", message: "Another pattern in this term already has this name." });
  }
  if (input.periods.length === 0) errors.push({ field: "periods", message: "Add at least one period." });
  if (input.periods.length > 16) errors.push({ field: "periods", message: "Use 16 periods or fewer." });

  const items = [
    ...input.periods.map((p, index) => ({ ...p, field: `period-${index}`, label: `Period ${index + 1}` })),
    ...input.breaks.map((b, index) => ({ ...b, field: `break-${index}`, label: b.name?.trim() || `Break ${index + 1}` })),
  ];
  for (const item of items) {
    if (!isMinute(item.start) || !isMinute(item.end)) {
      errors.push({ field: item.field, message: `${item.label}: enter a start and an end time.` });
    } else if (item.end <= item.start) {
      errors.push({ field: item.field, message: `${item.label} must end after it starts.` });
    } else if (item.start < GRID_DAY_START || item.end > GRID_DAY_END) {
      errors.push({ field: item.field, message: `${item.label} must be between 7:00 AM and 9:00 PM.` });
    }
  }
  input.breaks.forEach((b, index) => {
    if (!b.name?.trim()) errors.push({ field: `break-${index}-name`, message: `Break ${index + 1}: enter a name.` });
  });
  const valid = items.filter((item) => isMinute(item.start) && isMinute(item.end) && item.end > item.start);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (overlaps(valid[i].start, valid[i].end, valid[j].start, valid[j].end)) {
        errors.push({ field: valid[j].field, message: `${valid[j].label} overlaps ${valid[i].label}.` });
      }
    }
  }
  return errors;
}

/** Periods and breaks sorted by start time, as stored. */
export function normalizePattern(input: PatternInput): PatternInput {
  return {
    name: input.name.trim(),
    periods: [...input.periods].sort((a, b) => a.start - b.start).map(({ start, end }) => ({ start, end })),
    breaks: [...input.breaks].sort((a, b) => a.start - b.start)
      .map(({ name, start, end, blocksClasses }) => ({ name: name.trim(), start, end, blocksClasses: !!blocksClasses })),
  };
}

/** "Fill evenly": `count` periods of `length` minutes from `first`, with an optional break after period `breakAfter`. */
export function fillEvenly(first: number, length: number, count: number, breakAfter: number | null, breakLength: number): PatternInput["periods"] {
  const periods: GridPeriod[] = [];
  let cursor = first;
  for (let index = 0; index < count; index++) {
    periods.push({ start: cursor, end: cursor + length });
    cursor += length;
    if (breakAfter != null && index + 1 === breakAfter) cursor += breakLength;
  }
  return periods;
}

/** Default class hours for a pattern: first period start to last period end. */
export function patternSpan(pattern: Pick<PeriodPattern, "periods">): { start: number; end: number } | null {
  if (pattern.periods.length === 0) return null;
  return {
    start: Math.min(...pattern.periods.map((p) => p.start)),
    end: Math.max(...pattern.periods.map((p) => p.end)),
  };
}

// ---------------------------------------------------------------------------
// Change impact
// ---------------------------------------------------------------------------

export interface ImpactMeeting {
  id: number;
  courseCode: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  audiences: Array<{ batchId: number; stream: Stream; batchLabel: string }>;
}

export interface WindowLike { batchId: number | null; stream: string; dayOfWeek: number; startMinutes: number; endMinutes: number }

export interface ProposedMove { meetingId: number; courseCode: string; dayOfWeek: number; startMinutes: number; endMinutes: number }

export interface GridImpact {
  /** Classes on affected days that started at a period before and no longer do. */
  misaligned: ImpactMeeting[];
  /** Classes that would sit outside class hours or on a no-classes day; `resolvedByMove` when the same-position move fixes it. */
  breaking: Array<{ meeting: ImpactMeeting; reason: string; resolvedByMove: boolean }>;
  /** Same-position moves for misaligned classes whose length matches a run of periods. */
  moves: ProposedMove[];
  /** Misaligned classes that cannot be moved automatically. */
  manual: ImpactMeeting[];
  /** Number of classes on the affected batch-days. */
  affected: number;
}

function startsAtPeriod(periods: GridPeriod[], m: { startMinutes: number; endMinutes: number }): number {
  return periods.findIndex((p) => p.start === m.startMinutes);
}

/** Index run [first, last] of periods exactly covering the class, or null. */
function periodRun(periods: GridPeriod[], m: { startMinutes: number; endMinutes: number }): [number, number] | null {
  const first = startsAtPeriod(periods, m);
  if (first < 0) return null;
  const last = periods.findIndex((p, index) => index >= first && p.end === m.endMinutes);
  return last >= first ? [first, last] : null;
}

function allowedByWindows(windows: WindowLike[], stream: string, batchId: number, day: number, start: number, end: number): boolean {
  const specific = windows.filter((w) => w.batchId === batchId && w.dayOfWeek === day);
  const applicable = specific.length ? specific : windows.filter((w) => w.batchId == null && w.stream === stream && w.dayOfWeek === day);
  return applicable.some((w) => start >= w.startMinutes && end <= w.endMinutes);
}

/**
 * What changes for existing classes when the grid (and class hours) change
 * from `before` to `after`. Nothing is moved here; `moves` is the opt-in
 * same-position plan (period 1 to period 1, a two-period class to the same two
 * periods) offered when the old and new patterns have the same number of periods.
 */
export function analyzeGridChange(input: {
  meetings: ImpactMeeting[];
  before: TimeGrid;
  after: TimeGrid;
  windowsBefore: WindowLike[];
  windowsAfter: WindowLike[];
}): GridImpact {
  const misaligned: ImpactMeeting[] = [];
  const breaking: GridImpact["breaking"] = [];
  const moves: ProposedMove[] = [];
  const manual: ImpactMeeting[] = [];
  let affected = 0;

  for (const m of input.meetings) {
    let touched = false;
    let aligned = true;
    let move: ProposedMove | null = null;
    let reason: string | null = null;
    for (const audience of m.audiences) {
      const was = effectivePlan(input.before, audience.stream, audience.batchId, m.dayOfWeek);
      const now = effectivePlan(input.after, audience.stream, audience.batchId, m.dayOfWeek);
      const samePattern = JSON.stringify(was.pattern?.periods ?? null) === JSON.stringify(now.pattern?.periods ?? null)
        && (was.pattern?.id ?? null) === (now.pattern?.id ?? null);
      const wasAllowed = allowedByWindows(input.windowsBefore, audience.stream, audience.batchId, m.dayOfWeek, m.startMinutes, m.endMinutes);
      const nowAllowed = allowedByWindows(input.windowsAfter, audience.stream, audience.batchId, m.dayOfWeek, m.startMinutes, m.endMinutes);
      if (samePattern && wasAllowed === nowAllowed && (was.pattern != null) === (now.pattern != null)) continue;
      touched = true;
      const run = was.pattern ? periodRun(was.pattern.periods, m) : null;
      if (run && now.pattern && startsAtPeriod(now.pattern.periods, m) < 0) {
        aligned = false;
        const target = now.pattern.periods;
        if (was.pattern!.periods.length === target.length && target[run[1]]) {
          move = { meetingId: m.id, courseCode: m.courseCode, dayOfWeek: m.dayOfWeek, startMinutes: target[run[0]].start, endMinutes: target[run[1]].end };
        }
      }
      if (!now.pattern && was.pattern) reason = reason ?? `${audience.stream}-${audience.batchLabel} has no classes on ${DAY_NAMES[m.dayOfWeek]}`;
      else if (wasAllowed && !nowAllowed) reason = reason ?? `outside ${audience.stream}-${audience.batchLabel} class hours on ${DAY_NAMES[m.dayOfWeek]}`;
    }
    if (!touched) continue;
    affected++;
    if (!aligned) {
      misaligned.push(m);
      if (move) moves.push(move);
      else manual.push(m);
    }
    if (reason) {
      const resolvedByMove = !aligned && move != null && m.audiences.every((a) =>
        effectivePlan(input.after, a.stream, a.batchId, m.dayOfWeek).pattern != null
        && allowedByWindows(input.windowsAfter, a.stream, a.batchId, m.dayOfWeek, move!.startMinutes, move!.endMinutes));
      breaking.push({ meeting: m, reason: `${m.courseCode} (${fmtRange(m.startMinutes, m.endMinutes)}): ${reason}.`, resolvedByMove });
    }
  }
  return { misaligned, breaking, moves, manual, affected };
}

/** A copy of a grid with fresh negative ids, for comparing a proposed change. */
export function withPattern(grid: TimeGrid, pattern: PeriodPattern): TimeGrid {
  const exists = grid.patterns.some((p) => p.id === pattern.id);
  return {
    patterns: exists ? grid.patterns.map((p) => (p.id === pattern.id ? pattern : p)) : [...grid.patterns, pattern],
    dayPlans: grid.dayPlans,
  };
}

/** Replace (or remove, with `patternId === undefined`) the plan for one stream/batch/day. */
export function withDayPlan(grid: TimeGrid, key: { stream: Stream; batchId: number | null; dayOfWeek: number }, plan: DayPlan | null): TimeGrid {
  const rest = grid.dayPlans.filter((p) => !(p.stream === key.stream && p.batchId === key.batchId && p.dayOfWeek === key.dayOfWeek));
  return { patterns: grid.patterns, dayPlans: plan ? [...rest, plan] : rest };
}

/** Label for an exception as shown to coordinators. */
export function exceptionKind(grid: TimeGrid, plan: DayPlan): "extra_day" | "own_periods" | "no_classes" {
  if (plan.patternId == null) return "no_classes";
  const streamOwn = streamPlan(grid, plan.stream, plan.dayOfWeek);
  return streamOwn && streamOwn.patternId != null ? "own_periods" : "extra_day";
}

/** Serializable check used when reading JSON from the database or a snapshot. */
export function isTimeGrid(value: unknown): value is TimeGrid {
  if (!value || typeof value !== "object") return false;
  const grid = value as Record<string, unknown>;
  return Array.isArray(grid.patterns) && Array.isArray(grid.dayPlans)
    && grid.patterns.every((p) => p && typeof p === "object" && Array.isArray((p as PeriodPattern).periods) && Array.isArray((p as PeriodPattern).breaks))
    && grid.dayPlans.every((p) => p && typeof p === "object" && typeof (p as DayPlan).dayOfWeek === "number");
}
