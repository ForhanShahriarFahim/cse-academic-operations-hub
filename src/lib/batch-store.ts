/** BAT-01A evidence and writes. Caller owns context lock and transaction. */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, auditEvents, batches, batchTermPlacements, classRepresentatives, courseEnrollments, courseOfferings, dayPlans, departments, meetingRooms, meetings, permittedWindows, rooms, scheduleVersions, students, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import type { Actor } from "./auth/policy";
import { batchIdentityKey, countStatus, snapshotBatchEvidence, type CountStatus } from "./batch-records";

export type BatchTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type BatchReader = Pick<BatchTx,"select">;
export type BatchRecord = typeof batches.$inferSelect;
export type PlacementRecord = typeof batchTermPlacements.$inferSelect;
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface BatchEvidence {
  references: Array<{key:string;termId:number|null;term:string;detail:string;href:string;blocksLifecycle:boolean}>;
  totals: Record<string,number>;
  snapshots:number; uncertainSnapshots:number;
}
export async function batchEvidence(reader: BatchReader, record: BatchRecord): Promise<BatchEvidence> {
  const references: BatchEvidence["references"] = [];
  const totals: Record<string,number> = {};
  const placements=await reader.select({p:batchTermPlacements,t:academicTerms}).from(batchTermPlacements).innerJoin(academicTerms,eq(academicTerms.id,batchTermPlacements.termId)).where(eq(batchTermPlacements.batchId,record.id)).orderBy(batchTermPlacements.id);
  for(const {p,t} of placements)references.push({key:`placement:${p.id}:${p.revision}`,termId:t.id,term:t.name,detail:`Semester ${p.semester} · ${t.status}`,href:`/terms/${t.id}`,blocksLifecycle:t.status!=="active"&&t.status!=="completed"});
  const offerings=await reader.select({o:courseOfferings,t:academicTerms}).from(courseOfferings).innerJoin(academicTerms,eq(academicTerms.id,courseOfferings.termId)).where(eq(courseOfferings.batchId,record.id)).orderBy(courseOfferings.id);
  for(const {o,t}of offerings)references.push({key:`offering:${o.id}:${o.status}`,termId:t.id,term:t.name,detail:`Course offering #${o.id} · ${o.status}`,href:"/courses",blocksLifecycle:t.status!=="completed"&&!["cancelled","completed"].includes(o.status)});
  const offeringIds=offerings.map(r=>r.o.id);
  const links=offeringIds.length?await reader.select().from(teachingGroupOfferings).where(inArray(teachingGroupOfferings.offeringId,offeringIds)).orderBy(teachingGroupOfferings.id):[];
  const groupIds=[...new Set(links.map(l=>l.teachingGroupId))];
  const events=groupIds.length?await reader.select({m:meetings,t:academicTerms}).from(meetings).innerJoin(teachingGroups,eq(teachingGroups.id,meetings.teachingGroupId)).innerJoin(academicTerms,eq(academicTerms.id,teachingGroups.termId)).where(inArray(meetings.teachingGroupId,groupIds)).orderBy(meetings.id):[];
  for(const {m,t} of events)references.push({key:`meeting:${m.id}:${m.status}`,termId:t.id,term:t.name,detail:`Meeting #${m.id} · ${m.status}`,href:"/routine",blocksLifecycle:t.status!=="completed"&&m.status!=="cancelled"});
  const home=await reader.select({id:students.id}).from(students).where(eq(students.homeBatchId,record.id));
  const homeIds=home.map(s=>s.id);
  const enrollments=await reader.select({e:courseEnrollments,t:academicTerms}).from(courseEnrollments).innerJoin(academicTerms,eq(academicTerms.id,courseEnrollments.termId)).orderBy(courseEnrollments.id);
  for(const {e,t}of enrollments.filter(({e})=>groupIds.includes(e.teachingGroupId)||homeIds.includes(e.studentId)))references.push({key:`enrollment:${e.id}:${e.status}`,termId:t.id,term:t.name,detail:`Enrollment reference #${e.id} · ${e.status}`,href:"/attendance",blocksLifecycle:t.status!=="completed"&&e.status!=="inactive"});
  totals.placements=placements.length;totals.offerings=offerings.length;totals.groupLinks=links.length;totals.meetings=events.length;totals.homeStudents=home.length;
  totals.enrollments=references.filter(r=>r.key.startsWith("enrollment:")).length;
  for(const [name,table,column] of [["representatives",classRepresentatives,classRepresentatives.batchId],["windows",permittedWindows,permittedWindows.batchId],["dayPlans",dayPlans,dayPlans.batchId]] as const)totals[name]=(await reader.select({id:table.id}).from(table).where(eq(column,record.id))).length;
  const aliases=[{stream:record.stream,label:record.label}];
  for(const event of await reader.select({before:auditEvents.before,after:auditEvents.after}).from(auditEvents).where(and(eq(auditEvents.entity,"batch"),eq(auditEvents.entityId,record.id)))){
    for(const value of [event.before,event.after])if(value&&typeof value==="object"&&"stream"in value&&"label"in value&&typeof value.stream==="string"&&typeof value.label==="string")aliases.push({stream:value.stream,label:value.label});
  }
  let snapshots=0,uncertainSnapshots=0;
  for(const version of await reader.select().from(scheduleVersions).orderBy(scheduleVersions.id)){
    const evidence=snapshotBatchEvidence(version.snapshot,record.id,aliases);
    if(evidence==="reference"){
      snapshots++;references.push({key:`snapshot:${version.id}:${fingerprint(version.snapshot)}`,termId:version.termId,term:`Term #${version.termId}`,detail:`Saved routine version ${version.versionNumber}`,href:`/terms/${version.termId}`,blocksLifecycle:false});
    }else if(evidence==="uncertain")uncertainSnapshots++;
  }
  return {references,totals,snapshots,uncertainSnapshots};
}
export function deletionBlocks(record: BatchRecord,evidence:BatchEvidence){
  return [...(!record.isDraft?["Imported/retained cohorts cannot be deleted."]:[]),...Object.entries(evidence.totals).filter(([,n])=>n>0).map(([name,n])=>`${n} ${name} reference(s), including historical use.`),...(evidence.snapshots?[`${evidence.snapshots} saved snapshot reference(s).`]:[]),...(evidence.uncertainSnapshots?[`${evidence.uncertainSnapshots} unsupported/ambiguous snapshot(s); absence cannot be proved.`]:[])];
}
export async function batchDuplicate(reader:BatchReader,stream:string,label:string,exclude?:number){
  return (await reader.select().from(batches).where(eq(batches.stream,stream))).some(b=>b.id!==exclude&&batchIdentityKey(b.label)===batchIdentityKey(label));
}
export async function auditBatch(tx:BatchTx,actor:Actor,action:string,id:number,before:unknown,after:unknown,reason:string,extra:Record<string,unknown>={}){
  await tx.insert(auditEvents).values({actor:actor.displayName,actorUserId:actor.id,actorDisplayName:actor.displayName,actorKind:"user",action:`batch.${action}`,entity:"batch",entityId:id,before,after,detail:{reason,...extra}});
}
export async function cohortScope(reader:BatchReader){return (await reader.select({id:departments.id}).from(departments).where(eq(departments.code,"CSE")))[0]?.id??null;}
export async function countImpact(reader:BatchReader,batchId:number,termId:number,proposed:{studentCount:number|null;countStatus:CountStatus}){
  const links=await reader.select({groupId:teachingGroupOfferings.teachingGroupId}).from(teachingGroupOfferings).innerJoin(courseOfferings,eq(courseOfferings.id,teachingGroupOfferings.offeringId)).where(and(eq(courseOfferings.batchId,batchId),eq(courseOfferings.termId,termId)));
  const ids=[...new Set(links.map(l=>l.groupId))];
  if(!ids.length)return [];
  const groups=await reader.select().from(teachingGroups).where(inArray(teachingGroups.id,ids)).orderBy(asc(teachingGroups.id));
  const audiences=await reader.select({groupId:teachingGroupOfferings.teachingGroupId,batchId:courseOfferings.batchId,p:batchTermPlacements}).from(teachingGroupOfferings).innerJoin(courseOfferings,eq(courseOfferings.id,teachingGroupOfferings.offeringId)).leftJoin(batchTermPlacements,and(eq(batchTermPlacements.batchId,courseOfferings.batchId),eq(batchTermPlacements.termId,courseOfferings.termId))).where(inArray(teachingGroupOfferings.teachingGroupId,ids));
  const bookings=await reader.select({groupId:meetings.teachingGroupId,meetingId:meetings.id,roomId:rooms.id,code:rooms.code,capacity:rooms.capacity}).from(meetings).innerJoin(meetingRooms,eq(meetingRooms.meetingId,meetings.id)).innerJoin(rooms,eq(rooms.id,meetingRooms.roomId)).where(and(inArray(meetings.teachingGroupId,ids),eq(meetings.status,"active"))).orderBy(meetings.id,rooms.id);
  return groups.map(g=>{
    const unique=[...new Map(audiences.filter(a=>a.groupId===g.id).map(a=>[a.batchId,a])).values()];
    const values=unique.map(a=>a.batchId===batchId?proposed:{studentCount:a.p?.studentCount??null,countStatus:a.p?countStatus(a.p):"unknown"});
    const partial=values.reduce((n,a)=>n+(a.studentCount??0),0)+(g.externalAudienceLabel?g.externalStudentCount??0:0);
    const known=values.every(a=>a.studentCount!=null)&&(!g.externalAudienceLabel||g.externalStudentCount!=null);
    return {groupId:g.id,total:known?partial:null,knownSubtotal:partial,verified:values.every(a=>a.countStatus==="verified")&&(!g.externalAudienceLabel||g.externalStudentCount!=null),rooms:bookings.filter(b=>b.groupId===g.id).map(b=>({...b,overCapacity:b.capacity!=null&&partial>b.capacity}))};
  });
}
export async function batchChanges(reader:BatchReader,id:number){return reader.select().from(auditEvents).where(and(eq(auditEvents.entity,"batch"),eq(auditEvents.entityId,id))).orderBy(desc(auditEvents.at),desc(auditEvents.id));}
