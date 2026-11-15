import assert from "node:assert/strict";
import path from "node:path";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pgliteFactory, withHandle, openPostgres, postgresDatabase, type DatabaseFactory, type SafetyDatabase } from "./database";
import { populateSummerFixture } from "./fixture";
import { fingerprintDatabase, selectFingerprint } from "./fingerprint";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";
import { courseRaces } from "./course-races";

const demigrate = "drop index courses_canonical_code_idx;alter table courses drop column revision;delete from drizzle.__drizzle_migrations where created_at >= 1794700800000";
async function oldBaseline(database: SafetyDatabase, lines: string[]) {
  const run = createOwnedRun("crs01a 0009 migration source");
  try {
    const folder = path.join(run.root, "migrations"); mkdirSync(path.join(folder, "meta"), { recursive: true });
    const journal = JSON.parse(readFileSync(path.join(REPO_ROOT, "drizzle/meta/_journal.json"), "utf8")); journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 9);
    writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) copyFileSync(path.join(REPO_ROOT, "drizzle", `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
    await withHandle(database, async h => {
      await database.migrateFrom(h, folder);
      await h.exec(`insert into departments(code,name) values('CSE','Synthetic');insert into academic_terms(name,academic_year,start_date,end_date,status) values('Synthetic 0009',2026,'2026-01-01','2026-05-01','active');insert into courses(code,title,credits,course_type,owning_department_id,semester,needs_lab,required_room_capability,is_active) values(' legacy code ','Legacy title',0,'legacy',1,99,true,'old-token',false),('CSE-1101','Theory',3,'theory',1,1,false,null,true);insert into batches(stream,label,student_count) values('HSC','SYN',20);insert into batch_term_placements(batch_id,term_id,semester) values(1,1,1);insert into course_offerings(course_id,batch_id,term_id) values(1,1,1);insert into teaching_groups(course_id,term_id,delivery_mode) values(1,1,'teacher_managed');insert into teaching_group_offerings(teaching_group_id,offering_id) values(1,1);insert into schedule_versions(term_id,version_number,state,snapshot) values(1,1,'published','{"old":"unsupported preserved bytes"}'),(1,2,'superseded','{"generatedAt":"2026-01-01T00:00:00Z","termName":"Synthetic","versionNumber":2,"meetings":[]}');`);
      const columns = "id,code,title,credits,course_type,owning_department_id,semester,needs_lab,required_room_capability,is_active";
      const courses = await selectFingerprint(h.client, `select ${columns} from courses`), snapshots = await selectFingerprint(h.client, "select * from schedule_versions"), offerings = await selectFingerprint(h.client, "select * from course_offerings"), groups = await selectFingerprint(h.client, "select * from teaching_groups");
      await database.migrate(h);
      assert.deepEqual(await selectFingerprint(h.client, `select ${columns} from courses`), courses); assert.deepEqual(await selectFingerprint(h.client, "select * from schedule_versions"), snapshots); assert.deepEqual(await selectFingerprint(h.client, "select * from course_offerings"), offerings); assert.deepEqual(await selectFingerprint(h.client, "select * from teaching_groups"), groups);
      assert.ok((await h.client.query<{ revision: number }>("select revision from courses")).rows.every(row => row.revision === 1));
      const after = await fingerprintDatabase(h.client); await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after);
    });
    lines.push("Actual populated 0009→0018 full chain preserves all course facts, unsupported and supported snapshot bytes, offering/group links; revision=1, repeat migration identical.");
  } finally { removeOwnedRun(run); }
}
async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [], baseline = await factory("crs01a 0009 baseline");
  try { await oldBaseline(baseline, lines); } finally { await baseline.dispose(); }
  const database = await factory("crs01a records");
  try {
    await withHandle(database, async h => {
      await database.migrate(h); await populateSummerFixture(h.db); await h.exec(demigrate);
      await h.exec("insert into courses(code,title,credits,course_type,semester,needs_lab) values(' syn-4101 ','Legacy duplicate',0,'custom',99,true)");
      const columns = await selectFingerprint(h.client, "select to_jsonb(c) as value from courses c"), before = await fingerprintDatabase(h.client);
      await database.migrate(h); const after = await fingerprintDatabase(h.client);
      assert.deepEqual(await selectFingerprint(h.client, "select to_jsonb(c)-'revision' as value from courses c"), columns);
      for (const [name, fp] of Object.entries(before.tables)) if (!["public.courses", "drizzle.__drizzle_migrations"].includes(name)) assert.deepEqual(after.tables[name], fp, name);
      const stable = await fingerprintDatabase(h.client); await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), stable);
      await assert.rejects(h.client.query("update courses set revision=0"));
      // 0017 remains an independent full-chain preflight, including on an attempted 0018 rollout.
      await h.exec("drop index schedule_versions_term_version_uq;drop index schedule_versions_one_published_uq;delete from drizzle.__drizzle_migrations where created_at >=1794182400000;drop index courses_canonical_code_idx;alter table courses drop column revision;insert into schedule_versions(term_id,version_number,state) select term_id,version_number,'superseded' from schedule_versions limit 1");
      const dirty = await fingerprintDatabase(h.client); await assert.rejects(database.migrate(h), /BUG-25 preflight/); assert.deepEqual(await fingerprintDatabase(h.client), dirty);
      await h.exec("delete from schedule_versions where state='superseded'"); await database.migrate(h);
      await h.exec("delete from courses where code=' syn-4101 '");
      lines.push("Populated 0017→0018 preserves every old course column, legacy duplicate/invalid facts and unrelated table/snapshot. Positive revision enforced; repeat migration identical. Full-chain 0017 preflight refuses duplicates without schema/row/journal changes.");
    });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/course-scenarios.ts")); assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-7000)); lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await database.dispose(); }
  return lines;
}
async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("crs01a backup"), restored = createOwnedRun("crs01a restore"), backup = newBackupLocation("crs01a catalog");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populateSummerFixture(h.db as never); await h.client.exec("update courses set revision=7,is_active=false"); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup); assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    lines.push("Cold PGlite backup/separate restore preserves catalog revision/status, legacy snapshots, schema, rows, audit and sequences with an identical full fingerprint.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_crs01a_backup"), restored = await cluster.createDatabase("safe01_crs01a_restore"), backup = newBackupLocation("crs01a PG"), key = path.join(cluster.run.root, "crs01a.key"); createKeyFile(key);
  try {
    const h = openPostgres(source); try { await postgresDatabase(source, async () => {}).migrate(h); await populateSummerFixture(h.db); await h.exec("update courses set revision=7,is_active=false"); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key); assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    lines.push("Encrypted PostgreSQL backup/separate restore preserves catalog revision/status, snapshots, schema, rows, audit and sequences with an identical full fingerprint.");
  } finally { await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}
export async function checkCourses() { const lines = await exercise(pgliteFactory); await pgliteRecovery(lines); return lines; }
export async function checkCoursesPostgres(bin: string | undefined) { return withDisposableCluster(bin, async cluster => { const lines = await exercise(factoryFor(cluster)); await courseRaces(cluster, lines); await postgresRecovery(cluster, lines); return lines; }); }
