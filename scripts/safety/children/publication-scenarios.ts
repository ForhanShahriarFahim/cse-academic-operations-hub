/** BUG-25: the production publish action, alone, from a stale page and against a second publisher. */
import assert from "node:assert/strict";
import { and, asc, eq } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";

const database = loadApp<typeof import("../../../src/db")>("src/db/index.ts"), { db } = database;
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const routine = loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const terms = loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
const termData = loadApp<typeof import("../../../src/lib/term-data")>("src/lib/term-data.ts");
const records = loadApp<typeof import("../../../src/lib/term-records")>("src/lib/term-records.ts");

const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, String(v)); return f; };
const ok = (r: ActionResult) => { assert.equal(r.ok, true, r.message); return r; };
const isStale = (r: ActionResult) => { assert.equal(r.ok, false, r.message); assert.deepEqual(r.outcome, { kind: "stale", reason: "changed" }, r.message); assert.match(r.message, /Nothing was published/); return r; };
const BARRIER = 61026;

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  // An empty managed term: no fixture blockers, and no other publication to disturb.
  const created = ok(await terms.createTermAction(null, form({ name: "BUG-25 publication", academicYear: 2046, startDate: "2046-01-01", endDate: "2046-06-30" })));
  const target = created.outcome?.kind === "success" ? created.outcome.entityId! : 0;
  ok(await terms.saveStartingPolicyAction(null, form({ termId: target, revision: 1, ...Object.fromEntries(records.POLICY_FIELDS.map((k) => [k, k === "extraClassRate" ? 200 : 1])) })));
  const evidence = (await termData.activationEvidence(target))!;
  ok(await terms.activateTermAction(null, form({ termId: target, revision: evidence.target.term.revision, generation: evidence.context.generation, previousActiveId: evidence.active?.term.id ?? "", fingerprint: evidence.fingerprint, reason: "Synthetic publication checks", acknowledge: "on" })));
  const token = (await context.captureActiveContext()).writeContext;
  assert.equal(token.activeTermId, target);

  const versions = () => db.select().from(s.scheduleVersions).where(eq(s.scheduleVersions.termId, target)).orderBy(asc(s.scheduleVersions.versionNumber), asc(s.scheduleVersions.id));
  const audits = () => db.select().from(s.auditEvents).where(and(eq(s.auditEvents.action, "publish"), eq(s.auditEvents.entity, "schedule_version"))).orderBy(asc(s.auditEvents.id));
  const publish = (summary: string, expected: unknown) => routine.publishAction(summary, token, expected as number | null);
  const shape = async () => (await versions()).map((v) => `${v.id}:${v.versionNumber}:${v.state}`).join();
  const otherTerms = JSON.stringify(await db.select().from(s.scheduleVersions).orderBy(asc(s.scheduleVersions.id)));
  const auditStart = (await audits()).length;

  // AC-05: one publisher behaves as before.
  ok(await publish("Synthetic first", null));
  let v = await versions();
  assert.deepEqual(v.map((row) => [row.versionNumber, row.state]), [[1, "published"]]);
  assert.equal((v[0].snapshot as { versionNumber: number }).versionNumber, 1);
  const second = ok(await publish("Synthetic second", v[0].id));
  assert.match(second.message, /^Version 2 published/);
  v = await versions();
  assert.deepEqual(v.map((row) => [row.versionNumber, row.state]), [[1, "superseded"], [2, "published"]]);
  assert.equal((v[1].snapshot as { versionNumber: number }).versionNumber, 2);
  let trail = await audits();
  assert.equal(trail.length, auditStart + 2);
  assert.deepEqual(trail.at(-1)!.before, { versionNumber: 1, state: "published" });
  assert.equal((trail.at(-1)!.after as { versionNumber: number; state: string }).versionNumber, 2);
  assert.equal(trail.at(-1)!.entityId, v[1].id);
  lines.push("A single publication keeps its behaviour: next number, previous version superseded, snapshot number equal to the row, one audit event with the previous version as its before-state.");

  // AC-04: a page that shows anything but the current latest version publishes nothing.
  const settled = await shape();
  const old = isStale(await publish("Synthetic stale page", v[0].id));
  assert.match(old.message, /^Version 2 was published by Synthetic Admin on .+ while this page was open\./);
  for (const expected of [null, undefined, String(v[1].id), 0, -1, v[1].id + 0.5, Number.NaN, {}, v[1].id + 9999]) {
    isStale(await publish("Synthetic invalid page", expected));
    assert.equal(await shape(), settled); assert.equal((await audits()).length, auditStart + 2);
  }
  lines.push("An older, missing, non-numeric or unknown latest-version value returns stale, names the current version where the page was merely behind, and writes no version and no audit event.");

  // AC-03: two approvers, same page state, same moment.
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;
  const control = pool ? await pool.connect() : null;
  const waitFor = async (what: string, query: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (Number((await pool!.query(query)).rows[0].count) > 0) return; await new Promise((r) => setTimeout(r, 15)); }
    assert.fail(`Publication race did not observe ${what}`);
  };
  const waitingOnAdvisory = "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and wait_event='advisory'";
  // A publisher that waits on an advisory lock held by another session which is itself held at the barrier.
  const waitingOnPublisher = `select count(*) from pg_stat_activity a where a.datname=current_database() and a.wait_event='advisory' and exists (select 1 from pg_stat_activity o where o.pid = any(pg_blocking_pids(a.pid)) and o.wait_event='advisory')`;
  async function barrier<T>(event: string, work: () => Promise<T>) {
    await control!.query(`select pg_advisory_lock(${BARRIER})`);
    await pool!.query(`create or replace function bug25_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${BARRIER});return new;end$$;create trigger bug25_barrier before ${event} on schedule_versions for each row execute function bug25_barrier()`);
    try { return await work(); }
    finally { await control!.query(`select pg_advisory_unlock(${BARRIER})`); await pool!.query("drop trigger bug25_barrier on schedule_versions;drop function bug25_barrier()"); }
  }
  try {
    let pair: ActionResult[];
    if (pool && control) {
      pair = await barrier("insert", async () => {
        const one = publish("Synthetic race A", v[1].id); await waitFor("the first publisher at its insert", waitingOnAdvisory);
        const two = publish("Synthetic race B", v[1].id); await waitFor("the second publisher waiting for the first", waitingOnPublisher);
        await control.query(`select pg_advisory_unlock(${BARRIER})`);
        return Promise.all([one, two]);
      });
    } else {
      let entered!: () => void, release!: () => void;
      const held = new Promise<void>((r) => entered = r), finish = new Promise<void>((r) => release = r);
      const one = db.transaction((tx) => database.inDatabaseTransaction(tx, async () => { const result = await publish("Synthetic race A", v[1].id); entered(); await finish; return result; }));
      await held; let done = false; const two = publish("Synthetic race B", v[1].id).then((result) => { done = true; return result; });
      await new Promise((r) => setTimeout(r, 25)); assert.equal(done, false, "second publisher queues behind the open publication"); release();
      pair = await Promise.all([one, two]);
    }
    ok(pair[0]); assert.match(pair[0].message, /^Version 3 published/);
    assert.match(isStale(pair[1]).message, /^Version 3 was published by Synthetic Admin/);
    v = await versions();
    assert.deepEqual(v.map((row) => [row.versionNumber, row.state]), [[1, "superseded"], [2, "superseded"], [3, "published"]]);
    assert.equal((await audits()).length, auditStart + 3);
    lines.push(`${pool ? "PostgreSQL: the second publisher was observed waiting on the first publisher's lock (blocking PID) while the first was held at its insert" : "PGlite: the second request queued behind the open publication"}; exactly one succeeded as version 3, the other received stale naming version 3; one new version, one published row, one audit event.`);

    // Backstop: a version row written outside the lock while a publication is in flight.
    if (pool && control) {
      const before = (await audits()).length;
      const result = await barrier("update", async () => {
        const one = publish("Synthetic backstop", v[2].id); await waitFor("the publisher at its supersede step", waitingOnAdvisory);
        await pool.query("insert into schedule_versions(term_id,version_number,state,change_summary) values ($1,4,'superseded','Synthetic outside writer')", [target]);
        await control.query(`select pg_advisory_unlock(${BARRIER})`);
        return one;
      });
      isStale(result);
      v = await versions();
      assert.deepEqual(v.map((row) => [row.versionNumber, row.state]), [[1, "superseded"], [2, "superseded"], [3, "published"], [4, "superseded"]]);
      assert.equal((await audits()).length, before);
      await db.delete(s.scheduleVersions).where(and(eq(s.scheduleVersions.termId, target), eq(s.scheduleVersions.versionNumber, 4)));
      lines.push("PostgreSQL backstop: a version row inserted outside the lock mid-publication turns the unique violation into stale; the supersede and audit writes roll back and version 3 stays published.");
    }
  } finally { control?.release(); await pool?.end(); }

  trail = await audits();
  assert.equal(new Set((await versions()).map((row) => row.versionNumber)).size, 3);
  const untouched = (await db.select().from(s.scheduleVersions).orderBy(asc(s.scheduleVersions.id))).filter((row) => row.termId !== target);
  assert.equal(JSON.stringify(untouched), otherTerms, "other terms' versions are unchanged");
  report({ lines });
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
