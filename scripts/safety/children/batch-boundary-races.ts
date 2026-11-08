/** Actual publication/lifecycle/deletion/activation requests, both adapter ordering models. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp } from "./controlled-runtime";
import type { BatchResult } from "../../../src/lib/batch-actions";

export async function batchBoundaryRaces(lines:string[]){
  const database=loadApp<typeof import("../../../src/db")>("src/db/index.ts"),{db}=database;
  const s=loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
  const context=loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
  const actions=loadApp<typeof import("../../../src/lib/batch-actions")>("src/lib/batch-actions.ts");
  const data=loadApp<typeof import("../../../src/lib/batch-data")>("src/lib/batch-data.ts");
  const routine=loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
  const terms=loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
  const termData=loadApp<typeof import("../../../src/lib/term-data")>("src/lib/term-data.ts");
  const records=loadApp<typeof import("../../../src/lib/term-records")>("src/lib/term-records.ts");
  const form=(v:Record<string,unknown>)=>{const f=new FormData();for(const[k,value]of Object.entries(v))f.set(k,String(value));return f;};
  const call=(v:Record<string,unknown>)=>actions.saveBatchAction(null,form(v));
  const ok=(r:BatchResult)=>{assert.equal(r.ok,true,r.message);return r.outcome?.kind==="success"?r.outcome.entityId!:0;};
  const token=async()=>{const c=await context.captureActiveContext();return {_activeTermId:c.term.id,_termGeneration:c.writeContext.generation};};
  async function draft(name:string){const id=ok(await terms.createTermAction(null,form({name,academicYear:2045,startDate:"2045-01-01",endDate:"2045-06-30"})));ok(await terms.saveStartingPolicyAction(null,form({termId:id,revision:1,...Object.fromEntries(records.POLICY_FIELDS.map(k=>[k,k==="extraClassRate"?200:1]))})));return id;}
  async function activation(id:number){const r=(await termData.activationEvidence(id))!;return form({termId:id,revision:r.target.term.revision,generation:r.context.generation,previousActiveId:r.active?.term.id??"",fingerprint:r.fingerprint,reason:"Synthetic boundary race",acknowledge:"on"});}
  async function create(label:string){return ok(await call({command:"identity",stream:"HSC",label,intake:"",sortOrder:0,reason:"Synthetic boundary race"}));}
  async function placement(id:number){const d=(await data.getBatchDetail(String(id)))!;return {command:"placement",batchId:id,revision:d.record.revision,placementRevision:d.current?.revision??"",semester:1,reason:"Synthetic boundary placement",...await token()};}
  async function lifecycle(id:number,command:string){const d=(await data.getBatchDetail(String(id)))!;return {command,batchId:id,revision:d.record.revision,generation:d.generation,fingerprint:d.lifecycleFingerprints[command],confirmation:`${d.record.stream}-${d.record.label}`,acknowledge:"on",reason:"Synthetic boundary lifecycle"};}
  async function count(id:number,n:number){const d=(await data.getBatchDetail(String(id)))!;const values={command:"estimate",batchId:id,revision:d.record.revision,placementRevision:d.current!.revision,studentCount:n,countSource:"Synthetic boundary estimate",reason:"Synthetic boundary count",...await token()};const r=await call(values);assert.ok(r.fingerprint,r.message);return {...values,fingerprint:r.fingerprint,acknowledge:"on"};}
  const target=await draft("BAT isolated boundary term");ok(await terms.activateTermAction(null,await activation(target)));
  // Older synthetic fixture payloads intentionally have unsupported shapes.
  // Temporarily clear those only for this isolated race setup, then restore them.
  const originalVersions=await db.select().from(s.scheduleVersions);await db.update(s.scheduleVersions).set({snapshot:null});
  const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,max:4}):null;
  const control=pool?await pool.connect():null;
  let cases=0;
  async function race(table:string,event:string,first:()=>Promise<BatchResult>,second:()=>Promise<BatchResult>){
    cases++;
    if(pool&&control){
      const wait=async(query:string)=>{const end=Date.now()+15000;while(Date.now()<end){if(Number((await pool.query(query)).rows[0].count)>0)return;await new Promise(r=>setTimeout(r,15));}assert.fail(`Boundary race ${cases} did not observe actual blocking`);};
      await control.query("select pg_advisory_lock(61052)");
      await pool.query(`create or replace function bat01a_boundary() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(61052); if TG_OP='DELETE' then return old; end if;return new;end$$;create trigger bat01a_boundary before ${event} on ${table} for each row execute function bat01a_boundary()`);
      let one:Promise<BatchResult>|undefined,two:Promise<BatchResult>|undefined;
      try{
        one=first();await wait("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
        two=second();await wait("select count(*) from pg_stat_activity where datname=current_database() and query like '%term_context%' and cardinality(pg_blocking_pids(pid))>0");
        await control.query("select pg_advisory_unlock(61052)");return await Promise.all([one,two]);
      }finally{await control.query("select pg_advisory_unlock(61052)");await Promise.allSettled([one,two].filter(Boolean));await pool.query(`drop trigger bat01a_boundary on ${table};drop function bat01a_boundary()`);}
    }
    let entered!:()=>void,release!:()=>void;const held=new Promise<void>(r=>entered=r),finish=new Promise<void>(r=>release=r);
    const one=db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{const result=await first();entered();await finish;return result;}));
    await held;let settled=false;const two=second().then(result=>{settled=true;return result;});
    await new Promise(r=>setTimeout(r,25));assert.equal(settled,false,`Boundary queue ${cases}`);release();return Promise.all([one,two]);
  }
  try{
    let current=(await context.captureActiveContext()).writeContext;
    const a=await create("BOUND-PUB-FIRST"),deleteA=await lifecycle(a,"delete");
    let results=await race("schedule_versions","insert",()=>routine.publishAction("Synthetic publication first",current),()=>call(deleteA));ok(results[0]);assert.equal(results[1].ok,false);assert.match(results[1].message,/retained/);
    const b=await create("BOUND-DELETE-FIRST"),deleteB=await lifecycle(b,"delete");
    results=await race("batches","delete",()=>call(deleteB),()=>routine.publishAction("Synthetic deletion first",current));ok(results[0]);ok(results[1]);
    let published=(await db.select().from(s.scheduleVersions).where(eq(s.scheduleVersions.termId,target))).find(v=>v.state==="published")!;
    assert.ok(!(published.snapshot as {batches:Array<{id:number}>}).batches.some(row=>row.id===b));
    const c=await create("BOUND-COUNT");ok(await call(await placement(c)));ok(await call(await count(c,20)));
    let change=await count(c,30);
    results=await race("schedule_versions","insert",()=>routine.publishAction("Synthetic frozen count first",current),()=>call(change));ok(results[0]);ok(results[1]);
    published=(await db.select().from(s.scheduleVersions).where(eq(s.scheduleVersions.termId,target))).find(v=>v.state==="published")!;
    assert.equal((published.snapshot as {batches:Array<{id:number;studentCount:number}>}).batches.find(row=>row.id===c)!.studentCount,20);
    change=await count(c,40);results=await race("batch_term_placements","update",()=>call(change),()=>routine.publishAction("Synthetic updated count first",current));ok(results[0]);ok(results[1]);
    published=(await db.select().from(s.scheduleVersions).where(eq(s.scheduleVersions.termId,target))).find(v=>v.state==="published")!;
    assert.equal((published.snapshot as {batches:Array<{id:number;studentCount:number}>}).batches.find(row=>row.id===c)!.studentCount,40);
    const d=await create("BOUND-PLACE-FIRST"),placeD=await placement(d),deleteD=await lifecycle(d,"delete");
    results=await race("batch_term_placements","insert",()=>call(placeD),()=>call(deleteD));ok(results[0]);assert.equal(results[1].ok,false);
    const e=await create("BOUND-DELETE-PLACE"),placeE=await placement(e),deleteE=await lifecycle(e,"delete");
    results=await race("batches","delete",()=>call(deleteE),()=>call(placeE));ok(results[0]);assert.equal(results[1].outcome?.kind,"stale");
    const f=await create("BOUND-PLACE-LIFE"),placeF=await placement(f),deactivateF=await lifecycle(f,"deactivate");
    results=await race("batch_term_placements","insert",()=>call(placeF),()=>call(deactivateF));ok(results[0]);assert.equal(results[1].ok,false);assert.ok(results[1].fingerprint,"new reference requires another review");ok(await call(await lifecycle(f,"deactivate")));
    const g=await create("BOUND-LIFE-PLACE"),placeG=await placement(g),deactivateG=await lifecycle(g,"deactivate");
    results=await race("batches","update",()=>call(deactivateG),()=>call(placeG));ok(results[0]);assert.equal(results[1].outcome?.kind,"stale");
    const next=await draft("BAT count then activation"),activateNext=await activation(next),oldCount=await count(c,50);
    results=await race("batch_term_placements","update",()=>call(oldCount),()=>terms.activateTermAction(null,activateNext));ok(results[0]);ok(results[1]);
    assert.equal((await db.select().from(s.batchTermPlacements).where(eq(s.batchTermPlacements.batchId,c))).find(p=>p.termId===target)!.studentCount,50);
    ok(await call(await placement(c)));const newer=await draft("BAT activation then count"),activateNewer=await activation(newer),staleCount=await count(c,60);
    results=await race("academic_terms","update",()=>terms.activateTermAction(null,activateNewer),()=>call(staleCount));ok(results[0]);assert.equal(results[1].outcome?.kind,"stale");
    assert.equal((await db.select().from(s.batchTermPlacements).where(eq(s.batchTermPlacements.batchId,c))).find(p=>p.termId===next)!.studentCount,null);
    current=(await context.captureActiveContext()).writeContext;assert.equal(current.activeTermId,newer);
    lines.push(`${pool?"PostgreSQL real trigger/advisory/blocking-PID barriers":"PGlite real open-transaction request queue"}: ${cases} additional actual-action orderings cover publication/delete, publication/count, placement/delete, placement/lifecycle and count/activation in both directions. Frozen counts match the winning order; stale/new-reference losers refuse without retargeting or deleting history.`);
  }finally{
    for(const v of originalVersions)await db.update(s.scheduleVersions).set({snapshot:v.snapshot}).where(eq(s.scheduleVersions.id,v.id));
    if(control)control.release();if(pool)await pool.end();
  }
}
