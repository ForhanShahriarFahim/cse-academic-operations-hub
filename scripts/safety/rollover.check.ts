import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, openPostgres, postgresDatabase, type DatabaseFactory, type SafetyHandle } from "./database";
import { populateSummerFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";

async function exercise(factory: DatabaseFactory) {
  const database = await factory("bat01b_rollover"), lines: string[] = [];
  try {
    await withHandle(database,async h => {
      await database.migrate(h);await populateSummerFixture(h.db);
      await h.exec("drop table term_rollovers;delete from drizzle.__drizzle_migrations where created_at >= 1794096000000");
      const before = await fingerprintDatabase(h.client);
      await database.migrate(h);
      const after = await fingerprintDatabase(h.client);
      for (const [table,hash] of Object.entries(before.tables)) if (table !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[table],hash,table);
      await database.migrate(h);assert.deepEqual(await fingerprintDatabase(h.client),after);
      lines.push("Populated 0015→0016 adds the rollover receipt without changing any existing table/row/snapshot fingerprint; repeat migration is identical.");
    });
    const child = await database.runChild(path.join(REPO_ROOT,"scripts/safety/children/rollover-scenarios.ts"));
    assert.equal(child.status,0,child.stderr.slice(-9000) || child.stdout.slice(-6000));lines.push(...(child.report as {lines:string[]}).lines);
  } finally {await database.dispose();}
  return lines;
}
async function recoveryFixture(h: Pick<SafetyHandle,"exec">) {
  await h.exec("insert into academic_terms(name,academic_year,start_date,end_date,status) values('Synthetic recovery destination',2027,'2027-01-01','2027-05-01','draft');insert into term_rollovers(source_term_id,target_term_id,actor_user_id,reason,summary) select s.id,t.id,u.id,'Synthetic rollover recovery receipt','{\"fingerprint\":\"synthetic\",\"source\":\"Summer 2026\",\"target\":\"Synthetic recovery destination\",\"decisions\":[],\"grid\":{\"patterns\":0,\"plans\":0,\"windows\":0,\"excludedExceptions\":0,\"legacyWindows\":0},\"warnings\":[]}'::jsonb from academic_terms s cross join academic_terms t cross join portal_users u where s.name='Summer 2026' and t.name='Synthetic recovery destination' and u.email='admin@example.invalid'");
}
async function pgliteRecovery(lines:string[]) {
  const source = createOwnedRun("bat01b_backup"), restored = createOwnedRun("bat01b_restore"), backup = newBackupLocation("bat01b PGlite");
  try {
    const h = await openOwnedPglite(source);try {await migrateOwned(h);await populateSummerFixture(h.db as unknown as SafetyHandle["db"]);await recoveryFixture({exec:async text => {await h.client.exec(text);}});}finally {await h.close();}
    const manifest = await createColdBackup(source,backup);await restoreColdBackup(backup,restored);
    const r = await openOwnedPglite(restored);try {assert.deepEqual(await fingerprintDatabase(r.client as unknown as SafetyHandle["client"]),manifest.fingerprint);}finally {await r.close();}
    lines.push("Cold PGlite backup and separate owned-target restore preserve the new receipt, schema, rows and sequences with an identical full database fingerprint.");
  }finally {removeOwnedRun(source);removeOwnedRun(restored);removeBackup(backup);}
}
async function postgresRecovery(cluster:PgCluster,lines:string[]) {
  const source = await cluster.createDatabase("safe01_bat01b_backup"), restored = await cluster.createDatabase("safe01_bat01b_restore"), backup = newBackupLocation("bat01b PG"), key = path.join(cluster.run.root,"bat01b.key");createKeyFile(key);
  try {
    const h = openPostgres(source);try {await postgresDatabase(source,async() => {}).migrate(h);await populateSummerFixture(h.db);await recoveryFixture(h);}finally {await h.close();}
    const manifest = await createEncryptedBackup(cluster,source,backup,key);assert.deepEqual((await restoreEncryptedBackup(cluster,backup,key,restored,source)).fingerprint,manifest.fingerprint);
    lines.push("Encrypted PostgreSQL backup and separate-target restore preserve the rollover receipt and all populated data/schema with an identical full fingerprint.");
  }finally {await cluster.dropDatabase(source);await cluster.dropDatabase(restored);removeBackup(backup);}
}
export async function checkRollover() {const lines = await exercise(pgliteFactory);await pgliteRecovery(lines);return lines;}
export async function checkRolloverPostgres(bin: string | undefined) {return withDisposableCluster(bin,async cluster => {const lines = await exercise(factoryFor(cluster));await postgresRecovery(cluster,lines);return lines;});}
