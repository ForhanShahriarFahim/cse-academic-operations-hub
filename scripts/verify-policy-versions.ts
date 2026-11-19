/** SET-01B database-free policy rules (AC-03, AC-04): resolution, validation, pricing and impact. */
import assert from "node:assert/strict";
import { attendanceMark } from "../src/lib/attendance";
import {
  buildTimeline, changedFields, clampDate, evaluationDate, manualAmount, markFor, parseNote, policyImpact, priceClasses,
  validateProposal, versionOn, versionsUsed, withProposal, type ImpactInput, type PolicyFigures,
} from "../src/lib/policy-versions";

const term = { startDate: "2027-02-01", endDate: "2027-06-30" };
const base: PolicyFigures = { extraClassRate: 200, extraLoadThresholdCredits: 15, theoryAttendanceMarks: 10, sessionalAttendanceMarks: 5 };
const v2 = { id: 11, version: 2, effectiveFrom: "2027-03-01", figures: { ...base, extraClassRate: 250 } };
const timeline = buildTimeline(term, base, [v2]);

// D-2 resolution: latest version on or before the date, else the baseline.
assert.equal(versionOn(timeline, "2027-01-15").version, 1, "before the term resolves to the baseline");
assert.equal(versionOn(timeline, "2027-02-28").figures.extraClassRate, 200);
assert.equal(versionOn(timeline, "2027-03-01").figures.extraClassRate, 250, "effective date is inclusive");
assert.equal(versionOn(timeline, "2027-06-30").version, 2);
// A backdated later version only governs its own window.
const backdated = buildTimeline(term, base, [v2, { id: 12, version: 3, effectiveFrom: "2027-02-15", figures: { ...base, extraClassRate: 225 } }]);
assert.deepEqual(["2027-02-14", "2027-02-15", "2027-02-28", "2027-03-01"].map((date) => versionOn(backdated, date).version), [1, 3, 3, 2]);
// A version on the term start never displaces the baseline.
assert.equal(buildTimeline(term, base, [{ ...v2, effectiveFrom: term.startDate }]).versions.length, 1);

assert.equal(clampDate("2026-12-01", term.startDate, term.endDate), term.startDate);
assert.equal(evaluationDate({ ...term, status: "active" }, "2027-04-10"), "2027-04-10");
assert.equal(evaluationDate({ ...term, status: "active" }, "2027-09-01"), term.endDate);
assert.equal(evaluationDate({ ...term, status: "completed" }, "2027-04-10"), term.endDate, "a completed term uses its end date");

// Pricing per class date; manual rows by recording date; overrides untouched; exact paisa.
const priced = priceClasses(timeline, [{ classDate: "2027-02-27" }, { classDate: "2027-03-02" }]);
assert.deepEqual(priced.map((row) => [row.rate, row.policyVersion]), [[200, 1], [250, 2]]);
assert.deepEqual(versionsUsed(timeline, priced.map((row) => row.policyVersion)).map((row) => row.version), [1, 2]);
assert.equal(manualAmount(timeline, { recordedDate: "2027-03-05", classCount: 3, rateOverride: null, amountOverride: null }).amount, 750);
assert.equal(manualAmount(timeline, { recordedDate: "2027-09-05", classCount: 1, rateOverride: null, amountOverride: null }).policyVersion, 2, "recording after the term clamps to its end");
assert.deepEqual(manualAmount(timeline, { recordedDate: "2027-03-05", classCount: 3, rateOverride: 100, amountOverride: null }), { rate: 100, policyVersion: null, amount: 300 });
assert.equal(manualAmount(timeline, { recordedDate: "2027-03-05", classCount: 3, rateOverride: 100, amountOverride: 999.99 }).amount, 999.99);
assert.equal(manualAmount(buildTimeline(term, { ...base, extraClassRate: 0.1 }, []), { recordedDate: "2027-03-05", classCount: 3, rateOverride: null, amountOverride: null }).amount, 0.3);

// Marks: identical to the existing attendance rule (rounded to two decimals).
for (const [attended, counted, max] of [[0, 0, 10], [7, 9, 10], [2, 3, 5], [5, 5, 7.5], [1, 3, 10]] as const) {
  const statuses = [...Array(attended).fill("present"), ...Array(counted - attended).fill("absent")];
  assert.equal(markFor(attended, counted, max), attendanceMark(statuses, max));
}

// Proposal validation.
const form = (patch: Record<string, unknown> = {}) => ({ extraClassRate: "300", extraLoadThresholdCredits: "15", theoryAttendanceMarks: "10", sessionalAttendanceMarks: "5", effectiveFrom: "2027-04-01", reason: "  Syndicate memo 12  ", ...patch });
const good = validateProposal(form(), term, timeline);
assert.ok(good.ok); assert.equal(good.value.reason, "Syndicate memo 12"); assert.equal(good.value.figures.extraClassRate, 300);
const errorKeys = (patch: Record<string, unknown>) => { const result = validateProposal(form(patch), term, timeline); assert.equal(result.ok, false); return Object.keys((result as { errors: Record<string, string[]> }).errors); };
assert.deepEqual(errorKeys({ effectiveFrom: term.startDate }), ["effectiveFrom"], "the baseline owns the term start");
assert.deepEqual(errorKeys({ effectiveFrom: "2027-07-01" }), ["effectiveFrom"]);
assert.deepEqual(errorKeys({ effectiveFrom: "2027-02-30" }), ["effectiveFrom"]);
assert.deepEqual(errorKeys({ effectiveFrom: "2027-03-01" }), ["effectiveFrom"], "one approved version per date");
assert.deepEqual(errorKeys({ extraClassRate: "-1", theoryAttendanceMarks: "1000", sessionalAttendanceMarks: "1.25" }), ["extraClassRate", "theoryAttendanceMarks", "sessionalAttendanceMarks"]);
assert.deepEqual(errorKeys({ extraClassRate: 300 }), ["extraClassRate"], "non-string payloads are refused");
assert.deepEqual(errorKeys({ reason: "   " }), ["reason"]);
assert.deepEqual(errorKeys({ reason: "x".repeat(501) }), ["reason"]);
assert.deepEqual(errorKeys({ extraClassRate: "250" }), ["form"], "a proposal that changes nothing is refused");
assert.ok(validateProposal(form({ extraClassRate: "200", effectiveFrom: "2027-04-01", theoryAttendanceMarks: "12" }), term, timeline).ok);
// Missing baseline: only a term-start baseline proposal, and no "unchanged" comparison.
assert.ok(validateProposal(form({ effectiveFrom: term.startDate, extraClassRate: "200" }), term, null).ok);
assert.deepEqual(Object.keys((validateProposal(form(), term, null) as { errors: object }).errors), ["effectiveFrom"]);

assert.equal(parseNote("  ", false), null); assert.equal(parseNote(undefined, true), undefined); assert.equal(parseNote(5, false), undefined);
assert.deepEqual(changedFields(base, { ...base, extraClassRate: 1, sessionalAttendanceMarks: 6 }), ["extraClassRate", "sessionalAttendanceMarks"]);

// Impact (D-4): only rows whose figures differ, totals in paisa, threshold and attendance effects, and agreement with post-approval pricing.
const input: ImpactInput = {
  term: { ...term, status: "active" }, today: "2027-04-20",
  classes: [
    { id: 1, teacherId: 7, teacherName: "Teacher A", classDate: "2027-03-28" },
    { id: 2, teacherId: 7, teacherName: "Teacher A", classDate: "2027-04-03" },
    { id: 3, teacherId: 8, teacherName: "Teacher B", classDate: "2027-04-10" },
    { id: 4, teacherId: 8, teacherName: "Teacher B", classDate: "2027-04-11" },
  ],
  manual: [
    { id: 21, teacherName: "Visiting", classCount: 2, rateOverride: null, amountOverride: null, recordedDate: "2027-04-10" },
    { id: 22, teacherName: "Override", classCount: 2, rateOverride: 150, amountOverride: null, recordedDate: "2027-04-10" },
  ],
  workloads: [{ teacherId: 7, teacherName: "Teacher A", units: 16 }, { teacherId: 8, teacherName: "Teacher B", units: 18 }],
  attendance: [{ groupId: 5, courseCode: "CSE-0000", audience: "Example", courseType: "theory", lockedSessions: 2,
    students: [{ studentId: 1, attended: 3, counted: 4 }, { studentId: 2, attended: 0, counted: 0 }] }],
};
const ratePlan = { effectiveFrom: "2027-04-01", figures: { ...base, extraClassRate: 300 } };
const after = withProposal(timeline, ratePlan);
const impact = policyImpact(timeline, after, input);
assert.deepEqual(impact.payments.classIds, [2, 3, 4], "classes before the date keep their rate");
assert.deepEqual(impact.payments.teachers.map((row) => [row.teacherName, row.classes, row.before, row.after]), [["Teacher A", 1, 250, 300], ["Teacher B", 2, 500, 600]]);
assert.deepEqual(impact.payments.manual, [{ id: 21, teacherName: "Visiting", before: 500, after: 600 }]);
assert.deepEqual([impact.payments.totalBefore, impact.payments.totalAfter], [1250, 1500]);
assert.equal(impact.attendance.courses.length, 0); assert.equal(impact.threshold.changed.length, 0); assert.equal(impact.empty, false);
const afterPriced = priceClasses(after, input.classes);
assert.equal(afterPriced.filter((row) => impact.payments.classIds.includes(row.id)).reduce((sum, row) => sum + row.rate, 0), 900, "preview matches approved pricing");

const thresholdImpact = policyImpact(timeline, withProposal(timeline, { effectiveFrom: "2027-04-05", figures: { ...v2.figures, extraLoadThresholdCredits: 17 } }), input);
assert.deepEqual(thresholdImpact.threshold.changed.map((row) => [row.teacherName, row.before, row.after]), [["Teacher A", true, false]]);
assert.deepEqual(thresholdImpact.threshold.recordedUnderEarlier, [], "Teacher A's only class after the date is 3 Apr; nothing recorded on/after 5 Apr");
assert.deepEqual(policyImpact(timeline, withProposal(timeline, { effectiveFrom: "2027-04-02", figures: { ...v2.figures, extraLoadThresholdCredits: 17 } }), input).threshold.recordedUnderEarlier, [2]);

const marksImpact = policyImpact(timeline, withProposal(timeline, { effectiveFrom: "2027-04-15", figures: { ...v2.figures, theoryAttendanceMarks: 12 } }), input);
assert.deepEqual(marksImpact.attendance.courses.map((row) => [row.maxBefore, row.maxAfter, row.studentsChanged, row.largestChange, row.lockedSessions]), [[10, 12, 1, 1.5, 2]]);
const future = policyImpact(timeline, withProposal(timeline, { effectiveFrom: "2027-05-01", figures: { ...v2.figures, theoryAttendanceMarks: 12 } }), input);
assert.equal(future.empty, true, "a future-dated change affects nothing yet");

console.log("SET-01B policy versions: resolution, validation, pricing, marks parity and impact preview verified.");
