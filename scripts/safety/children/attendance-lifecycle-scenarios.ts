/** ATT-03A: real lifecycle actions, loader, Today match and history; only the request/provider boundary is stubbed. */
import assert from "node:assert/strict";
import { and, asc, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";

const database = loadApp<typeof import("../../../src/db")>("src/db/index.ts"), { db } = database;
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const actions = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const operations = loadApp<typeof import("../../../src/lib/academic-operations")>("src/lib/academic-operations.ts");
const directory = loadApp<typeof import("../../../src/lib/attendance-directory")>("src/lib/attendance-directory.ts");

const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f; };
const ok = (r: ActionResult) => { assert.equal(r.ok, true, `${r.message} ${JSON.stringify(r.outcome)}`); return r; };
const kind = (r: ActionResult) => r.outcome?.kind;

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  const token = (await context.captureActiveContext()).writeContext;
  const [group] = await db.select().from(s.teachingGroups).orderBy(asc(s.teachingGroups.id));
  const users = Object.fromEntries((await db.select().from(s.portalUsers)).map(user => [user.email, user]));
  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.email, "teacher-a@example.invalid"));
  const session = async (id: number) => (await db.select().from(s.attendanceSessions).where(eq(s.attendanceSessions.id, id)))[0];
  const records = async (id: number) => db.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, id)).orderBy(asc(s.attendanceRecords.studentId));
  const audits = () => db.select().from(s.auditEvents).orderBy(asc(s.auditEvents.id));
  const snapshot = async () => JSON.stringify([await db.select().from(s.attendanceSessions).orderBy(asc(s.attendanceSessions.id)), await db.select().from(s.attendanceRecords).orderBy(asc(s.attendanceRecords.id)), await audits()]);
  const noWrite = async (work: () => Promise<ActionResult>) => { const before = await snapshot(); const result = await work(); assert.equal(await snapshot(), before, `wrote despite ${result.message}`); return result; };
  const cmd = async (id: number, command: string, extra: Record<string, unknown> = {}, writeContext = token) =>
    actions.changeAttendanceSessionAction(id, { command, revision: (await session(id))?.revision ?? 0, ...extra } as never, writeContext);
  const values = async (id: number, status: string) => (await records(id)).map(row => ({ studentId: row.studentId, status }));
  const make = async (classDate: string, start = "09:00", end = "10:00") => {
    ok(await actions.createAttendanceSessionAction(form({ teachingGroupId: group.id, classDate, phase: "midterm", startTime: start, endTime: end }), token));
    return (await db.select().from(s.attendanceSessions).orderBy(asc(s.attendanceSessions.id))).at(-1)!;
  };

  // D-5 / AC-06: fixture sessions written before 0020 are unsubmitted drafts with no invented actor.
  const fixtureSessions = await db.select().from(s.attendanceSessions);
  assert.ok(fixtureSessions.length > 0);
  for (const row of fixtureSessions) assert.deepEqual([row.status, row.revision, row.submittedAt, row.submittedByUserId, row.lockedAt, row.voidedAt, row.voidReason], ["draft", 0, null, null, null, null, null]);
  const baseline = await operations.getAttendanceData(group.id);
  assert.equal(baseline.unsubmitted, baseline.sessions.length);
  // AC-05 parity: the pre-ATT-03A rule (every session counts, from raw rows) gives the same summaries as the migrated loader.
  const { summarizeAttendance } = loadApp<typeof import("../../../src/lib/attendance")>("src/lib/attendance.ts");
  const rawSessions = await db.select().from(s.attendanceSessions).where(eq(s.attendanceSessions.teachingGroupId, group.id));
  const rawRecords = await db.select().from(s.attendanceRecords);
  const legacy = rawSessions.map(row => ({ phase: row.phase, records: rawRecords.filter(record => record.sessionId === row.id).map(record => ({ studentId: record.studentId, status: record.status })) }));
  assert.ok(legacy.some(item => item.records.length > 0), "parity needs recorded fixture marks");
  assert.deepEqual(baseline.summaries, baseline.roster.map(student => summarizeAttendance(student.id, legacy as never, baseline.maximum!)), "migrated summaries match the pre-ATT-03A counting");
  lines.push("Summary parity: on migrated fixture sessions the loader's summaries equal the pre-ATT-03A rule computed independently from the raw sessions and records.");

  // AC-01: the assigned teacher's draft → submitted → reopened → resubmitted path.
  signInAs("teacher-a@example.invalid");
  const a = await make("2026-07-01");
  assert.equal(a.status, "draft");
  ok(await actions.saveAttendanceAction(a.id, await values(a.id, "present"), 0, token));
  assert.equal((await session(a.id)).revision, 1);
  const auditCount = (await audits()).length;
  assert.match(ok(await actions.saveAttendanceAction(a.id, await values(a.id, "present"), 1, token)).message, /No attendance changes/);
  assert.equal((await audits()).length, auditCount, "a save that changes nothing writes no event");
  assert.equal((await session(a.id)).revision, 1);
  const submitValues = (await values(a.id, "present")).map((value, index) => index === 0 ? { ...value, status: "late" } : value);
  ok(await cmd(a.id, "submit", { values: submitValues }));
  let row = await session(a.id);
  assert.deepEqual([row.status, row.revision, row.submittedByUserId], ["submitted", 2, users["teacher-a@example.invalid"].id]);
  assert.equal((await records(a.id))[0].status, "late", "submit saves the marks on screen");
  const submitAudit = (await audits()).at(-1)!;
  assert.equal(submitAudit.action, "attendance.submit");
  assert.equal((submitAudit.detail as { changes: unknown[] }).changes.length, 1);
  assert.equal(kind(await noWrite(() => actions.saveAttendanceAction(a.id, submitValues, 2, token))), "conflict", "a submitted session is read-only");
  assert.equal(kind(await noWrite(() => actions.deleteAttendanceSessionAction(a.id, 2, token))), "conflict", "a submitted session is never deleted");
  assert.equal(kind(await noWrite(() => cmd(a.id, "lock"))), "permission", "teachers cannot lock");
  assert.equal(kind(await noWrite(() => cmd(a.id, "reopen", { reason: " " }))), "validation", "reopen needs a reason");
  assert.equal(kind(await noWrite(() => cmd(a.id, "reopen", { reason: "x".repeat(301) }))), "validation");
  ok(await cmd(a.id, "reopen", { reason: "Student B arrived within ten minutes" }));
  assert.equal((await session(a.id)).status, "reopened");
  assert.equal(((await audits()).at(-1)!.detail as { reason: string }).reason, "Student B arrived within ten minutes");
  ok(await actions.saveAttendanceAction(a.id, (await values(a.id, "present")), (await session(a.id)).revision, token));
  ok(await cmd(a.id, "submit", { values: await values(a.id, "present") }));
  assert.equal((await session(a.id)).status, "submitted");
  lines.push("Teacher draft save (no-op save writes nothing), submit with marks, refused edit/delete/lock and reasonless reopen, then reopen with reason, correction and resubmission.");

  // AC-02/AC-03: reviewer lock, teacher refusal, locked correction keeps the original roll-call.
  signInAs("admin@example.invalid");
  ok(await cmd(a.id, "lock", { reason: "Checked against the paper register" }));
  row = await session(a.id);
  assert.deepEqual([row.status, row.lockedByUserId], ["locked", users["admin@example.invalid"].id]);
  const lockedMarks = (await records(a.id)).map(({ studentId, status }) => ({ studentId, status }));
  signInAs("teacher-a@example.invalid");
  for (const [command, extra, expected] of [["reopen", { reason: "Teacher correction" }, "permission"], ["void", { reason: "Teacher void" }, "permission"], ["save", { values: lockedMarks }, "conflict"], ["submit", { values: lockedMarks }, "conflict"]] as const) {
    assert.equal(kind(await noWrite(() => cmd(a.id, command, extra))), expected, `teacher ${command} on locked`);
  }
  signInAs("admin@example.invalid");
  ok(await cmd(a.id, "reopen", { reason: "Registrar asked for a correction" }));
  const reopenAudit = (await audits()).at(-1)!;
  assert.deepEqual((reopenAudit.before as { records: Array<{ studentId: number; status: string }> }).records.map(({ studentId, status }) => ({ studentId, status })).sort((x, y) => x.studentId - y.studentId), lockedMarks, "the locked roll-call is the correction's recorded starting point");
  assert.equal((await session(a.id)).lockedAt, null);
  ok(await cmd(a.id, "void", { reason: "Class was held in another slot" }));
  row = await session(a.id);
  assert.deepEqual([row.status, row.voidReason, row.voidedByUserId], ["voided", "Class was held in another slot", users["admin@example.invalid"].id]);
  assert.equal((await records(a.id)).length, lockedMarks.length, "voiding keeps every record");
  lines.push("Reviewer locks with a note; the teacher cannot reopen, void or edit the locked session; the reviewer's reopen records the full locked roll-call; void keeps the session and records with its reason.");

  // AC-05: voided sessions leave the duplicate guard, Today match and summaries; restore re-checks duplicates.
  signInAs("teacher-a@example.invalid");
  const b = await make("2026-07-01");
  signInAs("admin@example.invalid");
  const refusedRestore = await noWrite(() => cmd(a.id, "restore", { reason: "Voided by mistake" }));
  assert.equal(kind(refusedRestore), "conflict"); assert.match(refusedRestore.message, /2026-07-01/);
  assert.equal(kind(await noWrite(() => cmd(b.id, "void", { reason: "Draft void" }))), "conflict", "a draft is deleted, not voided");
  const today = await directory.todayAttendanceSessions(token.activeTermId, "2026-07-01", [group.id]);
  assert.deepEqual(today.map(item => item.id), [b.id], "the Today match ignores the voided session");
  signInAs("teacher-a@example.invalid");
  ok(await actions.deleteAttendanceSessionAction(b.id, 0, token));
  assert.equal(await session(b.id), undefined);
  assert.equal((await audits()).at(-1)!.action, "attendance.session.delete");
  assert.equal(kind(await noWrite(() => cmd(a.id, "restore", { reason: "Voided by mistake" }))), "permission", "teachers cannot restore");
  signInAs("admin@example.invalid");
  ok(await cmd(a.id, "restore", { reason: "Voided by mistake" }));
  assert.deepEqual([(await session(a.id)).status, (await session(a.id)).voidReason], ["reopened", null]);
  const before = (await operations.getAttendanceData(group.id)).summaries;
  signInAs("teacher-a@example.invalid");
  const c = await make("2026-07-05");
  ok(await cmd(c.id, "submit", { values: await values(c.id, "present") }));
  const counted = (await operations.getAttendanceData(group.id)).summaries;
  assert.notDeepEqual(counted, before, "a submitted session counts");
  ok(await cmd(c.id, "void", { reason: "Wrong group selected" }));
  assert.deepEqual((await operations.getAttendanceData(group.id)).summaries, before, "a voided session leaves every summary");
  lines.push("Voided sessions no longer block an identical new session or the Today match; restore is refused over an active duplicate and works after the draft is deleted; a draft cannot be voided; summaries drop a voided session exactly.");

  // Stale revisions and history.
  const stale = await noWrite(() => actions.changeAttendanceSessionAction(a.id, { command: "submit", revision: 0, values: [] }, token));
  assert.equal(kind(stale), "stale"); assert.match(stale.message, /changed/);
  const history = await actions.attendanceSessionHistoryAction(a.id);
  assert.ok(history.ok);
  if (history.ok) assert.deepEqual(history.events.map(event => event.label), ["Restored", "Voided", "Reopened for correction", "Locked", "Resubmitted", "Marks saved", "Reopened for correction", "Submitted", "Marks saved", "Session created"]);
  lines.push("Writes with an old revision are refused as stale with no writes; session history lists every event newest first with resubmission named.");

  // AC-02: role matrix on direct actions.
  const [cse] = await db.select().from(s.departments).where(eq(s.departments.code, "CSE"));
  const [eee] = await db.select().from(s.departments).where(eq(s.departments.code, "EEE"));
  const [otherTeacher] = await db.select().from(s.teachers).orderBy(asc(s.teachers.id)).offset(2).limit(1);
  const role = async (email: string, assignment: { role: "read_only_viewer" | "teacher" | "academic_administrator"; departmentId?: number | null; activeTo?: Date }, teacherId: number | null = null) => {
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: email.split("@")[0], teacherId, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role: assignment.role, departmentId: assignment.departmentId ?? null, activeFrom: new Date("2025-01-01T00:00:00Z"), activeTo: assignment.activeTo });
  };
  await role("att3-viewer@example.invalid", { role: "read_only_viewer" });
  await role("att3-unassigned@example.invalid", { role: "teacher" }, otherTeacher.id);
  await role("att3-cse-admin@example.invalid", { role: "academic_administrator", departmentId: cse.id });
  await role("att3-eee-admin@example.invalid", { role: "academic_administrator", departmentId: eee.id });
  await role("att3-expired@example.invalid", { role: "academic_administrator", activeTo: new Date("2026-01-01") });
  signInAs("teacher-a@example.invalid");
  const d = await make("2026-07-06");
  ok(await cmd(d.id, "submit", { values: await values(d.id, "present") }));
  for (const email of ["att3-viewer@example.invalid", "att3-unassigned@example.invalid", "att3-eee-admin@example.invalid", "att3-expired@example.invalid", null]) {
    signInAs(email);
    for (const command of ["lock", "reopen", "void"]) assert.equal(kind(await noWrite(() => cmd(d.id, command, { reason: "Not permitted here" }))), "permission", `${email} ${command}`);
    assert.equal((await actions.attendanceSessionHistoryAction(d.id)).ok, false, `${email} history`);
    assert.equal(kind(await noWrite(() => actions.lockSubmittedAttendanceAction(group.id, [d.id], null, token))), "permission");
  }
  signInAs("att3-cse-admin@example.invalid");
  ok(await cmd(d.id, "lock"));
  assert.equal((await session(d.id)).status, "locked", "a reviewer scoped to the group's department can lock");
  signInAs("admin@example.invalid");
  const [otherTerm] = await db.insert(s.academicTerms).values({ name: "ATT-03A other term", academicYear: 2027, startDate: "2027-01-01", endDate: "2027-05-01", status: "draft" }).returning();
  const [otherGroup] = await db.insert(s.teachingGroups).values({ termId: otherTerm.id, courseId: group.courseId }).returning();
  const [foreign] = await db.insert(s.attendanceSessions).values({ termId: otherTerm.id, teachingGroupId: otherGroup.id, classDate: "2027-01-10" }).returning();
  assert.equal(kind(await noWrite(() => cmd(foreign.id, "submit", { values: [] }))), "stale", "another term's session is refused");
  assert.equal((await noWrite(() => actions.changeAttendanceSessionAction(a.id, { command: "erase", revision: 0 } as never, token))).ok, false);
  assert.equal((await noWrite(() => actions.changeAttendanceSessionAction(-4, { command: "lock", revision: 0 }, token))).ok, false);
  assert.equal(kind(await noWrite(() => cmd(a.id, "void", { reason: "Context changed" }, { ...token, generation: token.generation + 1 }))), "stale");
  assert.equal(kind(await noWrite(() => cmd(a.id, "submit", { values: [{ studentId: 999999, status: "present" }] }))), undefined, "students outside the session are refused");
  lines.push("Viewer, unassigned teacher, out-of-department and expired reviewers and anonymous users cannot lock, reopen, void, read history or lock all; an in-department reviewer can lock; forged terms, commands, IDs, stale contexts and uncaptured students write nothing.");

  // Lock all submitted: reviewer only, exact set shown in the confirmation.
  signInAs("teacher-a@example.invalid");
  const e = await make("2026-07-07"), f = await make("2026-07-08");
  for (const id of [e.id, f.id]) ok(await cmd(id, "submit", { values: await values(id, "present") }));
  signInAs("admin@example.invalid");
  assert.equal(kind(await noWrite(() => actions.lockSubmittedAttendanceAction(group.id, [e.id], null, token))), "stale", "the confirmed set must match");
  const lockEvents = (await audits()).length;
  ok(await actions.lockSubmittedAttendanceAction(group.id, [f.id, e.id], "Midterm checked", token));
  assert.deepEqual([(await session(e.id)).status, (await session(f.id)).status], ["locked", "locked"]);
  assert.equal((await audits()).length, lockEvents + 2, "one audit event per locked session");
  assert.equal((await session(a.id)).status, "reopened", "lock all leaves other states alone");
  lines.push("Lock all submitted locks exactly the confirmed submitted sessions with one event each and refuses a changed set.");

  // AC-04: audit failure rolls the whole change back.
  await db.execute(sql`insert into safe01_fault values (true)`);
  const beforeFault = await snapshot();
  await assert.rejects(cmd(a.id, "submit", { values: await values(a.id, "absent") }), (error) => /SAFE-01 injected audit failure/.test(String((error as { cause?: { message?: string } }).cause?.message ?? error)));
  assert.equal(await snapshot(), beforeFault);
  await db.execute(sql`delete from safe01_fault`);
  lines.push("An audit-insert failure during submit leaves sessions, marks and audit unchanged.");

  // AC-04: concurrent writers on one session commit exactly once.
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) : null;
  const control = pool ? await pool.connect() : null;
  const barrier = 61031;
  const waitFor = async (query: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (Number((await pool!.query(query)).rows[0].count) > 0) return; await new Promise(resolve => setTimeout(resolve, 15)); }
    assert.fail("Lifecycle race did not reach the expected lock wait");
  };
  async function race(first: () => Promise<ActionResult>, second: () => Promise<ActionResult>) {
    if (!pool || !control) return Promise.all([first(), second()]);
    await control.query(`select pg_advisory_lock(${barrier})`);
    await pool.query(`create function att3_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${barrier});return new;end$$;create trigger att3_barrier before update on attendance_sessions for each row execute function att3_barrier()`);
    try {
      const one = first();
      await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
      const two = second();
      await waitFor("select count(*) from pg_stat_activity a where a.datname=current_database() and exists(select 1 from pg_stat_activity b where b.pid=any(pg_blocking_pids(a.pid)) and b.wait_event='advisory')");
      await control.query(`select pg_advisory_unlock(${barrier})`);
      return await Promise.all([one, two]);
    } finally {
      await control.query(`select pg_advisory_unlock(${barrier})`);
      await pool.query("drop trigger att3_barrier on attendance_sessions;drop function att3_barrier()");
    }
  }
  try {
    const outcome = (pair: ActionResult[]) => pair.map(result => result.ok ? "ok" : kind(result)).sort();
    signInAs("teacher-a@example.invalid");
    const g = await make("2026-07-09");
    ok(await cmd(g.id, "submit", { values: await values(g.id, "present") }));
    signInAs("admin@example.invalid");
    let events = (await audits()).length;
    const rev = (await session(g.id)).revision;
    const lockVsReopen = await race(() => actions.changeAttendanceSessionAction(g.id, { command: "lock", revision: rev }, token),
      () => actions.changeAttendanceSessionAction(g.id, { command: "reopen", revision: rev, reason: "Concurrent correction" }, token));
    assert.deepEqual(outcome(lockVsReopen), ["ok", "stale"]);
    assert.equal((await session(g.id)).status, "locked");
    assert.equal((await audits()).length, events + 1);
    ok(await cmd(g.id, "reopen", { reason: "Prepare twin submit" }));
    events = (await audits()).length;
    const twin = (await session(g.id)).revision, marks = await values(g.id, "late");
    const twins = await race(() => actions.changeAttendanceSessionAction(g.id, { command: "submit", revision: twin, values: marks }, token),
      () => actions.changeAttendanceSessionAction(g.id, { command: "submit", revision: twin, values: marks }, token));
    assert.deepEqual(outcome(twins), ["ok", "stale"]);
    assert.equal((await audits()).length, events + 1);
    ok(await cmd(g.id, "void", { reason: "Prepare twin restore" }));
    events = (await audits()).length;
    const voided = (await session(g.id)).revision;
    const restores = await race(() => actions.changeAttendanceSessionAction(g.id, { command: "restore", revision: voided, reason: "First restore" }, token),
      () => actions.changeAttendanceSessionAction(g.id, { command: "restore", revision: voided, reason: "Second restore" }, token));
    assert.deepEqual(outcome(restores), ["ok", "stale"]);
    assert.equal((await audits()).length, events + 1);
    assert.equal((await db.select().from(s.attendanceSessions).where(and(eq(s.attendanceSessions.id, g.id), eq(s.attendanceSessions.status, "reopened")))).length, 1);
    lines.push(`${pool ? "PostgreSQL: the second writer is observed blocked behind the first" : "PGlite: requests serialize"}; lock versus reopen, twin submits and twin restores each commit once with one audit event, the other is stale.`);
  } finally { control?.release(); await pool?.end(); }
  report({ lines });
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
