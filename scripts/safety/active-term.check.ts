/** BUG-28: actual adapters/migrators, production consumers and independent PostgreSQL locks. */
import assert from "node:assert/strict";
import path from "node:path";
import { sql } from "drizzle-orm";
import { pgliteFactory, withHandle, openPostgres, type DatabaseFactory, type SafetyDatabase, type SafetyHandle } from "./database";
import { populateSummerFixture, populateSpringFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";

const legacy = (h: Pick<SafetyHandle, "exec">) => h.exec("drop index academic_terms_one_active_uq; delete from drizzle.__drizzle_migrations where created_at >= 1793491200000;");
const childPath = path.join(REPO_ROOT, "scripts/safety/children/active-term-scenarios.ts");
const errorCode = (error: unknown): string | undefined => (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;

async function upgrade(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    await database.migrate(h);
    const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
    await legacy(h);
    const before = await fingerprintDatabase(h.client);
    await database.migrate(h);
    const after = await fingerprintDatabase(h.client);
    for (const [name, rows] of Object.entries(before.tables)) if (name !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[name], rows, name);
    for (const [name, value] of Object.entries(before.sequences)) if (name !== "drizzle.__drizzle_migrations_id_seq") assert.equal(after.sequences[name], value, name);
    await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after);
    const index = (await h.client.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname='academic_terms_one_active_uq'")).rows[0].indexdef;
    assert.match(index, /UNIQUE.*\(status\).*WHERE.*active/);
    const rowsBefore = JSON.stringify((await h.client.query("select * from academic_terms order by id")).rows);
    for (const statement of [
      "insert into academic_terms (name,academic_year,start_date,end_date,status) values ('Bad explicit',2030,'2030-01-01','2030-05-01','active')",
      "insert into academic_terms (name,academic_year,start_date,end_date) values ('Bad default',2030,'2030-01-01','2030-05-01')",
      "update academic_terms set status='active' where status <> 'active'",
    ]) await assert.rejects(h.client.query(statement), (error) => errorCode(error) === "23505");
    assert.equal(JSON.stringify((await h.client.query("select * from academic_terms order by id")).rows), rowsBefore);
    await h.exec("insert into academic_terms(name,academic_year,start_date,end_date,status) values ('Historic label',1999,'1999-01-01','1999-05-01','Retained custom status'),('Another draft',2031,'2031-01-01','2031-05-01','draft')");
    await h.exec("update academic_terms set status='completed' where status='active'");
    assert.equal((await h.client.query("select id from academic_terms where status='active'")).rows.length, 0);
    // Only the fixture switches; no production switch function or automatic rewrite.
    await h.exec("update academic_terms set status='active' where name='Summer 2026'");
    await legacy(h); await h.exec("update academic_terms set status='active' where name='Spring 2027'");
    const dirty = await fingerprintDatabase(h.client);
    await assert.rejects(database.migrate(h), (error) => errorCode(error) === "23514");
    assert.deepEqual(await fingerprintDatabase(h.client), dirty, "duplicate migration rolls back schema/data/journal");
    lines.push("Populated 0012→0013, reapply and explicit/default/update uniqueness pass; zero/non-active custom statuses remain valid. Duplicate actual-migrator preflight (23514) preserves complete schema/sequence/table/audit/snapshot/journal fingerprint.");
  });
  for (const mode of ["ambiguous", "none", "one"]) {
    if (mode !== "ambiguous") await withHandle(database, async (h) => { await h.exec("update academic_terms set status='completed' where status='active'"); if (mode === "one") { await h.exec("update academic_terms set status='active' where name='Summer 2026'"); await database.migrate(h); } });
    const beforeDiagnostic = await withHandle(database, h => fingerprintDatabase(h.client));
    const diagnostic = await database.runChild(path.join(REPO_ROOT, "scripts/check-terms.ts"));
    assert.equal(diagnostic.status, mode === "ambiguous" ? 2 : 0, diagnostic.stderr);
    const diagnosticJson = JSON.parse(diagnostic.stdout.slice(diagnostic.stdout.indexOf("{\n"))) as { state: string };
    assert.equal(diagnosticJson.state, mode);
    assert.deepEqual(await withHandle(database, h => fingerprintDatabase(h.client)), beforeDiagnostic, "actual diagnostic is read-only");
    const result = await database.runChild(childPath, [mode]);
    assert.equal(result.status, 0, result.stderr.slice(-6000) || result.stdout.slice(-2000));
    lines.push(...(result.report as { lines: string[] }).lines);
  }
}

const latch = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };
type Transaction = Parameters<Parameters<SafetyHandle["db"]["transaction"]>[0]>[0];
async function races(database: SafetyDatabase, lines: string[]) {
  const a = await database.open(), b = await database.open(), monitor = await database.open();
  try {
    const interleave = async (first: (tx: Transaction) => Promise<unknown>, second: (tx: Transaction) => Promise<unknown>, rollback = false) => {
      const held = latch(), finish = latch();
      const firstResult = a.db.transaction(async (tx) => { const value = await first(tx); held.release(); await finish.promise; if (rollback) throw new Error("BUG28 intentional rollback"); return value; })
        .then(value => ({ value }), (error: unknown) => { held.release(); return { error }; });
      await held.promise;
      const secondResult = b.db.transaction(async (tx) => { await tx.execute(sql`select set_config('application_name', 'bug28-contender', true)`); return second(tx); })
        .then(value => ({ value }), (error: unknown) => ({ error }));
      try {
        const until = Date.now() + 10000;
        let blocked = false;
        while (!blocked && Date.now() < until) {
          blocked = (await monitor.client.query<{ blocked: boolean }>("select exists(select 1 from pg_stat_activity where application_name='bug28-contender' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid)) > 0) as blocked")).rows[0].blocked;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(blocked, "observed real blocking PID before releasing holder");
      } finally { finish.release(); }
      return [await firstResult, await secondResult];
    };
    let count = 0;
    for (const pair of [["update", "update"], ["explicit", "explicit"], ["default", "default"], ["explicit", "update"]] as const) {
      for (const reversed of [false, true]) for (const rollback of [false, true]) {
        await a.exec("update academic_terms set status='draft'");
        const ids = (await a.client.query<{ id: number }>("select id from academic_terms order by id limit 2")).rows;
        const statement = (mode: string, id: number) => mode === "update" ? sql`update academic_terms set status='active' where id=${id}` : mode === "default" ? sql`insert into academic_terms(name,academic_year,start_date,end_date) values ('Race',2040,'2040-01-01','2040-05-01')` : sql`insert into academic_terms(name,academic_year,start_date,end_date,status) values ('Race',2040,'2040-01-01','2040-05-01','active')`;
        const ordered = reversed ? [pair[1], pair[0]] : pair;
        const result = await interleave(tx => tx.execute(statement(ordered[0], ids[0].id)), tx => tx.execute(statement(ordered[1], ids[1].id)), rollback);
        if (rollback) { assert.ok("error" in result[0]); assert.ok("value" in result[1]); }
        else { assert.ok("value" in result[0]); assert.ok("error" in result[1] && errorCode(result[1].error) === "23505"); }
        assert.equal((await a.client.query("select id from academic_terms where status='active'")).rows.length, 1);
        count++;
      }
    }
    // Exercise the actual migration runner while a status writer owns an uncommitted row.
    await a.exec("update academic_terms set status='draft'; update academic_terms set status='active' where name='Summer 2026'");
    await legacy(a);
    const held = latch(), release = latch();
    const writer = a.db.transaction(async tx => { await tx.execute(sql`update academic_terms set status='active' where name='Spring 2027'`); held.release(); await release.promise; });
    const writerResult = writer.then(() => undefined, (e: unknown) => e);
    await held.promise;
    // A named connection is used for deterministic observation of the real migrator's lock.
    await b.exec("set application_name='bug28-migration'");
    const migrating = database.migrate(b).then(() => ({ ok: true }), (error: unknown) => ({ error }));
    try {
      const until = Date.now() + 10000; let blocked = false;
      while (!blocked && Date.now() < until) {
        blocked = (await monitor.client.query<{ blocked: boolean }>("select exists(select 1 from pg_stat_activity where application_name='bug28-migration' and wait_event_type='Lock') as blocked")).rows[0].blocked;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(blocked, "actual migrator waits for pre-existing writer");
    } finally { release.release(); }
    assert.equal(await writerResult, undefined);
    const refused = await migrating; assert.ok("error" in refused && errorCode(refused.error) === "23514");
    await a.exec("update academic_terms set status='draft' where name <> 'Summer 2026'");
    // Hold the actual migrator immediately before its journal insert/commit using a test-only trigger.
    await a.exec("create function public.bug28_journal_barrier() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(28,13); return NEW; end $$; create trigger bug28_journal_barrier before insert on drizzle.__drizzle_migrations for each row execute function public.bug28_journal_barrier();");
    const barrierHeld = latch(), unlock = latch();
    const blocker = monitor.db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(28,13)`); barrierHeld.release(); await unlock.promise; });
    const blockerResult = blocker.then(() => undefined, (error: unknown) => { barrierHeld.release(); return error; });
    await barrierHeld.promise;
    await a.exec("set application_name='bug28-migrator-first'");
    const firstMigration = database.migrate(a).then(() => ({ ok: true }), (error: unknown) => ({ error }));
    const observer = await database.open();
    let secondWriter: Promise<{ ok: boolean } | { error: unknown }> | undefined;
    try {
      const waitFor = async (name: string) => {
        const until = Date.now() + 10000; let blocked = false;
        while (!blocked && Date.now() < until) {
          blocked = (await observer.client.query<{ blocked: boolean }>("select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid)) > 0) as blocked", [name])).rows[0].blocked;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(blocked, `${name} blocked at deterministic barrier`);
      };
      await waitFor("bug28-migrator-first");
      secondWriter = b.db.transaction(async tx => { await tx.execute(sql`select set_config('application_name', 'bug28-later-writer', true)`); await tx.execute(sql`update academic_terms set status='active' where name='Spring 2027'`); })
        .then(() => ({ ok: true }), (error: unknown) => ({ error }));
      await waitFor("bug28-later-writer");
    } finally { unlock.release(); await observer.close(); }
    assert.equal(await blockerResult, undefined);
    assert.ok("ok" in await firstMigration, "actual migration commits first");
    assert.ok(secondWriter); const lost = await secondWriter;
    assert.ok("error" in lost && errorCode(lost.error) === "23505");
    await a.exec("drop trigger bug28_journal_barrier on drizzle.__drizzle_migrations; drop function public.bug28_journal_barrier()");
    await database.migrate(a);
    lines.push(`${count} PostgreSQL uniqueness races use real blocking-PID barriers: explicit/default inserts, updates and mixed pairs, both orders and holder rollback. Actual migrator waits for an earlier duplicate writer then refuses; actual migrator held before journal commit wins before a later writer, which refuses; final real-runner reapply passes.`);
  } finally { await a.close(); await b.close(); await monitor.close(); }
}

async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("bug28 before"), restored = createOwnedRun("bug28 restore"), backup = newBackupLocation("bug28");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populateSummerFixture(h.db as never); await legacy({ exec: async q => { await h.client.exec(q); } }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup);
    const h2 = await openOwnedPglite(source); try { await migrateOwned(h2); } finally { await h2.close(); }
    assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    lines.push("Pre-0013 PGlite cold backup, populated upgrade and separate-target restore recover complete schema/sequence/history fingerprint.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_bug28_backup"), restored = await cluster.createDatabase("safe01_bug28_restore");
  const backup = newBackupLocation("bug28 PG"), key = path.join(cluster.run.root, "bug28.key"); createKeyFile(key);
  const migrator = await factoryFor(cluster)("bug28 restore migrator");
  try {
    const h = openPostgres(source); try { await migrator.migrate(h); await populateSummerFixture(h.db); await legacy(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key);
    const upgraded = openPostgres(source); try { await migrator.migrate(upgraded); } finally { await upgraded.close(); }
    assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    lines.push("Pre-0013 PostgreSQL encrypted backup, populated upgrade and separate-target restore recover complete schema/sequence/history fingerprint.");
  } finally { await migrator.dispose(); await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}
export async function checkActiveTerms(factory: DatabaseFactory = pgliteFactory) {
  const database = await factory("bug28"), lines: string[] = [];
  try {
    const empty = await factory("bug28 empty diagnostic");
    try {
      const missing = await empty.runChild(path.join(REPO_ROOT, "scripts/check-terms.ts"));
      assert.equal(missing.status, 1); assert.match(missing.stderr, /Term diagnostic failed/);
      assert.doesNotMatch(missing.stderr, /password|connectionString|PGlite|SELECT|select |Error:/);
      const before = await withHandle(empty, async h => { await empty.migrate(h); return fingerprintDatabase(h.client); });
      const none = await empty.runChild(path.join(REPO_ROOT, "scripts/check-terms.ts"));
      assert.equal(none.status, 0, none.stderr);
      assert.equal(JSON.parse(none.stdout.slice(none.stdout.indexOf("{\n"))).activeCount, 0);
      assert.deepEqual(await withHandle(empty, h => fingerprintDatabase(h.client)), before);
      const invalid = await empty.runChild(path.join(REPO_ROOT, "scripts/check-terms.ts"), ["--repair"]);
      assert.equal(invalid.status, 1); assert.equal(invalid.stdout, "");
      lines.push("Actual diagnostic safely refuses missing store/table and unsupported repair flag; migrated empty table reports zero without seeding or changing any fingerprint; child exit proves resource closure.");
    } finally { await empty.dispose(); }
    await upgrade(database, lines); if (database.adapter === "postgresql") await races(database, lines); else await pgliteRecovery(lines); return lines;
  }
  finally { await database.dispose(); }
}
export async function checkActiveTermsPostgres(bin: string | undefined) {
  return withDisposableCluster(bin, async cluster => { const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await checkActiveTerms(factoryFor(cluster))]; await postgresRecovery(cluster, lines); return lines; });
}
