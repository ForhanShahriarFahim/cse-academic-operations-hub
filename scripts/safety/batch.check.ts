import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory,withHandle,openPostgres,postgresDatabase,type DatabaseFactory,type SafetyHandle } from "./database";
import { populateSummerFixture,populateSpringFixture } from "./fixture";
import { fingerprintDatabase,selectFingerprint } from "./fingerprint";
import { withDisposableCluster,type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun,migrateOwned,openOwnedPglite,removeOwnedRun } from "./pglite";
import { createColdBackup,newBackupLocation,removeBackup,restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup,createKeyFile,restoreEncryptedBackup } from "./pg-backup";

export const demigrateBatchSQL="drop trigger batch_placement_write on batch_term_placements;drop function validate_batch_placement_write();alter table batches drop column revision,drop column is_draft;alter table batch_term_placements drop column student_count,drop column count_source,drop column count_origin,drop column count_verified_at,drop column count_verified_by,drop column revision;delete from drizzle.__drizzle_migrations where created_at >= 1793491200002";
async function exercise(factory:DatabaseFactory){
  const database=await factory("bat01a_records"),lines:string[]=[];
  try{
    await withHandle(database,async h=>{
      await database.migrate(h);const summer=await populateSummerFixture(h.db);await populateSpringFixture(h.db,summer);
      await h.exec(demigrateBatchSQL);
      await h.exec("update batches set student_count=-2,status='legacy_custom' where stream='DIPLOMA';insert into batches(stream,label,student_count) values('HSC','ORPHAN',12),('HSC','ZERO',0);insert into batch_term_placements(batch_id,term_id,semester) select id,1,99 from batches where label='ZERO'");
      const before=await fingerprintDatabase(h.client);
      const batchCols="id,stream,label,intake,status,student_count,sort_order",placementCols="id,batch_id,term_id,semester";
      const originalBatch=await selectFingerprint(h.client,`select ${batchCols} from batches`),originalPlacement=await selectFingerprint(h.client,`select ${placementCols} from batch_term_placements`);
      await database.migrate(h);
      assert.deepEqual(await selectFingerprint(h.client,`select ${batchCols} from batches`),originalBatch);assert.deepEqual(await selectFingerprint(h.client,`select ${placementCols} from batch_term_placements`),originalPlacement);
      const after=await fingerprintDatabase(h.client);
      for(const[name,fp]of Object.entries(before.tables))if(!["public.batches","public.batch_term_placements","drizzle.__drizzle_migrations"].includes(name))assert.deepEqual(after.tables[name],fp,name);
      const rows=(await h.client.query<{student_count:number|null;count_origin:string;count_verified_by:number|null;count_verified_at:unknown;label:string}>("select p.*,b.label from batch_term_placements p join batches b on b.id=p.batch_id order by p.id")).rows;
      assert.ok(rows.some(r=>r.student_count===30&&r.count_origin==='legacy'));
      assert.ok(rows.some(r=>r.student_count===null&&r.count_origin==='legacy_invalid'));
      assert.ok(rows.some(r=>r.label==='ZERO'&&r.student_count===0));assert.ok(rows.every(r=>r.count_verified_at===null&&r.count_verified_by===null));
      assert.equal((await h.client.query("select p.id from batch_term_placements p join batches b on b.id=p.batch_id where b.label='ORPHAN'")).rows.length,0);
      await database.migrate(h);assert.deepEqual(await fingerprintDatabase(h.client),after);
      await assert.rejects(h.client.query("insert into batch_term_placements(batch_id,term_id,semester) select id,1,9 from batches where label='ORPHAN'"));
      await h.exec("update batch_term_placements set student_count=0 where semester=99");
      await assert.rejects(h.client.query("update batch_term_placements set semester=10 where semester=99"));
      // Restore fixture-only anomalies for the unchanged production action scenarios.
      await h.exec("update batches set status='active' where status='legacy_custom';update academic_terms set status='completed';update academic_terms set status='active' where name='Summer 2026'");
      lines.push("Populated 0014→0015 preserves every old column and unrelated table/snapshot; legacy numeric/null/zero/negative/no-placement and anomalous semester/status evidence retained. Estimates never verified; no placement fabricated; repeat migration is identical; new invalid writes refused.");
    });
    const child=await database.runChild(path.join(REPO_ROOT,"scripts/safety/children/batch-scenarios.ts"));
    assert.equal(child.status,0,child.stderr.slice(-9000)||child.stdout.slice(-5000));lines.push(...(child.report as {lines:string[]}).lines);
  }finally{await database.dispose();}
  return lines;
}
async function recoveryEvidence(h:Pick<SafetyHandle,"exec">){await h.exec("update batch_term_placements set student_count=0,count_source='Synthetic verified zero recovery',count_verified_by=(select id from portal_users where email='admin@example.invalid'),count_verified_at=now(),revision=3 where batch_id=(select id from batches where stream='HSC' and label='22B')");}
async function pgliteRecovery(lines:string[]){
  const source=createOwnedRun("bat01a backup"),restored=createOwnedRun("bat01a restore"),backup=newBackupLocation("bat01a counts");
  try{
    const h=await openOwnedPglite(source);try{await migrateOwned(h);await populateSummerFixture(h.db as never);await recoveryEvidence({exec:async q=>{await h.client.exec(q);}});}finally{await h.close();}
    const manifest=await createColdBackup(source,backup);assert.deepEqual((await restoreColdBackup(backup,restored)).fingerprint,manifest.fingerprint);
    lines.push("Cold PGlite backup and separate-target restore preserve verified-zero actor/time/source/revision, trigger/schema, sequences, audit and frozen snapshots with an identical full fingerprint.");
  }finally{removeOwnedRun(source);removeOwnedRun(restored);removeBackup(backup);}
}
async function postgresRecovery(cluster:PgCluster,lines:string[]){
  const source=await cluster.createDatabase("safe01_bat01a_backup"),restored=await cluster.createDatabase("safe01_bat01a_restore"),backup=newBackupLocation("bat01a PG"),key=path.join(cluster.run.root,"bat01a.key");createKeyFile(key);
  try{
    const h=openPostgres(source);try{await postgresDatabase(source,async()=>{}).migrate(h);await populateSummerFixture(h.db);await recoveryEvidence(h);}finally{await h.close();}
    const manifest=await createEncryptedBackup(cluster,source,backup,key);assert.deepEqual((await restoreEncryptedBackup(cluster,backup,key,restored,source)).fingerprint,manifest.fingerprint);
    lines.push("Encrypted PostgreSQL backup and separate-target restore preserve verified-zero actor/time/source/revision, trigger/schema, sequences, audit and frozen snapshots with an identical full fingerprint.");
  }finally{await cluster.dropDatabase(source);await cluster.dropDatabase(restored);removeBackup(backup);}
}
export async function checkBatches(){const lines=await exercise(pgliteFactory);await pgliteRecovery(lines);return lines;}
export async function checkBatchesPostgres(bin:string|undefined){return withDisposableCluster(bin,async cluster=>{const lines=await exercise(factoryFor(cluster));await postgresRecovery(cluster,lines);return lines;});}
