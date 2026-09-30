/**
 * T-03 (AC-04): a later Spring term must not change Summer history, and the
 * real loaders, workload and CSV exports must show only the active term.
 * Summer history is fingerprinted from term-scoped rows and their dependants.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun, type OwnedPglite, type OwnedRun } from "./pglite";
import { fingerprintDatabase, fingerprintDifferences, selectFingerprint, type TableFingerprint } from "./fingerprint";
import { activateTerm, populateSpringFixture, populateSummerFixture, type SummerFixture } from "./fixture";
import { runAppChild } from "./app-env";

const SCENARIO = path.join(__dirname, "children", "term-scenario.ts");
const ADMIN = "admin@example.invalid";

type View = {
  term: { id: number; name: string };
  meetings: number[];
  groups: number[];
  batches: string[];
  audiences: string[];
  allocations: number[];
  externals: number[];
  windows: number[];
  versions: string[];
  publishedSnapshotTerm: string | null;
  representatives: string[];
  contacts: string[];
  reconciliations: string[];
  attendance: Array<{ groupId: number; roster: string[]; sessions: Array<{ id: number }> }>;
  extraLoad: { rate: number; classes: number[]; manual: number[] };
  workloads: unknown[];
  publicRoutine: { term: string; version: number } | null;
  csv: Record<string, { status: number; rows: number; terms: string[]; courses: string[]; digest: string }>;
};

async function child<T>(run: OwnedRun, args: string[]): Promise<T> {
  const result = await runAppChild(run, SCENARIO, args);
  assert.equal(result.status, 0, `${args[0]} child failed:\n${result.stderr.slice(-2000)}`);
  assert.ok(result.report, `${args[0]} child produced no report`);
  return result.report as T;
}

/** Term-scoped rows plus the rows that hang off them; term status is excluded (the fixture switches it). */
function historyQueries(termId: number, auditMaxId: number): Record<string, string> {
  const scoped = (table: string) => `select * from ${table} where term_id = ${termId}`;
  const groups = `select id from teaching_groups where term_id = ${termId}`;
  const meetingIds = `select id from meetings where teaching_group_id in (${groups})`;
  return {
    term: `select id, name, academic_year, start_date, end_date, effective_from from academic_terms where id = ${termId}`,
    ...Object.fromEntries([
      "academic_policies", "batch_term_placements", "class_representatives", "department_contacts",
      "routine_source_reconciliations", "course_offerings", "teaching_groups", "external_commitments",
      "workload_allocations", "schedule_versions", "extra_load_classes", "extra_load_manual_summaries",
      "course_enrollments", "attendance_sessions", "permitted_windows",
    ].map((table) => [table, scoped(table)])),
    teaching_group_offerings: `select * from teaching_group_offerings where teaching_group_id in (${groups})`,
    teaching_requirements: `select * from teaching_requirements where teaching_group_id in (${groups})`,
    meetings: `select * from meetings where teaching_group_id in (${groups})`,
    meeting_teachers: `select * from meeting_teachers where meeting_id in (${meetingIds})`,
    meeting_rooms: `select * from meeting_rooms where meeting_id in (${meetingIds})`,
    attendance_records: `select * from attendance_records where session_id in (select id from attendance_sessions where term_id = ${termId})`,
    courses: `select * from courses where id in (select course_id from course_offerings where term_id = ${termId})`,
    batches: `select * from batches where id in (select batch_id from batch_term_placements where term_id = ${termId})`,
    students: `select * from students where id in (select student_id from course_enrollments where term_id = ${termId})`,
    teachers: "select * from teachers",
    role_assignments: "select * from role_assignments",
    audit_events_before: `select * from audit_events where id <= ${auditMaxId}`,
  };
}

async function history(handle: OwnedPglite, termId: number, auditMaxId: number): Promise<Record<string, TableFingerprint>> {
  const out: Record<string, TableFingerprint> = {};
  for (const [name, query] of Object.entries(historyQueries(termId, auditMaxId))) out[name] = await selectFingerprint(handle.client, query);
  return out;
}

async function withDb<T>(run: OwnedRun, work: (handle: OwnedPglite) => Promise<T>): Promise<T> {
  const handle = await openOwnedPglite(run);
  try { return await work(handle); } finally { await handle.close(); }
}

/** Ids of one record of each kind in a term (0 when the term has none). */
async function termRecordIds(handle: OwnedPglite, termId: number, groupId: number, summer: SummerFixture) {
  const id = async (rows: Promise<Array<{ id: number }>>) => (await rows)[0]?.id ?? 0;
  const session = (await handle.db.select().from(schema.attendanceSessions).where(eq(schema.attendanceSessions.termId, termId)))[0];
  const record = session && (await handle.db.select().from(schema.attendanceRecords).where(eq(schema.attendanceRecords.sessionId, session.id)))[0];
  return {
    teachingGroupId: groupId,
    teacherId: summer.teacherIds[0],
    roomId: await id(handle.db.select().from(schema.rooms).where(eq(schema.rooms.code, "SX-406"))),
    meetingId: await id(handle.db.select().from(schema.meetings).where(eq(schema.meetings.teachingGroupId, groupId))),
    externalId: await id(handle.db.select().from(schema.externalCommitments).where(eq(schema.externalCommitments.termId, termId))),
    windowId: await id(handle.db.select().from(schema.permittedWindows).where(eq(schema.permittedWindows.termId, termId))),
    extraLoadClassId: await id(handle.db.select().from(schema.extraLoadClasses).where(eq(schema.extraLoadClasses.termId, termId))),
    manualSummaryId: await id(handle.db.select().from(schema.extraLoadManualSummaries).where(eq(schema.extraLoadManualSummaries.termId, termId))),
    attendanceSessionId: session?.id ?? 0,
    studentId: record?.studentId ?? 0,
  };
}

export async function checkHistory(): Promise<string[]> {
  const run = createOwnedRun("t03 two-term");
  const lines: string[] = [];
  try {
    const summer = await withDb(run, async (handle) => {
      await migrateOwned(handle);
      return populateSummerFixture(handle.db);
    });

    // Summer baseline through production paths, including a real publication.
    const summerPublish = await child<{ ok: boolean; message: string; issues?: unknown[] }>(run, ["publish", ADMIN, "Synthetic Summer publication"]);
    assert.equal(summerPublish.ok, true, `${summerPublish.message} ${JSON.stringify(summerPublish.issues)}`);
    const summerView = await child<View>(run, ["view", ADMIN]);
    assert.equal(summerView.term.name, "Summer 2026");
    assert.deepEqual(summerView.publicRoutine, { term: "Summer 2026", version: 2 });
    assert.ok(summerView.csv.internalHsc.rows > 0 && summerView.csv.publicHsc.rows > 0);
    const auditMaxId = await withDb(run, async (handle) =>
      (await handle.db.execute<{ max: number }>(sql`select max(id)::int as max from audit_events`)).rows[0].max);
    const summerHistory = await withDb(run, (handle) => history(handle, summer.termId, auditMaxId));

    // Add Spring and make it active.
    const spring = await withDb(run, (handle) => populateSpringFixture(handle.db, summer));
    const springDraft = await child<View>(run, ["view", ADMIN]);
    assert.equal(springDraft.term.name, "Spring 2027");
    assert.deepEqual(springDraft.groups, [spring.mergedGroupId, spring.repeatGroupId].sort((a, b) => a - b));
    assert.equal(springDraft.meetings.filter((id) => summerView.meetings.includes(id)).length, 0, "Summer meetings leaked into Spring");
    assert.equal(springDraft.allocations.filter((id) => summerView.allocations.includes(id)).length, 0);
    assert.equal(springDraft.externals.filter((id) => summerView.externals.includes(id)).length, 0);
    assert.equal(springDraft.windows.filter((id) => summerView.windows.includes(id)).length, 0);
    assert.deepEqual(springDraft.versions, []);
    assert.equal(springDraft.publishedSnapshotTerm, null);
    assert.equal(springDraft.publicRoutine, null, "public routine fell back to another term");
    assert.equal(springDraft.csv.publicHsc.status, 404);
    assert.deepEqual(springDraft.representatives, ["Synthetic Spring Representative"]);
    assert.deepEqual(springDraft.contacts, ["Synthetic Spring Coordinator"]);
    assert.deepEqual(springDraft.reconciliations, []);
    assert.ok(springDraft.batches.includes("HSC-21B@null"), "graduated batch has no Spring placement");
    assert.ok(springDraft.batches.includes("HSC-22B@8") && springDraft.batches.includes("DIPLOMA-22B@3"));
    assert.ok(springDraft.audiences.every((audience) => !audience.includes("21B")));
    const sessions = springDraft.attendance.flatMap((group) => group.sessions.map((session) => session.id));
    const summerSessions = summerView.attendance.flatMap((group) => group.sessions.map((session) => session.id));
    assert.equal(sessions.length, 1);
    assert.equal(sessions.filter((id) => summerSessions.includes(id)).length, 0);
    assert.deepEqual(springDraft.attendance.find((group) => group.groupId === spring.mergedGroupId)?.roster, ["SYN-0001", "SYN-9001"]);
    assert.equal(springDraft.extraLoad.rate, 250);
    assert.equal(springDraft.extraLoad.classes.filter((id) => summerView.extraLoad.classes.includes(id)).length, 0);
    assert.deepEqual(springDraft.extraLoad.manual, []);
    for (const csv of [springDraft.csv.internalHsc, springDraft.csv.internalDiploma]) {
      assert.deepEqual(csv.terms, ["Spring 2027"]);
    }
    assert.ok(!springDraft.csv.internalHsc.courses.includes("SYN-4102"), "Summer-only course exported in Spring");
    lines.push("Spring active: loaders, attendance, extra load (Spring rate), workload and internal CSV show only Spring; public routine/CSV do not fall back to Summer; graduated batch has no semester");

    const springPublish = await child<{ ok: boolean; message: string }>(run, ["publish", ADMIN, "Synthetic Spring publication"]);
    assert.equal(springPublish.ok, true, springPublish.message);
    const springView = await child<View>(run, ["view", ADMIN]);
    assert.deepEqual(springView.publicRoutine, { term: "Spring 2027", version: 1 });
    assert.deepEqual(springView.versions, ["1:published"]);
    assert.deepEqual(springView.csv.publicHsc.terms, ["Spring 2027"]);

    // Summer history is byte-for-byte unchanged by Spring data entry and publication.
    const afterSpring = await withDb(run, (handle) => history(handle, summer.termId, auditMaxId));
    assert.deepEqual(afterSpring, summerHistory);

    // Switching the active term back reproduces the Summer projections exactly.
    await withDb(run, (handle) => activateTerm(handle.db, summer.termId));
    const summerAgain = await child<View>(run, ["view", ADMIN]);
    assert.deepEqual(summerAgain, summerView);
    await withDb(run, (handle) => activateTerm(handle.db, spring.termId));
    assert.deepEqual(await child<View>(run, ["view", ADMIN]), springView);
    lines.push("Summer history (term rows, dependants, snapshot, enrollments, attendance, extra load, roles, prior audits) unchanged after Spring entry and publication; switching terms reproduces each term's loaders and CSV exactly");

    // Repeated migrations on populated two-term data change nothing.
    await withDb(run, async (handle) => {
      const before = await fingerprintDatabase(handle.client);
      await migrateOwned(handle);
      await migrateOwned(handle);
      assert.deepEqual(fingerprintDifferences(before, await fingerprintDatabase(handle.client)), []);
    });
    lines.push("Repeated migrations on the populated two-term database leave schema, journal and every row unchanged");

    // With Spring active, id-based actions must not reach Summer rows.
    // Before the term-scope correction six of these succeeded and two threw foreign-key errors.
    type Results = Record<string, { ok: boolean; message: string; outcome?: unknown; threw?: boolean }>;
    const outside = /belongs to a term that is not active/;
    const summerRows = await withDb(run, (handle) => termRecordIds(handle, summer.termId, summer.mergedGroupId, summer));
    const crossTerm = await child<Results>(run, ["cross-term", ADMIN, JSON.stringify(summerRows)]);
    for (const [name, result] of Object.entries(crossTerm)) {
      const expected = name === "moveMeeting" ? /Meeting not found/ : outside;
      assert.ok(!result.ok && !result.threw && expected.test(result.message), `${name} was not refused for a Summer row: ${JSON.stringify(result)}`);
      if (name !== "moveMeeting") assert.deepEqual(result.outcome, { kind: "stale", reason: "not_active_term" });
    }
    assert.deepEqual(await withDb(run, (handle) => history(handle, summer.termId, auditMaxId)), summerHistory);

    // Control: the same actions on Spring's own rows are not refused by the term check.
    const springRows = await withDb(run, (handle) => termRecordIds(handle, spring.termId, spring.repeatGroupId, summer));
    const sameTerm = await child<Results>(run, ["cross-term", ADMIN, JSON.stringify(springRows)]);
    const wronglyRefused = Object.entries(sameTerm).filter(([, result]) => outside.test(result.message)).map(([name]) => name);
    assert.deepEqual(wronglyRefused, []);
    assert.ok(sameTerm.saveAttendance.ok && sameTerm.deleteExtraLoadClass.ok && sameTerm.verifyExternal.ok, JSON.stringify(sameTerm));
    lines.push(`Cross-term writes refused: ${Object.keys(crossTerm).length} id-based actions against Summer rows while Spring is active (Summer history unchanged); the same actions on Spring rows are not blocked`);
    return lines;
  } finally {
    removeOwnedRun(run);
  }
}
