import assert from "node:assert/strict";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import { loadApp } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";
import type { RolloverChoice } from "../../../src/lib/rollover";
const database = loadApp<typeof import("../../../src/db")>("src/db/index.ts"), {db} = database;
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions = loadApp<typeof import("../../../src/lib/rollover-actions")>("src/lib/rollover-actions.ts");
const terms = loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
const termData = loadApp<typeof import("../../../src/lib/term-data")>("src/lib/term-data.ts");
const batches = loadApp<typeof import("../../../src/lib/batch-actions")>("src/lib/batch-actions.ts");
const batchData = loadApp<typeof import("../../../src/lib/batch-data")>("src/lib/batch-data.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const form = (values:Record<string,unknown>) => {const f=new FormData();for (const [k,v] of Object.entries(values)) f.set(k,String(v));return f;};
type Work = () => Promise<ActionResult>;

export async function rolloverRaces(sourceId:number,choices:RolloverChoice[],batchId:number,lines:string[]) {
  await db.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.status,"active"));
  await db.update(s.academicTerms).set({status:"active"}).where(eq(s.academicTerms.id,sourceId));
  await db.update(s.termContext).set({generation:sql`${s.termContext.generation}+1`});
  const pool = process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL,max:4}) : null;
  const control = pool ? await pool.connect() : null;
  let seq=0;
  async function waitFor(query:string) {
    const end=Date.now()+15000;while (Date.now()<end) {if(Number((await pool!.query(query)).rows[0].count)>0)return;await new Promise(r=>setTimeout(r,15));}assert.fail("Expected actual rollover SQL lock barrier not observed");
  }
  async function race(table:string,event:string,first:Work,second:Work) {
    if (pool && control) {
      await control.query("select pg_advisory_lock(61061)");
      await pool.query(`create or replace function bat01b_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(61061);return new;end$$;create trigger bat01b_barrier before ${event} on ${table} for each row execute function bat01b_barrier()`);
      let one:Promise<ActionResult>|undefined,two:Promise<ActionResult>|undefined;
      try {
        one=first();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
        two=second();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and query like '%term_context%' and cardinality(pg_blocking_pids(pid))>0");
        await control.query("select pg_advisory_unlock(61061)");return await Promise.all([one,two]);
      } finally {await control.query("select pg_advisory_unlock(61061)");await Promise.allSettled([one,two].filter(Boolean));await pool.query(`drop trigger bat01b_barrier on ${table};drop function bat01b_barrier()`);}
    }
    let entered!:()=>void,release!:()=>void;const held=new Promise<void>(r=>entered=r),finish=new Promise<void>(r=>release=r);
    const one=db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{const result=await first();entered();await finish;return result;}));
    await held;let settled=false;const two=second().then(r=>{settled=true;return r;});await new Promise(r=>setTimeout(r,25));assert.equal(settled,false);release();return Promise.all([one,two]);
  }
  async function ready(planChoices = choices) {
    const [t]=await db.insert(s.academicTerms).values({name:`Rollover race ${++seq}`,academicYear:2027,startDate:"2027-01-01",endDate:"2027-05-01",status:"draft",managedSetup:true}).returning();
    await db.insert(s.academicPolicies).values({termId:t.id});
    const values={sourceId,targetId:t.id,choices:JSON.stringify(planChoices),cloneGrid:"off",reason:"Synthetic race review",command:"preview"};
    const review=await actions.prepareRolloverAction(null,form(values));assert.equal(review.ok,true,review.message);
    const commit=()=>actions.prepareRolloverAction(null,form({...values,command:"commit",fingerprint:review.review!.fingerprint,confirmation:`${t.name} · ${t.academicYear}`,acknowledge:"on"}));
    const edit=()=>terms.editTermAction(null,form({termId:t.id,revision:t.revision,name:`${t.name} edited`,academicYear:t.academicYear,startDate:t.startDate,endDate:t.endDate,effectiveFrom:""}));
    const activate=async()=>{const r=await termData.activationEvidence(t.id);return terms.activateTermAction(null,form({termId:t.id,revision:r!.target.term.revision,generation:r!.context.generation,previousActiveId:r!.active?.term.id ?? "",fingerprint:r!.fingerprint,reason:"Synthetic activation race",acknowledge:"on"}));};
    return {t,commit,edit,activate};
  }
  const okay=(r:ActionResult)=>assert.equal(r.ok,true,r.message);
  try {
    let r=await ready();let pair=await race("academic_terms","update",r.edit,r.commit);okay(pair[0]);assert.equal(pair[1].outcome?.kind,"stale");
    r=await ready();pair=await race("term_rollovers","insert",r.commit,r.edit);okay(pair[0]);assert.equal(pair[1].ok,false);
    r=await ready();pair=await race("academic_terms","update",r.activate,r.commit);okay(pair[0]);assert.equal(pair[1].ok,false);
    await db.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.status,"active"));await db.update(s.academicTerms).set({status:"active"}).where(eq(s.academicTerms.id,sourceId));await db.update(s.termContext).set({generation:sql`${s.termContext.generation}+1`});
    // Count edits use the actual BAT-01A review + confirmation path in the active source.
    async function countWrite() {
      const b=await batchData.getBatchDetail(String(batchId)),token=await context.captureActiveContext();
      const v={batchId,revision:b!.record.revision,placementRevision:b!.current!.revision,command:"estimate",studentCount:"18",countSource:"Synthetic race count",reason:"Synthetic source edit",_activeTermId:sourceId,_termGeneration:token.writeContext.generation};
      const preview=await batches.saveBatchAction(null,form(v));assert.ok(preview.fingerprint,preview.message);
      return batches.saveBatchAction(null,form({...v,fingerprint:preview.fingerprint,acknowledge:"on"}));
    }
    r=await ready();pair=await race("batch_term_placements","update",countWrite,r.commit);okay(pair[0]);assert.equal(pair[1].outcome?.kind,"stale");
    r=await ready();pair=await race("term_rollovers","insert",r.commit,countWrite);okay(pair[0]);okay(pair[1]);
    r=await ready();const activationReview=await termData.activationEvidence(r.t.id);
    const oldActivation=()=>terms.activateTermAction(null,form({termId:r.t.id,revision:activationReview!.target.term.revision,generation:activationReview!.context.generation,previousActiveId:activationReview!.active?.term.id ?? "",fingerprint:activationReview!.fingerprint,reason:"Synthetic reviewed activation",acknowledge:"on"}));
    pair=await race("term_rollovers","insert",r.commit,oldActivation);okay(pair[0]);assert.equal(pair[1].outcome?.kind,"stale");
    // Two real rollover requests create the competing draft reference / graduation.
    async function graduatePair() {
      const [b]=await db.insert(s.batches).values({stream:"HSC",label:`ROLL-GRAD-RACE-${seq}`,status:"active"}).returning();
      await db.insert(s.batchTermPlacements).values({termId:sourceId,batchId:b.id,semester:8});
      const source=await db.select({b:s.batches,p:s.batchTermPlacements}).from(s.batchTermPlacements).innerJoin(s.batches,eq(s.batches.id,s.batchTermPlacements.batchId)).where(eq(s.batchTermPlacements.termId,sourceId));
      const held:RolloverChoice[]=source.filter(row=>row.b.status==="active").map(row=>({batchId:row.b.id,disposition:"hold",carryCount:false,reason:"Synthetic race hold",graduateConfirmed:false}));
      return {reference:await ready(held.map(c=>c.batchId===b.id?{...c,disposition:"repeat"}:c)),graduate:await ready(held.map(c=>c.batchId===b.id?{...c,disposition:"graduate",graduateConfirmed:true}:c))};
    }
    let g=await graduatePair();pair=await race("batch_term_placements","insert",g.reference.commit,g.graduate.commit);okay(pair[0]);assert.equal(pair[1].ok,false);assert.match(pair[1].message,/ongoing planning or teaching/);
    g=await graduatePair();pair=await race("batches","update",g.graduate.commit,g.reference.commit);okay(pair[0]);assert.equal(pair[1].ok,false);
    lines.push(`${pool ? "PostgreSQL independent SQL trigger/advisory barriers with observed blocking PIDs" : "PGlite real request queue with an open write transaction"}: both target-edit/rollover, activation/rollover, source-count/rollover and draft-reference/graduation ordering tests pass; stale writes never overwrite reviewed data or create a placement for a newly graduated cohort.`);
  } finally {control?.release();await pool?.end();}
}
