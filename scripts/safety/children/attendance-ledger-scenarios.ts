import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { SpringFixture, SummerFixture } from "../fixture";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const { getAttendanceLedger } = loadApp<typeof import("../../../src/lib/attendance-ledger-data")>("src/lib/attendance-ledger-data.ts");
const { getAttendanceMarks } = loadApp<typeof import("../../../src/lib/attendance-marks")>("src/lib/attendance-marks.ts");
const exportRoute = loadApp<typeof import("../../../src/app/(portal)/attendance/ledger/export/route")>("src/app/(portal)/attendance/ledger/export/route.ts");
const { summer, spring } = JSON.parse(process.argv[2]) as { summer: SummerFixture; spring: SpringFixture };
const [one, two, visiting] = summer.studentIds;
const [teacherA, teacherB] = summer.teacherIds;
const active = { termId: spring.termId, groupId: spring.mergedGroupId };
const archived = { termId: summer.termId, groupId: summer.mergedGroupId };
type Query = Record<string, string>;
const ledger = async (target: typeof active, query: Query = {}) => {
  const result = await getAttendanceLedger(target.termId, target.groupId, query);
  assert.equal(result.kind, "ledger");
  return result;
};
const csv = async (target: typeof active, query: Query = {}) =>
  exportRoute.GET(new Request(`http://localhost/attendance/ledger/export?${new URLSearchParams({ term: String(target.termId), group: String(target.groupId), ...query })}`));

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  // Fixture: 9 Jan midterm draft by teacher A (one late, visiting present). Add a submitted session by teacher B,
  // a voided duplicate and an untimed final with no recorded teacher where the visiting student was not captured.
  const add = async (values: Partial<typeof s.attendanceSessions.$inferInsert>, records: Array<[number, string]>) => {
    const [session] = await db.insert(s.attendanceSessions).values({ termId: active.termId, teachingGroupId: active.groupId, classDate: "2027-01-01", ...values }).returning();
    if (records.length) await db.insert(s.attendanceRecords).values(records.map(([studentId, status]) => ({ sessionId: session.id, studentId, status })));
  };
  await add({ classDate: "2027-01-16", phase: "midterm", startMinutes: 630, endMinutes: 705, teacherId: teacherB, status: "submitted", submittedAt: new Date(), submittedByUserId: summer.adminUserId },
    [[one, "present"], [visiting, "excused"]]);
  await add({ classDate: "2027-01-23", phase: "midterm", startMinutes: 630, endMinutes: 705, teacherId: teacherA, status: "voided", voidReason: "Synthetic duplicate",
    voidedAt: new Date(), voidedByUserId: summer.adminUserId, submittedAt: new Date(), submittedByUserId: summer.adminUserId },
    [[one, "present"], [visiting, "present"]]);
  await add({ classDate: "2027-02-06", phase: "final" }, [[one, "absent"]]);

  const full = await ledger(active);
  assert.deepEqual(full.ledger.rows.map(row => [row.date, row.teacherCode, row.counts, row.notCaptured, row.percentage, row.state]), [
    ["2027-01-09", full.ledger.rows[0].teacherCode, { present: 1, late: 1, absent: 0, excused: 0 }, 0, 100, "draft"],
    ["2027-01-16", full.ledger.rows[1].teacherCode, { present: 1, late: 0, absent: 0, excused: 1 }, 0, 100, "submitted"],
    ["2027-01-23", full.ledger.rows[2].teacherCode, null, null, null, "voided"],
    ["2027-02-06", null, { present: 0, late: 0, absent: 1, excused: 0 }, 1, 0, "draft"],
  ]);
  assert.deepEqual([full.ledger.summary.classesHeld, full.ledger.summary.voided, full.ledger.summary.provisional, full.ledger.summary.teachers,
    full.ledger.summary.notRecorded, full.ledger.summary.attended, full.ledger.summary.eligible, full.ledger.summary.percentage], [3, 1, 2, 2, 1, 3, 4, 75]);
  assert.deepEqual(full.teacherOptions.map(option => option.value), [...full.teacherOptions.filter(option => option.value !== "none").map(option => option.value), "none"]);
  assert.equal(full.teacherOptions.length, 3);
  assert.equal(full.canOpenSessions, true);
  lines.push("Active ledger lists every session with recorded teacher, counts, not-captured roster students and lifecycle; voided sessions are excluded from the summary.");

  // AC-03: unfiltered and phase-filtered matrix rows agree with ATT-04 for every roster student.
  for (const [phase, filter] of [["semester", "all"], ["midterm", "midterm"], ["final", "final"]] as const) {
    const marks = await getAttendanceMarks({ ...active, phase });
    assert.equal(marks.kind, "marks");
    const matrix = (await ledger(active, filter === "all" ? {} : { phase: filter })).ledger.matrix;
    assert.deepEqual(marks.rows.map(row => [row.id, row.attended, row.total, row.percentage]),
      matrix.filter(row => !row.notOnRoster).map(row => [row.id, row.attended, row.eligible, row.percentage]), phase);
  }
  lines.push("Matrix totals agree with ATT-04 Semester, Midterm and Final marks for the same group.");

  // AC-02: filters narrow screen and CSV identically; invalid filters fall back to the whole term.
  const byTeacher = await ledger(active, { teacher: String(teacherB) });
  assert.deepEqual([byTeacher.ledger.rows.map(row => row.date), byTeacher.filters.teacher], [["2027-01-16"], teacherB]);
  const untimed = await ledger(active, { teacher: "none", from: "2027-02-01", to: "2027-02-28" });
  assert.deepEqual(untimed.ledger.rows.map(row => row.date), ["2027-02-06"]);
  const fallback = await ledger(active, { phase: "semester", from: "2026-01-01" });
  assert.deepEqual([fallback.invalid, fallback.ledger.rows.length], [true, 4]);
  const finalCsv = await csv(active, { phase: "final", view: "sessions" });
  assert.equal(finalCsv.status, 200);
  assert.equal(finalCsv.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(finalCsv.headers.get("x-content-type-options"), "nosniff");
  assert.match(finalCsv.headers.get("content-disposition") ?? "", /attendance-ledger-sessions-term-\d+-group-\d+-2027-01-02-to-2027-04-30\.csv/);
  const finalText = await finalCsv.text();
  assert.ok(finalText.includes('"Filters","Final · All teachers · 2027-01-02 to 2027-04-30"'));
  assert.ok(finalText.includes('"Total","","","","","0","0","1","0","","0.0","1 class held",""'));
  assert.ok(!finalText.includes("2027-01-16"));
  const studentsCsv = await (await csv(active, { view: "students" })).text();
  assert.ok(studentsCsv.includes('"SYN-0001","Synthetic Student One","","Late","Present","Absent","2","3","66.7"'), studentsCsv);
  assert.ok(!/phone|\+000/i.test(studentsCsv), "no contact fields");
  lines.push("Teacher, unrecorded-teacher, date and phase filters narrow the screen projection and CSV identically; invalid filters fall back to the term.");

  // Removing a student after capture keeps their records in counts and the matrix, labelled.
  await db.update(s.courseEnrollments).set({ status: "removed" }).where(and(
    eq(s.courseEnrollments.teachingGroupId, active.groupId), eq(s.courseEnrollments.studentId, one)));
  const removed = await ledger(active);
  assert.deepEqual(removed.ledger.rows.map(row => row.counts), full.ledger.rows.map(row => row.counts));
  assert.deepEqual(removed.ledger.matrix.map(row => [row.id, row.notOnRoster, row.attended, row.eligible]), [[one, true, 2, 3], [visiting, false, 1, 1]]);
  assert.ok((await (await csv(active, { view: "students" })).text()).includes('"Synthetic Student One","Not on current roster"'));
  lines.push("A student removed after capture keeps their dated records in session counts, matrix and CSV, labelled as not on the current roster.");

  // AC-07: completed term stays readable and unchanged after removal and deactivation; no correction links.
  const before = await ledger(archived);
  assert.equal(before.canOpenSessions, false);
  assert.deepEqual(before.ledger.rows.map(row => row.notCaptured), [null]);
  await db.update(s.courseEnrollments).set({ status: "removed" }).where(and(
    eq(s.courseEnrollments.teachingGroupId, archived.groupId), eq(s.courseEnrollments.studentId, one)));
  await db.update(s.students).set({ status: "inactive" }).where(eq(s.students.id, one));
  const after = await ledger(archived);
  assert.deepEqual(after.ledger, before.ledger);
  assert.deepEqual(after.ledger.matrix.map(row => row.code), ["SYN-0001", "SYN-0002", "SYN-9001"]);
  lines.push("Completed-term ledger is read-only and unchanged after a student is removed and deactivated.");

  // AC-05: forged pairs and unauthorized actors read nothing, through the loader and the CSV route.
  assert.equal((await getAttendanceLedger(active.termId, archived.groupId, {})).kind, "missing");
  assert.equal((await getAttendanceLedger(archived.termId, active.groupId, {})).kind, "missing");
  assert.equal((await getAttendanceLedger(active.termId, 2147483647, {})).kind, "missing");
  assert.equal((await csv({ termId: active.termId, groupId: archived.groupId })).status, 404);
  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.id, summer.teacherUserId));
  for (const [email, role, departmentId] of [
    ["viewer@example.invalid", "read_only_viewer", null],
    ["out-of-scope@example.invalid", "academic_administrator", summer.departmentIds.eee],
    ["in-scope@example.invalid", "academic_administrator", summer.departmentIds.cse],
  ] as const) {
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: role, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId, grantedByUserId: summer.adminUserId });
  }
  for (const [email, expected, status] of [
    [null, "sign-in", 401], ["viewer@example.invalid", "missing", 404], ["out-of-scope@example.invalid", "denied", 403],
    ["teacher-a@example.invalid", "ledger", 200], ["in-scope@example.invalid", "ledger", 200],
  ] as const) {
    signInAs(email);
    assert.equal((await getAttendanceLedger(archived.termId, archived.groupId, {})).kind, expected, email ?? "anonymous");
    const response = await csv(archived);
    assert.equal(response.status, status, `${email ?? "anonymous"} CSV`);
    if (status !== 200) assert.ok(!(await response.text()).includes("SYN-"), "refusals reveal no students");
  }
  lines.push("Anonymous, viewer, out-of-department and forged term/group requests are refused by the loader and CSV route; the assigned teacher and in-department administrator can read.");
  void two;
  report({ lines });
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
