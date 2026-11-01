import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory,withHandle,type DatabaseFactory } from "./database";
import { populateSummerFixture,populateSpringFixture } from "./fixture";
import { fingerprintDatabase,selectFingerprint } from "./fingerprint";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

async function exercise(factory:DatabaseFactory){
  const database=await factory("set01a_workspace");const lines:string[]=[];
  try{
    await withHandle(database,async h=>{
      await database.migrate(h);const summer=await populateSummerFixture(h.db);await populateSpringFixture(h.db,summer);
      await h.exec("update academic_terms set status='completed';update academic_terms set status='active' where name='Summer 2026';drop table term_context;alter table academic_terms drop column revision;alter table academic_terms drop column managed_setup;alter table academic_terms alter column status set default 'active';delete from drizzle.__drizzle_migrations where created_at >= 1793491200001");
      const before=await fingerprintDatabase(h.client);
      const termColumns="id,name,academic_year,start_date,end_date,effective_from,status";
      const terms=await selectFingerprint(h.client,`select ${termColumns} from academic_terms`);
      await database.migrate(h);const after=await fingerprintDatabase(h.client);
      for(const [name,value]of Object.entries(before.tables))if(!["public.academic_terms","drizzle.__drizzle_migrations"].includes(name))assert.deepEqual(after.tables[name],value,name);
      assert.deepEqual(await selectFingerprint(h.client,`select ${termColumns} from academic_terms`),terms);
      assert.equal((await h.client.query<{generation:number}>("select generation from term_context")).rows[0].generation,1);
      const created=(await h.client.query<{id:number;status:string}>("insert into academic_terms(name,academic_year,start_date,end_date,managed_setup) values('Empty managed draft',2030,'2030-01-01','2030-05-01',true) returning id,status")).rows[0];assert.equal(created.status,"draft");
      await h.exec("delete from day_plans;delete from period_patterns;update term_context set generation=9");
      await database.migrate(h);await database.migrate(h);
      assert.equal((await h.client.query<{count:number}>("select count(*)::int as count from period_patterns where term_id=$1",[created.id])).rows[0].count,0);
      assert.ok((await h.client.query<{count:number}>("select count(*)::int as count from period_patterns where term_id<>$1",[created.id])).rows[0].count>0,"legacy rows still receive their original grid");
      assert.equal((await h.client.query<{generation:number}>("select generation from term_context")).rows[0].generation,9);
      lines.push("Populated 0013→0014 preserves all old term fields and other table/snapshot bytes; draft default, idempotent migration/preparation, context generation and managed-draft/legacy backfill behavior pass.");
    });
    const result=await database.runChild(path.join(REPO_ROOT,"scripts/safety/children/term-workspace-scenarios.ts"));
    assert.equal(result.status,0,result.stderr.slice(-7000)||result.stdout.slice(-4000));
    lines.push(...(result.report as {lines:string[]}).lines);
  }finally{await database.dispose();}
  return lines;
}
export const checkTermWorkspace=()=>exercise(pgliteFactory);
export async function checkTermWorkspacePostgres(bin:string|undefined){if(!bin)throw new Error("PostgreSQL tools required");return withDisposableCluster(bin,cluster=>exercise(factoryFor(cluster)));}
