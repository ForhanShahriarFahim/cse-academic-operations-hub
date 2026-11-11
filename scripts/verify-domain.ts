import assert from "node:assert/strict";
import "./verify-room-records";
import { attendanceMark, parseStudentCsv, summarizeAttendance } from "../src/lib/attendance";
import { csvCell } from "../src/lib/routine-csv";
import { computeWorkloads } from "../src/lib/workload";
import { amountInWords, isExtraLoadEligible, paymentForClasses } from "../src/lib/extra-load";

const roster = parseStudentCsv(`STUDENT'S ID,STUDENT'S NAME,PHONE NUMBER,Department,Audience Type
0322320205101068,Mst. Antana Fahmida,01819946506,CSE,local
EXT-EEE-001,"Example, External Student",01700000000,EEE,merged`);

assert.equal(roster.length, 2);
assert.equal(roster[0].studentCode, "0322320205101068");
assert.equal(roster[1].fullName, "Example, External Student");
assert.equal(roster[1].audienceType, "merged");

assert.equal(attendanceMark(["present", "late", "absent", "excused"], 10), 6.67);
assert.equal(attendanceMark(["present", "absent"], 5), 2.5);
assert.equal(attendanceMark(["excused"], 10), 0);

const capturedSessions = [
  { phase: "midterm", records: [{ studentId: 1, status: "present" }] },
  { phase: "final", records: [{ studentId: 1, status: "absent" }, { studentId: 2, status: "present" }] },
];
assert.deepEqual(summarizeAttendance(2, capturedSessions, 10), {
  studentId: 2, midterm: { attended: 0, total: 0 }, final: { attended: 1, total: 1 },
  semester: { attended: 1, total: 1, percentage: 100 }, mark: 10, maximum: 10,
});
assert.equal(summarizeAttendance(1, capturedSessions, 10).mark, 5, "explicit absence still counts");
assert.equal(summarizeAttendance(2, capturedSessions, 5).mark, 5, "sessional maximum");
for (const sessions of [[], [{ phase: "midterm", records: [{ studentId: 2, status: "excused" }] }]]) {
  assert.deepEqual(summarizeAttendance(2, sessions, 10).semester, { attended: 0, total: 0, percentage: 0 });
  assert.equal(summarizeAttendance(2, sessions, 10).mark, 0);
}
assert.equal(summarizeAttendance(999, capturedSessions, 10).mark, 0, "no captured records");
const mixed = ["present", "late", "absent", "excused"].map((status) => ({ phase: "midterm", records: [{ studentId: 2, status }] }));
assert.equal(summarizeAttendance(2, mixed, 10).mark, 6.67);
assert.equal(summarizeAttendance(2, mixed, 10).semester.percentage, 66.7);

assert.equal(isExtraLoadEligible(15, 15), false);
assert.equal(isExtraLoadEligible(15.01, 15), true);
assert.equal(paymentForClasses(4, 200), 800);
assert.equal(paymentForClasses(4, 200, 750), 750);
assert.equal(amountInWords(800), "Eight Hundred taka only");
assert.equal(amountInWords(125_600), "One Lakh Twenty-Five Thousand Six Hundred taka only");

// HARDEN-01 AC-02: spreadsheet formulas in exported text stay text; other cells are unchanged.
assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
assert.equal(csvCell("+1"), "'+1");
assert.equal(csvCell("-1"), "'-1");
assert.equal(csvCell("@cmd"), "'@cmd");
assert.equal(csvCell("CSE-1101"), "CSE-1101");
assert.equal(csvCell("Room A, Lab"), "\"Room A, Lab\"");
assert.equal(csvCell(-5), "-5");
assert.equal(csvCell(null), "");

// HARDEN-01 AC-01: catalog credits come from the course record, never from code text.
const allocation = (courseCode: string, courseCredits: number | null) => ({ id: 1, teacherId: 7, units: 2, allocationMethod: "sole", policyNote: null,
  courseCode, courseTitle: "Synthetic", courseCredits, teachingGroupId: 1, externalDepartment: null, externalCommitmentId: null });
assert.equal(computeWorkloads([], [allocation("CSE-1102", 1)], () => false).get(7)!.catalogCredits, 1);
assert.equal(computeWorkloads([], [allocation("CSE-4000(B)", 6)], () => false).get(7)!.catalogCredits, 6);
assert.equal(computeWorkloads([], [allocation("CSE-4000(A)", null)], () => false).get(7)!.catalogCredits, 0);
assert.equal(computeWorkloads([], [allocation("CSE-1102", 1), { ...allocation("CSE-1102", 1), id: 2 }], () => false).get(7)!.catalogCredits, 1);

console.log("Domain verification passed: workload credits, CSV cells, CSV import, attendance, eligibility, payment, and amount wording.");
