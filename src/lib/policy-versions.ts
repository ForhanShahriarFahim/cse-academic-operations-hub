/**
 * SET-01B — effective-dated policy versions (database-free).
 *
 * A term's baseline policy is version 1, effective from the term start. Later
 * approved versions take effect from their own date. One rule resolves every
 * value: the latest approved version whose effective-from is on or before the
 * relevant date, else the baseline (spec D-1/D-2).
 */
import { validTermDate } from "./term-records";

export const VERSION_FIELDS = ["extraClassRate", "extraLoadThresholdCredits", "theoryAttendanceMarks", "sessionalAttendanceMarks"] as const;
export type VersionField = typeof VERSION_FIELDS[number];
export type PolicyFigures = Record<VersionField, number>;

export const VERSION_LABELS: Record<VersionField, string> = {
  extraClassRate: "Payment per extra class (Tk)",
  extraLoadThresholdCredits: "Extra-load threshold (workload credit-hours)",
  theoryAttendanceMarks: "Theory attendance marks",
  sessionalAttendanceMarks: "Sessional attendance marks",
};
export const SHORT_LABELS: Record<VersionField, string> = {
  extraClassRate: "Rate", extraLoadThresholdCredits: "Threshold", theoryAttendanceMarks: "Theory marks", sessionalAttendanceMarks: "Sessional marks",
};
export const REASON_LIMIT = 500;
export const ROUNDING_NOTE = "Payments are exact to the paisa; attendance marks round to 2 decimals; percentages to 1 decimal.";

export interface EffectiveVersion { id: number | null; version: number; effectiveFrom: string; figures: PolicyFigures }
export interface PolicyTimeline { termStart: string; termEnd: string; versions: EffectiveVersion[] }
interface TermDates { startDate: string; endDate: string }

export function figuresOf(row: Record<VersionField, unknown>): PolicyFigures {
  return Object.fromEntries(VERSION_FIELDS.map((key) => [key, Number(row[key])])) as PolicyFigures;
}

export function buildTimeline(term: TermDates, baseline: PolicyFigures, approved: ReadonlyArray<{ id: number; version: number; effectiveFrom: string; figures: PolicyFigures }>): PolicyTimeline {
  const later = approved.filter((row) => row.effectiveFrom > term.startDate)
    .map((row) => ({ id: row.id, version: row.version, effectiveFrom: row.effectiveFrom, figures: { ...row.figures } }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version);
  return { termStart: term.startDate, termEnd: term.endDate, versions: [{ id: null, version: 1, effectiveFrom: term.startDate, figures: { ...baseline } }, ...later] };
}

/** The version in force on a civil date. Dates before the term resolve to the baseline. */
export function versionOn(timeline: PolicyTimeline, date: string): EffectiveVersion {
  let found = timeline.versions[0];
  for (const version of timeline.versions) if (version.effectiveFrom <= date) found = version;
  return found;
}

export const clampDate = (date: string, start: string, end: string) => date < start ? start : date > end ? end : date;

/** Whole-term figures (attendance marks, eligible count) use today inside the term; a completed term uses its end. */
export function evaluationDate(term: TermDates & { status: string }, today: string): string {
  return term.status === "completed" ? term.endDate : clampDate(today, term.startDate, term.endDate);
}

/** The timeline as it would be if a proposal were approved. Version 0 marks the proposal. */
export function withProposal(timeline: PolicyTimeline, proposal: { effectiveFrom: string; figures: PolicyFigures }): PolicyTimeline {
  const versions = [...timeline.versions, { id: null, version: 0, effectiveFrom: proposal.effectiveFrom, figures: { ...proposal.figures } }]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { ...timeline, versions };
}

export const versionLabel = (version: number) => version === 0 ? "Proposed" : `Version ${version}`;

// ---------------------------------------------------------------------------
// Money and marks
// ---------------------------------------------------------------------------

export const toPaisa = (taka: number) => Math.round(taka * 100);
export const fromPaisa = (paisa: number) => paisa / 100;
export function markFor(attended: number, counted: number, maximum: number): number {
  return counted === 0 ? 0 : Math.round((attended / counted) * maximum * 100) / 100;
}

/** Each class is paid at the rate in force on its class date. */
export function priceClasses<T extends { classDate: string }>(timeline: PolicyTimeline, classes: readonly T[]) {
  return classes.map((row) => {
    const version = versionOn(timeline, row.classDate);
    return { ...row, rate: version.figures.extraClassRate, policyVersion: version.version };
  });
}

/** Manual rows without a rate override use the rate in force on their recording date, clamped into the term. */
export function manualRate(timeline: PolicyTimeline, row: { recordedDate: string; rateOverride: number | null }) {
  const version = versionOn(timeline, clampDate(row.recordedDate, timeline.termStart, timeline.termEnd));
  return row.rateOverride == null ? { rate: version.figures.extraClassRate, policyVersion: version.version as number | null } : { rate: row.rateOverride, policyVersion: null };
}
export function manualAmount(timeline: PolicyTimeline, row: { recordedDate: string; classCount: number; rateOverride: number | null; amountOverride: number | null }) {
  const { rate, policyVersion } = manualRate(timeline, row);
  return { rate, policyVersion, amount: row.amountOverride ?? fromPaisa(toPaisa(rate) * row.classCount) };
}

/** Distinct versions used by a set of priced lines, for output trace labels. */
export function versionsUsed(timeline: PolicyTimeline, used: Iterable<number | null>): EffectiveVersion[] {
  const numbers = new Set([...used].filter((value): value is number => value != null));
  return timeline.versions.filter((version) => numbers.has(version.version));
}

// ---------------------------------------------------------------------------
// Proposal validation
// ---------------------------------------------------------------------------

export type ProposalInput = { effectiveFrom: string; figures: PolicyFigures; reason: string };

export function parseNote(value: unknown, required: boolean): string | null | undefined {
  if (value != null && typeof value !== "string") return undefined;
  const text = (value ?? "").trim();
  if (!text) return required ? undefined : null;
  return [...text].length > REASON_LIMIT ? undefined : text;
}

/**
 * `timeline` is null when the term has no recorded baseline: the proposal then
 * records the baseline itself and must start on the term start date.
 */
export function validateProposal(input: Record<string, unknown>, term: TermDates, timeline: PolicyTimeline | null): { ok: true; value: ProposalInput } | { ok: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const figures = {} as PolicyFigures;
  for (const key of VERSION_FIELDS) {
    const text = typeof input[key] === "string" ? (input[key] as string).trim() : "";
    const rate = key === "extraClassRate";
    if (!(rate ? /^\d{1,8}(?:\.\d{1,2})?$/ : /^\d{1,3}(?:\.\d)?$/).test(text)) {
      errors[key] = [rate ? "Enter 0–99,999,999.99, with at most two decimal places." : "Enter 0–999.9, with at most one decimal place."];
    } else figures[key] = Number(text);
  }
  const effectiveFrom = typeof input.effectiveFrom === "string" ? input.effectiveFrom.trim() : "";
  if (!timeline) {
    if (effectiveFrom !== term.startDate) errors.effectiveFrom = [`The first recorded policy is the baseline and starts on the term start, ${term.startDate}.`];
  } else if (!validTermDate(effectiveFrom) || effectiveFrom <= term.startDate || effectiveFrom > term.endDate) {
    errors.effectiveFrom = [`Choose a date after ${term.startDate} and on or before ${term.endDate}. The baseline owns the term start.`];
  } else if (timeline.versions.some((version) => version.version > 1 && version.effectiveFrom === effectiveFrom)) {
    errors.effectiveFrom = ["An approved version already starts on this date. Choose another date."];
  }
  const reason = parseNote(input.reason, true);
  if (reason == null) errors.reason = [`Enter a reason of 1–${REASON_LIMIT} characters.`];
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!timeline) return { ok: true, value: { effectiveFrom, figures, reason: reason! } };
  const current = versionOn(timeline, effectiveFrom).figures;
  if (VERSION_FIELDS.every((key) => current[key] === figures[key])) {
    return { ok: false, errors: { form: ["These values are already in force on that date. Change at least one value."] } };
  }
  return { ok: true, value: { effectiveFrom, figures, reason: reason! } };
}

export function changedFields(before: PolicyFigures, after: PolicyFigures): VersionField[] {
  return VERSION_FIELDS.filter((key) => before[key] !== after[key]);
}

// ---------------------------------------------------------------------------
// Impact preview (spec D-4)
// ---------------------------------------------------------------------------

export interface ImpactInput {
  term: TermDates & { status: string };
  today: string;
  classes: ReadonlyArray<{ id: number; teacherId: number; teacherName: string; classDate: string }>;
  manual: ReadonlyArray<{ id: number; teacherName: string; classCount: number; rateOverride: number | null; amountOverride: number | null; recordedDate: string }>;
  workloads: ReadonlyArray<{ teacherId: number; teacherName: string; units: number }>;
  attendance: ReadonlyArray<{ groupId: number; courseCode: string; audience: string; courseType: string; lockedSessions: number;
    students: ReadonlyArray<{ studentId: number; attended: number; counted: number }> }>;
}

export interface PolicyImpact {
  payments: {
    teachers: Array<{ teacherId: number; teacherName: string; classes: number; before: number; after: number }>;
    classIds: number[];
    manual: Array<{ id: number; teacherName: string; before: number; after: number }>;
    totalBefore: number; totalAfter: number;
  };
  threshold: {
    evaluationDate: string;
    changed: Array<{ teacherId: number; teacherName: string; units: number; before: boolean; after: boolean }>;
    recordedUnderEarlier: number[];
  };
  attendance: {
    evaluationDate: string;
    courses: Array<{ groupId: number; courseCode: string; audience: string; courseType: string; maxBefore: number; maxAfter: number;
      studentsChanged: number; largestChange: number; lockedSessions: number }>;
  };
  empty: boolean;
}

export function policyImpact(before: PolicyTimeline, after: PolicyTimeline, input: ImpactInput) {
  // Payments: every class whose rate differs between the two timelines.
  const byTeacher = new Map<number, { teacherId: number; teacherName: string; classes: number; before: number; after: number }>();
  const classIds: number[] = [];
  const classRates: Array<{ id: number; before: number; after: number }> = [];
  for (const row of [...input.classes].sort((a, b) => a.id - b.id)) {
    const was = toPaisa(versionOn(before, row.classDate).figures.extraClassRate);
    const will = toPaisa(versionOn(after, row.classDate).figures.extraClassRate);
    if (was === will) continue;
    classIds.push(row.id);
    classRates.push({ id: row.id, before: was, after: will });
    const entry = byTeacher.get(row.teacherId) ?? { teacherId: row.teacherId, teacherName: row.teacherName, classes: 0, before: 0, after: 0 };
    entry.classes += 1; entry.before += was; entry.after += will;
    byTeacher.set(row.teacherId, entry);
  }
  const teachers = [...byTeacher.values()].map((row) => ({ ...row, before: fromPaisa(row.before), after: fromPaisa(row.after) }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName) || a.teacherId - b.teacherId);
  const manual = [...input.manual].sort((a, b) => a.id - b.id).flatMap((row) => {
    const was = manualAmount(before, row).amount, will = manualAmount(after, row).amount;
    return toPaisa(was) === toPaisa(will) ? [] : [{ id: row.id, teacherName: row.teacherName, before: was, after: will }];
  });
  const sum = (values: number[]) => fromPaisa(values.reduce((total, value) => total + toPaisa(value), 0));
  const totalBefore = sum([...teachers.map((row) => row.before), ...manual.map((row) => row.before)]);
  const totalAfter = sum([...teachers.map((row) => row.after), ...manual.map((row) => row.after)]);

  // Threshold: eligibility today, and recorded classes that the new threshold would not have admitted.
  const when = evaluationDate(input.term, input.today);
  const thresholdBefore = versionOn(before, when).figures.extraLoadThresholdCredits;
  const thresholdAfter = versionOn(after, when).figures.extraLoadThresholdCredits;
  const changed = [...input.workloads].sort((a, b) => a.teacherName.localeCompare(b.teacherName) || a.teacherId - b.teacherId)
    .map((row) => ({ ...row, before: row.units > thresholdBefore, after: row.units > thresholdAfter }))
    .filter((row) => row.before !== row.after);
  const units = new Map(input.workloads.map((row) => [row.teacherId, row.units]));
  const recordedUnderEarlier = [...input.classes].sort((a, b) => a.id - b.id).filter((row) => {
    const load = units.get(row.teacherId) ?? 0;
    return load > versionOn(before, row.classDate).figures.extraLoadThresholdCredits && !(load > versionOn(after, row.classDate).figures.extraLoadThresholdCredits);
  }).map((row) => row.id);

  // Attendance: whole-term maximum on the evaluation date.
  const maximum = (timeline: PolicyTimeline, type: string) => {
    const figures = versionOn(timeline, when).figures;
    return type === "sessional" ? figures.sessionalAttendanceMarks : figures.theoryAttendanceMarks;
  };
  const marks: Array<{ groupId: number; studentId: number; before: number; after: number }> = [];
  const courses = [...input.attendance].sort((a, b) => a.groupId - b.groupId).flatMap((group) => {
    const maxBefore = maximum(before, group.courseType), maxAfter = maximum(after, group.courseType);
    if (maxBefore === maxAfter) return [];
    let studentsChanged = 0, largestChange = 0;
    for (const student of [...group.students].sort((a, b) => a.studentId - b.studentId)) {
      const was = markFor(student.attended, student.counted, maxBefore);
      const will = markFor(student.attended, student.counted, maxAfter);
      if (was === will) continue;
      marks.push({ groupId: group.groupId, studentId: student.studentId, before: was, after: will });
      studentsChanged += 1;
      largestChange = Math.max(largestChange, Math.round(Math.abs(will - was) * 100) / 100);
    }
    return studentsChanged ? [{ groupId: group.groupId, courseCode: group.courseCode, audience: group.audience, courseType: group.courseType,
      maxBefore, maxAfter, studentsChanged, largestChange, lockedSessions: group.lockedSessions }] : [];
  });

  const impact: PolicyImpact = {
    payments: { teachers, classIds, manual, totalBefore, totalAfter },
    threshold: { evaluationDate: when, changed, recordedUnderEarlier },
    attendance: { evaluationDate: when, courses },
    empty: !classIds.length && !manual.length && !changed.length && !recordedUnderEarlier.length && !courses.length,
  };
  return { impact, classRates, marks };
}

// ---------------------------------------------------------------------------
// Output trace (spec D-5)
// ---------------------------------------------------------------------------

export const formatTaka = (amount: number) => amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Version 1 (Tk 200.00, from 2027-02-01) and Version 2 (Tk 250.00, from 2027-03-01)". */
export function rateTrace(versions: readonly EffectiveVersion[]): string {
  const parts = versions.map((version) => `${versionLabel(version.version)} (Tk ${formatTaka(version.figures.extraClassRate)}, from ${version.effectiveFrom})`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
