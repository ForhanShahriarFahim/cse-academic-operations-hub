import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { openPostgres, postgresDatabase } from "./database";
import type { PgCluster } from "./pg-cluster";
import { populateSummerFixture } from "./fixture";
import * as s from "../../src/db/schema";
import { changeClassGroupInTransaction, termClassGroups, type ClassGroupResult, type ClassGroupTx } from "../../src/lib/class-group-store";
import { changeOfferingsInTransaction, termOfferings, type OfferingResult, type OfferingTx } from "../../src/lib/offering-store";
import { lockTermContext } from "../../src/lib/term-lock";
import type { Actor } from "../../src/lib/auth/policy";

const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
type Work = (tx: ClassGroupTx) => Promise<unknown>;

/** Independent PostgreSQL connections; the contender must be observed waiting on a real lock. */
export async function classGroupRaces(cluster: PgCluster, lines: string[]) {
  const target = await cluster.createDatabase("safe01_crs01c_races"), a = openPostgres(target), b = openPostgres(target), monitor = openPostgres(target);
  try {
    await postgresDatabase(target, async () => {}).migrate(a); const fixture = await populateSummerFixture(a.db);
    await a.exec("update schedule_versions set snapshot=null");
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.id, fixture.adminUserId));
    const actor: Actor = { id: admin.id, email: admin.email, displayName: admin.displayName, teacherId: null, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date(0), activeTo: null }] };
    const [fall] = await a.db.insert(s.academicTerms).values({ name: "Fall 2026", academicYear: 2026, startDate: "2026-10-15", endDate: "2027-02-15", status: "draft" }).returning();
    const cohorts = await a.db.insert(s.batches).values(Array.from({ length: 8 }, (_, index) => ({ stream: "HSC", label: `23${String.fromCharCode(75 + index)}`, sortOrder: 10 + index }))).returning();
    await a.db.insert(s.batchTermPlacements).values(cohorts.map(cohort => ({ batchId: cohort.id, termId: fall.id, semester: 7 })));
    const [theory] = await a.db.select().from(s.courses).orderBy(s.courses.id);
    const offerings = await a.db.insert(s.courseOfferings).values(cohorts.map(cohort => ({ termId: fall.id, batchId: cohort.id, courseId: theory.id, status: "planned" }))).returning();
    const [teacher] = await a.db.insert(s.teachers).values({ shortCode: "SYR", fullName: "Synthetic Race Teacher" }).returning();
    const base = { termId: String(fall.id), courseId: String(theory.id), delivery: "fixed", meetings: "2", minutes: "150" };
    const create = (offeringId: number, teachers: Array<[number, string]> = []): Work => tx => changeClassGroupInTransaction(tx, actor, { ...base, command: "create" }, { offerings: [String(offeringId)], teacherIds: teachers.map(row => String(row[0])), units: teachers.map(row => row[1]) });
    const groupsOf = (offeringId: number) => a.db.select().from(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.offeringId, offeringId));
    const view = async () => (await termClassGroups(a.db as never, fall.id))!;

    async function interleave(first: Work, second: Work) {
      const held = latch(), finish = latch(), entered = latch();
      const firstResult = a.db.transaction(async tx => { const result = await first(tx as unknown as ClassGroupTx); held.release(); await finish.promise; return result; }).then(value => ({ value }), error => { held.release(); return { error }; });
      await held.promise;
      const secondResult = b.db.transaction(async tx => { await tx.execute(sql`select set_config('application_name','crs01c-contender',true)`); entered.release(); return second(tx as unknown as ClassGroupTx); }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      try {
        let waiting = false; const deadline = Date.now() + 15000;
        while (!waiting && Date.now() < deadline) { waiting = (await monitor.client.query<{ waiting: boolean }>("select exists(select 1 from pg_stat_activity where application_name='crs01c-contender' and wait_event_type='Lock') as waiting")).rows[0].waiting; if (!waiting) await new Promise(resolve => setTimeout(resolve, 15)); }
        assert.ok(waiting, "independent PostgreSQL connection observed waiting on a real lock");
      } finally { finish.release(); }
      const results = await Promise.all([firstResult, secondResult]);
      for (const result of results) if ("error" in result) throw result.error;
      return results.map(result => "value" in result ? result.value : undefined) as [unknown, unknown];
    }

    // Two simultaneous creates for one offering: exactly one class group.
    const twins = await interleave(create(offerings[0].id), create(offerings[0].id)) as [ClassGroupResult, ClassGroupResult];
    assert.equal(twins[0].ok, true); assert.equal(twins[1].outcome?.kind, "conflict"); assert.equal((await groupsOf(offerings[0].id)).length, 1);

    // Two editors apply the same reviewed edit: the second waits on the term row, then is stale.
    const group = (await view()).groups[0];
    const edit: Work = tx => changeClassGroupInTransaction(tx, actor, { ...base, command: "update", groupId: String(group.id), fingerprint: group.fingerprint, reason: "Synthetic race" }, { offerings: [String(offerings[0].id)], teacherIds: [String(teacher.id)], units: ["3.00"] });
    const edits = await interleave(edit, edit) as [ClassGroupResult, ClassGroupResult];
    assert.equal(edits[0].ok, true); assert.equal(edits[1].outcome?.kind, "stale");
    assert.equal((await a.db.select().from(s.workloadAllocations).where(and(eq(s.workloadAllocations.teachingGroupId, group.id), eq(s.workloadAllocations.teacherId, teacher.id)))).length, 1, "one allocation, never two");

    // Different offerings of one term still serialize, and both succeed.
    const apart = await interleave(create(offerings[1].id), create(offerings[2].id)) as [ClassGroupResult, ClassGroupResult];
    assert.equal(apart[0].ok, true); assert.equal(apart[1].ok, true);

    // Class-group creation versus cancelling the same offering, both commit orders.
    for (const groupFirst of [true, false]) {
      const offering = offerings[groupFirst ? 3 : 4], cohort = cohorts[groupFirst ? 3 : 4];
      const fingerprint = (await termOfferings(a.db as never, fall.id, fixture.termId))!.cohorts.find(item => item.batchId === cohort.id)!.fingerprint;
      const cancel: Work = tx => changeOfferingsInTransaction(tx as unknown as OfferingTx, actor, { command: "cancel", termId: String(fall.id), offeringId: String(offering.id), fingerprint, reason: "Synthetic race" });
      const results = await interleave(groupFirst ? create(offering.id) : cancel, groupFirst ? cancel : create(offering.id));
      const grouped = (groupFirst ? results[0] : results[1]) as ClassGroupResult, cancelled = (groupFirst ? results[1] : results[0]) as OfferingResult;
      const [row] = await a.db.select().from(s.courseOfferings).where(eq(s.courseOfferings.id, offering.id));
      if (groupFirst) { assert.equal(grouped.ok, true); assert.equal(cancelled.ok, false, "an offering in a class group cannot be cancelled"); assert.equal(row.status, "planned"); assert.equal((await groupsOf(offering.id)).length, 1); }
      else { assert.equal(cancelled.ok, true); assert.equal(grouped.ok, false, "a cancelled offering cannot get a class group"); assert.equal(row.status, "cancelled"); assert.equal((await groupsOf(offering.id)).length, 0); }
    }

    // Teacher lifecycle writers lock the teacher row (teacher-actions.ts). Deactivation first: the assignment waits, then is refused.
    const [second] = await a.db.insert(s.teachers).values({ shortCode: "SYQ", fullName: "Synthetic Race Teacher Two" }).returning();
    const retire: Work = async tx => { await tx.select().from(s.teachers).where(eq(s.teachers.id, second.id)).for("update"); await tx.update(s.teachers).set({ status: "inactive" }).where(eq(s.teachers.id, second.id)); return "inactive"; };
    const late = await interleave(retire, create(offerings[5].id, [[second.id, "3.00"]])) as [string, ClassGroupResult];
    assert.equal(late[1].ok, false, "a teacher deactivated first cannot be assigned"); assert.equal((await groupsOf(offerings[5].id)).length, 0);
    // Assignment first: the lifecycle writer waits on the teacher row and then sees the committed allocation.
    const [third] = await a.db.insert(s.teachers).values({ shortCode: "SYP", fullName: "Synthetic Race Teacher Three" }).returning();
    const observe: Work = async tx => { await tx.select().from(s.teachers).where(eq(s.teachers.id, third.id)).for("update"); return (await tx.select().from(s.workloadAllocations).where(eq(s.workloadAllocations.teacherId, third.id))).length; };
    const early = await interleave(create(offerings[5].id, [[third.id, "3.00"]]), observe) as [ClassGroupResult, number];
    assert.equal(early[0].ok, true); assert.equal(early[1], 1, "the teacher writer decides on the committed allocation");

    // Cohort lifecycle and rollover commits hold the exclusive context lock: a class-group writer waits, then decides on the committed cohort state.
    const graduate: Work = async tx => { await lockTermContext(tx, "exclusive"); await tx.update(s.batches).set({ status: "graduated" }).where(eq(s.batches.id, cohorts[6].id)); return "graduated"; };
    const after = await interleave(graduate, create(offerings[6].id)) as [string, ClassGroupResult];
    assert.equal(after[1].ok, false); assert.equal((await groupsOf(offerings[6].id)).length, 0);
    // The reverse order: an in-flight class-group write makes the exclusive writer wait.
    const reverse = await interleave(create(offerings[7].id), async tx => { await lockTermContext(tx, "exclusive"); return (await tx.select().from(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.offeringId, offerings[7].id))).length; }) as [ClassGroupResult, number];
    assert.equal(reverse[0].ok, true); assert.equal(reverse[1], 1, "the exclusive writer sees the committed class group");

    lines.push("Independent PostgreSQL transactions observe actual lock waiting: two creates for one offering (one class group, second is a conflict), two editors applying one reviewed edit (second is stale, one allocation), different offerings of one term (serialized, both succeed), class-group creation versus cancelling the same offering in both commit orders (never a grouped cancelled offering), teacher deactivation versus assignment in both orders, and class-group writes against exclusive context-lock holders in both orders, the lock cohort lifecycle and rollover commits take.");
  } finally { await a.close(); await b.close(); await monitor.close(); await cluster.dropDatabase(target); }
}
