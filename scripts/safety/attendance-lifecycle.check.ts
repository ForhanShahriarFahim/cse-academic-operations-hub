/** ATT-03A: forward migration from a populated database, lifecycle scenarios, races and disposable recovery/reapply. */
import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, openPostgres, postgresDatabase, type DatabaseFactory, type SafetyHandle } from "./database";
import { populateSpringFixture, populateSummerFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { setAuditInsertFault } from "./faults";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";

const LIFECYCLE_COLUMNS = ["status", "revision", "submitted_at", "submitted_by_user_id", "locked_at", "locked_by_user_id", "voided_at", "voided_by_user_id", "void_reason"];
const DEMIGRATE = `alter table attendance_sessions ${LIFECYCLE_COLUMNS.map(column => `drop column ${column}`).join(", ")}; delete from drizzle.__drizzle_migrations where created_at >= 1794873600000`;
const ORIGINAL = "select id, term_id, teaching_group_id, teacher_id, meeting_id, class_date::text, phase, start_minutes, end_minutes, notes, created_at from attendance_sessions order by id";
const LIFECYCLE_ROWS = `update attendance_sessions set status='locked', revision=3, submitted_at=now(), submitted_by_user_id=(select min(id) from portal_users), locked_at=now(), locked_by_user_id=(select min(id) from portal_users) where id=(select min(id) from attendance_sessions);
  insert into audit_events(actor,action,entity,entity_id,detail) select 'Synthetic','attendance.lock','attendance_session',min(id),'{"from":"submitted","to":"locked"}' from attendance_sessions;`;

async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [], database = await factory("att03a lifecycle");
  try {
    await withHandle(database, async h => {
      // Populated 0019 database (both fixture terms, attendance, publications, snapshots, calendar) → 0020.
      await database.migrate(h); const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
      await h.exec(DEMIGRATE);
      const before = await fingerprintDatabase(h.client), originalRows = (await h.client.query(ORIGINAL)).rows;
      await database.migrate(h); const after = await fingerprintDatabase(h.client);
      for (const [name, value] of Object.entries(before.tables)) if (!["drizzle.__drizzle_migrations", "public.attendance_sessions"].includes(name)) assert.deepEqual(after.tables[name], value, name);
      assert.deepEqual((await h.client.query(ORIGINAL)).rows, originalRows, "existing session columns are unchanged");
      const states = (await h.client.query<{ status: string; revision: number; actors: string | null }>("select status, revision, coalesce(submitted_at::text, locked_at::text, voided_at::text, void_reason) as actors from attendance_sessions")).rows;
      assert.ok(states.length > 0); for (const state of states) assert.deepEqual(state, { status: "draft", revision: 0, actors: null }, "existing sessions become unsubmitted drafts");
      await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after, "repeat migration is identical");
      const id = (await h.client.query<{ id: number }>("select min(id) as id from attendance_sessions")).rows[0].id;
      for (const [label, statement] of [
        ["unknown state", `update attendance_sessions set status='archived' where id=${id}`],
        ["submitted without actor", `update attendance_sessions set status='submitted' where id=${id}`],
        ["half actor pair", `update attendance_sessions set submitted_at=now() where id=${id}`],
        ["voided without reason", `update attendance_sessions set status='voided', submitted_at=now(), submitted_by_user_id=(select min(id) from portal_users), voided_at=now(), voided_by_user_id=(select min(id) from portal_users) where id=${id}`],
        ["short reason", `update attendance_sessions set status='voided', submitted_at=now(), submitted_by_user_id=(select min(id) from portal_users), voided_at=now(), voided_by_user_id=(select min(id) from portal_users), void_reason='no' where id=${id}`],
        ["negative revision", `update attendance_sessions set revision=-1 where id=${id}`],
        ["unknown actor", `update attendance_sessions set status='submitted', submitted_at=now(), submitted_by_user_id=999999 where id=${id}`],
      ]) await assert.rejects(h.client.query(statement), Error, label);
      lines.push("Populated 0019→0020 adds lifecycle columns without touching any other table or existing session value; every session becomes an unsubmitted draft; repeat migration is identical; state, actor-pair, reason, revision and actor constraints are enforced.");
    });
  } finally { await database.dispose(); }
  // Scenarios run on a separate Summer-only database whose active term owns the fixture groups.
  const scenarios = await factory("att03a scenarios");
  try {
    await withHandle(scenarios, async h => { await scenarios.migrate(h); await populateSummerFixture(h.db); await setAuditInsertFault(h, false); });
    const child = await scenarios.runChild(path.join(REPO_ROOT, "scripts/safety/children/attendance-lifecycle-scenarios.ts"), [], {
      BETTER_AUTH_SECRET: "synthetic-att-03a-preview-test-secret-only",
    });
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-6000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await scenarios.dispose(); }
  return lines;
}

async function populated(h: Pick<SafetyHandle, "exec" | "db">) { await populateSummerFixture(h.db as never); await h.exec(LIFECYCLE_ROWS); }

async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("att03a backup"), restored = createOwnedRun("att03a restore"), backup = newBackupLocation("att03a lifecycle");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populated({ db: h.db as never, exec: q => h.client.exec(q).then(() => undefined) }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup); assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    const r = await openOwnedPglite(restored); try { await migrateOwned(r); } finally { await r.close(); }
    const again = await openOwnedPglite(restored); try { assert.deepEqual(await fingerprintDatabase(again.client as never), manifest.fingerprint, "reapplying migrations to the restore changes nothing"); } finally { await again.close(); }
    lines.push("Cold PGlite backup/separate restore of a database with a locked session has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_att03a_backup"), restored = await cluster.createDatabase("safe01_att03a_restore"), backup = newBackupLocation("att03a PG"), key = path.join(cluster.run.root, "att03a.key"); createKeyFile(key);
  try {
    const h = openPostgres(source); try { await postgresDatabase(source, async () => {}).migrate(h); await populated(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key); assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    const r = openPostgres(restored); try { await postgresDatabase(restored, async () => {}).migrate(r); assert.deepEqual(await fingerprintDatabase(r.client), manifest.fingerprint, "reapply"); } finally { await r.close(); }
    lines.push("Encrypted PostgreSQL backup/separate restore of a database with a locked session has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}

export async function checkAttendanceLifecycle() { const lines = await exercise(pgliteFactory); await pgliteRecovery(lines); return lines; }
export async function checkAttendanceLifecyclePostgres(bin: string | undefined) {
  return withDisposableCluster(bin, async cluster => { const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await exercise(factoryFor(cluster))]; await postgresRecovery(cluster, lines); return lines; });
}
