"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, inDatabaseTransaction } from "@/db";
import { batches, batchTermPlacements } from "@/db/schema";
import { actionActor } from "./auth/action-guard";
import { hasCapability, type Actor } from "./auth/policy";
import { denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { withTermContext } from "./active-term";
import { assertTermContext, lockTermContext, readTermContext, TermContextChanged } from "./term-context";
import { parseTermWriteContext } from "./term-context-value";
import { batchStates, countStatus, integerField, lifecycleTarget, note, parseBatchIdentity } from "./batch-records";
import { auditBatch, batchDuplicate, batchEvidence, cohortScope, countImpact, deletionBlocks, fingerprint, type BatchEvidence, type BatchTx } from "./batch-store";

export interface BatchResult extends ActionResult { fingerprint?:string; evidence?:BatchEvidence; impact?:Awaited<ReturnType<typeof countImpact>> }
const fields=["batchId","revision","placementRevision","command","stream","label","intake","sortOrder","reason","semester","studentCount","countSource","fingerprint","confirmation","acknowledge","generation","_activeTermId","_termGeneration"];
export async function saveBatchAction(_previous:BatchResult|null,form:FormData):Promise<BatchResult>{
  const actor=await actionActor("manage_batches");if("ok"in actor)return actor;
  if(!(form instanceof FormData))return invalid("Submit a valid batch form.");
  const raw:Record<string,string>={};
  for(const [key,value]of form.entries()){
    if(key.startsWith("$ACTION_"))continue;
    if(!fields.includes(key)||key in raw||typeof value!=="string")return invalid("Submit each supported field once as text.");
    raw[key]=value;
  }
  if(!note(raw.reason))return invalid("Enter a reason of 1–300 characters.",{reason:["A reason is required; do not include private student data."]});
  try{return await withTermContext(()=>db.transaction(tx=>inDatabaseTransaction(tx,async()=>{
    await lockTermContext(tx,"exclusive");
    if(!hasCapability(actor,"manage_batches",await cohortScope(tx)))return denied("You do not have permission to manage CSE cohorts.","forbidden");
    const fresh=await actionActor("manage_batches");if("ok"in fresh)return fresh;
    const result=await mutateBatch(tx,fresh,raw,form);
    if(result.ok&&!result.message.startsWith("Nothing changed"))revalidatePath("/","layout");
    return result;
  }))) as BatchResult;}catch(error){
    if(error instanceof TermContextChanged)return stale(error.message);
    // The person sees a safe message; the server keeps the cause for diagnosis.
    console.error("Batch change failed and was rolled back",error);
    return invalid("The batch change could not be saved. Your input is kept. Review and try again.");
  }
}
async function mutateBatch(tx:BatchTx,actor:Actor,raw:Record<string,string>,form:FormData):Promise<BatchResult>{
  const command=raw.command;
  const identity=command==="identity";
  const id=integerField(raw.batchId);
  if(!identity&&!id||raw.batchId&&!id)return invalid("Choose a valid batch.");
  const [record]=id?await tx.select().from(batches).where(eq(batches.id,id)).for("update"):[];
  if(id&&!record)return stale("This batch no longer exists.","missing");
  if(record&&integerField(raw.revision)!==record.revision)return stale("Someone else changed this cohort. Your input is kept; review the latest record.");
  if(identity){
    const parsed=parseBatchIdentity(raw);if(!parsed.ok)return invalid("Check the highlighted fields.",parsed.errors);
    const values=parsed.fields;
    const changed=record?Object.keys(values).filter(k=>record[k as keyof typeof values]!==values[k as keyof typeof values]):Object.keys(values);
    if(record&&!changed.length)return succeeded("Nothing changed.",{entityId:record.id});
    if((!record||changed.includes("label")||changed.includes("stream"))&&await batchDuplicate(tx,values.stream,values.label,record?.id))return invalid("That batch label is already in use.",{label:["Use a different label in this stream, including retained cohorts."]});
    if(record&&record.stream!==values.stream){const e=await batchEvidence(tx,record);if(Object.values(e.totals).some(Boolean)||e.snapshots||e.uncertainSnapshots)return invalid("A used cohort's stream cannot change. Create a separate cohort in the other stream.",{stream:["Academic or saved references protect this stream."]});}
    const [saved]=record?await tx.update(batches).set({...values,revision:record.revision+1}).where(eq(batches.id,record.id)).returning():await tx.insert(batches).values({...values,status:"active",isDraft:true}).returning();
    await auditBatch(tx,actor,record?"identity":"create",saved.id,record??null,saved,raw.reason);
    return succeeded(record?"Batch identity saved.":"Batch added. Place it in the active term as a separate step.",{entityId:saved.id});
  }
  if(!record)return stale("This batch no longer exists.","missing");
  if(!batchStates.includes(record.status as typeof batchStates[number]))return invalid("This cohort has an unsupported legacy status. A status correction needs an owner decision.");
  const context=await readTermContext(tx);
  if(["deactivate","reactivate","graduate","restore","delete"].includes(command)){
    const evidence=await batchEvidence(tx,record);
    const blocks=command==="delete"?deletionBlocks(record,evidence):["deactivate","graduate"].includes(command)?evidence.references.filter(r=>r.blocksLifecycle).map(r=>`${r.term}: ${r.detail}`):[];
    if(blocks.length)return {...invalid(command==="delete"?"This cohort must be retained.":"Resolve ongoing planning or teaching before changing this status."),evidence,issues:blocks.map(detail=>({severity:"blocker" as const,title:"Cohort reference",detail}))};
    const target=command==="delete"?null:lifecycleTarget(record.status,command);
    if(command!=="delete"&&!target)return invalid("This lifecycle transition is not available for the current status.");
    const current=fingerprint({record,command,generation:context.generation,evidence});
    if(raw.fingerprint!==current||raw.generation!==String(context.generation)||raw.confirmation!==`${record.stream}-${record.label}`||raw.acknowledge!=="on")return {...invalid("Review the current impact, enter the cohort identity and confirm this change."),fingerprint:current,evidence};
    if(command==="delete")await tx.delete(batches).where(eq(batches.id,record.id));
    else await tx.update(batches).set({status:target!,revision:record.revision+1}).where(eq(batches.id,record.id));
    await auditBatch(tx,actor,command,record.id,record,target?{...record,status:target,revision:record.revision+1}:null,raw.reason,{evidence});
    return succeeded(command==="delete"?"Unused mistaken cohort deleted; its audit is retained.":`Cohort status saved: ${target}.`,{entityId:record.id});
  }
  const expected=parseTermWriteContext(form);if(!expected)throw new TermContextChanged("This form has no valid term context. Refresh before continuing.");
  const {term}=await assertTermContext(expected,tx);
  const [placement]=await tx.select().from(batchTermPlacements).where(andPlacement(record.id,term.id)).for("update");
  if(command==="placement"){
    if(record.status!=="active")return invalid("Reactivate or restore this cohort before creating or correcting its placement.");
    const semester=integerField(raw.semester,1,8);if(semester==null)return invalid("Choose semester 1–8.",{semester:["Enter a whole number from 1 to 8."]});
    if(placement){
      if(integerField(raw.placementRevision)!==placement.revision)return stale("Someone else changed this term placement. Review the latest values.");
      if(placement.semester===semester)return succeeded("Nothing changed.",{entityId:record.id});
      const evidence=await batchEvidence(tx,record);
      if(evidence.references.some(r=>r.termId===term.id&&!r.key.startsWith("placement:")))return invalid("This semester is protected by academic or saved routine use. A historic correction needs a separate decision.");
      const [saved]=await tx.update(batchTermPlacements).set({semester,revision:placement.revision+1}).where(eq(batchTermPlacements.id,placement.id)).returning();
      await auditBatch(tx,actor,"placement.correct",record.id,placement,saved,raw.reason);
    }else{
      if(raw.placementRevision)return stale("This placement no longer exists.");
      const [saved]=await tx.insert(batchTermPlacements).values({batchId:record.id,termId:term.id,semester}).returning();
      await auditBatch(tx,actor,"placement.create",record.id,null,saved,raw.reason);
    }
    return succeeded("Active-term placement saved. Count is maintained separately.",{entityId:record.id});
  }
  if(!["estimate","verify","unverify","unknown"].includes(command))return invalid("Choose a supported cohort action.");
  if(!placement)return invalid("Place this cohort in the active term before recording a count.");
  if(integerField(raw.placementRevision)!==placement.revision)return stale("Someone else changed this term's count or placement. Your input is kept.");
  const number=command==="unknown"?null:command==="unverify"?placement.studentCount:raw.studentCount===""?null:integerField(raw.studentCount,0);
  if(command==="verify"&&number==null||raw.studentCount!==""&&number==null&&!["unknown","unverify"].includes(command))return invalid("Enter a non-negative whole count or leave blank for unknown.",{studentCount:["Use 0–2,147,483,647; zero is an explicit count."]});
  if(command==="verify"&&!note(raw.countSource))return invalid("Enter a non-private count reference.",{countSource:["Confirmation requires a reference of 1–300 characters."]});
  if(raw.countSource&&(!note(raw.countSource)||raw.countSource.length>300))return invalid("Use a count reference of at most 300 characters.",{countSource:["Do not include private student data."]});
  const values={studentCount:number,countSource:command==="unknown"?null:command==="unverify"?placement.countSource:raw.countSource?.trim()||null,countOrigin:"manual",countVerifiedAt:command==="verify"?new Date():null,countVerifiedBy:command==="verify"?actor.id:null};
  const desiredStatus=command==="verify"?"verified":number==null?"unknown":"unverified";
  const impact=await countImpact(tx,record.id,term.id,{studentCount:number,countStatus:desiredStatus});
  const current=fingerprint({id:record.id,revision:record.revision,placementRevision:placement.revision,generation:context.generation,command,number,source:values.countSource,impact});
  if(raw.fingerprint!==current||raw.acknowledge!=="on")return {...invalid("Review the affected draft room fit and confirm this count change. Bookings are retained."),fingerprint:current,impact};
  if(number===placement.studentCount&&values.countSource===placement.countSource&&desiredStatus===countStatus(placement)&&command!=="verify")return succeeded("Nothing changed.",{entityId:record.id});
  const [saved]=await tx.update(batchTermPlacements).set({...values,revision:placement.revision+1}).where(eq(batchTermPlacements.id,placement.id)).returning();
  await auditBatch(tx,actor,`count.${command}`,record.id,placement,saved,raw.reason,{impact});
  return succeeded(`Count saved for ${term.name}: ${number??"unknown"} · ${desiredStatus}.`,{entityId:record.id});
}
import { and } from "drizzle-orm";
const andPlacement=(batchId:number,termId:number)=>and(eq(batchTermPlacements.batchId,batchId),eq(batchTermPlacements.termId,termId));
