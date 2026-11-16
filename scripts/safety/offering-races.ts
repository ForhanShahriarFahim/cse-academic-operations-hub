import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { openPostgres, postgresDatabase } from "./database";
import type { PgCluster } from "./pg-cluster";
import { populateSummerFixture } from "./fixture";
import * as s from "../../src/db/schema";
import { changeOfferingsInTransaction, termOfferings, type OfferingResult, type OfferingTx } from "../../src/lib/offering-store";
import { courseEvidence, courseLifecycleFingerprint, saveCourseInTransaction, type CourseResult, type CourseTx } from "../../src/lib/course-store";
import { lockTermContext } from "../../src/lib/term-lock";
import type { Actor } from "../../src/lib/auth/policy";

const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
type Work = (tx: OfferingTx) => Promise<unknown>;

/** Independent PostgreSQL connections; the contender must be observed waiting on a real lock. */
export async function offeringRaces(cluster: PgCluster, lines: string[]) {
  const target = await cluster.createDatabase("safe01_crs01b_races"), a = openPostgres(target), b = openPostgres(target), monitor = openPostgres(target);
  try {
    await postgresDatabase(target, async () => {}).migrate(a); const fixture = await populateSummerFixture(a.db);
    await a.exec("update schedule_versions set snapshot=null");
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.id, fixture.adminUserId));
    const actor: Actor = { id: admin.id, email: admin.email, displayName: admin.displayName, teacherId: null, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date(0), activeTo: null }] };
    const [fall] = await a.db.insert(s.academicTerms).values({ name: "Fall 2026", academicYear: 2026, startDate: "2026-10-15", endDate: "2027-02-15", status: "draft" }).returning();
    const [cohort, other] = await a.db.insert(s.batches).values([{ stream: "HSC", label: "23X", sortOrder: 4 }, { stream: "HSC", label: "23Y", sortOrder: 5 }]).returning();
    await a.db.insert(s.batchTermPlacements).values([{ batchId: cohort.id, termId: fall.id, semester: 7 }, { batchId: other.id, termId: fall.id, semester: 7 }]);
    const [theory, sessional] = await a.db.select().from(s.courses).orderBy(s.courses.id);
    let sequence = 0;
    const course = () => a.db.insert(s.courses).values({ code: `RACE-${2000 + sequence++}`, title: "Synthetic race", credits: "3.0", semester: 7 }).returning().then(rows => rows[0]);
    const view = async () => (await termOfferings(a.db as never, fall.id, fixture.termId))!;
    const fingerprint = async (batchId: number) => (await view()).cohorts.find(item => item.batchId === batchId)!.fingerprint;
    const offerings = (batchId: number, courseId: number) => a.db.select().from(s.courseOfferings).where(and(eq(s.courseOfferings.termId, fall.id), eq(s.courseOfferings.batchId, batchId), eq(s.courseOfferings.courseId, courseId)));
    const change = (raw: Record<string, unknown>, picks: string[] = []): Work => tx => changeOfferingsInTransaction(tx, actor, { termId: String(fall.id), ...raw }, picks);

    async function interleave(first: Work, second: Work) {
      const held = latch(), finish = latch(), entered = latch();
      const firstResult = a.db.transaction(async tx => { const result = await first(tx as unknown as OfferingTx); held.release(); await finish.promise; return result; }).then(value => ({ value }), error => { held.release(); return { error }; });
      await held.promise;
      const secondResult = b.db.transaction(async tx => { await tx.execute(sql`select set_config('application_name','crs01b-contender',true)`); entered.release(); return second(tx as unknown as OfferingTx); }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      try {
        let waiting = false; const deadline = Date.now() + 15000;
        while (!waiting && Date.now() < deadline) { waiting = (await monitor.client.query<{ waiting: boolean }>("select exists(select 1 from pg_stat_activity where application_name='crs01b-contender' and wait_event_type='Lock') as waiting")).rows[0].waiting; if (!waiting) await new Promise(resolve => setTimeout(resolve, 15)); }
        assert.ok(waiting, "independent PostgreSQL connection observed waiting on a real lock");
      } finally { finish.release(); }
      const results = await Promise.all([firstResult, secondResult]);
      for (const result of results) if ("error" in result) throw result.error;
      return results.map(result => "value" in result ? result.value : undefined) as [unknown, unknown];
    }

    // Two editors apply the same reviewed start: the second waits on the term row, then is stale.
    const reviewed = (await view()).startFingerprint, start = change({ command: "start", sourceId: String(fixture.termId), fingerprint: reviewed, reason: "Synthetic race" }, [`${cohort.id}:${theory.id}`]);
    const starts = await interleave(start, start) as [OfferingResult, OfferingResult];
    assert.equal(starts[0].ok, true); assert.equal(starts[1].outcome?.kind, "stale"); assert.equal((await offerings(cohort.id, theory.id)).length, 1);

    // Identical simultaneous adds: exactly one offering.
    const cohortFp = await fingerprint(other.id), add = change({ command: "add", batchId: String(other.id), courseId: String(sessional.id), fingerprint: cohortFp });
    const adds = await interleave(add, add) as [OfferingResult, OfferingResult];
    assert.equal(adds[0].ok, true); assert.equal(adds[1].ok, false); assert.equal((await offerings(other.id, sessional.id)).length, 1);

    // Different cohorts of the same term still serialize, and the second then succeeds on fresh state.
    const one = await course(), two = await course();
    const separate = await interleave(change({ command: "add", batchId: String(cohort.id), courseId: String(one.id), fingerprint: await fingerprint(cohort.id) }), change({ command: "add", batchId: String(other.id), courseId: String(two.id), fingerprint: await fingerprint(other.id) })) as [OfferingResult, OfferingResult];
    assert.equal(separate[0].ok, true); assert.equal(separate[1].ok, true);

    // Offering creation versus catalog deactivation, both commit orders.
    for (const offerFirst of [true, false]) {
      const subject = await course();
      const evidence = await courseEvidence(a.db as never, subject);
      const deactivate: Work = tx => saveCourseInTransaction(tx as unknown as CourseTx, actor, { command: "deactivate", courseId: String(subject.id), revision: String(subject.revision), reason: "Synthetic race", confirmation: subject.code, acknowledge: "on", fingerprint: courseLifecycleFingerprint(subject, "deactivate", evidence) });
      const offer = change({ command: "add", batchId: String(cohort.id), courseId: String(subject.id), fingerprint: await fingerprint(cohort.id) });
      const results = await interleave(offerFirst ? offer : deactivate, offerFirst ? deactivate : offer);
      const offered = (offerFirst ? results[0] : results[1]) as OfferingResult, retired = (offerFirst ? results[1] : results[0]) as CourseResult;
      const [latest] = await a.db.select().from(s.courses).where(eq(s.courses.id, subject.id));
      if (offerFirst) { assert.equal(offered.ok, true); assert.equal(retired.ok, false, "a newly offered course cannot be deactivated"); assert.equal(latest.isActive, true); assert.equal((await offerings(cohort.id, subject.id)).length, 1); }
      else { assert.equal(retired.ok, true); assert.equal(offered.ok, false, "an inactive course cannot be offered"); assert.equal(latest.isActive, false); assert.equal((await offerings(cohort.id, subject.id)).length, 0); }
    }

    // Cohort lifecycle and rollover commits hold the exclusive context lock (batch-actions.ts, rollover-actions.ts):
    // an offering writer waits behind that lock and then decides on the committed cohort state.
    const late = await course(), lateFp = await fingerprint(other.id);
    const graduate: Work = async tx => { await lockTermContext(tx, "exclusive"); await tx.update(s.batches).set({ status: "graduated" }).where(eq(s.batches.id, other.id)); return "graduated"; };
    const afterLifecycle = await interleave(graduate, change({ command: "add", batchId: String(other.id), courseId: String(late.id), fingerprint: lateFp })) as [string, OfferingResult];
    assert.equal(afterLifecycle[1].ok, false); assert.equal((await offerings(other.id, late.id)).length, 0);
    // The reverse order: an in-flight offering write makes the exclusive writer wait.
    const early = await course();
    const reverse = await interleave(change({ command: "add", batchId: String(cohort.id), courseId: String(early.id), fingerprint: await fingerprint(cohort.id) }), async tx => { await lockTermContext(tx, "exclusive"); return (await tx.select().from(s.courseOfferings).where(and(eq(s.courseOfferings.termId, fall.id), eq(s.courseOfferings.courseId, early.id)))).length; }) as [OfferingResult, number];
    assert.equal(reverse[0].ok, true); assert.equal(reverse[1], 1, "the exclusive writer sees the committed offering");

    lines.push("Independent PostgreSQL transactions observe actual lock waiting: two editors applying one reviewed start (second is stale), identical simultaneous adds (one offering), different cohorts of one term (serialized, both succeed), offering-vs-catalog-deactivation in both commit orders (never an offered inactive course), and offering writes against exclusive context-lock holders in both orders, the lock cohort lifecycle and rollover commits take.");
  } finally { await a.close(); await b.close(); await monitor.close(); await cluster.dropDatabase(target); }
}
