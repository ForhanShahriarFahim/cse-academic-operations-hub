/** PERF-01: real production readers/actions on a pinned synthetic target. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { PglitePreparedQuery } from "drizzle-orm/pglite";
import { NodePgPreparedQuery } from "drizzle-orm/node-postgres";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { freshTermActions } from "./fresh-term-actions";
import type { RolloverPlan } from "../../../src/lib/rollover";

type Query = { queryString: string; execute: (...args: unknown[]) => Promise<unknown> };
type Read = { table: string; rows: number; sql: string };
let reads: Read[] = [], hashes = 0;
const payloads = new Set<string>();
for (const prepared of [PglitePreparedQuery, NodePgPreparedQuery]) {
  const prototype = prepared.prototype as unknown as Query, original = prototype.execute;
  prototype.execute = async function (...args) {
    const result = await original.apply(this, args);
    const table = /^select\b[\s\S]*?\bfrom "([a-z_]+)"/.exec(this.queryString)?.[1];
    if (table && !/^select count\(/i.test(this.queryString)) reads.push({ table, rows: Array.isArray(result) ? result.length : (result as { rows?: unknown[] })?.rows?.length ?? 0, sql: this.queryString });
    return result;
  };
}
const originalHash = crypto.createHash;
crypto.createHash = ((...args: Parameters<typeof createHash>) => {
  const hash = originalHash(...args), update = hash.update.bind(hash);
  hash.update = function (value: crypto.BinaryLike, encoding?: crypto.Encoding) {
    if (typeof value === "string" && payloads.has(value)) hashes++;
    return typeof value === "string" ? update(value, encoding ?? "utf8") : update(value);
  };
  return hash;
}) as typeof createHash;
const { db, inDatabaseTransaction } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const portal = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const batches = loadApp<typeof import("../../../src/lib/batch-store")>("src/lib/batch-store.ts");
const rollover = loadApp<typeof import("../../../src/lib/rollover-store")>("src/lib/rollover-store.ts");
const { lockTermContext } = loadApp<typeof import("../../../src/lib/term-lock")>("src/lib/term-lock.ts");
const mode = process.argv[2];
const targeted = ["teaching_group_offerings", "teaching_requirements", "meetings", "meeting_teachers", "meeting_rooms", "permitted_windows"];
const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, String(v)); return f; };
async function measure<T>(work: () => Promise<T>) {
  reads = []; hashes = 0;
  const value = await work();
  const tables = Object.fromEntries([...new Set(reads.map(r => r.table))].sort().map(table => [table, { calls: reads.filter(r => r.table === table).length, rows: reads.filter(r => r.table === table).reduce((n, r) => n + r.rows, 0) }]));
  return { value, tables, hashes, portalLoads: reads.filter(r => /^select "id", "code", "name" from "departments"/.test(r.sql)).length, queries: reads.filter(r => targeted.includes(r.table)).map(r => r.sql) };
}
async function locked<T>(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  return db.transaction(tx => inDatabaseTransaction(tx, async () => { await lockTermContext(tx, "exclusive"); return work(tx); }));
}
async function main() {
  signInAs("admin@example.invalid");
  const [term] = await db.select().from(s.academicTerms), courses = await db.select().from(s.courses), cohortRows = await db.select().from(s.batches);
  const teacher = (await db.select().from(s.teachers))[0], room = (await db.select().from(s.rooms)).find(r => r.code === "SX-101")!;
  const hsc = cohortRows.find(b => b.stream === "HSC" && b.label === "22B")!, diploma = cohortRows.find(b => b.stream === "DIPLOMA")!;
  const student = (await db.select().from(s.students))[0], visitor = (await db.select().from(s.students)).find(r => r.studentCode === "SYN-9001")!;
  const [viewer] = await db.insert(s.portalUsers).values({ email: "perf-viewer@example.invalid", displayName: "Synthetic viewer", status: "active" }).returning();
  await db.insert(s.roleAssignments).values({ userId: viewer.id, role: "read_only_viewer", activeFrom: new Date("2020-01-01Z") });
  await db.insert(s.permittedWindows).values({ termId: null, stream: "HSC", dayOfWeek: 4, startMinutes: 480, endMinutes: 1020 });
  const [emptyCohort] = await db.insert(s.batches).values({ stream: "HSC", label: "PERF-EMPTY" }).returning();
  // All dictionaries stay fixed while only historical term dependants grow.
  async function noise(n: number) {
    const [t] = await db.insert(s.academicTerms).values({ name: `Synthetic history ${n}`, academicYear: 2020, startDate: "2020-01-01", endDate: "2020-05-01", status: "completed" }).returning();
    const [o] = await db.insert(s.courseOfferings).values({ termId: t.id, batchId: diploma.id, courseId: courses[0].id, status: "completed" }).returning();
    const [g] = await db.insert(s.teachingGroups).values({ termId: t.id, courseId: courses[0].id }).returning();
    await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: g.id, offeringId: o.id });
    await db.insert(s.teachingRequirements).values({ teachingGroupId: g.id, expectedWeeklyMinutes: 75 });
    const [m] = await db.insert(s.meetings).values({ teachingGroupId: g.id, dayOfWeek: 0, startMinutes: 480, endMinutes: 555, status: n % 2 ? "cancelled" : "active" }).returning();
    await db.insert(s.meetingTeachers).values({ meetingId: m.id, teacherId: teacher.id });
    await db.insert(s.meetingRooms).values({ meetingId: m.id, roomId: room.id });
    await db.insert(s.permittedWindows).values({ termId: t.id, stream: "DIPLOMA", dayOfWeek: 3, startMinutes: 480, endMinutes: 1020 });
    await db.insert(s.courseEnrollments).values({ termId: t.id, teachingGroupId: g.id, studentId: visitor.id, status: "inactive" });
    if (n === 1) await db.insert(s.courseEnrollments).values({ termId: t.id, teachingGroupId: g.id, studentId: student.id, status: "inactive" });
    return { t, g, o };
  }
  const first = await noise(1);
  // A selected group's cross-term link is retained by owner; projection ignores
  // its foreign offering exactly as before. A teacher-managed group has no meetings.
  const [unscheduled] = await db.insert(s.teachingGroups).values({ termId: term.id, courseId: courses[0].id, deliveryMode: "teacher_managed" }).returning();
  await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: unscheduled.id, offeringId: first.o.id });
  const two = await measure(() => portal.getPortalData());
  signInAs("perf-viewer@example.invalid"); const viewerTwo = await measure(() => portal.getPortalData()); signInAs("admin@example.invalid");
  for (let n = 2; n < 20; n++) await noise(n);
  const twenty = await measure(() => portal.getPortalData());
  assert.deepEqual(twenty.value, two.value, "Historical noise does not change complete portal projection");
  signInAs("perf-viewer@example.invalid"); const viewerTwenty = await measure(() => portal.getPortalData()); signInAs("admin@example.invalid");
  assert.deepEqual(viewerTwo.value, viewerTwenty.value);
  assert.ok(viewerTwenty.value.teachers.every(t => t.email === null && t.phone === null));
  const evidence = await measure(() => locked(tx => batches.batchEvidence(tx, hsc)));
  const emptyEvidence = await measure(() => locked(tx => batches.batchEvidence(tx, emptyCohort)));
  assert.equal(evidence.value.totals.enrollments, 5, "Includes overlap once, merged visitor and home student in another term");
  assert.equal(emptyEvidence.value.totals.enrollments, 0);
  const actions = freshTermActions(loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts"));
  const meetingForm = form({ teachingGroupId: two.value.coverage.find(g => g.courseCode === courses[0].code && g.deliveryMode !== "teacher_managed")!.teachingGroupId, dayOfWeek: 0, startTime: "11:00", endTime: "12:15", teacherIds: teacher.id, roomIds: room.id });
  const create = await measure(() => actions.createMeetingAction(meetingForm));
  assert.equal(create.value.ok, true, JSON.stringify(create.value));
  const repeat = await measure(() => actions.createMeetingAction(meetingForm));
  assert.equal(repeat.value.ok, false);
  signInAs("perf-viewer@example.invalid"); const denied = await measure(() => actions.createMeetingAction(meetingForm)); signInAs("admin@example.invalid");
  assert.equal(denied.value.ok, false);
  const [source] = await db.insert(s.academicTerms).values({ name: "Synthetic performance source", academicYear: 2025, startDate: "2025-01-01", endDate: "2025-05-01", status: "completed" }).returning();
  const [target] = await db.insert(s.academicTerms).values({ name: "Synthetic performance destination", academicYear: 2027, startDate: "2027-01-01", endDate: "2027-05-01", status: "draft", managedSetup: true }).returning();
  await db.insert(s.academicPolicies).values({ termId: target.id });
  const graduates = await db.insert(s.batches).values(["PERF-A", "PERF-B"].map(label => ({ stream: "HSC", label }))).returning();
  await db.insert(s.batchTermPlacements).values(graduates.map(b => ({ batchId: b.id, termId: source.id, semester: 8 })));
  const snapshot = { generatedAt: "2025-01-01T00:00:00.000Z", termName: source.name, versionNumber: 1, meetings: [], batches: graduates.map(b => ({ id: b.id, stream: b.stream, label: b.label })) };
  const [version] = await db.insert(s.scheduleVersions).values({ termId: source.id, versionNumber: 1, snapshot }).returning();
  payloads.add(JSON.stringify(version.snapshot));
  // Stabilize database-generated creation/update instants in this synthetic
  // fixture, rather than masking timestamps or evidence fingerprints in parity.
  const columns = await db.execute<{ table_name: string; column_name: string }>(sql`select table_name,column_name from information_schema.columns where table_schema='public' and column_name in ('created_at','updated_at') and data_type like 'timestamp%'`);
  for (const c of columns.rows) await db.execute(sql`update ${sql.identifier(c.table_name)} set ${sql.identifier(c.column_name)}='2026-01-01T00:00:00Z'`);
  const plan: RolloverPlan = { sourceId: source.id, targetId: target.id, cloneGrid: false, reason: "Synthetic bounded reads", choices: graduates.map(b => ({ batchId: b.id, disposition: "graduate", carryCount: false, reason: "Synthetic graduation", graduateConfirmed: true })) };
  const graduation = await measure(() => locked(async tx => (await rollover.rolloverEvidence(tx, plan)).review));
  const held = await measure(() => locked(async tx => (await rollover.rolloverEvidence(tx, { ...plan, choices: plan.choices.map(c => ({ ...c, disposition: "hold" })) })).review));
  const changed = { ...snapshot, generatedAt: "2025-01-02T00:00:00.000Z" };
  const [changedVersion] = await db.update(s.scheduleVersions).set({ snapshot: changed }).where(eq(s.scheduleVersions.id, version.id)).returning();
  payloads.add(JSON.stringify(changedVersion.snapshot));
  const changedGraduation = await measure(() => locked(async tx => (await rollover.rolloverEvidence(tx, plan)).review));
  assert.notEqual(changedGraduation.value.fingerprint, graduation.value.fingerprint, "New operation sees changed payload at the same version ID");
  // Empty selected term: no dependant-table fallback to an unrestricted read.
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, term.id));
  const [emptyTerm] = await db.insert(s.academicTerms).values({ name: "Synthetic empty active", academicYear: 2028, startDate: "2028-01-01", endDate: "2028-05-01", status: "active" }).returning();
  await db.update(s.termContext).set({ generation: sql`${s.termContext.generation} + 1` });
  const empty = await measure(() => portal.getPortalData());
  assert.equal(empty.value.term.id, emptyTerm.id); assert.equal(empty.value.meetings.length, 0); assert.equal(empty.value.coverage.length, 0);
  const metrics = { two: two.tables, twenty: twenty.tables, evidence: evidence.tables, emptyEvidence: emptyEvidence.tables, create: create.tables, createPortalLoads: create.portalLoads, repeat: repeat.tables, denied: denied.tables, graduation: { tables: graduation.tables, hashes: graduation.hashes }, held: { tables: held.tables, hashes: held.hashes }, changedGraduation: { tables: changedGraduation.tables, hashes: changedGraduation.hashes }, empty: empty.tables };
  if (mode !== "baseline") {
    for (const table of targeted) assert.deepEqual(twenty.tables[table], two.tables[table], `${table} returned rows bounded by active term`);
    assert.equal(create.portalLoads, 1, "One portal load in create validation");
    assert.equal(create.tables.course_offerings.calls, 2, "One portal offering read and one candidate audience query");
    assert.equal(evidence.tables.course_enrollments.rows, 5); assert.equal(emptyEvidence.tables.course_enrollments, undefined);
    assert.equal(graduation.tables.schedule_versions.calls, 1); assert.equal(graduation.hashes, 1);
    assert.equal(held.tables.schedule_versions, undefined); assert.equal(held.hashes, 0);
    assert.equal(changedGraduation.tables.schedule_versions.calls, 1); assert.equal(changedGraduation.hashes, 1);
    for (const table of targeted.filter(t => t !== "permitted_windows")) assert.equal(empty.tables[table]?.rows ?? 0, 0);
  }
  // Full semantic outputs are compared with the separately captured unmodified base.
  report({ outputs: { portal: two.value, viewer: viewerTwo.value, evidence: evidence.value, emptyEvidence: emptyEvidence.value, create: create.value, repeat: repeat.value, denied: denied.value, graduation: graduation.value, held: held.value, changedGraduation: changedGraduation.value, empty: empty.value }, metrics, queries: twenty.queries });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
