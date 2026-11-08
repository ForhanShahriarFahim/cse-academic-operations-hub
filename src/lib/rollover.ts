/** Approved BAT-01B rules. Pure: safe in the browser and the parent test harness. */
import { note } from "./batch-records";
import { validatePattern, type PatternInput } from "./time-grid";

export type Disposition = "progress" | "repeat" | "hold" | "graduate";
export interface RolloverChoice { batchId: number; disposition: Disposition; carryCount: boolean; reason: string; graduateConfirmed: boolean }
export interface RolloverPlan { sourceId: number; targetId: number; cloneGrid: boolean; reason: string; choices: RolloverChoice[] }
export interface RolloverCohort { id: number; label: string; stream: string; status: string; semester: number; studentCount: number | null; confidence: string }
export interface RolloverDecision extends RolloverCohort { disposition: Disposition; destinationSemester: number | null; destinationCount: number | null; reason: string }
export interface RolloverReview { fingerprint: string; source: string; target: string; decisions: RolloverDecision[]; grid: { patterns: number; plans: number; windows: number; excludedExceptions: number; legacyWindows: number }; warnings: string[] }
export const positiveId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export const eligibleCohort = (b: RolloverCohort) => b.status === "active" && ["HSC", "DIPLOMA"].includes(b.stream) && Number.isInteger(b.semester) && b.semester >= 1 && b.semester <= 8;
export const validCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2147483647;

export function parseRolloverPlan(raw: Record<string, string>): RolloverPlan {
  const sourceId = Number(raw.sourceId), targetId = Number(raw.targetId);
  if (!/^\d+$/.test(raw.sourceId) || !/^\d+$/.test(raw.targetId) || !positiveId(sourceId) || !positiveId(targetId) || sourceId === targetId) throw new Error("Choose different valid source and destination terms.");
  if (!["on", "off"].includes(raw.cloneGrid)) throw new Error("Choose whether to copy the time grid.");
  if (!note(raw.reason)) throw new Error("Enter an operation reason of 1–300 characters without private student data.");
  if (!raw.choices || raw.choices.length > 500000) throw new Error("Submit a bounded cohort plan.");
  let rows: unknown;
  try { rows = JSON.parse(raw.choices); } catch { throw new Error("Submit a valid cohort plan."); }
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error("Submit at most 2,000 cohort decisions.");
  const ids = new Set<number>();
  const choices = rows.map((value): RolloverChoice => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each cohort needs one valid decision.");
    const r = value as Record<string, unknown>;
    if (Object.keys(r).sort().join(",") !== "batchId,carryCount,disposition,graduateConfirmed,reason" || !positiveId(r.batchId) || ids.has(r.batchId)
      || !["progress", "repeat", "hold", "graduate"].includes(String(r.disposition)) || typeof r.carryCount !== "boolean" || typeof r.graduateConfirmed !== "boolean" || typeof r.reason !== "string") throw new Error("Submit each supported cohort decision exactly once.");
    ids.add(r.batchId);
    if (r.reason && !note(r.reason)) throw new Error("Use decision reasons of 1–300 characters without control characters.");
    if (["hold", "graduate"].includes(String(r.disposition)) && !note(r.reason)) throw new Error("Hold and graduation each require a reason.");
    if (r.disposition === "graduate" && !r.graduateConfirmed) throw new Error("Explicitly confirm each graduation decision.");
    return { batchId: r.batchId, disposition: r.disposition as Disposition, carryCount: r.carryCount, reason: r.reason.trim(), graduateConfirmed: r.graduateConfirmed };
  }).sort((a, b) => a.batchId - b.batchId);
  return { sourceId, targetId, cloneGrid: raw.cloneGrid === "on", reason: raw.reason.trim(), choices };
}

export function rolloverDecisions(cohorts: RolloverCohort[], choices: RolloverChoice[]): RolloverDecision[] {
  const eligible = cohorts.filter(eligibleCohort);
  if (eligible.length !== choices.length || choices.some(c => !eligible.some(b => b.id === c.batchId))) throw new Error("The source cohort list changed. Review every eligible cohort exactly once.");
  return choices.map(c => {
    const b = eligible.find(b => b.id === c.batchId)!;
    if (c.disposition === "progress" && b.semester === 8) throw new Error(`${b.stream}-${b.label}: semester 8 requires Repeat, Hold or Graduate.`);
    const semester = c.disposition === "progress" ? b.semester + 1 : c.disposition === "repeat" ? b.semester : null;
    if (semester != null && c.carryCount && b.studentCount != null && !validCount(b.studentCount)) throw new Error(`${b.stream}-${b.label}: the legacy count is invalid. Choose Start unknown.`);
    return { ...b, disposition: c.disposition, destinationSemester: semester, destinationCount: semester != null && c.carryCount ? b.studentCount : null, reason: c.reason };
  });
}

export interface ClonePattern extends PatternInput { id: number; termId: number }
export interface ClonePlan { id: number; termId: number; stream: string; batchId: number | null; dayOfWeek: number; patternId: number | null; reason: string | null }
export interface CloneWindow { id: number; termId: number | null; stream: string; batchId: number | null; dayOfWeek: number; startMinutes: number; endMinutes: number; requiresExceptionNote: string | null }
export function planGridClone(sourceId: number, patterns: ClonePattern[], plans: ClonePlan[], windows: CloneWindow[], cohorts: Array<{id:number;stream:string}>, receiving: number[]) {
  const names: string[] = [], patternIds = new Set<number>();
  for (const p of patterns) {
    if (p.termId !== sourceId || !positiveId(p.id) || patternIds.has(p.id) || typeof p.name !== "string" || !Array.isArray(p.periods) || !Array.isArray(p.breaks)
      || p.periods.some(v => !v || typeof v !== "object") || p.breaks.some(v => !v || typeof v.name !== "string" || typeof v.blocksClasses !== "boolean")
      || validatePattern(p, names).length) throw new Error("Source period patterns are invalid or ambiguous. Correct them before cloning, or turn cloning off.");
    names.push(p.name); patternIds.add(p.id);
  }
  const keys = new Set<string>();
  const validScope = (r: ClonePlan | CloneWindow, kind: string) => {
    if (r.termId !== sourceId || !["HSC", "DIPLOMA"].includes(r.stream) || !Number.isInteger(r.dayOfWeek) || r.dayOfWeek < 0 || r.dayOfWeek > 6
      || r.batchId != null && !cohorts.some(b => b.id === r.batchId && b.stream === r.stream)) throw new Error("Source grid has an invalid term, weekday or cohort scope. Turn cloning off or correct it first.");
    const key = `${kind}:${r.stream}:${r.batchId ?? "stream"}:${r.dayOfWeek}`;
    if (keys.has(key)) throw new Error("Source grid has duplicate semantic rules. Turn cloning off or correct them first.");
    keys.add(key);
  };
  for (const p of plans) {
    validScope(p, "plan");
    if (p.patternId == null ? p.batchId == null : !patternIds.has(p.patternId)) throw new Error("Source day plan has a missing or foreign pattern. Turn cloning off or correct it first.");
  }
  const owned = windows.filter(w => w.termId === sourceId);
  for (const w of owned) {
    validScope(w, "window");
    if (!Number.isInteger(w.startMinutes) || !Number.isInteger(w.endMinutes) || w.startMinutes < 420 || w.endMinutes > 1260 || w.startMinutes >= w.endMinutes) throw new Error("Source class windows have invalid times. Turn cloning off or correct them first.");
  }
  const include = (r: {batchId:number|null}) => r.batchId == null || receiving.includes(r.batchId);
  const includedPlans = plans.filter(include), includedWindows = owned.filter(include);
  return { patterns, plans: includedPlans, windows: includedWindows, excludedExceptions: plans.length + owned.length - includedPlans.length - includedWindows.length, legacyWindows: windows.filter(w => w.termId == null).length };
}
