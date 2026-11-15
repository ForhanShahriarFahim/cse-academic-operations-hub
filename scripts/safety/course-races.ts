import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { openPostgres, postgresDatabase } from "./database";
import type { PgCluster } from "./pg-cluster";
import { populateSummerFixture } from "./fixture";
import * as s from "../../src/db/schema";
import { courseEvidence, courseFingerprint, saveCourseInTransaction, type CourseTx } from "../../src/lib/course-store";
import { courseDraft } from "../../src/lib/course-records";
import { lockTermContext } from "../../src/lib/term-lock";
import type { Actor } from "../../src/lib/auth/policy";
import type { ActionResult } from "../../src/lib/action-result";
const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
export async function courseRaces(cluster: PgCluster, lines: string[]) {
  const target = await cluster.createDatabase("safe01_crs01a_races"), a = openPostgres(target), b = openPostgres(target), monitor = openPostgres(target);
  try {
    await postgresDatabase(target, async () => {}).migrate(a); const fixture = await populateSummerFixture(a.db);
    await a.exec("update schedule_versions set snapshot=null");
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.id, fixture.adminUserId));
    const actor: Actor = { id: admin.id, email: admin.email, displayName: admin.displayName, teacherId: null, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date(0), activeTo: null }] };
    let sequence = 0;
    const create = () => a.db.insert(s.courses).values({ code: `RACE-${1000 + sequence++}`, title: "Synthetic race", credits: "3", semester: 1 }).returning().then(rows => rows[0]);
    const save = (record: typeof s.courses.$inferSelect | null, patch: Record<string, unknown>) => (tx: CourseTx) => saveCourseInTransaction(tx, actor, { ...courseDraft(record), command: "save", courseId: record?.id ? String(record.id) : "", revision: record ? String(record.revision) : "", reason: "Synthetic race", ...patch });
    async function interleave(first: (tx: CourseTx) => Promise<unknown>, second: (tx: CourseTx) => Promise<unknown>) {
      const held = latch(), finish = latch(), entered = latch();
      const firstResult = a.db.transaction(async tx => { const result = await first(tx as unknown as CourseTx); held.release(); await finish.promise; return result; }).then(value => ({ value }), error => { held.release(); return { error }; });
      await held.promise;
      const secondResult = b.db.transaction(async tx => { await tx.execute(sql`select set_config('application_name','crs01a-contender',true)`); entered.release(); return second(tx as unknown as CourseTx); }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      try {
        let waiting = false; const deadline = Date.now() + 15000;
        while (!waiting && Date.now() < deadline) { waiting = (await monitor.client.query<{ waiting: boolean }>("select exists(select 1 from pg_stat_activity where application_name='crs01a-contender' and wait_event_type='Lock') as waiting")).rows[0].waiting; if (!waiting) await new Promise(resolve => setTimeout(resolve, 15)); }
        assert.ok(waiting, "independent PostgreSQL connection observed waiting on real context lock");
      } finally { finish.release(); }
      const results = await Promise.all([firstResult, secondResult]);
      for (const result of results) if ("error" in result) throw result.error;
      return results.map(result => "value" in result ? result.value : undefined);
    }
    const record = await create(); const stale = await interleave(save(record, { title: "Winner" }), save(record, { title: "Loser" })); assert.equal((stale[0] as ActionResult).ok, true); assert.equal((stale[1] as ActionResult).outcome?.kind, "stale");
    for (const mode of ["create", "rename"] as const) {
      const one = await create(), two = await create();
      const candidate = { ...courseDraft(one), code: `COLLIDE-${mode === "create" ? "1000" : "1001"}` };
      const results = await interleave(save(mode === "create" ? null : one, candidate), save(mode === "create" ? null : two, candidate)); assert.equal((results[0] as ActionResult).ok, true); assert.equal((results[1] as ActionResult).ok, false);
    }
    for (const editFirst of [true, false]) {
      const course = await create();
      const reference = async (tx: CourseTx) => { await lockTermContext(tx, "share"); const [latest] = await tx.select().from(s.courses).where(eq(s.courses.id, course.id)); assert.equal(latest.isActive, true); await tx.insert(s.courseOfferings).values({ termId: fixture.termId, batchId: fixture.batchIds.hsc, courseId: course.id }); return latest.credits; };
      const edit = save(course, { credits: "4.0" });
      const results = await interleave(editFirst ? edit : reference, editFirst ? reference : edit);
      assert.equal(editFirst ? (results[0] as ActionResult).ok : (results[1] as ActionResult).ok, editFirst);
      if (editFirst) assert.equal(results[1], "4.0");
    }
    for (const editFirst of [true, false]) {
      const course = await create();
      const publishRead = async (tx: CourseTx) => { await lockTermContext(tx, "share"); const [latest] = await tx.select().from(s.courses).where(eq(s.courses.id, course.id)); await tx.insert(s.scheduleVersions).values({ termId: fixture.termId, versionNumber: 30 + sequence++, snapshot: { generatedAt: "2026-01-01T00:00:00Z", termName: "Synthetic", versionNumber: 1, meetings: [{ courseCode: latest.code, courseTitle: latest.title }] } }); return latest.title; };
      const edit = save(course, { title: "New title" }); const results = await interleave(editFirst ? edit : publishRead, editFirst ? publishRead : edit);
      if (editFirst) { assert.equal((results[0] as ActionResult).ok, true); assert.equal(results[1], "New title"); }
      else { assert.equal(results[0], "Synthetic race"); assert.equal((results[1] as ActionResult).ok, false); assert.ok((results[1] as { fingerprint: string }).fingerprint); }
      const [latest] = await a.db.select().from(s.courses).where(eq(s.courses.id, course.id));
      const evidence = await courseEvidence(a.db as never, latest); assert.equal(evidence.totals.snapshots, 1); assert.ok(courseFingerprint(evidence));
    }
    lines.push("Independent PostgreSQL transactions observe actual context-lock waiting: stale editors, duplicate create/rename, reference-vs-academic edits and snapshot-capture-vs-title corrections in both commit orders. At most one collision succeeds; newly captured use requires fresh title acknowledgement.");
  } finally { await a.close(); await b.close(); await monitor.close(); await cluster.dropDatabase(target); }
}
