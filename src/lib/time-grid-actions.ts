"use server";

/**
 * Days & periods server actions (RUT-04). Each change is guarded (routine or
 * policy editors, decision D-1), limited to the active term, checked against
 * the version the editor saw, validated, and written with its class hours,
 * any opted-in class moves and an audit record in one transaction.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { academicTerms, batches, dayPlans, meetings, periodPatterns, permittedWindows } from "@/db/schema";
import { auditedChange } from "./auth/audit";
import { guardAnyAction } from "./auth/action-guard";
import { invalid, stale, succeeded, type ActionResult } from "./action-result";
import { getActiveTerm, getPortalData, timeGridFromRows } from "./data";
import {
  GRID_DAY_END, GRID_DAY_START, analyzeGridChange, normalizePattern, patternSpan, validatePattern, withDayPlan, withPattern,
  type DayPlan, type GridBreak, type GridImpact, type GridPeriod, type ImpactMeeting, type Stream, type TimeGrid, type WindowLike,
} from "./time-grid";
import { DAY_NAMES } from "./time";

const EDITORS = ["manage_routine", "manage_policy"] as const;
const CHANGED = "Someone else changed these periods since you opened them. Reload the page to see the latest version.";
const OTHER_TERM = "This belongs to a term that is not active, so it cannot be changed here. Reload the page.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function refresh() {
  revalidatePath("/", "layout");
}

async function termGrid(termId: number, tx: Tx | typeof db = db): Promise<TimeGrid> {
  const [patternRows, planRows] = await Promise.all([
    tx.select().from(periodPatterns).where(eq(periodPatterns.termId, termId)),
    tx.select().from(dayPlans).where(eq(dayPlans.termId, termId)),
  ]);
  return timeGridFromRows(patternRows, planRows);
}

async function termWindows(termId: number, tx: Tx | typeof db = db): Promise<WindowLike[]> {
  const rows = await tx.select().from(permittedWindows);
  return rows.filter((w) => w.termId == null || w.termId === termId)
    .map((w) => ({ batchId: w.batchId, stream: w.stream, dayOfWeek: w.dayOfWeek, startMinutes: w.startMinutes, endMinutes: w.endMinutes }));
}

async function impactMeetings(): Promise<ImpactMeeting[]> {
  const data = await getPortalData();
  return data.meetings.map((m) => ({
    id: m.id, courseCode: m.courseCode, dayOfWeek: m.dayOfWeek, startMinutes: m.startMinutes, endMinutes: m.endMinutes,
    audiences: m.audiences.map((a) => ({ batchId: a.batchId, stream: a.stream, batchLabel: a.batchLabel })),
  }));
}

const isMinute = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const validHours = (hours: { start: number; end: number } | null) =>
  hours != null && isMinute(hours.start) && isMinute(hours.end) && hours.end > hours.start && hours.start >= GRID_DAY_START && hours.end <= GRID_DAY_END;

/** Replace this term's class hours for one stream/batch/day key; rows shared with every term are left alone. */
async function setHours(tx: Tx, termId: number, key: { stream: Stream; batchId: number | null; dayOfWeek: number }, hours: { start: number; end: number } | null) {
  await tx.delete(permittedWindows).where(and(
    eq(permittedWindows.termId, termId), eq(permittedWindows.stream, key.stream), eq(permittedWindows.dayOfWeek, key.dayOfWeek),
    key.batchId == null ? isNull(permittedWindows.batchId) : eq(permittedWindows.batchId, key.batchId),
  ));
  if (hours) {
    await tx.insert(permittedWindows).values({
      termId, stream: key.stream, batchId: key.batchId, dayOfWeek: key.dayOfWeek, startMinutes: hours.start, endMinutes: hours.end,
    });
  }
}

function windowsAfter(before: WindowLike[], key: { stream: Stream; batchId: number | null; dayOfWeek: number }, hours: { start: number; end: number } | null): WindowLike[] {
  const rest = before.filter((w) => !(w.stream === key.stream && w.batchId === key.batchId && w.dayOfWeek === key.dayOfWeek));
  return hours ? [...rest, { ...key, startMinutes: hours.start, endMinutes: hours.end }] : rest;
}

async function applyMoves(tx: Tx, impact: GridImpact): Promise<number> {
  for (const move of impact.moves) {
    await tx.update(meetings).set({ startMinutes: move.startMinutes, endMinutes: move.endMinutes }).where(eq(meetings.id, move.meetingId));
  }
  return impact.moves.length;
}

function impactMessage(impact: GridImpact, moved: number): string {
  const parts: string[] = [];
  if (moved) parts.push(`${moved} class${moved === 1 ? "" : "es"} moved to the new periods; check the Routine builder for any clashes the moves created.`);
  const left = impact.misaligned.length - moved;
  if (left > 0) parts.push(`${left} class${left === 1 ? " keeps its" : "es keep their"} exact times and no longer start at a period.`);
  if (impact.breaking.length) parts.push(`${impact.breaking.length} now need${impact.breaking.length === 1 ? "s" : ""} attention in the Routine builder.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export interface SavePatternInput {
  patternId: number | null;
  expectedUpdatedAt: string | null;
  name: string;
  periods: GridPeriod[];
  breaks: GridBreak[];
  /** Set every day using this pattern to the new first-to-last period span. */
  updateHours: boolean;
  /** Move classes to the period in the same position (period 1 to period 1). */
  moveClasses: boolean;
}

export async function savePatternAction(input: SavePatternInput): Promise<ActionResult> {
  const denied = await guardAnyAction([...EDITORS]);
  if (denied) return denied;
  const term = await getActiveTerm();
  const pattern = normalizePattern({ name: String(input.name ?? ""), periods: input.periods ?? [], breaks: input.breaks ?? [] });
  const others = await db.select().from(periodPatterns).where(eq(periodPatterns.termId, term.id));
  const existing = input.patternId == null ? null : others.find((p) => p.id === input.patternId) ?? null;
  if (input.patternId != null && !existing) {
    const [elsewhere] = await db.select({ id: periodPatterns.id }).from(periodPatterns).where(eq(periodPatterns.id, input.patternId)).limit(1);
    return elsewhere ? stale(OTHER_TERM, "not_active_term") : stale("These periods no longer exist. Reload the page.", "missing");
  }
  if (existing && existing.updatedAt.toISOString() !== input.expectedUpdatedAt) return stale(CHANGED, "changed");
  const errors = validatePattern(pattern, others.filter((p) => p.id !== existing?.id).map((p) => p.name));
  if (errors.length) {
    const fieldErrors: Record<string, string[]> = {};
    for (const error of errors) (fieldErrors[error.field] ??= []).push(error.message);
    return invalid("Check the highlighted periods.", fieldErrors);
  }

  const meetingsNow = existing ? await impactMeetings() : [];
  const result = await auditedChange("time_grid.pattern.save", "period_pattern", async (tx) => {
    const before = await termGrid(term.id, tx);
    const windowsBefore = await termWindows(term.id, tx);
    const now = new Date();
    let id = existing?.id ?? null;
    if (id == null) {
      const [row] = await tx.insert(periodPatterns).values({ termId: term.id, ...pattern, createdAt: now, updatedAt: now }).returning();
      id = row.id;
    } else {
      await tx.update(periodPatterns).set({ ...pattern, updatedAt: now }).where(eq(periodPatterns.id, id));
    }
    const after = withPattern(before, { id, ...pattern, updatedAt: now.toISOString() });
    const span = patternSpan(pattern);
    let windows = windowsBefore;
    const users = after.dayPlans.filter((plan) => plan.patternId === id);
    if (existing && input.updateHours && span) {
      for (const plan of users) {
        const key = { stream: plan.stream, batchId: plan.batchId, dayOfWeek: plan.dayOfWeek };
        await setHours(tx, term.id, key, span);
        windows = windowsAfter(windows, key, span);
      }
    }
    const impact = existing
      ? analyzeGridChange({ meetings: meetingsNow, before, after, windowsBefore, windowsAfter: windows })
      : { misaligned: [], breaking: [], moves: [], manual: [], affected: 0 };
    const moved = existing && input.moveClasses ? await applyMoves(tx, impact) : 0;
    return {
      result: { id, impact, moved },
      entityId: id,
      before: existing ? { name: existing.name, periods: existing.periods, breaks: existing.breaks } : null,
      after: pattern,
      detail: { termId: term.id, hoursUpdated: existing && input.updateHours ? users.length : 0, moved: impact.moves.slice(0, moved) },
    };
  });
  refresh();
  const note = impactMessage(result.impact, result.moved);
  return succeeded(`${existing ? "Periods saved" : "Pattern created"}: ${pattern.name}.${note ? ` ${note}` : ""}`, { entityId: result.id });
}

export async function deletePatternAction(patternId: number, expectedUpdatedAt: string | null): Promise<ActionResult> {
  const denied = await guardAnyAction([...EDITORS]);
  if (denied) return denied;
  if (!Number.isInteger(patternId) || patternId <= 0) return invalid("Choose a pattern.");
  const term = await getActiveTerm();
  const [row] = await db.select().from(periodPatterns).where(eq(periodPatterns.id, patternId)).limit(1);
  if (!row) return stale("This pattern no longer exists. Reload the page.", "missing");
  if (row.termId !== term.id) return stale(OTHER_TERM, "not_active_term");
  if (row.updatedAt.toISOString() !== expectedUpdatedAt) return stale(CHANGED, "changed");
  const users = await db.select().from(dayPlans).where(eq(dayPlans.patternId, patternId));
  if (users.length) {
    const days = [...new Set(users.map((u) => DAY_NAMES[u.dayOfWeek]))].join(", ");
    return invalid(`${row.name} is still used on ${days}. Choose other periods for those days first.`);
  }
  await auditedChange("time_grid.pattern.delete", "period_pattern", async (tx) => {
    await tx.delete(periodPatterns).where(eq(periodPatterns.id, patternId));
    return { result: null, entityId: patternId, before: { name: row.name, periods: row.periods, breaks: row.breaks } };
  });
  refresh();
  return succeeded(`${row.name} deleted.`);
}

// ---------------------------------------------------------------------------
// Day plans and batch exceptions
// ---------------------------------------------------------------------------

export interface SetDayPlanInput {
  stream: Stream;
  /** null for the stream's own week; a batch id for an exception. */
  batchId: number | null;
  dayOfWeek: number;
  /** A pattern, or null for "No classes". */
  patternId: number | null;
  /** Class hours; required with a pattern. */
  hours: { start: number; end: number } | null;
  reason: string;
  /** The plan's updatedAt when the editor opened it, or null for a new plan. */
  expectedUpdatedAt: string | null;
  moveClasses: boolean;
}

export async function setDayPlanAction(input: SetDayPlanInput): Promise<ActionResult> {
  const denied = await guardAnyAction([...EDITORS]);
  if (denied) return denied;
  const term = await getActiveTerm();
  const fieldErrors: Record<string, string[]> = {};
  const stream: Stream = input.stream === "DIPLOMA" ? "DIPLOMA" : "HSC";
  const day = input.dayOfWeek;
  const reason = String(input.reason ?? "").trim();
  if (input.stream !== "HSC" && input.stream !== "DIPLOMA") fieldErrors.stream = ["Choose HSC or Diploma."];
  if (!Number.isInteger(day) || day < 0 || day > 6) fieldErrors.dayOfWeek = ["Choose a day."];
  if (input.batchId != null) {
    const [batch] = await db.select().from(batches).where(eq(batches.id, input.batchId)).limit(1);
    if (!batch || batch.stream !== stream) fieldErrors.batchId = ["Choose a batch in this stream."];
    if (!reason) fieldErrors.reason = ["Give a reason, so others know why this batch differs."];
    if (reason.length > 300) fieldErrors.reason = ["Use 300 characters or fewer."];
  }
  if (input.patternId != null) {
    const [pattern] = await db.select().from(periodPatterns).where(eq(periodPatterns.id, input.patternId)).limit(1);
    if (!pattern || pattern.termId !== term.id) fieldErrors.patternId = ["Choose periods from this term."];
    if (!validHours(input.hours)) fieldErrors.hours = ["Enter class hours between 7:00 AM and 9:00 PM that end after they start."];
  }
  if (Object.keys(fieldErrors).length) return invalid("Check the highlighted fields.", fieldErrors);

  const key = { stream, batchId: input.batchId, dayOfWeek: day };
  const [current] = await db.select().from(dayPlans).where(and(
    eq(dayPlans.termId, term.id), eq(dayPlans.stream, stream), eq(dayPlans.dayOfWeek, day),
    input.batchId == null ? isNull(dayPlans.batchId) : eq(dayPlans.batchId, input.batchId),
  )).limit(1);
  if ((current?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) return stale(CHANGED, "changed");

  const meetingsNow = await impactMeetings();
  const result = await auditedChange("time_grid.day_plan.set", "day_plan", async (tx) => {
    const before = await termGrid(term.id, tx);
    const windowsBefore = await termWindows(term.id, tx);
    const now = new Date();
    let planId: number | null = current?.id ?? null;
    // A stream day with no classes has no plan row; a batch "No classes" is a row with no pattern.
    if (input.batchId == null && input.patternId == null) {
      if (current) await tx.delete(dayPlans).where(eq(dayPlans.id, current.id));
      planId = null;
    } else if (current) {
      await tx.update(dayPlans).set({ patternId: input.patternId, reason: reason || null, updatedAt: now }).where(eq(dayPlans.id, current.id));
    } else {
      const [row] = await tx.insert(dayPlans).values({
        termId: term.id, stream, batchId: input.batchId, dayOfWeek: day, patternId: input.patternId, reason: reason || null, createdAt: now, updatedAt: now,
      }).returning();
      planId = row.id;
    }
    const hours = input.patternId != null ? input.hours : null;
    await setHours(tx, term.id, key, hours);
    const plan: DayPlan | null = planId == null ? null : {
      id: planId, stream, batchId: input.batchId, dayOfWeek: day, patternId: input.patternId, reason: reason || null, updatedAt: now.toISOString(),
    };
    const after = withDayPlan(before, key, plan);
    const impact = analyzeGridChange({ meetings: meetingsNow, before, after, windowsBefore, windowsAfter: windowsAfter(windowsBefore, key, hours) });
    const moved = input.moveClasses ? await applyMoves(tx, impact) : 0;
    return {
      result: { impact, moved },
      entityId: planId ?? current?.id ?? null,
      before: current ? { patternId: current.patternId, reason: current.reason } : null,
      after: plan ? { patternId: plan.patternId, reason: plan.reason, hours } : null,
      detail: { termId: term.id, ...key, moved: impact.moves.slice(0, moved) },
    };
  });
  refresh();
  const what = input.batchId == null
    ? input.patternId == null ? `${stream === "HSC" ? "HSC" : "Diploma"} has no classes on ${DAY_NAMES[day]}.` : `${DAY_NAMES[day]} updated.`
    : input.patternId == null ? `Batch set to no classes on ${DAY_NAMES[day]}.` : `Batch exception saved for ${DAY_NAMES[day]}.`;
  const note = impactMessage(result.impact, result.moved);
  return succeeded(`${what}${note ? ` ${note}` : ""}`);
}

export async function removeExceptionAction(planId: number, expectedUpdatedAt: string | null): Promise<ActionResult> {
  const denied = await guardAnyAction([...EDITORS]);
  if (denied) return denied;
  if (!Number.isInteger(planId) || planId <= 0) return invalid("Choose an exception.");
  const term = await getActiveTerm();
  const [plan] = await db.select().from(dayPlans).where(eq(dayPlans.id, planId)).limit(1);
  if (!plan) return stale("This exception no longer exists. Reload the page.", "missing");
  if (plan.termId !== term.id) return stale(OTHER_TERM, "not_active_term");
  if (plan.batchId == null) return invalid("This is the stream's own day. Set it to No classes instead.");
  if (plan.updatedAt.toISOString() !== expectedUpdatedAt) return stale(CHANGED, "changed");
  await auditedChange("time_grid.exception.remove", "day_plan", async (tx) => {
    await tx.delete(dayPlans).where(eq(dayPlans.id, planId));
    await setHours(tx, term.id, { stream: plan.stream === "DIPLOMA" ? "DIPLOMA" : "HSC", batchId: plan.batchId, dayOfWeek: plan.dayOfWeek }, null);
    return { result: null, entityId: planId, before: { batchId: plan.batchId, dayOfWeek: plan.dayOfWeek, patternId: plan.patternId, reason: plan.reason } };
  });
  refresh();
  return succeeded(`Exception removed. The batch follows the stream's ${DAY_NAMES[plan.dayOfWeek]} again.`);
}

// ---------------------------------------------------------------------------
// Copy from another term
// ---------------------------------------------------------------------------

export async function copyGridFromTermAction(sourceTermId: number, expectedPatternCount: number): Promise<ActionResult> {
  const denied = await guardAnyAction([...EDITORS]);
  if (denied) return denied;
  const term = await getActiveTerm();
  if (!Number.isInteger(sourceTermId) || sourceTermId === term.id) return invalid("Choose another term to copy from.");
  const [source] = await db.select().from(academicTerms).where(eq(academicTerms.id, sourceTermId)).limit(1);
  if (!source) return invalid("That term no longer exists.");
  const sourceGrid = await termGrid(source.id);
  if (sourceGrid.patterns.length === 0) return invalid(`${source.name} has no periods to copy.`);
  const current = await db.select({ id: periodPatterns.id }).from(periodPatterns).where(eq(periodPatterns.termId, term.id));
  if (current.length !== expectedPatternCount) return stale(CHANGED, "changed");
  const sourceWindows = (await db.select().from(permittedWindows).where(eq(permittedWindows.termId, source.id)));

  const counts = await auditedChange("time_grid.copy", "academic_term", async (tx) => {
    const before = await termGrid(term.id, tx);
    await tx.delete(dayPlans).where(eq(dayPlans.termId, term.id));
    if (before.patterns.length) await tx.delete(periodPatterns).where(inArray(periodPatterns.id, before.patterns.map((p) => p.id)));
    await tx.delete(permittedWindows).where(eq(permittedWindows.termId, term.id));
    const idMap = new Map<number, number>();
    for (const pattern of sourceGrid.patterns) {
      const [row] = await tx.insert(periodPatterns).values({ termId: term.id, name: pattern.name, periods: pattern.periods, breaks: pattern.breaks }).returning();
      idMap.set(pattern.id, row.id);
    }
    for (const plan of sourceGrid.dayPlans) {
      await tx.insert(dayPlans).values({
        termId: term.id, stream: plan.stream, batchId: plan.batchId, dayOfWeek: plan.dayOfWeek,
        patternId: plan.patternId == null ? null : idMap.get(plan.patternId)!, reason: plan.reason,
      });
    }
    for (const window of sourceWindows) {
      await tx.insert(permittedWindows).values({
        termId: term.id, stream: window.stream, batchId: window.batchId, dayOfWeek: window.dayOfWeek,
        startMinutes: window.startMinutes, endMinutes: window.endMinutes, requiresExceptionNote: window.requiresExceptionNote,
      });
    }
    const result = { patterns: sourceGrid.patterns.length, plans: sourceGrid.dayPlans.length, hours: sourceWindows.length };
    return {
      result,
      entityId: term.id,
      before: { patterns: before.patterns.map((p) => p.name), plans: before.dayPlans.length },
      after: result,
      detail: { sourceTermId: source.id, sourceTermName: source.name },
    };
  });
  refresh();
  return succeeded(`Copied ${counts.patterns} period pattern${counts.patterns === 1 ? "" : "s"} and ${counts.plans} day plan${counts.plans === 1 ? "" : "s"} from ${source.name}. Classes were not moved.`);
}
