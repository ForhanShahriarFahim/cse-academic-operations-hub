/** OD-01A database-free commitment rules (AC-01–AC-04): validation, level, impact parity, lifecycle and register. */
import assert from "node:assert/strict";
import { analyzeSchedule } from "../src/lib/conflicts";
import { teacherAvailability } from "../src/lib/routine-workbench";
import { EMPTY_GRID } from "../src/lib/time-grid";
import type { ExternalCommitmentView, MeetingView } from "../src/lib/serialize";
import {
  availableCommands, blocksText, changedFields, commitmentClashes, completenessLevel, filterRegister, levelSummary,
  parseCommitmentDates, parseCommitmentInput, parseReason, parseRegisterFilters, planningFactsChanged, registerCounts, registerQuery, reviewReasons,
  type CommitmentFacts,
} from "../src/lib/commitment-records";

const base = { counterpartDepartment: "EEE", dayOfWeek: "1", startTime: "11:30 AM", endTime: "12:45 PM" };
const parsed = (raw: Record<string, unknown>) => { const r = parseCommitmentInput(raw); assert.ok(r.ok, JSON.stringify(!r.ok && r.errors)); return r.value; };
const refused = (raw: Record<string, unknown>) => { const r = parseCommitmentInput(raw); assert.ok(!r.ok, "expected refusal"); return r.errors; };

// AC-02: each choice requires its facts and keeps only the facts that apply.
assert.deepEqual(Object.keys(refused({ ...base, kind: "teaching" })), ["teacherId"]);
assert.deepEqual(Object.keys(refused({ ...base, kind: "room_reservation" })), ["roomId"]);
assert.deepEqual(Object.keys(refused({ ...base, kind: "combined" })).sort(), ["roomId", "teacherId"]);
assert.deepEqual(Object.keys(refused({ kind: "teaching", teacherId: "4" })).sort(), ["counterpartDepartment", "dayOfWeek", "endTime", "startTime"]);
assert.deepEqual(refused({ ...base, kind: "teaching", teacherId: "4", endTime: "11:00 AM" }).endTime, ["End must be after the start."]);
assert.deepEqual(Object.keys(refused({ ...base, kind: "teaching", teacherId: "x" })), ["teacherId"], "a forged id is refused");
assert.deepEqual(Object.keys(refused({ ...base, kind: "teaching", teacherId: "4", credits: "3.25" })), ["credits"]);
assert.deepEqual(Object.keys(refused({ ...base, kind: "bogus" })), ["kind"]);
assert.deepEqual(Object.keys(refused({ kind: "unresolved_note", counterpartDepartment: "CE" })), ["notes"], "a note needs its text");
const room = parsed({ ...base, kind: "room_reservation", roomId: "7", teacherId: "4", credits: "3.0" });
assert.equal(room.teacherId, null, "room-only never stores a teacher"); assert.equal(room.credits, null);
const teaching = parsed({ ...base, kind: "teaching", teacherId: "4", roomId: "7" });
assert.equal(teaching.roomId, null, "teaching elsewhere never blocks our room");
assert.deepEqual([teaching.dayOfWeek, teaching.startMinutes, teaching.endMinutes], [1, 690, 765]);
const note = parsed({ ...base, kind: "unresolved_note", teacherId: "4", roomId: "7", notes: "  CE may need a teacher  ", courseLabel: "CE-1201" });
assert.deepEqual([note.teacherId, note.roomId, note.dayOfWeek, note.startMinutes, note.endMinutes, note.credits], [null, null, null, null, null, null], "an unresolved note fabricates nothing");
assert.equal(note.notes, "CE may need a teacher"); assert.equal(note.courseLabel, "CE-1201");

// AC-04 / D-3: completeness is derived from the facts and is independent of verification.
const facts = (patch: Partial<CommitmentFacts>): CommitmentFacts => ({ ...teaching, ...patch });
assert.equal(completenessLevel(note), "D");
assert.equal(completenessLevel(room), "C");
assert.equal(completenessLevel(facts({})), "B");
assert.equal(completenessLevel(facts({ courseLabel: "EEE-1101", credits: "3.0" })), "A", "teaching no longer needs a room for A");
assert.equal(completenessLevel(facts({ kind: "combined", courseLabel: "PHY", credits: "3.0", roomId: null })), "B");
assert.equal(completenessLevel(facts({ kind: "combined", courseLabel: "PHY", credits: "3.0", roomId: 7 })), "A");
assert.equal(completenessLevel({ kind: "room_reservation", teacherId: 4, roomId: 7, courseLabel: "X", credits: "3" }), "C", "room-only is always C");
assert.equal(completenessLevel({ kind: "teaching", teacherId: null, roomId: null, courseLabel: null, credits: null }), "C");
assert.equal(levelSummary("B", facts({ courseLabel: "EEE-1101" })), "credits missing");

// Legacy rows the form would refuse are labelled, not rewritten.
assert.deepEqual(reviewReasons({ kind: "teaching", teacherId: null, roomId: null, dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }).length, 1);
assert.equal(reviewReasons({ kind: "room_reservation", teacherId: 3, roomId: 7, dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }).length, 1);
assert.equal(reviewReasons({ kind: "room_reservation", teacherId: null, roomId: 7, dayOfWeek: 1, startMinutes: 600, endMinutes: 660 }).length, 0);
assert.equal(reviewReasons({ kind: "unresolved_note", teacherId: null, roomId: null, dayOfWeek: null, startMinutes: null, endMinutes: null }).length, 0);

// D-1: the planning effect in words.
assert.equal(blocksText({ ...room, kind: "room_reservation" }, { room: "NB-301" }), "Room NB-301 only");
assert.equal(blocksText(teaching, { teacher: "SYN-T2" }), "SYN-T2 only");
assert.equal(blocksText({ ...teaching, kind: "combined", roomId: 7 }, { teacher: "SYN-T4", room: "Lab-2" }), "SYN-T4 and room Lab-2");
assert.equal(blocksText(note, {}), "Nothing — unresolved note");

// AC-03: the shared overlap rule matches the conflict engine exactly, including exact-minute edges.
const teacher = { id: 4, shortCode: "SYN-T2", fullName: "Synthetic Teacher Two", homeDepartmentCode: "CSE", designation: null, isExternalCse: false, role: "instructor" };
const lab = { id: 7, code: "Lab-2", building: "NB", roomType: "lab", capabilities: [], capacity: 40 };
const meeting = (id: number, start: number, end: number, patch: Partial<MeetingView> = {}) => ({
  id, teachingGroupId: id, dayOfWeek: 1, startMinutes: start, endMinutes: end, courseCode: `SYN-${id}`, courseTitle: "Synthetic", courseType: "theory",
  courseCredits: 3, requiredRoomCapability: null, owningDepartmentCode: "CSE", deliveryMode: "fixed", isException: false, exceptionNote: null,
  customTimeLabel: null, highlightColor: null, pendingReconciliation: false, teachers: [teacher], rooms: [lab], audiences: [],
  externalAudienceLabel: null, externalStudentCount: null, ...patch,
}) as MeetingView;
const meetings = [meeting(1, 690, 765), meeting(2, 765, 840), meeting(3, 600, 691), meeting(4, 700, 720, { dayOfWeek: 2 }), meeting(5, 700, 720, { teachers: [], rooms: [] })];
const view = (id: number, f: CommitmentFacts): ExternalCommitmentView => ({
  id, kind: f.kind, completenessLevel: completenessLevel(f), counterpartDepartment: f.counterpartDepartment, teacherId: f.teacherId, teacherShortCode: null,
  teacherName: null, roomId: f.roomId, roomCode: null, courseLabel: f.courseLabel, audienceLabel: f.audienceLabel, dayOfWeek: f.dayOfWeek,
  startMinutes: f.startMinutes, endMinutes: f.endMinutes, credits: null, verificationStatus: "pending", source: null, lastVerifiedAt: null, notes: f.notes,
});
const records = [teaching, { ...room, kind: "room_reservation" as const }, { ...teaching, kind: "combined" as const, roomId: 7 }, note,
  { ...teaching, teacherId: null }, { ...room, roomId: null }];
records.forEach((record, index) => {
  const engine = analyzeSchedule({ meetings, externals: [view(index + 1, record)], breaks: [], windows: [] })
    .filter((issue) => issue.type === "external_teacher_conflict" || issue.type === "external_room_conflict")
    .map((issue) => `${issue.type === "external_teacher_conflict" ? "teacher" : "room"}:${issue.meetingIds[0]}`).sort();
  const preview = commitmentClashes(record, meetings).map((clash) => `${clash.on}:${clash.meetingId}`).sort();
  assert.deepEqual(preview, engine, `record ${index + 1}`);
});
assert.deepEqual(commitmentClashes(teaching, meetings).map((c) => c.meetingId), [1, 3], "touching ends do not clash; one shared minute does");

const bounds = { termStart: "2027-01-01", termEnd: "2027-02-28" };
const dates = { effectiveFrom: "2027-01-03", effectiveTo: "2027-01-10" }; // Sunday
const bounded = { ...teaching, ...dates };
assert.deepEqual(parseCommitmentDates(dates, 1, bounds).errors, {});
assert.ok(parseCommitmentDates({ effectiveFrom: dates.effectiveFrom }, 1, bounds).errors.effectiveTo);
assert.ok(parseCommitmentDates({ ...dates, effectiveFrom: "2026-12-27" }, 1, bounds).errors.effectiveFrom);
assert.ok(parseCommitmentDates({ effectiveFrom: "2027-01-04", effectiveTo: "2027-01-09" }, 1, bounds).errors.effectiveTo);
const record = { ...view(100, bounded), ...dates };
const repeats = [meeting(10, 690, 765), meeting(11, 690, 765), meeting(12, 690, 765)];
const datesByMeeting = {
  10: { effectiveFrom: "2027-01-10", effectiveTo: "2027-01-17" },
  11: { effectiveFrom: "2027-01-11", effectiveTo: null },
  12: { effectiveFrom: "2027-01-04", effectiveTo: "2027-01-09" },
};
const schedule = { meetings: repeats, externals: [record], breaks: [], windows: [], grid: EMPTY_GRID, maintenance: { ...bounds, meetingDates: datesByMeeting, entries: [] } };
assert.deepEqual(commitmentClashes(bounded, repeats.map((m) => ({ ...m, ...datesByMeeting[m.id as keyof typeof datesByMeeting] })), bounds).map((clash) => clash.meetingId), [10]);
assert.deepEqual(analyzeSchedule(schedule).filter((issue) => issue.type === "external_teacher_conflict").flatMap((issue) => issue.meetingIds), [10]);
assert.equal(teacherAvailability(teacher.id, 1, 690, 765, { ...schedule, meetings: [] }, 10).state, "external");
assert.equal(teacherAvailability(teacher.id, 1, 690, 765, { ...schedule, meetings: [] }, 11).state, "free");
assert.equal(planningFactsChanged(teaching, bounded), true);

// D-4: planning facts and lifecycle availability.
const relabelled: CommitmentFacts = { ...teaching, courseLabel: "X" };
assert.equal(planningFactsChanged(teaching, relabelled), false);
assert.equal(planningFactsChanged(teaching, { ...teaching, endMinutes: 780 }), true);
assert.deepEqual(changedFields({ ...teaching, credits: "3.00" }, { ...teaching, credits: "3.0", notes: "x" }), ["notes"], "numerically equal credits are unchanged");
assert.deepEqual(availableCommands({ kind: "teaching", lifecycleStatus: "active", verificationStatus: "pending" }), ["edit", "verify", "archive", "delete"]);
assert.deepEqual(availableCommands({ kind: "teaching", lifecycleStatus: "active", verificationStatus: "verified" }), ["edit", "return", "archive", "delete"]);
assert.deepEqual(availableCommands({ kind: "unresolved_note", lifecycleStatus: "active", verificationStatus: "pending" }), ["resolve", "archive", "delete"], "a note cannot be verified");
assert.deepEqual(availableCommands({ kind: "teaching", lifecycleStatus: "archived", verificationStatus: "verified" }), ["reactivate", "delete"]);
assert.equal(parseReason("  ok  "), "ok"); assert.equal(parseReason(" "), null); assert.equal(parseReason("x".repeat(301)), null); assert.equal(parseReason("a\u0007b"), null);

// AC-01: register filters and counts reconcile with the rows.
const rows = [
  { id: 1, kind: "room_reservation", lifecycleStatus: "active", verificationStatus: "verified", counterpartDepartment: "MATH", courseLabel: null, audienceLabel: null, notes: "Source cell" },
  { id: 2, kind: "teaching", lifecycleStatus: "active", verificationStatus: "pending", counterpartDepartment: "EEE", courseLabel: "EEE-1101", audienceLabel: "EEE 1st year", notes: null },
  { id: 3, kind: "unresolved_note", lifecycleStatus: "active", verificationStatus: "pending", counterpartDepartment: "CE", courseLabel: null, audienceLabel: null, notes: "maybe" },
  { id: 4, kind: "combined", lifecycleStatus: "archived", verificationStatus: "verified", counterpartDepartment: "PHY", courseLabel: "PHY-2105", audienceLabel: null, notes: null },
];
assert.deepEqual(registerCounts(rows), { active: 3, pending: 2, verified: 1, unresolved: 1, archived: 1 });
const ids = (raw: Record<string, string>) => filterRegister(rows, parseRegisterFilters(raw)).map((r) => r.id);
assert.deepEqual(ids({}), [1, 2, 3], "Active by default");
assert.deepEqual(ids({ state: "archived" }), [4]);
assert.deepEqual(ids({ state: "all", verification: "verified" }), [1, 4]);
assert.deepEqual(ids({ kind: "teaching" }), [2]);
assert.deepEqual(ids({ q: "eee 1st" }), [2]);
assert.deepEqual(ids({ state: "bogus", kind: "bogus", verification: "bogus" }), [1, 2, 3], "invalid filters fall back");
assert.equal(registerQuery(parseRegisterFilters({ state: "all", q: "PHY" })), "?state=all&q=PHY");
assert.equal(registerQuery(parseRegisterFilters({})), "");

console.log("OD-01A commitment rules: per-choice validation, D-3 levels, legacy review labels, engine/preview overlap parity, lifecycle availability and register filters/counts pass.");
