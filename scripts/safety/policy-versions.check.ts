/** SET-01B: forward migration from a populated database, reviewed policy scenarios, races and disposable recovery/reapply. */
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

const DEMIGRATE = `drop table academic_policy_versions; drop function academic_policy_versions_guard(); delete from drizzle.__drizzle_migrations where created_at >= 1794960000000`;
const VERSION_ROWS = `insert into academic_policy_versions(term_id, version, status, effective_from, extra_load_threshold_credits, extra_class_rate, theory_attendance_marks, sessional_attendance_marks, reason, proposed_by_user_id, proposal_fingerprint, decided_by_user_id, decided_at, decision_fingerprint)
  select t.id, 2, 'approved', t.start_date + 30, 15, 260, 10, 5, 'Synthetic recovery version', (select min(id) from portal_users), 'synthetic', (select max(id) from portal_users), now(), 'synthetic' from academic_terms t where t.status = 'active';
  insert into audit_events(actor,action,entity,entity_id) select 'Synthetic','policy.approve','academic_policy_version',min(id) from academic_policy_versions;`;

async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [], database = await factory("set01b migration");
  try {
    await withHandle(database, async h => {
      // Populated 0020 database (both fixture terms, policies, claims, attendance, publications) → 0021.
      await database.migrate(h); const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
      await h.exec(DEMIGRATE);
      const before = await fingerprintDatabase(h.client);
      await database.migrate(h); const after = await fingerprintDatabase(h.client);
      for (const [name, value] of Object.entries(before.tables)) if (name !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[name], value, name);
      assert.equal((after.tables["public.academic_policy_versions"] as { rows: number }).rows, 0, "no version rows are invented");
      await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after, "repeat migration is identical");
      lines.push("Populated 0020→0021 adds the empty version table without touching any existing table (policies, claims, attendance, publications); repeat migration is identical.");
    });
  } finally { await database.dispose(); }
  const scenarios = await factory("set01b scenarios");
  try {
    await withHandle(scenarios, async h => { await scenarios.migrate(h); await populateSummerFixture(h.db); await setAuditInsertFault(h, false); });
    const child = await scenarios.runChild(path.join(REPO_ROOT, "scripts/safety/children/policy-versions-scenarios.ts"), [], {
      BETTER_AUTH_SECRET: "synthetic-set-01b-preview-test-secret-only",
    });
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-6000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await scenarios.dispose(); }
  return lines;
}

async function populated(h: Pick<SafetyHandle, "exec" | "db">) { await populateSummerFixture(h.db as never); await h.exec(VERSION_ROWS); }

async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("set01b backup"), restored = createOwnedRun("set01b restore"), backup = newBackupLocation("set01b policy");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populated({ db: h.db as never, exec: q => h.client.exec(q).then(() => undefined) }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup); assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    const r = await openOwnedPglite(restored); try { await migrateOwned(r); } finally { await r.close(); }
    const again = await openOwnedPglite(restored); try { assert.deepEqual(await fingerprintDatabase(again.client as never), manifest.fingerprint, "reapplying migrations to the restore changes nothing"); } finally { await again.close(); }
    lines.push("Cold PGlite backup/separate restore of a database with an approved policy version has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_set01b_backup"), restored = await cluster.createDatabase("safe01_set01b_restore"), backup = newBackupLocation("set01b PG"), key = path.join(cluster.run.root, "set01b.key"); createKeyFile(key);
  try {
    const h = openPostgres(source); try { await postgresDatabase(source, async () => {}).migrate(h); await populated(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key); assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    const r = openPostgres(restored); try { await postgresDatabase(restored, async () => {}).migrate(r); assert.deepEqual(await fingerprintDatabase(r.client), manifest.fingerprint, "reapply"); } finally { await r.close(); }
    lines.push("Encrypted PostgreSQL backup/separate restore of a database with an approved policy version has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}

export async function checkPolicyVersions() { const lines = await exercise(pgliteFactory); await pgliteRecovery(lines); return lines; }
export async function checkPolicyVersionsPostgres(bin: string | undefined) {
  return withDisposableCluster(bin, async cluster => { const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await exercise(factoryFor(cluster))]; await postgresRecovery(cluster, lines); return lines; });
}
