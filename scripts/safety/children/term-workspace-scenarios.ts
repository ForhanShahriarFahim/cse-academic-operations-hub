/** Raw production actions: no fresh-page adapter or bypass for context tests. */
import assert from "node:assert/strict";
import { eq,sql } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp,report,signInAs } from "./controlled-runtime";
import { fingerprintDatabase } from "../fingerprint";
import type { ActionResult } from "../../../src/lib/action-result";
import type { TermWriteContext } from "../../../src/lib/term-context-value";

const database=loadApp<typeof import("../../../src/db")>("src/db/index.ts"),{db}=database;
const s=loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context=loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const terms=loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
const reads=loadApp<typeof import("../../../src/lib/term-data")>("src/lib/term-data.ts");
const actions=loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const academic=loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const grid=loadApp<typeof import("../../../src/lib/time-grid-actions")>("src/lib/time-grid-actions.ts");
const teachers=loadApp<typeof import("../../../src/lib/teacher-actions")>("src/lib/teacher-actions.ts");
const data=loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const archive=loadApp<typeof import("../../../src/lib/term-archive")>("src/lib/term-archive.ts");
const auth=loadApp<typeof import("../../../src/lib/auth")>("src/lib/auth/index.ts");
const records=loadApp<typeof import("../../../src/lib/term-records")>("src/lib/term-records.ts");
const {buildSnapshot}=loadApp<typeof import("../../../src/lib/serialize")>("src/lib/serialize.ts");
const raw=(db as unknown as {$client:import("../database").Queryable}).$client;
const form=(values:Record<string,unknown>)=>{const fd=new FormData();for(const[k,v]of Object.entries(values))fd.set(k,String(v));return fd;};
const policyValues=Object.fromEntries(records.POLICY_FIELDS.map(key=>[key,key==="extraClassRate"?200:1]));
const assertOk=(r:ActionResult)=>{assert.equal(r.ok,true,r.message);return r.outcome?.kind==="success"?r.outcome.entityId!:0;};
async function create(name:string){return assertOk(await terms.createTermAction(null,form({name,academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})));}
async function ready(name:string){const id=await create(name);assertOk(await terms.saveStartingPolicyAction(null,form({termId:id,revision:1,...policyValues})));return id;}
async function reviewForm(id:number){const review=await reads.activationEvidence(id);assert.ok(review);return form({termId:id,revision:review.target.term.revision,generation:review.context.generation,previousActiveId:review.active?.term.id??"",fingerprint:review.fingerprint,reason:"Synthetic verification only",acknowledge:"on"});}
async function activate(id:number){return terms.activateTermAction(null,await reviewForm(id));}

/** The complete public action inventory; malformed bodies never reach a write when context is absent/stale. */
function attempts(token?:TermWriteContext):Array<[string,()=>Promise<ActionResult>]> {
  return [
    ["createMeeting",()=>actions.createMeetingAction(form({}),token)],["moveMeeting",()=>actions.moveMeetingAction(1,0,540,600,token)],
    ["updateMeeting",()=>actions.updateMeetingAction(1,{} as Parameters<typeof actions.updateMeetingAction>[1],token)],["deleteMeeting",()=>actions.deleteMeetingAction(1,token)],
    ["createExternal",()=>actions.createExternalAction(form({}),token)],["verifyExternal",()=>actions.verifyExternalAction(1,token)],["deleteExternal",()=>actions.deleteExternalAction(1,token)],["publish",()=>actions.publishAction("Synthetic",token)],
    ["updatePolicy",()=>academic.updateAcademicPolicyAction(form(policyValues),token)],["createExtra",()=>academic.createExtraLoadClassAction(form({}),token)],
    ["deleteExtra",()=>academic.deleteExtraLoadClassAction(1,token)],["createManual",()=>academic.createManualTopSheetRowAction(form({}),token)],["deleteManual",()=>academic.deleteManualTopSheetRowAction(1,token)],
    ["upsertStudent",()=>academic.upsertStudentAction(form({}),token)],["importStudent",()=>academic.importStudentCsvAction(form({}),token)],["deactivateStudent",()=>academic.deactivateStudentAction(1,1,token)],
    ["createAttendance",()=>academic.createAttendanceSessionAction(form({}),token)],["saveAttendance",()=>academic.saveAttendanceAction(1,[],token)],["deleteAttendance",()=>academic.deleteAttendanceSessionAction(1,token)],["autoSchedule",()=>academic.applyAutoScheduleAction(token)],
    ["savePattern",()=>grid.savePatternAction({} as Parameters<typeof grid.savePatternAction>[0],token)],["deletePattern",()=>grid.deletePatternAction(1,null,token)],
    ["setDayPlan",()=>grid.setDayPlanAction({} as Parameters<typeof grid.setDayPlanAction>[0],token)],["removeException",()=>grid.removeExceptionAction(1,null,token)],["copyGrid",()=>grid.copyGridFromTermAction(1,0,token)],
    ["deactivateTeacher",()=>teachers.setTeacherStatusAction(null,form({action:"deactivate",teacherId:1,...(token?{_activeTermId:token.activeTermId,_termGeneration:token.generation}:{})}))],
  ];
}
async function refuseAll(token?:TermWriteContext){const before=await fingerprintDatabase(raw);for(const[name,run]of attempts(token)){const r=await run();assert.equal(r.ok,false,name);assert.equal(r.outcome?.kind,"stale",`${name}: ${r.message}`);}assert.deepEqual(await fingerprintDatabase(raw),before);}

async function roleMatrix(){
  const departments=await db.select().from(s.departments);const cse=departments.find(d=>d.code==="CSE")!,eee=departments.find(d=>d.code==="EEE")!;
  const matrix=[['system_administrator',null,true],['academic_administrator',cse.id,true],['academic_administrator',eee.id,false],['routine_coordinator',cse.id,false],['read_only_viewer',cse.id,false],['teacher',cse.id,false]] as const;
  for(let i=0;i<matrix.length;i++){const[role,departmentId,allowed]=matrix[i];const email=`term-role-${i}@example.invalid`;
    const[user]=await db.insert(s.portalUsers).values({email,displayName:"Synthetic term actor",status:"active"}).returning();
    await db.insert(s.roleAssignments).values({userId:user.id,role,departmentId,activeFrom:new Date("2020-01-01T00:00:00Z")});
    signInAs(email);const result=await terms.createTermAction(null,form({name:`Role draft ${i}`,academicYear:2041,startDate:"2041-01-01",endDate:"2041-05-01"}));
    assert.equal(result.ok,allowed,`${role}/${departmentId}: ${result.message}`);if(!allowed)assert.equal(result.outcome?.kind,"permission");
  }
  signInAs(null);assert.equal((await terms.createTermAction(null,form({}))).outcome?.kind,"permission");signInAs("admin@example.invalid");
}

async function protectedFamilies(lines:string[]){
  const active=(await context.captureActiveContext()).term.id,probe=await create("Reference-family probe");
  const [batch]=await db.select().from(s.batches);
  await db.insert(s.classRepresentatives).values({termId:active,batchId:batch.id,fullName:"Synthetic representative"}).onConflictDoNothing();
  await db.insert(s.departmentContacts).values({termId:active,fullName:"Synthetic contact",designation:"Fixture",phone:"Synthetic only"});
  await db.insert(s.routineSourceReconciliations).values({termId:active,sourceLabel:"Synthetic",detail:"Verification only"});
  await db.insert(s.academicPolicies).values({termId:probe,...Object.fromEntries(records.POLICY_FIELDS.map(k=>[k,"0"]))});
  const [pattern]=await db.insert(s.periodPatterns).values({termId:probe,name:"Setup-only",periods:[{start:540,end:600}],breaks:[]}).returning();
  await db.insert(s.dayPlans).values({termId:probe,stream:"HSC",dayOfWeek:0,patternId:pattern.id});
  await db.insert(s.permittedWindows).values({termId:probe,stream:"HSC",dayOfWeek:0,startMinutes:540,endMinutes:600});
  assert.equal((await reads.getTermSummary(probe))!.editable,true,"policy/grid/window setup alone does not freeze metadata");
  const familyTables=["batch_term_placements","class_representatives","department_contacts","routine_source_reconciliations","course_offerings","teaching_groups","course_enrollments","attendance_sessions","extra_load_classes","extra_load_manual_summaries","external_commitments","workload_allocations","schedule_versions"];
  for(const table of familyTables){
    await assert.rejects(db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{
      await context.lockTermContext(tx,"exclusive");
      const rows=await tx.execute<{id:number}>(sql`select id from ${sql.identifier(table)} limit 1`);assert.ok(rows.rows.length,`fixture covers ${table}`);
      await tx.execute(sql`update ${sql.identifier(table)} set term_id=${probe} where id=${rows.rows[0].id}`);
      const summary=await reads.getTermSummary(probe);assert.equal(summary!.editable,false,table);assert.ok(summary!.uses.some(u=>u.table===table));
      assert.equal((await terms.editTermAction(null,form({termId:probe,revision:1,name:"Refused",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"}))).ok,false,table);
      assert.equal((await terms.saveStartingPolicyAction(null,form({termId:probe,revision:1,...policyValues}))).ok,false,table+" policy freeze");
      throw new Error("rollback reference probe");
    })),/rollback reference probe/);
  }
  assert.equal((await reads.getTermSummary(probe))!.editable,true);
  assertOk(await terms.editTermAction(null,form({termId:probe,revision:1,name:"Reference-family probe",academicYear:2040,startDate:"2040-01-01",endDate:"2040-07-31"})));
  lines.push("Every one of the 13 protected term-reference families refuses draft identity and starting-policy edits, including existing business descendants; policy/grid/day-plan/window setup alone permits a revisioned date edit. Each reference probe is rolled back.");
}

async function postgresRaces(lines:string[]){
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});const control=await pool.connect();
  async function waitFor(query:string){const end=Date.now()+15000;while(Date.now()<end){if(Number((await pool.query(query)).rows[0].count)>0)return;await new Promise(r=>setTimeout(r,15));}assert.fail(`No observed database barrier: ${query}`);}
  async function hold(table:string,first:()=>Promise<ActionResult>,second:()=>Promise<ActionResult>,event="update"){
    await control.query("select pg_advisory_lock(493731)");
    await pool.query(`create or replace function set01a_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(493731); return new; end$$; create trigger set01a_barrier before ${event} on ${table} for each row execute function set01a_barrier()`);
    let a:Promise<ActionResult>|undefined,b:Promise<ActionResult>|undefined;
    try{a=first();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");b=second();await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%term_context%' and cardinality(pg_blocking_pids(pid))>0");}
    finally{await control.query("select pg_advisory_unlock(493731)");}
    try{return await Promise.all([a!,b!]);}finally{await pool.query(`drop trigger set01a_barrier on ${table};drop function set01a_barrier()`);}
  }
  try{
    let token=(await context.captureActiveContext()).writeContext;let target=await ready("Writer before activation"),review=await reviewForm(target);
    const first=await hold("academic_policies",()=>academic.updateAcademicPolicyAction(form(policyValues),token),()=>terms.activateTermAction(null,review));assertOk(first[0]);assertOk(first[1]);
    token=(await context.captureActiveContext()).writeContext;target=await ready("Activation before writer");review=await reviewForm(target);
    const second=await hold("academic_terms",()=>terms.activateTermAction(null,review),()=>academic.updateAcademicPolicyAction(form(policyValues),token));assertOk(second[0]);assert.equal(second[1].outcome?.kind,"stale");
    const x=await ready("Competing activation X"),y=await ready("Competing activation Y"),rx=await reviewForm(x),ry=await reviewForm(y);
    const third=await hold("academic_terms",()=>terms.activateTermAction(null,rx),()=>terms.activateTermAction(null,ry));assertOk(third[0]);assert.equal(third[1].outcome?.kind,"stale");
    const duplicate=await hold("academic_terms",()=>terms.createTermAction(null,form({name:"Concurrent duplicate",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})),()=>terms.createTermAction(null,form({name:" CONCURRENT   duplicate ",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})),"insert");assertOk(duplicate[0]);assert.equal(duplicate[1].outcome?.kind,"validation");
    const editId=await create("Concurrent edit source");
    const edit=await hold("academic_terms",()=>terms.editTermAction(null,form({termId:editId,revision:1,name:"Concurrent edit identity",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})),()=>terms.createTermAction(null,form({name:"Concurrent edit identity",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})));assertOk(edit[0]);assert.equal(edit[1].outcome?.kind,"validation");
    lines.push("PostgreSQL actual production writer→activation, activation→writer, competing activation, duplicate-create and edit/create identity races pass using independent connections, SQL trigger/advisory barriers and observed pg_blocking_pids context waits; losers refuse stale context/review or duplicate identity.");
  }finally{control.release();await pool.end();}
}

async function pgliteQueue(lines:string[]){
  const token=(await context.captureActiveContext()).writeContext;const target=await ready("PGlite queued activation"),review=await reviewForm(target);
  let held!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>held=r),finish=new Promise<void>(r=>release=r);
  const writer=db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{await context.lockTermContext(tx,"share");assertOk(await academic.updateAcademicPolicyAction(form(policyValues),token));held();await finish;}));
  await entered;let settled=false;const activation=terms.activateTermAction(null,review).then(result=>{settled=true;return result;});
  await new Promise(r=>setTimeout(r,25));assert.equal(settled,false);release();await writer;assertOk(await activation);
  const old=(await context.captureActiveContext()).writeContext,next=await ready("PGlite activation first"),nextReview=await reviewForm(next);
  let activated!:()=>void,complete!:()=>void;const inside=new Promise<void>(r=>activated=r),commit=new Promise<void>(r=>complete=r);
  const switcher=db.transaction(tx=>database.inDatabaseTransaction(tx,async()=>{await context.lockTermContext(tx,"exclusive");assertOk(await terms.activateTermAction(null,nextReview));activated();await commit;}));
  await inside;const staleWriter=academic.updateAcademicPolicyAction(form(policyValues),old);complete();await switcher;assert.equal((await staleWriter).outcome?.kind,"stale");
  const duplicates=await Promise.all([terms.createTermAction(null,form({name:"PGlite concurrent identity",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"})),terms.createTermAction(null,form({name:" PGLITE   concurrent identity ",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"}))]);assert.equal(duplicates.filter(r=>r.ok).length,1);assert.equal(duplicates.filter(r=>r.outcome?.kind==="validation").length,1);
  const a=await ready("PGlite competing A"),b=await ready("PGlite competing B"),ra=await reviewForm(a),rb=await reviewForm(b);
  const competing=await Promise.all([terms.activateTermAction(null,ra),terms.activateTermAction(null,rb)]);assert.equal(competing.filter(r=>r.ok).length,1);assert.equal(competing.filter(r=>r.outcome?.kind==="stale").length,1);
  lines.push("PGlite production action queue passes both switch/save orderings with real open transactions and independent async requests. PGlite has one SQL connection; independent multi-session SQL races are PostgreSQL-only.");
}

async function main(){
  const lines:string[]=[];signInAs("admin@example.invalid");
  const initial=await context.captureActiveContext();const initialTerm=initial.term.id;
  await roleMatrix();await protectedFamilies(lines);await refuseAll();
  const draft=await create(" New   synthetic term ");const summary=await reads.getTermSummary(draft);assert.ok(summary?.editable);assert.equal(summary.policy,null);assert.equal(summary.counts.patterns,0);assert.equal(summary.term.status,"draft");assert.equal(summary.term.managedSetup,true);
  const malformedCases:Array<[string,(f:FormData)=>Promise<ActionResult>]>=[
    ["name",f=>terms.createTermAction(null,f)],["termId",f=>terms.editTermAction(null,f)],
    ["extraClassRate",f=>terms.saveStartingPolicyAction(null,f)],["reason",f=>terms.activateTermAction(null,f)],
  ];
  for(const[key,run]of malformedCases)for(const value of ["duplicate",new File(["x"],"synthetic.txt")]){const fd=form({[key]:"original"});if(typeof value==="string")fd.append(key,value);else fd.set(key,value);const before=await fingerprintDatabase(raw);assert.equal((await run(fd)).outcome?.kind,"validation",key);assert.deepEqual(await fingerprintDatabase(raw),before);}
  const duplicateToken=form({...policyValues,_activeTermId:initial.writeContext.activeTermId,_termGeneration:initial.writeContext.generation});duplicateToken.append("_termGeneration","1");assert.equal((await academic.updateAcademicPolicyAction(duplicateToken)).outcome?.kind,"stale");
  assert.equal((await terms.createTermAction(null,form({name:"new synthetic term",academicYear:2040,startDate:"2040-01-01",endDate:"2040-06-30"}))).outcome?.kind,"validation");
  assert.equal((await terms.saveStartingPolicyAction(null,form({termId:draft,revision:1}))).outcome?.kind,"validation");
  assertOk(await terms.saveStartingPolicyAction(null,form({termId:draft,revision:1,...policyValues})));
  assert.equal((await terms.editTermAction(null,form({termId:draft,revision:1,name:"Stale"}))).outcome?.kind,"stale");
  const staleReview=await reviewForm(draft);assertOk(await terms.saveStartingPolicyAction(null,form({termId:draft,revision:2,...policyValues,extraClassRate:250})));
  assert.equal((await terms.activateTermAction(null,staleReview)).outcome?.kind,"stale");
  const blocked=await ready("Protected draft");await db.insert(s.scheduleVersions).values({termId:blocked,versionNumber:1,state:"draft",snapshot:{}});
  assert.equal((await reads.getTermSummary(blocked))!.editable,false);assert.equal((await terms.editTermAction(null,form({termId:blocked,revision:2,name:"No"}))).ok,false);
  const portal=await data.getPortalData();const snapshot=buildSnapshot({term:portal.term,versionNumber:50,meetings:portal.meetings,batches:portal.batches,breaks:portal.breaks,externals:portal.externals,issues:[],timeGrid:portal.timeGrid,metadata:portal.publicationMetadata});
  snapshot.metadata.teachers.forEach(t=>{t.phone="PRIVATE_SENTINEL_PHONE";t.email="PRIVATE_SENTINEL_EMAIL";});
  // BUG-25: the term already has its one published version; this frozen archive row is superseded history.
  const [version]=await db.insert(s.scheduleVersions).values({termId:initialTerm,versionNumber:50,state:"superseded",publishedAt:new Date(),snapshot:{...snapshot,privateRoster:"PRIVATE_SENTINEL_ROSTER"}}).returning();
  const saved=JSON.stringify(version.snapshot),frozen=await archive.getTermPublication(initialTerm,version.id);assert.ok(frozen);assert.equal(JSON.stringify(frozen).includes("PRIVATE_SENTINEL"),false);
  assert.equal(await archive.getTermPublication(draft,version.id),null);
  signInAs(null);await assert.rejects(archive.getTermPublication(initialTerm,version.id),auth.AuthenticationError);signInAs("admin@example.invalid");
  await db.update(s.teachers).set({fullName:"Changed current identity"});assert.deepEqual(await archive.getTermPublication(initialTerm,version.id),frozen);
  const invalidReview=await reviewForm(draft);invalidReview.delete("reason");assert.equal((await terms.activateTermAction(null,invalidReview)).outcome?.kind,"validation");
  const before=await fingerprintDatabase(raw);assertOk(await activate(draft));const after=await fingerprintDatabase(raw);
  for(const[name,value]of Object.entries(before.tables))if(!["public.academic_terms","public.term_context","public.audit_events"].includes(name))assert.deepEqual(after.tables[name],value,name);
  await refuseAll(initial.writeContext);assert.equal(JSON.stringify((await db.select().from(s.scheduleVersions).where(eq(s.scheduleVersions.id,version.id)))[0].snapshot),saved);
  assertOk(await academic.updateAcademicPolicyAction(form(policyValues),(await context.captureActiveContext()).writeContext));
  // Disposable ABA seam; there is intentionally no production reopen action.
  await db.transaction(async tx=>{await tx.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.id,draft));await tx.update(s.academicTerms).set({status:"active"}).where(eq(s.academicTerms.id,initialTerm));await tx.update(s.termContext).set({generation:sql`${s.termContext.generation}+1`});});
  await refuseAll(initial.writeContext);
  const fresh=await ready("Zero active first activation");await db.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.status,"active"));assertOk(await activate(fresh));
  const rollbackTarget=await ready("Audit rollback"),rollbackReview=await reviewForm(rollbackTarget),rollbackBefore=await fingerprintDatabase(raw);
  await db.execute(sql`create function set01a_reject_audit() returns trigger language plpgsql as $$begin if NEW.action='term.activate' then raise exception 'synthetic audit refusal'; end if; return NEW; end$$`);
  await db.execute(sql`create trigger set01a_reject_audit before insert on audit_events for each row execute function set01a_reject_audit()`);
  await assert.rejects(terms.activateTermAction(null,rollbackReview));
  await db.execute(sql`drop trigger set01a_reject_audit on audit_events`);
  await db.execute(sql`drop function set01a_reject_audit()`);
  const rollbackAfter=await fingerprintDatabase(raw);assert.deepEqual(rollbackAfter.tables,rollbackBefore.tables,"audit failure rolls back status/context/data (sequence gaps are normal)");assertOk(await activate(rollbackTarget));
  lines.push("Raw production permissions/scope, normalized duplicate, explicit/missing policy, protected draft/revision, fresh activation, changed review, zero-active activation, audit rollback, immutable/redacted archive and 26 missing/stale/ABA action refusals pass; fingerprints prove refused writes leave data/audit/sequences unchanged.");
  if(process.env.DATABASE_URL)await postgresRaces(lines);else await pgliteQueue(lines);
  const [row]=await db.select().from(s.termContext);await db.delete(s.termContext);
  assert.equal((await terms.createTermAction(null,form({name:"No context"}))).ok,false);await assert.rejects(data.getPortalData());await db.insert(s.termContext).values(row);
  lines.push("Missing context fails closed; no unlocked fallback or synthetic context is created. Historical field/publication data are preserved.");
  // Put original ID 1 back under a fresh epoch in the owned fixture, so the
  // replacement really reuses the same ID instead of only changing identity.
  await db.transaction(async tx=>{await context.lockTermContext(tx,"exclusive");await tx.update(s.academicTerms).set({status:"completed"}).where(eq(s.academicTerms.status,"active"));await tx.update(s.academicTerms).set({status:"active"}).where(eq(s.academicTerms.id,initialTerm));await context.advanceTermGeneration(tx);});
  const oldContext=(await context.captureActiveContext()).writeContext;
  const reset=loadApp<typeof import("../../../src/db/reset-access")>("src/db/reset-access.ts");
  await reset.clearAcademicData(db,"db:reset");
  const empty=await context.readTermContext();assert.equal(empty.state.kind,"none");assert.equal(empty.generation,oldContext.generation+1);
  const replacement=await ready("Owned replacement after reset");assert.equal(replacement,oldContext.activeTermId,"same term ID is reused after the owned reset");assertOk(await activate(replacement));
  assert.equal((await academic.updateAcademicPolicyAction(form(policyValues),oldContext)).outcome?.kind,"stale");
  lines.push("Owned development replacement takes the context lock first and increments generation atomically before clearing academic rows; preserved access and later reuse of the exact same term ID cannot revive an old form. No institutional reset command is used.");
  report({lines});
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
