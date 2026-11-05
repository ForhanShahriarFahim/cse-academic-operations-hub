import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { academicTerms, batches, batchTermPlacements, courseOfferings, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { authorize, can } from "./auth";
import { cohortRead, readTermContext } from "./term-context";
import { countStatus, integerField } from "./batch-records";
import { batchChanges, batchEvidence, fingerprint } from "./batch-store";

export async function getBatchDirectory(){
  const actor=await authorize("view_internal_portal");
  const editor=await can(actor,"manage_batches");
  return cohortRead(async()=>{
    const context=await readTermContext();
    const term=context.state.kind==="one"?context.state.term:null;
    const records=await db.select().from(batches).orderBy(batches.stream,batches.sortOrder,batches.id);
    const placements=term?await db.select().from(batchTermPlacements).where(eq(batchTermPlacements.termId,term.id)):[];
    const links=term?await db.select({batchId:courseOfferings.batchId,groupId:teachingGroups.id,external:teachingGroups.externalAudienceLabel}).from(teachingGroupOfferings).innerJoin(courseOfferings,eq(courseOfferings.id,teachingGroupOfferings.offeringId)).innerJoin(teachingGroups,eq(teachingGroups.id,teachingGroupOfferings.teachingGroupId)).where(eq(teachingGroups.termId,term.id)):[];
    return {editor,term,context:{generation:context.generation,writeContext:term?{activeTermId:term.id,generation:context.generation}:null},records:records.map(b=>{
      const p=placements.find(p=>p.batchId===b.id),groups=links.filter(l=>l.batchId===b.id);
      return {id:b.id,stream:b.stream,label:b.label,intake:b.intake,status:b.status,sortOrder:b.sortOrder,semester:p?.semester??null,studentCount:p?.studentCount??null,countStatus:p?countStatus(p):null,shared:groups.some(g=>g.external||links.some(l=>l.groupId===g.groupId&&l.batchId!==b.id))};
    })};
  });
}
export async function getBatchDetail(value:string){
  const actor=await authorize("view_internal_portal"),editor=await can(actor,"manage_batches");
  const id=integerField(value);if(!id)return null;
  return cohortRead(async()=>{
    const [record]=await db.select().from(batches).where(eq(batches.id,id));if(!record)return null;
    const context=await readTermContext(),term=context.state.kind==="one"?context.state.term:null;
    const placements=await db.select({p:batchTermPlacements,t:academicTerms}).from(batchTermPlacements).innerJoin(academicTerms,eq(academicTerms.id,batchTermPlacements.termId)).where(eq(batchTermPlacements.batchId,id)).orderBy(asc(academicTerms.startDate),asc(academicTerms.id));
    const evidence=editor?await batchEvidence(db,record):null;
    const current=placements.find(({p})=>p.termId===term?.id)?.p??null;
    const history=editor?await batchChanges(db,id):[];
    const activeUse=editor&&term?evidence!.references.some(r=>r.termId===term.id&&!r.key.startsWith("placement:")):true;
    return {editor,record,term,generation:context.generation,writeContext:term?{activeTermId:term.id,generation:context.generation}:null,
      placements:placements.map(({p,t})=>({id:p.id,termId:t.id,termName:t.name,termStatus:t.status,semester:p.semester,studentCount:p.studentCount,countStatus:countStatus(p),countOrigin:p.countOrigin,...(editor?{countSource:p.countSource,countVerifiedAt:p.countVerifiedAt?.toISOString()??null,countVerifiedBy:p.countVerifiedBy}:{} )})),
      current:current&&{id:current.id,semester:current.semester,studentCount:current.studentCount,countStatus:countStatus(current),revision:current.revision,...(editor?{countSource:current.countSource}:{} )},
      evidence,activeUse,history:history.map(h=>({id:h.id,at:h.at.toISOString(),actor:h.actorDisplayName??h.actor,action:h.action,before:h.before,after:h.after,detail:h.detail})),
      lifecycleFingerprints:editor?Object.fromEntries(["deactivate","reactivate","graduate","restore","delete"].map(command=>[command,fingerprint({record,command,generation:context.generation,evidence})])):{},
    };
  });
}
// Imports above intentionally avoid getPortalData: cohort history works with zero active terms.
