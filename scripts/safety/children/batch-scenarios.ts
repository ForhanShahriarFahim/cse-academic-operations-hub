/** Production guards/actions/loaders and DB transactions; only request/session modules controlled. */
import assert from "node:assert/strict";
import { eq,sql } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp,report,signInAs } from "./controlled-runtime";
import { selectFingerprint } from "../fingerprint";
import { setAuditInsertFault } from "../faults";
import type { BatchResult } from "../../../src/lib/batch-actions";
import { batchBoundaryRaces } from "./batch-boundary-races";
const database=loadApp<typeof import("../../../src/db")>("src/db/index.ts"),{db}=database;
const s=loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions=loadApp<typeof import("../../../src/lib/batch-actions")>("src/lib/batch-actions.ts");
const data=loadApp<typeof import("../../../src/lib/batch-data")>("src/lib/batch-data.ts");
const context=loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const portal=loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const rooms=loadApp<typeof import("../../../src/lib/room-transaction")>("src/lib/room-transaction.ts");
const routine=loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const raw=(db as unknown as {$client:import("../database").Queryable}).$client;
const form=(values:Record<string,unknown>)=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,String(v));return f;};
const call=(values:Record<string,unknown>)=>actions.saveBatchAction(null,form(values));
const ok=(r:BatchResult)=>{assert.equal(r.ok,true,r.message);return r.outcome?.kind==="success"?r.outcome.entityId!:0;};
const record=async(id:number)=>(await db.select().from(s.batches).where(eq(s.batches.id,id)))[0];
const token=async()=>{const c=await context.captureActiveContext();return {_activeTermId:c.term.id,_termGeneration:c.writeContext.generation};};
async function create(label:string,stream="HSC"){return ok(await call({command:"identity",stream,label,intake:"Synthetic",sortOrder:0,reason:"Synthetic creation"}));}
async function place(id:number,semester=1){const b=await record(id);return call({command:"placement",batchId:id,revision:b.revision,semester,reason:"Synthetic placement",...await token()});}
async function count(id:number,command:string,number:string,source="Synthetic private reference"){
  const d=(await data.getBatchDetail(String(id)))!;
  const values={command,batchId:id,revision:d.record.revision,placementRevision:d.current!.revision,studentCount:number,countSource:source,reason:"Synthetic count review",...await token()};
  const review=await call(values);assert.equal(review.ok,false);assert.ok(review.fingerprint,review.message);
  return call({...values,fingerprint:review.fingerprint,acknowledge:"on"});
}
async function lifecycle(id:number,command:string){
  const d=(await data.getBatchDetail(String(id)))!;
  return call({command,batchId:id,revision:d.record.revision,reason:"Synthetic lifecycle",generation:d.generation,fingerprint:d.lifecycleFingerprints[command],confirmation:`${d.record.stream}-${d.record.label}`,acknowledge:"on"});
}
async function concurrency(lines:string[]){
  const id=await create("RACE-COUNT");ok(await place(id));ok(await count(id,"estimate","20"));
  const term=(await context.captureActiveContext()).term.id;
  const [course]=await db.insert(s.courses).values({code:"BAT-RACE",title:"Synthetic cohort race",credits:"3",semester:1}).returning();
  const [offering]=await db.insert(s.courseOfferings).values({courseId:course.id,batchId:id,termId:term}).returning();
  const [group]=await db.insert(s.teachingGroups).values({courseId:course.id,termId:term}).returning();
  await db.insert(s.teachingGroupOfferings).values({teachingGroupId:group.id,offeringId:offering.id});
  const [room]=await db.insert(s.rooms).values({code:"BAT-RACE",building:"Synthetic",capabilities:["theory"],capacity:40}).returning();
  const [teacher]=await db.insert(s.teachers).values({shortCode:"BATR",fullName:"Synthetic race teacher"}).returning();
  await db.insert(s.permittedWindows).values({termId:term,batchId:id,stream:"HSC",dayOfWeek:0,startMinutes:480,endMinutes:1020});
  const meeting=async()=>routine.createMeetingAction(form({teachingGroupId:group.id,dayOfWeek:0,startTime:"14:00",endTime:"15:00",teacherIds:teacher.id,roomIds:room.id,...await token()}));
  const stamp=(values:Record<string,unknown>)=>call({command:"identity",stream:"HSC",intake:"",sortOrder:0,reason:"Concurrent identity",...values});
  if(process.env.DATABASE_URL){
    const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4}),control=await pool.connect();
    const waitFor=async(query:string)=>{const end=Date.now()+15000;while(Date.now()<end){if(Number((await pool.query(query)).rows[0].count)>0)return;await new Promise(r=>setTimeout(r,15));}assert.fail("Expected actual PostgreSQL lock barrier was not observed");};
    async function race(table:string,event:string,first:()=>Promise<BatchResult>,second:()=>Promise<BatchResult>){
      await control.query("select pg_advisory_lock(61051)");
      await pool.query(`create or replace function bat01a_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(61051); return new; end$$;create trigger bat01a_barrier before ${event} on ${table} for each row execute function bat01a_barrier()`);
      let one:Promise<BatchResult>|undefined,two:Promise<BatchResult>|undefined;
      try{
        one=first();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
        two=second();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and query like '%term_context%' and cardinality(pg_blocking_pids(pid))>0");
        await control.query("select pg_advisory_unlock(61051)");return await Promise.all([one,two]);
      }finally{await control.query("select pg_advisory_unlock(61051)");await Promise.allSettled([one,two].filter(Boolean));await pool.query(`drop trigger bat01a_barrier on ${table};drop function bat01a_barrier()`);}
    }
    try{
      const [saved,refused]=await race("batch_term_placements","update",()=>count(id,"verify","60"),meeting);ok(saved);assert.equal(refused.ok,false);assert.ok(refused.issues?.some(i=>i.severity==="blocker"));
      ok(await count(id,"verify","20"));
      const [placed,changed]=await race("meetings","insert",meeting,()=>count(id,"verify","60"));ok(placed);ok(changed);assert.equal((await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId,group.id))).length,1);
      const dup=await race("batches","insert",()=>stamp({label:"RACE-DUP"}),()=>stamp({label:" race-dup "}));assert.equal(dup.filter(r=>r.ok).length,1);
      const same=(await data.getBatchDetail(String(id)))!,staleValues={command:"estimate",batchId:id,revision:same.record.revision,placementRevision:same.current!.revision,studentCount:"61",countSource:"Concurrent",reason:"Synthetic",...await token()};
      const preview=await call(staleValues);assert.ok(preview.fingerprint);
      const writes=await race("batch_term_placements","update",()=>call({...staleValues,fingerprint:preview.fingerprint,acknowledge:"on"}),()=>call({...staleValues,fingerprint:preview.fingerprint,acknowledge:"on"}));assert.equal(writes.filter(r=>r.ok).length,1);assert.equal(writes[1].outcome?.kind,"stale");
      lines.push("PostgreSQL independent production requests use SQL trigger/advisory barriers and observed blocking PIDs: count-first rejects undersized assignment; assignment-first retains booking then flags changed count; normalized duplicate creates serialize; competing count confirmations give one success/one stale.");
    }finally{control.release();await pool.end();}
  }else{
    async function queued(first:()=>Promise<BatchResult>,second:()=>Promise<BatchResult>){
      let entered!:()=>void,release!:()=>void;const held=new Promise<void>(r=>entered=r),finish=new Promise<void>(r=>release=r);
      const one=db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{const value=await first();entered();await finish;return value;}));
      await held;let settled=false;const two=second().then(r=>{settled=true;return r;});await new Promise(r=>setTimeout(r,25));assert.equal(settled,false);release();return Promise.all([one,two]);
    }
    const [saved,refused]=await queued(()=>count(id,"verify","60"),meeting);ok(saved);assert.equal(refused.ok,false);
    ok(await count(id,"verify","20"));const [placed,changed]=await queued(meeting,()=>count(id,"verify","60"));ok(placed);ok(changed);
    const dup=await Promise.all([stamp({label:"RACE-DUP"}),stamp({label:" race-dup "})]);assert.equal(dup.filter(r=>r.ok).length,1);
    lines.push("PGlite's real single-connection request queue passes both count/assignment orders with an open production-write transaction, plus concurrent normalized duplicate creates; no multi-session PGlite claim.");
  }
  const loaded=await portal.getPortalData();const issues=loadApp<typeof import("../../../src/lib/conflicts")>("src/lib/conflicts.ts").analyzeSchedule({meetings:loaded.meetings,externals:loaded.externals,breaks:loaded.breaks,windows:loaded.windows});
  assert.ok(issues.some(i=>i.type==="capacity_violation"&&i.meetingIds.some(mid=>loaded.meetings.find(m=>m.id===mid)?.teachingGroupId===group.id)));
  await db.update(s.batches).set({status:"inactive"}).where(eq(s.batches.id,id));
  await assert.rejects(db.transaction(async tx=>{await rooms.lockRooms(tx,[room.id]);await rooms.validateRoomAssignment(tx,group.id,[room.id]);}),/cohort is inactive/i);
  const grid=loadApp<typeof import("../../../src/lib/time-grid-actions")>("src/lib/time-grid-actions.ts");
  const rejected=await grid.setDayPlanAction({stream:"HSC",batchId:id,dayOfWeek:6,patternId:null,hours:null,reason:"Synthetic inactive selection",expectedUpdatedAt:null,moveClasses:false},(await context.captureActiveContext()).writeContext);
  assert.equal(rejected.ok,false);assert.match(rejected.message,/Reactivate or restore/);
  await db.update(s.batches).set({status:"active"}).where(eq(s.batches.id,id));
}
async function main(){
  const lines:string[]=[];signInAs("admin@example.invalid");
  const [cse,eee]=await db.select().from(s.departments).orderBy(s.departments.id);
  for(const [i,[role,departmentId,allowed]]of ([["system_administrator",null,true],["academic_administrator",cse.id,true],["academic_administrator",eee.id,false],["routine_coordinator",cse.id,false],["teacher",cse.id,false],["read_only_viewer",cse.id,false]] as const).entries()){
    const email=`batch-role-${i}@example.invalid`,[u]=await db.insert(s.portalUsers).values({email,displayName:"Synthetic batch actor",status:"active"}).returning();
    await db.insert(s.roleAssignments).values({userId:u.id,role,departmentId,activeFrom:new Date("2020-01-01")});signInAs(email);
    if(departmentId===eee.id)await assert.rejects(data.getBatchDirectory());else assert.equal((await data.getBatchDirectory()).editor,allowed);
    const result=await call({command:"identity",stream:"HSC",label:`ROLE-${i}`,intake:"",sortOrder:0,reason:"Synthetic role test"});assert.equal(result.ok,allowed,result.message);if(!allowed)assert.equal(result.outcome?.kind,"permission");
  }
  signInAs(null);assert.equal((await call({})).outcome?.kind,"permission");signInAs("admin@example.invalid");
  lines.push("Raw permission matrix: global/CSE administrators succeed; other-department/coordinator/teacher/viewer/anonymous writes refused; internal read directory remains available.");
  const id=await create("ACTION-A");await create("ACTION-A","DIPLOMA");assert.equal((await call({command:"identity",stream:"HSC",label:" action-a ",sortOrder:0,reason:"duplicate"})).ok,false);
  const malformed=form({command:"identity",stream:"HSC",label:"BAD",sortOrder:0,reason:"Synthetic"});malformed.append("label","OTHER");assert.equal((await actions.saveBatchAction(null,malformed)).ok,false);
  assert.equal((await call({command:"identity",stream:"HSC",label:"FORGED",sortOrder:0,reason:"Synthetic",actorUserId:1})).ok,false);
  ok(await place(id));assert.equal((await place(id,2)).outcome?.kind,"stale");
  let d=(await data.getBatchDetail(String(id)))!;ok(await call({command:"placement",batchId:id,revision:d.record.revision,placementRevision:d.current!.revision,semester:2,reason:"Unused correction",...await token()}));
  assert.equal((await call({command:"identity",batchId:id,revision:1,stream:"DIPLOMA",label:"ACTION-A2",sortOrder:0,reason:"Stream correction"})).ok,false);
  const oldSnapshots=await selectFingerprint(raw,"select snapshot from schedule_versions");
  ok(await count(id,"estimate","0"));d=(await data.getBatchDetail(String(id)))!;assert.equal(d.current!.studentCount,0);assert.equal(d.current!.countStatus,"unverified");
  ok(await count(id,"verify","0"));d=(await data.getBatchDetail(String(id)))!;assert.equal(d.current!.countStatus,"verified");assert.ok(d.placements.find(p=>p.termId===d.term!.id)!.countVerifiedAt);
  ok(await count(id,"unverify","0"));assert.equal((await data.getBatchDetail(String(id)))!.current!.countStatus,"unverified");
  ok(await count(id,"estimate","55"));ok(await count(id,"unknown",""));assert.equal((await data.getBatchDetail(String(id)))!.current!.studentCount,null);
  d=(await data.getBatchDetail(String(id)))!;
  assert.equal((await call({command:"verify",batchId:id,revision:d.record.revision,placementRevision:d.current!.revision,studentCount:30,countSource:"SYN",reason:"Missing context"})).outcome?.kind,"stale");
  const oldToken=await token();await db.update(s.termContext).set({generation:sql`${s.termContext.generation}+2`});
  assert.equal((await call({command:"estimate",batchId:id,revision:d.record.revision,placementRevision:d.current!.revision,studentCount:30,reason:"ABA",...oldToken})).outcome?.kind,"stale");
  assert.deepEqual(await selectFingerprint(raw,"select snapshot from schedule_versions"),oldSnapshots);
  lines.push("Identity normalization/stream protection, duplicate/non-text/forged input, manual placement/correction, unknown/estimate/verified-zero/revoke, missing and ABA contexts, and unchanged snapshot hashes pass through actual actions.");
  ok(await lifecycle(id,"deactivate"));assert.equal((await place(id)).ok,false);ok(await lifecycle(id,"reactivate"));ok(await lifecycle(id,"graduate"));ok(await lifecycle(id,"restore"));
  const used=(await db.select().from(s.batches).where(eq(s.batches.label,"22B")))[0];assert.equal((await lifecycle(used.id,"graduate")).ok,false);assert.equal((await lifecycle(id,"delete")).ok,false);
  // The baseline intentionally has unsupported saved evidence; it must block every unused deletion.
  const unused=await create("DELETE-ME");assert.equal((await lifecycle(unused,"delete")).ok,false);
  const stored=await db.select().from(s.scheduleVersions);await db.update(s.scheduleVersions).set({snapshot:null});
  ok(await lifecycle(unused,"delete"));assert.equal(await record(unused),undefined);assert.ok((await db.select().from(s.auditEvents).where(eq(s.auditEvents.entityId,unused))).some(e=>e.action==="batch.delete"));
  // Each direct FK family independently protects deletion, with snapshot uncertainty removed.
  const protectedId=await create("FK-PROBE"),activeTerm=(await context.captureActiveContext()).term.id;
  const [someStudent]=await db.select().from(s.students),[someCourse]=await db.select().from(s.courses);
  const probes:Array<[string,()=>Promise<unknown>,()=>Promise<unknown>]>= [
    ["placement",()=>db.insert(s.batchTermPlacements).values({batchId:protectedId,termId:activeTerm,semester:1}),()=>db.delete(s.batchTermPlacements).where(eq(s.batchTermPlacements.batchId,protectedId))],
    ["representative",()=>db.insert(s.classRepresentatives).values({batchId:protectedId,termId:activeTerm}),()=>db.delete(s.classRepresentatives).where(eq(s.classRepresentatives.batchId,protectedId))],
    ["window",()=>db.insert(s.permittedWindows).values({batchId:protectedId,termId:activeTerm,stream:"HSC",dayOfWeek:0,startMinutes:500,endMinutes:600}),()=>db.delete(s.permittedWindows).where(eq(s.permittedWindows.batchId,protectedId))],
    ["day plan",()=>db.insert(s.dayPlans).values({batchId:protectedId,termId:activeTerm,stream:"HSC",dayOfWeek:0}),()=>db.delete(s.dayPlans).where(eq(s.dayPlans.batchId,protectedId))],
    ["home student",()=>db.update(s.students).set({homeBatchId:protectedId}).where(eq(s.students.id,someStudent.id)),()=>db.update(s.students).set({homeBatchId:someStudent.homeBatchId}).where(eq(s.students.id,someStudent.id))],
    ["offering",()=>db.insert(s.courseOfferings).values({batchId:protectedId,termId:activeTerm,courseId:someCourse.id,status:"cancelled"}),()=>db.delete(s.courseOfferings).where(eq(s.courseOfferings.batchId,protectedId))],
  ];
  for(const[name,add,remove]of probes){await add();const refused=await lifecycle(protectedId,"delete");assert.equal(refused.ok,false,name);await remove();}
  const schemaSnapshot={schemaVersion:3,generatedAt:"2026-01-01T00:00:00Z",versionNumber:1,term:{id:activeTerm,name:"Synthetic"},meetings:[],batches:[{id:protectedId,stream:"HSC",label:"FK-PROBE"}],breaks:[],issues:[],externalCommitments:[],metadata:{classRepresentatives:[]}};
  await db.update(s.scheduleVersions).set({snapshot:schemaSnapshot}).where(eq(s.scheduleVersions.id,stored[0].id));assert.equal((await lifecycle(protectedId,"delete")).ok,false,"structured snapshot reference");
  await db.update(s.scheduleVersions).set({snapshot:null});ok(await lifecycle(protectedId,"delete"));
  for(const v of stored)await db.update(s.scheduleVersions).set({snapshot:v.snapshot}).where(eq(s.scheduleVersions.id,v.id));
  const draftId=await create("DRAFT-USE"),draft=(await db.select().from(s.academicTerms).where(eq(s.academicTerms.name,"Spring 2027")))[0];
  await db.update(s.academicTerms).set({status:"draft"}).where(eq(s.academicTerms.id,draft.id));await db.insert(s.batchTermPlacements).values({batchId:draftId,termId:draft.id,semester:1});assert.equal((await lifecycle(draftId,"deactivate")).ok,false);
  lines.push("Explicit deactivate/reactivate/graduate/restore preserve placements; ongoing and draft-term uses refuse lifecycle. Existing placement and unsupported snapshot evidence refuse deletion; a truly unused mistake deletes only with retained tombstone audit.");
  const active=(await context.captureActiveContext()).term.id;
  const summerCount=await selectFingerprint(raw,`select * from batch_term_placements where term_id=${active}`);
  await db.transaction(async tx=>{await context.lockTermContext(tx,"exclusive");await tx.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.id,active));await tx.update(s.academicTerms).set({status:"active"}).where(eq(s.academicTerms.id,draft.id));await context.advanceTermGeneration(tx);});
  const beforeSpring=(await data.getBatchDetail(String(used.id)))!;
  if(beforeSpring.current)ok(await count(used.id,"verify","37"));
  assert.deepEqual(await selectFingerprint(raw,`select * from batch_term_placements where term_id=${active}`),summerCount);
  if(beforeSpring.current){const loaded=await portal.getPortalData();assert.equal(loaded.batches.find(b=>b.id===used.id)!.studentCount,37);const evidence=await rooms.groupEvidence(db,loaded.meetings.map(m=>m.teachingGroupId));assert.ok([...evidence.values()].some(g=>g.audienceEvidence.some(a=>a.count===37)));}
  const serialized=loadApp<typeof import("../../../src/lib/serialize")>("src/lib/serialize.ts"),frozen=loadApp<typeof import("../../../src/lib/term-publication")>("src/lib/term-publication.ts");
  const loaded=await portal.getPortalData(),snapshot=serialized.buildSnapshot({meetings:loaded.meetings,term:loaded.term,versionNumber:2,batches:loaded.batches,breaks:loaded.breaks,externals:loaded.externals,issues:[],metadata:loaded.publicationMetadata,timeGrid:loaded.timeGrid});
  assert.doesNotMatch(JSON.stringify(snapshot),/countVerifiedBy|countVerifiedAt|countSource|_activeTermId|Synthetic private reference/);
  const projected=frozen.frozenPublication(snapshot,loaded.term.id,2);assert.ok(projected);assert.equal(projected.batches.find(b=>b.id===used.id)!.countStatus,"verified");
  signInAs("batch-role-5@example.invalid");const viewOnly=await data.getBatchDetail(String(used.id));assert.equal(viewOnly!.editor,false);assert.doesNotMatch(JSON.stringify(viewOnly),/Synthetic private reference|countVerifiedBy|countVerifiedAt|countSource/);signInAs("admin@example.invalid");
  const handle={exec:async(q:string)=>{if("exec"in raw)await (raw as unknown as {exec:(q:string)=>Promise<unknown>}).exec(q);else await raw.query(q);}};
  await setAuditInsertFault(handle,true);const identityBefore=await selectFingerprint(raw,"select * from batches");
  assert.equal((await call({command:"identity",batchId:id,revision:(await record(id)).revision,stream:"HSC",label:"ROLLBACK",intake:"",sortOrder:0,reason:"Audit rollback"})).ok,false);
  assert.deepEqual(await selectFingerprint(raw,"select * from batches"),identityBefore);await setAuditInsertFault(handle,false);
  await concurrency(lines);
  await batchBoundaryRaces(lines);
  await db.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.status,"active"));
  assert.equal((await data.getBatchDirectory()).term,null);assert.ok(await data.getBatchDetail(String(id)));
  lines.push("Each direct cohort FK family and structured snapshot independently refuses deletion. Two-term counts use actual portal/all-term room projections without touching previous rows; new frozen confidence round-trips without private metadata; viewers receive no count source/verifier/history; audit failure rolls back identity; zero-active history works.");
  report({lines});
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
