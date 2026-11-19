import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { SpringFixture, SummerFixture } from "../fixture";
import type { AttendancePhase } from "../../../src/lib/attendance";

const database = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const { db } = database;
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const { lockTermContext } = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const { getAttendanceMarks } = loadApp<typeof import("../../../src/lib/attendance-marks")>("src/lib/attendance-marks.ts");
const { getAttendanceData } = loadApp<typeof import("../../../src/lib/academic-operations")>("src/lib/academic-operations.ts");
const { summer, spring } = JSON.parse(process.argv[2]) as { summer: SummerFixture; spring: SpringFixture };
const [student, absent] = summer.studentIds;
const active = { termId: spring.termId, groupId: spring.mergedGroupId };
const archived = { termId: summer.termId, groupId: summer.mergedGroupId };
const marks = async (target: typeof active, phase: AttendancePhase = "semester", studentId?: number) => {
  const result = await getAttendanceMarks({ ...target, phase, studentId });
  assert.equal(result.kind, "marks");
  return result;
};

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  const [approver] = await db.insert(s.portalUsers).values({
    email: "approver@example.invalid", displayName: "Policy Approver", status: "active",
  }).returning();
  await db.insert(s.academicPolicyVersions).values({
    termId: summer.termId, version: 2, status: "approved", effectiveFrom: "2026-08-01",
    extraClassRate: "200", extraLoadThresholdCredits: "15", theoryAttendanceMarks: "12", sessionalAttendanceMarks: "6",
    reason: "Synthetic historic policy", proposedByUserId: summer.adminUserId, proposalFingerprint: "synthetic",
    decidedByUserId: approver.id, decidedAt: new Date(), decisionFingerprint: "synthetic",
  });

  // Four final sessions exercise a counted absence and three reasons for exclusion.
  for (const [index, status] of ["absent", "excused", null, "present"].entries()) {
    const voided = index === 3;
    const [session] = await db.insert(s.attendanceSessions).values({
      termId: active.termId, teachingGroupId: active.groupId, classDate: `2027-02-0${index + 1}`,
      startMinutes: 540, endMinutes: 600, phase: "final",
      ...(voided ? { status: "voided", voidReason: "Synthetic excluded session",
        voidedAt: new Date(), voidedByUserId: summer.adminUserId, submittedAt: new Date(), submittedByUserId: summer.adminUserId } : {}),
    }).returning();
    if (status) await db.insert(s.attendanceRecords).values({ sessionId: session.id, studentId: student, status });
  }
  const summary = await marks(active);
  const detail = await marks(active, "final", student);
  assert.deepEqual(detail.evidence.map(row => [row.attended, row.total, row.explanation]), [
    [0, 1, "+1 eligible"], [0, 0, "Excused"], [0, 0, "Student was not captured"], [0, 0, "Voided session"],
  ]);
  assert.equal(detail.provisional, 3);
  assert.equal(detail.rows.length, 1);
  assert.deepEqual(detail.rows.map(row => [row.attended, row.total, row.percentage, row.mark]), [[0, 1, 0, 0]]);
  assert.deepEqual((await marks(active, "midterm", student)).rows.map(row => [row.attended, row.total, row.mark]), [[1, 1, 10]]);
  assert.deepEqual(summary.rows.find(row => row.id === student), {
    id: student, code: "SYN-0001", name: "Synthetic Student One", attended: 1, total: 2, percentage: 50, mark: 5,
  });
  const legacy = await getAttendanceData(active.groupId);
  assert.deepEqual(summary.rows.map(row => [row.id, row.attended, row.total, row.mark]),
    legacy.summaries.map(row => [row.studentId, row.semester.attended, row.semester.total, row.mark]));
  assert.equal((await marks({ termId: summer.termId, groupId: summer.sessionalGroupId })).maximum, 6);
  await db.update(s.academicPolicies).set({ theoryAttendanceMarks: "0" }).where(eq(s.academicPolicies.termId, spring.termId));
  assert.equal((await marks(active)).maximum, 0);
  await db.delete(s.academicPolicies).where(eq(s.academicPolicies.termId, spring.termId));
  const missingPolicy = await marks(active, "semester", student);
  assert.deepEqual([missingPolicy.rows[0].total, missingPolicy.rows[0].mark, missingPolicy.version], [2, null, null]);
  lines.push("Independent phase counts and captured evidence cover late, absent, excused, uncaptured, voided and working sessions. Semester agrees with the old summary. Theory, sessional, zero and missing policy behave distinctly.");

  const old = await marks(archived, "semester", student);
  assert.deepEqual([old.maximum, old.version, old.effectiveFrom, old.evaluationDate, old.rows[0].mark], [12, 2, "2026-08-01", "2026-09-30", 12]);
  await db.update(s.courseEnrollments).set({ status: "removed" }).where(and(
    eq(s.courseEnrollments.teachingGroupId, archived.groupId), eq(s.courseEnrollments.studentId, student),
  ));
  await db.update(s.students).set({ status: "inactive" }).where(eq(s.students.id, student));
  assert.deepEqual((await marks(archived, "semester", student)).rows, old.rows);
  assert.equal((await getAttendanceMarks({ ...active, phase: "semester", studentId: student })).kind, "missing");
  assert.equal((await getAttendanceMarks({ ...active, phase: "semester", studentId: absent })).kind, "missing");
  assert.equal((await getAttendanceMarks({ ...active, groupId: archived.groupId, phase: "semester" })).kind, "missing");
  lines.push("Archive retains the original end-date policy and captured student after removal and deactivation. Unrelated and cross-term identifiers return no marks.");

  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.id, summer.teacherUserId));
  for (const [email, role, departmentId] of [
    ["viewer@example.invalid", "read_only_viewer", null],
    ["out-of-scope@example.invalid", "academic_administrator", summer.departmentIds.eee],
    ["in-scope@example.invalid", "academic_administrator", summer.departmentIds.cse],
  ] as const) {
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: role, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId, grantedByUserId: summer.adminUserId });
  }
  for (const [email, expected] of [
    [null, "sign-in"], ["viewer@example.invalid", "missing"], ["out-of-scope@example.invalid", "denied"],
    ["teacher-a@example.invalid", "marks"], ["in-scope@example.invalid", "marks"],
  ] as const) {
    signInAs(email);
    assert.equal((await getAttendanceMarks({ ...archived, phase: "semester", studentId: student })).kind, expected, email ?? "anonymous");
  }
  lines.push("Anonymous, viewer and out-of-department reads are refused. Assigned teacher and in-department administrator can read the group.");

  signInAs("admin@example.invalid");
  let entered!: () => void;
  let release!: () => void;
  const locked = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  const activation = db.transaction(tx => database.inDatabaseTransaction(tx, async () => {
    await lockTermContext(tx, "exclusive");
    await tx.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, spring.termId));
    entered();
    await finish;
  }));
  await locked;
  const read = marks(active, "semester", student);
  release();
  await activation;
  assert.equal((await read).term.status, "completed");
  assert.equal((await read).evaluationDate, "2027-04-30");
  lines.push("A read overlapping the completion transaction uses the completed term, its end date and its retained roster together.");
  report({ lines });
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
