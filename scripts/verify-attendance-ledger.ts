/** ATT-05 database-free ledger projection, filters and CSV (AC-01–AC-04). Expected values are written out by hand. */
import assert from "node:assert/strict";
import {
  buildLedger, ledgerBlocks, ledgerCsv, ledgerDay, ledgerFilterQuery, ledgerTeacherOptions, parseLedgerQuery,
  type LedgerFilters, type LedgerSessionInput,
} from "../src/lib/attendance-ledger";
import { safeCsvCell } from "../src/lib/csv-safe";

const term = { startDate: "2026-06-01", endDate: "2026-09-30" };
const all: LedgerFilters = { phase: "all", teacher: "all", from: term.startDate, to: term.endDate };
const session = (id: number, date: string, phase: string, state: string, teacherId: number | null, start: number | null = 540): LedgerSessionInput => ({
  id, date, phase, state, startMinutes: start, endMinutes: start == null ? null : start + 75, voidReason: state === "voided" ? "Duplicate entry" : null,
  teacherId, teacherCode: teacherId ? `T${teacherId}` : null, teacherName: teacherId ? `Teacher ${teacherId}` : null,
});
// Deliberately unordered input; 11 Jul has no time and sorts after the timed 11 Jul class.
const sessions = [
  session(5, "2026-07-11", "final", "reopened", 2),
  session(1, "2026-06-13", "midterm", "locked", 1),
  session(3, "2026-06-27", "midterm", "voided", 2),
  session(2, "2026-06-20", "midterm", "submitted", 1),
  session(4, "2026-07-11", "final", "draft", null, null),
];
const students = [
  { id: 10, code: "SYN-0001", name: "One", onRoster: true, enrolled: true },
  { id: 11, code: "SYN-0002", name: "Two", onRoster: true, enrolled: true },
  { id: 12, code: "SYN-0003", name: "Removed", onRoster: false, enrolled: false },
  { id: 13, code: "SYN-0004", name: "Joined late", onRoster: true, enrolled: true },
  { id: 14, code: "SYN-0005", name: "Never captured, not enrolled", onRoster: false, enrolled: false },
];
const r = (sessionId: number, studentId: number, status: string) => ({ sessionId, studentId, status });
const records = [
  r(1, 10, "present"), r(1, 11, "present"), r(1, 12, "present"),
  r(2, 10, "absent"), r(2, 11, "excused"), r(2, 12, "absent"),
  r(3, 10, "present"), r(3, 11, "present"),
  r(5, 10, "late"), r(5, 11, "present"), r(5, 13, "absent"),
  r(4, 10, "present"), r(4, 11, "present"), r(4, 13, "present"),
];

const ledger = buildLedger({ sessions, records, students, filters: all, activeTerm: true });
assert.deepEqual(ledger.rows.map(row => row.id), [1, 2, 3, 5, 4], "date, timed-before-untimed, then id");
assert.deepEqual(ledger.rows.map(row => [row.day, row.counts, row.notCaptured, row.percentage, row.provisional]), [
  ["Sat", { present: 3, late: 0, absent: 0, excused: 0 }, 1, 100, false],
  ["Sat", { present: 0, late: 0, absent: 2, excused: 1 }, 1, 0, false],
  ["Sat", null, null, null, false],
  ["Sat", { present: 1, late: 1, absent: 1, excused: 0 }, 0, 66.7, true],
  ["Sat", { present: 3, late: 0, absent: 0, excused: 0 }, 0, 100, true],
]);
assert.deepEqual(ledger.summary, {
  classesHeld: 4, provisional: 2, voided: 1, teachers: 2, notRecorded: 1,
  present: 7, late: 1, absent: 3, excused: 1, attended: 8, eligible: 11, percentage: 72.7,
});
assert.deepEqual(ledger.columns.map(column => column.id), [1, 2, 5, 4], "voided sessions are not matrix columns");
assert.deepEqual(ledger.matrix.map(row => [row.code, row.notOnRoster, row.cells, row.attended, row.eligible, row.percentage]), [
  ["SYN-0001", false, ["present", "absent", "late", "present"], 3, 4, 75],
  ["SYN-0002", false, ["present", "excused", "present", "present"], 3, 3, 100],
  ["SYN-0003", true, ["present", "absent", null, null], 1, 2, 50],
  ["SYN-0004", false, [null, null, "absent", "present"], 1, 2, 50],
]);
console.log("Ledger rows, summary and matrix reconcile for late, excused, uncaptured, voided, untimed, unrecorded-teacher and removed-student cases.");

// Filters narrow rows, summary and matrix together; a removed student vanishes once their sessions are filtered out.
const finals = buildLedger({ sessions, records, students, filters: { ...all, phase: "final" }, activeTerm: true });
assert.deepEqual([finals.rows.map(row => row.id), finals.summary.classesHeld, finals.matrix.map(row => row.code)],
  [[5, 4], 2, ["SYN-0001", "SYN-0002", "SYN-0004"]]);
const teacherOne = buildLedger({ sessions, records, students, filters: { ...all, teacher: 1 }, activeTerm: true });
assert.deepEqual([teacherOne.rows.map(row => row.id), teacherOne.summary.percentage], [[1, 2], 60]);
const unrecorded = buildLedger({ sessions, records, students, filters: { ...all, teacher: "none" }, activeTerm: true });
assert.deepEqual(unrecorded.rows.map(row => row.id), [4]);
const june = buildLedger({ sessions, records, students, filters: { ...all, from: "2026-06-20", to: "2026-06-27" }, activeTerm: true });
assert.deepEqual([june.rows.map(row => row.id), june.summary.voided, june.summary.classesHeld], [[2, 3], 1, 1]);
const empty = buildLedger({ sessions: [], records: [], students, filters: all, activeTerm: true });
assert.deepEqual([empty.summary.classesHeld, empty.summary.percentage, empty.matrix.map(row => [row.code, row.eligible, row.percentage])],
  [0, null, [["SYN-0001", 0, null], ["SYN-0002", 0, null], ["SYN-0004", 0, null]]]);
console.log("Phase, teacher, unrecorded-teacher and date filters narrow every part of one projection.");

// A completed term has no current roster: no "Not captured" counts or labels; enrolled students stay, captured ones are added.
const archive = buildLedger({ sessions, records, students: students.map(student => ({ ...student, onRoster: false })), filters: all, activeTerm: false });
assert.deepEqual(archive.rows.map(row => row.notCaptured), [null, null, null, null, null]);
assert.deepEqual(archive.matrix.map(row => [row.code, row.notOnRoster]), [["SYN-0001", false], ["SYN-0002", false], ["SYN-0003", false], ["SYN-0004", false]]);
console.log("Completed-term projection shows enrolled and captured students without current-roster labels.");

// Query parsing: valid filters round-trip; any invalid value falls back to the whole term and is reported.
const teachers = ledgerTeacherOptions(sessions);
assert.deepEqual(teachers, [{ value: "1", label: "T1 · Teacher 1" }, { value: "2", label: "T2 · Teacher 2" }, { value: "none", label: "Not recorded" }]);
assert.deepEqual(parseLedgerQuery({}, term, teachers), { view: "sessions", filters: all, invalid: false });
const parsed = parseLedgerQuery({ view: "students", phase: "midterm", teacher: "2", from: "2026-06-10", to: "2026-07-01" }, term, teachers);
assert.deepEqual(parsed, { view: "students", invalid: false, filters: { phase: "midterm", teacher: 2, from: "2026-06-10", to: "2026-07-01" } });
assert.deepEqual(ledgerFilterQuery(parsed.filters, term), { phase: "midterm", teacher: "2", from: "2026-06-10", to: "2026-07-01" });
assert.deepEqual(ledgerFilterQuery(all, term), { phase: undefined, teacher: undefined, from: undefined, to: undefined });
assert.equal(parseLedgerQuery({ teacher: "none" }, term, teachers).filters.teacher, "none");
for (const bad of [{ phase: "semester" }, { teacher: "99" }, { teacher: "1.5" }, { from: "2026-05-31" }, { to: "2026-10-01" },
  { from: "2026-07-01", to: "2026-06-01" }, { from: "2026-02-30" }, { from: "20260601" }, { view: "matrix" }, { phase: ["final", "midterm"] }]) {
  assert.deepEqual(parseLedgerQuery(bad, term, teachers), { view: "sessions", filters: all, invalid: true }, JSON.stringify(bad));
}
assert.deepEqual(parseLedgerQuery({ view: "students", phase: "x" }, term, teachers).view, "students", "a valid tab survives a bad filter");
assert.equal(ledgerDay("2026-06-14"), "Sun");
assert.equal(ledgerDay("2027-01-01"), "Fri");
console.log("Ledger filters parse, round-trip and fall back to the full term for invalid, unknown and out-of-term values.");

// CSV renders the same projection: totals equal the screen summary and student cells are full words.
const heading = { term: "Summer 2026", course: "SYN-2101 · Synthetic Theory", audience: "HSC 22B", groupId: 7, filters: "All", generated: "19 November 2026" };
const csv = ledgerCsv("sessions", ledger, heading);
assert.ok(csv.startsWith("﻿\"Report\""), "byte order mark and quoted cells");
assert.ok(csv.includes('"2026-06-27","Sat","09:00–10:15","Midterm","T2","","","","","","","Voided","Duplicate entry"'));
assert.ok(csv.includes('"2026-07-11","Sat","","Final","Not recorded","3","0","0","0","0","100.0","Draft (provisional)",""'));
assert.ok(csv.trimEnd().endsWith('"Total","","","","","7","1","3","1","","72.7","4 classes held",""'));
const matrixCsv = ledgerCsv("students", ledger, heading);
assert.ok(matrixCsv.includes('"Student ID","Student Name","Roster","2026-06-13 09:00–10:15 Midterm","2026-06-20 09:00–10:15 Midterm","2026-07-11 09:00–10:15 Final","2026-07-11 Final","Attended","Eligible","Attendance %"'));
assert.ok(matrixCsv.includes('"SYN-0003","Removed","Not on current roster","Present","Absent","Not captured","Not captured","1","2","50.0"'));
assert.equal(safeCsvCell("=SUM(A1)"), "\"'=SUM(A1)\"");
assert.equal(safeCsvCell(" ＋cmd"), "\"' ＋cmd\"");
assert.equal(safeCsvCell(-1), "\"-1\"", "numbers are never prefixed");
const hostile = ledgerCsv("students", buildLedger({ sessions, records, filters: all, activeTerm: true,
  students: [{ id: 10, code: "@SYN", name: "=HYPERLINK(\"x\")", onRoster: true, enrolled: true }] }), heading);
assert.ok(hostile.includes('"\'@SYN","\'=HYPERLINK(""x"")"'));
console.log("Ledger CSV matches the projection totals, uses full status words and neutralizes spreadsheet formulas.");

assert.deepEqual(ledgerBlocks([1, 2, 3], 2), [[1, 2], [3]]);
assert.deepEqual(ledgerBlocks(Array.from({ length: 32 }, (_, i) => i)).map(block => block.length), [16, 16]);
assert.deepEqual(ledgerBlocks([]), [[]]);
console.log("Matrix print splits into blocks of at most 16 sessions.");
