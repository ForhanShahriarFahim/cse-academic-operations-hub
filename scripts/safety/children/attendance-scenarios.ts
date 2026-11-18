/** Real attendance actions and loader; only the request/provider boundary is stubbed. */
import assert from "node:assert/strict";
import { asc, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";

const database = loadApp<typeof import("../../../src/db")>("src/db/index.ts"), { db } = database;
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const actions = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const directory = loadApp<typeof import("../../../src/lib/student-directory")>("src/lib/student-directory.ts");
const roster = loadApp<typeof import("../../../src/lib/student-roster-actions")>("src/lib/student-roster-actions.ts");
const operations = loadApp<typeof import("../../../src/lib/academic-operations")>("src/lib/academic-operations.ts");
const form = (values: Record<string, unknown>) => {
  const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f;
};
const ok = (r: ActionResult) => { assert.equal(r.ok, true, r.message); return r; };
const conflict = (r: ActionResult) => { assert.equal(r.ok, false, r.message); assert.equal(r.outcome?.kind, "conflict", r.message); };

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  const token = (await context.captureActiveContext()).writeContext;
  const [group, lab] = await db.select().from(s.teachingGroups).orderBy(asc(s.teachingGroups.id));
  const teachers = await db.select().from(s.teachers).orderBy(asc(s.teachers.id));
  await db.insert(s.workloadAllocations).values({ termId: token.activeTermId, teacherId: teachers[1].id, teachingGroupId: group.id, units: "0.00" });
  const create = (values: Record<string, unknown> = {}, writeContext = token) => actions.createAttendanceSessionAction(form({
    teachingGroupId: group.id, classDate: "2026-07-01", phase: "midterm", startTime: "09:00", endTime: "10:00", ...values,
  }), writeContext);
  const sessions = () => db.select().from(s.attendanceSessions).orderBy(asc(s.attendanceSessions.id));
  const records = () => db.select().from(s.attendanceRecords).orderBy(asc(s.attendanceRecords.id));
  const audits = () => db.select().from(s.auditEvents).orderBy(asc(s.auditEvents.id));
  const snapshot = async () => JSON.stringify([await sessions(), await records(), await audits()]);
  const initialSessions = await sessions(), initialRecords = await records();
  const noWrite = async (work: () => Promise<unknown>) => { const before = await snapshot(); const result = await work(); assert.equal(await snapshot(), before); return result; };

  ok(await create({ teacherId: teachers[0].id }));
  const first = (await sessions()).at(-1)!;
  const refused = await noWrite(() => create({ phase: "final", teacherId: teachers[1].id }));
  conflict(refused as ActionResult);
  assert.match((refused as ActionResult).message, /2026-07-01/);
  assert.match((refused as ActionResult).message, /9:00.*10:00/);
  ok(await create({ startTime: "", endTime: "" }));
  conflict(await noWrite(() => create({ startTime: "", endTime: "", phase: "final" })) as ActionResult);
  ok(await create({ startTime: "10:00", endTime: "11:00" }));
  ok(await create({ classDate: "2026-07-02" }));
  ok(await create({ teachingGroupId: lab.id }));
  lines.push("Same date/time duplicates are refused across phase/teacher changes, including null times; different times, dates and groups remain allowed, with no writes on refusal.");

  // A joins only after all preceding sessions, then attends their single captured session.
  const [late] = await db.insert(s.students).values({ studentCode: "ATT-LATE", fullName: "Synthetic Late Student", homeDepartmentLabel: "EEE" }).returning();
  await db.insert(s.courseEnrollments).values({ termId: token.activeTermId, teachingGroupId: group.id, studentId: late.id, audienceType: "external" });
  ok(await create({ classDate: "2026-07-03", phase: "final" }));
  const newest = (await sessions()).at(-1)!;
  ok(await actions.saveAttendanceAction(newest.id, [{ studentId: late.id, status: "present" }], token));
  const saved = await records();
  const data = await operations.getAttendanceData(group.id);
  const summary = data.summaries.find((row) => row.studentId === late.id)!;
  assert.deepEqual(summary.midterm, { attended: 0, total: 0 });
  assert.deepEqual(summary.final, { attended: 1, total: 1 });
  assert.deepEqual(summary.semester, { attended: 1, total: 1, percentage: 100 });
  assert.equal(summary.mark, summary.maximum);
  await operations.getAttendanceData(group.id);
  assert.deepEqual(await records(), saved, "reads never backfill older sessions");
  const captured = data.roster.filter((student) => data.sessions.find((row) => row.id === first.id)!.records.some((record) => record.studentId === student.id));
  assert.equal(captured.some((student) => student.id === late.id), false);
  const crafted = await noWrite(() => actions.saveAttendanceAction(first.id, [{ studentId: captured[0].id, status: "present" }, { studentId: late.id, status: "absent" }], token));
  assert.equal((crafted as ActionResult).ok, false);
  // Real UI payload shape: only current roster members with captured records.
  ok(await actions.saveAttendanceAction(first.id, captured.map((student) => ({ studentId: student.id, status: "present" })), token));
  assert.equal((await records()).some((record) => record.sessionId === first.id && record.studentId === late.id), false);
  const removed = captured.at(-1)!;
  const retained = (await records()).filter((record) => record.studentId === removed.id);
  ok(await actions.deactivateStudentAction(removed.id, group.id, token));
  const afterRemoval = await operations.getAttendanceData(group.id);
  assert.ok(afterRemoval.sessions.find(row => row.id === first.id)?.records.some(row => row.studentId === removed.id && row.fullName === removed.fullName));
  const stillCurrent = captured.filter((student) => student.id !== removed.id);
  ok(await actions.saveAttendanceAction(first.id, stillCurrent.map((student) => ({ studentId: student.id, status: "late" })), token));
  assert.equal(afterRemoval.roster.some((row) => row.id === removed.id), false);
  assert.deepEqual((await records()).filter((record) => record.studentId === removed.id), retained);
  assert.deepEqual((await sessions()).filter((row) => initialSessions.some((old) => old.id === row.id)), initialSessions);
  assert.deepEqual((await records()).filter((row) => initialRecords.some((old) => old.id === row.id)), initialRecords);
  lines.push("Late enrolment gives 0/0 Midterm, 1/1 Final, 100% and full marks; reads do not backfill. Captured-only saves succeed, crafted additions fail atomically, removed students' records and original fixture attendance remain unchanged.");

  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.email, "teacher-a@example.invalid"));
  signInAs("teacher-a@example.invalid");
  ok(await create({ classDate: "2026-07-11" }));
  ok(await actions.saveAttendanceAction((await sessions()).at(-1)!.id, [{ studentId: late.id, status: "late" }], token));
  signInAs("admin@example.invalid");
  for (const fields of [{ phase: "invalid" }, { classDate: "2025-07-01" }, { endTime: "" }, { teacherId: teachers[2].id }]) {
    assert.equal((await noWrite(() => create(fields)) as ActionResult).ok, false);
  }

  for (const [email, role, teacherId] of [
    ["att-viewer@example.invalid", "read_only_viewer", null],
    ["att-unassigned@example.invalid", "teacher", teachers[2].id],
  ] as const) {
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: "Synthetic Attendance Role", teacherId, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role });
    signInAs(email);
    const denied = await noWrite(() => create());
    assert.equal((denied as ActionResult).outcome?.kind, "permission");
    assert.equal((await noWrite(() => actions.saveAttendanceAction(first.id, [], token)) as ActionResult).outcome?.kind, "permission");
  }
  signInAs(null);
  assert.equal((await noWrite(() => create()) as ActionResult).outcome?.kind, "permission");
  signInAs("admin@example.invalid");
  assert.equal((await noWrite(() => create({}, { ...token, generation: token.generation + 1 })) as ActionResult).outcome?.kind, "stale");
  const [otherTerm] = await db.insert(s.academicTerms).values({ name: "Attendance other term", academicYear: 2027, startDate: "2027-01-01", endDate: "2027-05-01", status: "draft" }).returning();
  const [otherGroup] = await db.insert(s.teachingGroups).values({ termId: otherTerm.id, courseId: group.courseId }).returning();
  const [otherSession] = await db.insert(s.attendanceSessions).values({ termId: otherTerm.id, teachingGroupId: otherGroup.id, classDate: "2026-07-08", startMinutes: 540, endMinutes: 600 }).returning();
  assert.equal((await noWrite(() => create({ teachingGroupId: otherGroup.id })) as ActionResult).ok, false);
  assert.equal((await noWrite(() => actions.saveAttendanceAction(otherSession.id, [], token)) as ActionResult).ok, false);
  ok(await create({ classDate: "2026-07-08" }));
  await db.execute(sql`insert into safe01_fault values (true)`);
  const beforeFailure = await snapshot();
  await assert.rejects(create({ classDate: "2026-07-09" }), (error) => /SAFE-01 injected audit failure/.test(String((error as { cause?: { message?: string } }).cause?.message ?? error)));
  assert.equal(await snapshot(), beforeFailure);
  await db.execute(sql`delete from safe01_fault`);
  ok(await create({ classDate: "2026-07-09" }));
  lines.push("Assigned teacher can create/save; invalid input, anonymous, viewer, unassigned-teacher, wrong-term create/save and stale-term requests write nothing. Another term's session does not block creation; audit failure rolls back session/roster and retry succeeds.");

  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) : null;
  const control = pool ? await pool.connect() : null;
  const countBefore = (await sessions()).length, auditBefore = (await audits()).length;
  const raceRoster = (await operations.getAttendanceData(group.id)).roster.length;
  const recordBefore = (await records()).length;
  const barrier = 61028;
  const waitFor = async (query: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (Number((await pool!.query(query)).rows[0].count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    assert.fail("Attendance race did not reach the expected lock wait");
  };
  try {
    let pair: ActionResult[];
    if (pool && control) {
      await control.query(`select pg_advisory_lock(${barrier})`);
      await pool.query(`create function att_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${barrier});return new;end$$;create trigger att_barrier before insert on attendance_sessions for each row execute function att_barrier()`);
      try {
        const one = create({ classDate: "2026-07-10" });
        await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
        const two = create({ classDate: "2026-07-10", phase: "final", teacherId: teachers[1].id });
        await waitFor("select count(*) from pg_stat_activity a where a.datname=current_database() and a.wait_event='advisory' and exists(select 1 from pg_stat_activity b where b.pid=any(pg_blocking_pids(a.pid)) and b.wait_event='advisory')");
        await control.query(`select pg_advisory_unlock(${barrier})`);
        pair = await Promise.all([one, two]);
      } finally {
        await control.query(`select pg_advisory_unlock(${barrier})`);
        await pool.query("drop trigger att_barrier on attendance_sessions;drop function att_barrier()");
      }
    } else {
      let entered!: () => void, release!: () => void;
      const held = new Promise<void>((resolve) => entered = resolve), finish = new Promise<void>((resolve) => release = resolve);
      const one = db.transaction((tx) => database.inDatabaseTransaction(tx, async () => { const result = await create({ classDate: "2026-07-10" }); entered(); await finish; return result; }));
      await held;
      let done = false;
      const two = create({ classDate: "2026-07-10", phase: "final" }).then((result) => { done = true; return result; });
      try { await new Promise((resolve) => setTimeout(resolve, 25)); assert.equal(done, false); }
      finally { release(); }
      pair = await Promise.all([one, two]);
    }
    ok(pair[0]); conflict(pair[1]);
    assert.equal((await sessions()).length, countBefore + 1);
    assert.equal((await records()).length, recordBefore + raceRoster);
    assert.equal((await audits()).length, auditBefore + 1);
    lines.push(`${pool ? "PostgreSQL blocking-PID evidence: second creator waits for first while first is held at insert" : "PGlite: second request queues behind open creation"}; exactly one session, one captured roster, one success audit and one conflict.`);

    const upload = (rows: string[], teachingGroupId = group.id, writeContext = token, mode = "roster") => {
      const input = form({ mode, teachingGroupId, _activeTermId: writeContext.activeTermId, _termGeneration: writeContext.generation,
        "map:studentCode": 1, "map:fullName": 2, "map:department": 3, ...(mode === "roster" ? { "map:audienceType": 4 } : {}) });
      input.set("csv", new File([["Student ID,Student Name,Department,Audience Type", ...rows].join("\n")], "synthetic.csv"));
      return input;
    };
    const confirm = (input: FormData, proof: string) => {
      input.set("proof", proof); input.set("operation", "confirm"); return roster.reviewStudentCsv(input);
    };
    const importRows = async (...args: Parameters<typeof upload>) => {
      const input = upload(...args);
      const preview = await roster.reviewStudentCsv(input);
      return preview.proof ? confirm(input, preview.proof) : preview;
    };
    const marksBefore = await records();
    const inactiveCsv = `${removed.studentCode},${removed.fullName}`;
    const importNew = "ATT-CSV,New Student,,external";
    const importUnchanged = "ATT-UNCHANGED,Synthetic Unchanged";
    assert.equal((await importRows([importUnchanged])).receipt?.created, 1);
    const mixed = await importRows([
      importNew, "ATT-CSV,Duplicate", "", "ATT-BROKEN,,", "ATT-LATE,Wrong Name",
      importUnchanged, inactiveCsv,
    ]);
    assert.equal(mixed.outcome?.kind, "partial", mixed.message);
    if (mixed.outcome?.kind === "partial") {
      assert.deepEqual([mixed.outcome.total, mixed.outcome.applied, mixed.outcome.unchanged], [6, 2, 1]);
    }
    assert.deepEqual(mixed.receipt && {
      created: mixed.receipt.created, updated: mixed.receipt.updated, unchanged: mixed.receipt.unchanged,
      skipped: mixed.receipt.skipped, failed: mixed.receipt.failed,
    }, { created: 1, updated: 1, unchanged: 1, skipped: 1, failed: 2 });
    assert.deepEqual(mixed.receipt?.issues.map(({ row }) => row), [3, 5, 6]);
    assert.doesNotMatch(JSON.stringify(mixed), /Wrong Name|ATT-LATE/);
    assert.equal((await importRows([importNew])).receipt?.unchanged, 1);
    const noApply = await noWrite(() => importRows([importNew, "ATT-BROKEN,,"]));
    assert.equal((noApply as Awaited<ReturnType<typeof importRows>>).receipt?.unchanged, 1);
    assert.equal((await importRows(["ATT-BROKEN,,"])).receipt?.failed, 1);
    assert.equal((await importRows(["ATT-LATE,Synthetic Late Student"], lab.id)).receipt?.created, 1);
    assert.deepEqual(await db.select().from(s.students).where(eq(s.students.id, late.id)), [late]);
    assert.equal((await importRows([importNew], otherGroup.id)).ok, false);
    assert.equal((await importRows([importNew], group.id, { ...token, generation: token.generation + 1 })).outcome?.kind, "stale");
    signInAs("teacher-a@example.invalid");
    assert.equal((await importRows([importNew])).outcome?.kind, "permission");
    signInAs("admin@example.invalid");
    const importSnapshot = async () => JSON.stringify([
      await db.select().from(s.students).orderBy(asc(s.students.id)),
      await db.select().from(s.courseEnrollments).orderBy(asc(s.courseEnrollments.id)), await audits(),
    ]);
    const beforeFault = await importSnapshot();
    const undo = upload(["ATT-UNDO,Synthetic Rollback"]);
    const undoPreview = await roster.reviewStudentCsv(undo);
    assert.ok(undoPreview.proof);
    assert.equal(await importSnapshot(), beforeFault, "preview has no writes");
    await db.execute(sql`insert into safe01_fault values (true)`);
    assert.equal((await confirm(undo, undoPreview.proof)).ok, false);
    await db.execute(sql`delete from safe01_fault`);
    assert.equal(await importSnapshot(), beforeFault);

    const replay = upload([importNew.replace("external", "merged")]);
    const statusPreview = await roster.reviewStudentCsv(replay);
    assert.ok(statusPreview.proof);
    ok(await confirm(replay, statusPreview.proof));
    ok(await importRows([importNew]));
    assert.equal((await confirm(replay, statusPreview.proof)).outcome?.kind, "stale", "a used preview cannot reapply after its original state returns");

    const raceRows = ["ATT-RACE-B,Synthetic B", "ATT-RACE-A,Synthetic A"];
    const left = upload(raceRows), right = upload([...raceRows].reverse());
    const [leftPreview, rightPreview] = await Promise.all([roster.reviewStudentCsv(left), roster.reviewStudentCsv(right)]);
    assert.ok(leftPreview.proof && rightPreview.proof);
    assert.equal((await confirm(upload(["ATT-NOT-REVIEWED,Other Student"]), leftPreview.proof)).outcome?.kind, "stale");
    const importRace = await Promise.all([confirm(left, leftPreview.proof), confirm(right, rightPreview.proof)]);
    assert.equal(importRace.filter(result => result.receipt?.created === 2).length, 1);
    assert.equal(importRace.filter(result => result.outcome?.kind === "stale").length, 1);
    assert.equal((await confirm(left, leftPreview.proof)).outcome?.kind, "stale");
    assert.equal((await actions.importStudentCsvAction(form({ teachingGroupId: group.id, csvText: "unused" }), token)).ok, false);
    assert.equal((await actions.upsertStudentAction(form({ teachingGroupId: group.id, studentId: late.id, studentCode: late.studentCode, fullName: "Wrong Name" }), token)).ok, false);

    const directoryUpload = upload(["000-STUDENT,Directory Student"], group.id, token, "directory");
    const directoryPreview = await roster.reviewStudentCsv(directoryUpload);
    assert.ok(directoryPreview.proof);
    assert.equal((await confirm(directoryUpload, directoryPreview.proof)).receipt?.created, 1);
    const listing = await directory.searchStudents(form({ q: "000-STUDENT" }));
    assert.ok("rows" in listing && listing.rows.length === 1);
    const identity = await directory.studentDetail(listing.rows[0].id);
    assert.ok(identity && !identity.fixedCode && !identity.history.length);
    assert.ok((await directory.studentDetail(late.id))?.fixedCode);
    const [batch] = await db.select({ id: s.courseOfferings.batchId }).from(s.teachingGroupOfferings)
      .innerJoin(s.courseOfferings, eq(s.courseOfferings.id, s.teachingGroupOfferings.offeringId))
      .where(eq(s.teachingGroupOfferings.teachingGroupId, group.id));
    const edit = form({ operation: "edit", id: identity.id, fingerprint: identity.fingerprint, studentCode: identity.studentCode,
      fullName: identity.fullName, phone: "+000123456", homeBatchId: batch.id });
    ok(await directory.changeStudent(edit));
    assert.equal((await directory.changeStudent(edit)).outcome?.kind, "stale");
    const batchInput = form({ teachingGroupId: group.id, _activeTermId: token.activeTermId,
      _termGeneration: token.generation, batchId: batch.id, audienceType: "merged" });
    const batchPreview = await roster.reviewBatchEnrollment(batchInput);
    assert.ok(batchPreview.proof && batchPreview.candidates?.some(row => row.id === identity.id && row.disposition === "Enroll"), batchPreview.message);
    const [batchStudent] = await db.select().from(s.students).where(eq(s.students.id, identity.id));
    const freshIdentity = await directory.studentDetail(identity.id);
    ok(await directory.changeStudent(form({ id: identity.id, fingerprint: freshIdentity!.fingerprint, operation: "deactivate", confirmed: "yes" })));
    batchInput.set("operation", "confirm"); batchInput.set("proof", batchPreview.proof);
    assert.equal((await roster.reviewBatchEnrollment(batchInput)).outcome?.kind, "stale");
    const inactive = await directory.studentDetail(identity.id);
    ok(await directory.changeStudent(form({ id: identity.id, fingerprint: inactive!.fingerprint, operation: "restore" })));
    batchInput.set("operation", "preview");
    const freshBatch = await roster.reviewBatchEnrollment(batchInput);
    assert.ok(freshBatch.proof);
    batchInput.set("operation", "confirm"); batchInput.set("proof", freshBatch.proof);
    ok(await roster.reviewBatchEnrollment(batchInput));
    assert.equal((await directory.studentDetail(identity.id))?.phone, batchStudent.phone);
    const [ownerDepartment] = await db.select().from(s.departments).where(eq(s.departments.code, "CSE"));
    const [scoped] = await db.insert(s.portalUsers).values({ email: "stu-scoped@example.invalid", displayName: "Scoped Admin", status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: scoped.id, role: "academic_administrator", departmentId: ownerDepartment.id });
    signInAs("stu-scoped@example.invalid");
    assert.equal(await directory.studentDetail(identity.id), null);
    assert.equal((await directory.searchStudents(form({ q: "000-STUDENT" }))).outcome?.kind, "permission");
    const forged = upload(["ATT-PHONE,Student,,external,123"]);
    forged.set("map:phone", "5");
    assert.equal((await roster.reviewStudentCsv(forged)).outcome?.kind, "validation");
    assert.doesNotMatch(JSON.stringify(await operations.getAttendanceData(group.id)), /000123456/);
    signInAs("admin@example.invalid");
    assert.deepEqual(await records(), marksBefore, "roster import never changes captured marks");
    lines.push("ATT-02: source rows, committed counts, unchanged retry, cross-group enrollment, safe refusal, atomic audit rollback and stale/replayed overlapping previews, directory lifecycle, scoped privacy and batch enrollment passed.");
  } finally { control?.release(); await pool?.end(); }
  report({ lines });
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
