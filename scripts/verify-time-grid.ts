/**
 * RUT-04 domain checks: legacy grid parity, teaching days and batch
 * exceptions, grouped projections, validation (per-batch breaks and
 * no-classes days), pattern validation, change impact and snapshots.
 */
import assert from "node:assert/strict";
import {
  analyzeGridChange, dayGroups, daysFor, effectivePlan, exceptionKind, fillEvenly, isExceptionOnlyDay,
  normalizePattern, periodsFor, streamDays, teachingDays, validatePattern, withDayPlan, withPattern,
  type DayPlan, type PeriodPattern, type TimeGrid,
} from "../src/lib/time-grid";
import { legacyTimeGrid } from "../src/lib/time-grid-legacy";
import { analyzeSchedule, type PermittedWindow } from "../src/lib/conflicts";
import { projectRoutine, type RoutineBatch, type RoutineSource } from "../src/lib/routine-projection";
import { normalizePublicationSnapshot, type MeetingView } from "../src/lib/serialize";

const prayer = { name: "Friday prayer break", scope: "stream", stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 780, endMinutes: 840 };

// ---------------------------------------------------------------- legacy parity
const legacy = legacyTimeGrid([prayer]);
assert.deepEqual(streamDays(legacy, "HSC"), [0, 1, 2, 3], "HSC teaches Saturday to Tuesday");
assert.deepEqual(streamDays(legacy, "DIPLOMA"), [6, 0], "Diploma reads Friday then Saturday");
const periods = (grid: TimeGrid, stream: "HSC" | "DIPLOMA", day: number) =>
  effectivePlan(grid, stream, null, day).pattern!.periods.map((p) => [p.start, p.end]);
assert.deepEqual(periods(legacy, "HSC", 0), [[570, 645], [645, 720], [720, 795], [870, 945]]);
assert.deepEqual(periods(legacy, "HSC", 1), [[540, 600], [600, 660], [660, 720], [720, 795]]);
assert.deepEqual(periods(legacy, "HSC", 3).at(-1), [810, 885]);
assert.deepEqual(periods(legacy, "DIPLOMA", 6), [[540, 600], [600, 660], [660, 720], [720, 780], [840, 900], [900, 960]]);
assert.deepEqual(periods(legacy, "DIPLOMA", 0), [[720, 780], [780, 840], [840, 900], [900, 960]]);
assert.equal(effectivePlan(legacy, "HSC", null, 1).pattern!.id, effectivePlan(legacy, "HSC", null, 2).pattern!.id, "Sunday and Monday share a pattern");
assert.deepEqual(effectivePlan(legacy, "DIPLOMA", null, 6).pattern!.breaks, [{ name: "Friday prayer break", start: 780, end: 840, blocksClasses: true }]);
assert.deepEqual(effectivePlan(legacy, "HSC", null, 0).pattern!.breaks, []);
assert.deepEqual(legacy.patterns.map((p) => p.name), ["HSC Saturday", "HSC Sunday–Monday", "HSC Tuesday", "Diploma Friday", "Diploma Saturday"]);
// A break on Sunday only splits the shared Sunday–Monday pattern and names the days.
const split = legacyTimeGrid([{ name: "Assembly", scope: "stream", stream: "HSC", dayOfWeek: 1, startMinutes: 600, endMinutes: 610 }]);
assert.notEqual(effectivePlan(split, "HSC", null, 1).pattern!.id, effectivePlan(split, "HSC", null, 2).pattern!.id);
assert.deepEqual(split.patterns.filter((p) => p.name.startsWith("HSC S") || p.name.startsWith("HSC M")).map((p) => p.name).sort(), ["HSC Monday", "HSC Saturday", "HSC Sunday"]);

// ---------------------------------------------------------------- exceptions
const friday: PeriodPattern = { id: 50, name: "HSC Friday morning", periods: [{ start: 540, end: 600 }, { start: 600, end: 660 }, { start: 660, end: 720 }], breaks: [], updatedAt: null };
const lab: PeriodPattern = { id: 51, name: "Lab block", periods: [{ start: 540, end: 690 }, { start: 690, end: 780 }], breaks: [{ name: "Jumu'ah", start: 780, end: 840, blocksClasses: true }], updatedAt: null };
const plan = (id: number, fields: Partial<DayPlan> & Pick<DayPlan, "stream" | "dayOfWeek">): DayPlan =>
  ({ id, batchId: null, patternId: null, reason: "test", updatedAt: null, ...fields });
let grid: TimeGrid = withPattern(withPattern(legacy, friday), lab);
grid = withDayPlan(grid, { stream: "HSC", batchId: 25, dayOfWeek: 6 }, plan(-100, { stream: "HSC", batchId: 25, dayOfWeek: 6, patternId: 50 }));
grid = withDayPlan(grid, { stream: "HSC", batchId: 24, dayOfWeek: 3 }, plan(-101, { stream: "HSC", batchId: 24, dayOfWeek: 3, patternId: 51 }));
grid = withDayPlan(grid, { stream: "HSC", batchId: 23, dayOfWeek: 2 }, plan(-102, { stream: "HSC", batchId: 23, dayOfWeek: 2, patternId: null }));

assert.deepEqual(streamDays(grid, "HSC"), [0, 1, 2, 3, 6], "an extra Friday comes after the stream's own week");
assert.equal(isExceptionOnlyDay(grid, "HSC", 6), true);
assert.equal(isExceptionOnlyDay(grid, "HSC", 3), false);
assert.deepEqual(teachingDays(grid).HSC, { all: [0, 1, 2, 3, 6], exceptionOnly: [6] });
assert.equal(exceptionKind(grid, grid.dayPlans.find((p) => p.id === -100)!), "extra_day");
assert.equal(exceptionKind(grid, grid.dayPlans.find((p) => p.id === -101)!), "own_periods");
assert.equal(exceptionKind(grid, grid.dayPlans.find((p) => p.id === -102)!), "no_classes");
assert.equal(effectivePlan(grid, "HSC", 26, 6).pattern, null, "other HSC batches have no Friday");
assert.deepEqual(periodsFor(grid, [{ batchId: 24, stream: "HSC" }], 3).map((p) => p.start), [540, 690]);
assert.deepEqual(daysFor(grid, [{ batchId: 23, stream: "HSC" }]), [0, 1, 3], "a no-classes day is not offered");

const batches: RoutineBatch[] = [23, 24, 25, 26].map((id, index) => ({ id, stream: "HSC", label: `${id}B`, semester: index + 1, studentCount: 30, sortOrder: 40 - id }));
const tuesdayGroups = dayGroups(grid, "HSC", 3, batches);
assert.deepEqual(tuesdayGroups.map((g) => [g.pattern.name, g.isStreamDefault, g.batches.map((b) => b.id)]),
  [["HSC Tuesday", true, [23, 25, 26]], ["Lab block", false, [24]]]);
assert.deepEqual(dayGroups(grid, "HSC", 6, batches).map((g) => g.batches.map((b) => b.id)), [[25]]);
assert.deepEqual(dayGroups(grid, "HSC", 2, batches)[0].batches.map((b) => b.id), [24, 25, 26], "no-classes batch left out");

// ---------------------------------------------------------------- validation
function meeting(id: number, batchId: number, day: number, start: number, end: number, extra: Partial<MeetingView> = {}): MeetingView {
  return {
    id, teachingGroupId: id, dayOfWeek: day, startMinutes: start, endMinutes: end, courseCode: `CSE-${id}`, courseTitle: "T",
    courseType: "theory", courseCredits: 3, requiredRoomCapability: null, owningDepartmentCode: "CSE", deliveryMode: "fixed",
    isException: false, exceptionNote: null, customTimeLabel: null, highlightColor: null, pendingReconciliation: false,
    teachers: [], rooms: [], externalAudienceLabel: null, externalStudentCount: null,
    audiences: [{ batchId, batchLabel: `${batchId}B`, stream: "HSC", semester: 1, studentCount: 30 }], ...extra,
  };
}
const windows: PermittedWindow[] = [
  { id: 1, termId: 1, batchId: null, stream: "HSC", dayOfWeek: 2, startMinutes: 540, endMinutes: 795, note: null },
  { id: 2, termId: 1, batchId: null, stream: "HSC", dayOfWeek: 3, startMinutes: 540, endMinutes: 885, note: null },
  { id: 3, termId: 1, batchId: 25, stream: "HSC", dayOfWeek: 6, startMinutes: 540, endMinutes: 720, note: null },
];
const issuesFor = (meetings: MeetingView[], g: TimeGrid | null = grid) =>
  analyzeSchedule({ meetings, externals: [], breaks: [], windows, grid: g });
const blockers = (meetings: MeetingView[], g?: TimeGrid | null) => issuesFor(meetings, g).filter((i) => i.severity === "blocker");

assert.deepEqual(blockers([meeting(1, 25, 6, 540, 600)]).map((i) => i.type), [], "HSC-25B may teach Friday within its hours");
assert.deepEqual(blockers([meeting(2, 26, 6, 540, 600)]).map((i) => i.type), ["outside_permitted_window"], "another HSC batch on Friday is still a clash");
const closed = blockers([meeting(3, 23, 2, 540, 600)]);
assert.deepEqual(closed.map((i) => [i.type, i.title]), [["outside_permitted_window", "HSC-23B has no classes on Monday"]]);
assert.match(closed[0].detail, /No classes/);
assert.deepEqual(issuesFor([meeting(4, 23, 2, 540, 600, { isException: true, exceptionNote: "Approved" })]).map((i) => [i.severity, i.type]),
  [["warning", "window_exception_in_use"]], "an approved exception is a warning");
const breakIssue = blockers([meeting(5, 24, 3, 780, 830)]);
assert.deepEqual(breakIssue.map((i) => i.type), ["break_conflict"], "HSC-24B's own pattern blocks Jumu'ah");
assert.match(breakIssue[0].detail, /applies to HSC-24B/);
assert.deepEqual(blockers([meeting(6, 26, 3, 780, 830)]).map((i) => i.type), [], "the same time is free for batches on the stream pattern");
assert.equal(blockers([meeting(8, 26, 3, 780, 830)], null).length, 0, "without a grid there is no Tuesday break");
// Without a grid, the old break rules still apply (older publications).
assert.equal(analyzeSchedule({ meetings: [meeting(7, 26, 6, 780, 800, { audiences: [{ batchId: 9, batchLabel: "9B", stream: "DIPLOMA", semester: 1, studentCount: 1 }] })], externals: [], breaks: [{ id: 1, ...prayer }], windows: [] })
  .some((i) => i.type === "break_conflict"), true);

// ---------------------------------------------------------------- grouped projection
const source: RoutineSource = {
  kind: "draft", termName: "Spring 2027", effectiveFrom: null, generatedAt: "2027-01-01T00:00:00.000Z", versionNumber: null,
  legacyContext: false, batches, breaks: [], timeGrid: grid, externals: [], issues: [],
  meetings: [meeting(10, 24, 3, 540, 690), meeting(11, 26, 3, 540, 600), meeting(12, 26, 6, 540, 600), meeting(13, 25, 6, 600, 660)],
};
const tuesday = projectRoutine({ source, selection: { stream: "HSC", view: "day", day: 3 } }).days[0];
assert.deepEqual(tuesday.groups.map((g) => [g.name, g.rows.map((r) => r.batch.id)]), [["HSC Tuesday", [23, 25, 26]], ["Lab block", [24]]]);
assert.equal(tuesday.groups[1].rows[0].slots[0].meetings[0].meeting.id, 10);
assert.deepEqual(tuesday.groups[1].breaks.map((b) => [b.name, b.afterSlot]), [], "a break at the end of a pattern draws no column");
const fri = projectRoutine({ source, selection: { stream: "HSC", view: "day", day: 6 } }).days[0];
assert.equal(fri.exceptionOnly, true);
assert.deepEqual(fri.groups.map((g) => g.rows.map((r) => [r.batch.id, !!r.unplanned])), [[[25, false], [26, true]]], "an unplanned class stays visible");
assert.deepEqual(fri.groups[0].rows[1].offGrid.map((m) => m.meeting.id), [12]);
const diplomaFriday = projectRoutine({ source: { ...source, timeGrid: legacy, batches: [{ id: 9, stream: "DIPLOMA", label: "9B", semester: 1, studentCount: 1, sortOrder: 1 }] }, selection: { stream: "DIPLOMA", view: "day", day: 6 } }).days[0];
assert.deepEqual(diplomaFriday.groups[0].breaks.map((b) => [b.name, b.afterSlot]), [["Friday prayer break", 3]], "the prayer column sits after 12:00–1:00");

// ---------------------------------------------------------------- pattern validation
const ok = normalizePattern({ name: "  HSC 75 ", periods: fillEvenly(570, 75, 4, 3, 75), breaks: [{ name: "Lunch", start: 795, end: 870, blocksClasses: false }] });
assert.deepEqual(ok.periods.map((p) => [p.start, p.end]), [[570, 645], [645, 720], [720, 795], [870, 945]]);
assert.equal(ok.name, "HSC 75");
assert.deepEqual(validatePattern(ok, ["Other"]), []);
const fields = (errors: ReturnType<typeof validatePattern>) => [...new Set(errors.map((e) => e.field))];
assert.deepEqual(fields(validatePattern({ ...ok, name: "" }, [])), ["name"]);
assert.deepEqual(fields(validatePattern(ok, ["hsc 75"])), ["name"], "names are unique in a term, ignoring case");
assert.deepEqual(fields(validatePattern({ ...ok, periods: [] }, [])), ["periods"]);
assert.deepEqual(fields(validatePattern({ ...ok, periods: [{ start: 600, end: 540 }] }, [])), ["period-0"]);
assert.deepEqual(fields(validatePattern({ ...ok, periods: [{ start: 300, end: 360 }] }, [])), ["period-0"]);
assert.deepEqual(fields(validatePattern({ ...ok, periods: [{ start: 540, end: 600 }, { start: 590, end: 650 }] }, [])), ["period-1"]);
assert.deepEqual(fields(validatePattern({ ...ok, breaks: [{ name: "Lunch", start: 700, end: 760, blocksClasses: false }] }, [])), ["break-0"], "a break overlapping a period is refused");
assert.deepEqual(fields(validatePattern({ ...ok, breaks: [{ name: " ", start: 800, end: 860, blocksClasses: false }] }, [])), ["break-0-name"]);

// ---------------------------------------------------------------- change impact
const sundayId = effectivePlan(legacy, "HSC", null, 1).pattern!.id;
const shifted = withPattern(legacy, { ...legacy.patterns.find((p) => p.id === sundayId)!, periods: fillEvenly(570, 75, 3, null, 0).concat([{ start: 870, end: 945 }]) });
const impactMeetings = [
  { id: 1, courseCode: "A", dayOfWeek: 1, startMinutes: 540, endMinutes: 600, audiences: [{ batchId: 26, stream: "HSC" as const, batchLabel: "26B" }] },
  { id: 2, courseCode: "B", dayOfWeek: 2, startMinutes: 600, endMinutes: 720, audiences: [{ batchId: 26, stream: "HSC" as const, batchLabel: "26B" }] },
  { id: 3, courseCode: "C", dayOfWeek: 1, startMinutes: 700, endMinutes: 730, audiences: [{ batchId: 26, stream: "HSC" as const, batchLabel: "26B" }] },
  { id: 4, courseCode: "D", dayOfWeek: 0, startMinutes: 570, endMinutes: 645, audiences: [{ batchId: 26, stream: "HSC" as const, batchLabel: "26B" }] },
];
const hours = [1, 2].map((dayOfWeek) => ({ batchId: null, stream: "HSC", dayOfWeek, startMinutes: 540, endMinutes: 795 }));
const newHours = [1, 2].map((dayOfWeek) => ({ batchId: null, stream: "HSC", dayOfWeek, startMinutes: 570, endMinutes: 945 }));
const impact = analyzeGridChange({ meetings: impactMeetings, before: legacy, after: shifted, windowsBefore: hours, windowsAfter: newHours });
assert.equal(impact.affected, 3, "Saturday is untouched");
assert.deepEqual(impact.misaligned.map((m) => m.id), [1, 2]);
assert.deepEqual(impact.moves.map((m) => [m.meetingId, m.startMinutes, m.endMinutes]), [[1, 570, 645], [2, 645, 795]], "same position, spanning periods 2–3");
assert.deepEqual(impact.manual, []);
assert.deepEqual(impact.breaking.map((b) => b.meeting.id), [1], "only the 9:00 class leaves the new hours");
assert.equal(impact.breaking[0].resolvedByMove, true, "moving it to 9:30 puts it back inside the hours");
assert.match(impact.breaking[0].reason, /^A \(9:00 AM – 10:00 AM\): outside HSC-26B class hours on Sunday\.$/);
const closing = analyzeGridChange({
  meetings: impactMeetings, before: legacy, windowsBefore: hours, windowsAfter: hours,
  after: withDayPlan(legacy, { stream: "HSC", batchId: 26, dayOfWeek: 1 }, plan(-1, { stream: "HSC", batchId: 26, dayOfWeek: 1, patternId: null })),
});
assert.deepEqual(closing.breaking.map((b) => b.meeting.id), [1, 3]);
assert.match(closing.breaking[0].reason, /has no classes on Sunday/);

// ---------------------------------------------------------------- snapshots
const metadata = { teachers: [], courses: [], classRepresentatives: [], queryContacts: [], sourceReconciliations: [] };
const base = { generatedAt: "2027-01-01T00:00:00.000Z", versionNumber: 3, term: { id: 1, name: "S", academicYear: 2027, effectiveFrom: null }, meetings: [], batches: [], breaks: [], externalCommitments: [], issues: [], metadata };
const fallback = { term: base.term, batches: [], breaks: [], externals: [], issues: [], metadata };
assert.deepEqual(normalizePublicationSnapshot({ ...base, schemaVersion: 4, timeGrid: grid }, fallback)?.snapshot.timeGrid, grid);
assert.equal(normalizePublicationSnapshot({ ...base, schemaVersion: 3 }, fallback)?.snapshot.timeGrid, undefined, "v3 falls back to the legacy grid at projection time");
assert.equal(normalizePublicationSnapshot({ ...base, schemaVersion: 4, timeGrid: { nope: true } }, fallback), null, "a malformed v4 grid is rejected");

console.log("Time grid verification passed.");
