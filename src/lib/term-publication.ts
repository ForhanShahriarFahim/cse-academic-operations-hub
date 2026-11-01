import type { PublicationSnapshotV3 } from "./serialize";
import type { RoutineSource } from "./routine-projection";
import { legacyTimeGrid } from "./time-grid-legacy";

type Shape = ((value: unknown) => boolean) | { [key: string]: Shape } | readonly [Shape];
const str = (v: unknown) => typeof v === "string";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const bool = (v: unknown) => typeof v === "boolean";
const nullable = (test: (v: unknown) => boolean) => (v: unknown) => v === null || test(v);
const ns = nullable(str), nn = nullable(num);
const stream = (v: unknown) => v === "HSC" || v === "DIPLOMA";
const teacher = { id:num, shortCode:str, fullName:str, homeDepartmentCode:ns, designation:ns, isExternalCse:bool, role:str };
const room = { id:num, code:str, building:str, roomType:str, capabilities:[str] as const, capacity:nn };
const audience = { batchId:num, batchLabel:str, stream, semester:nn, studentCount:nn };
const meeting = { id:num, teachingGroupId:num, dayOfWeek:num, startMinutes:num, endMinutes:num,
  courseCode:str, courseTitle:str, courseType:str, courseCredits:num, requiredRoomCapability:ns, owningDepartmentCode:ns,
  deliveryMode:str, isException:bool, exceptionNote:ns, customTimeLabel:ns, highlightColor:ns, pendingReconciliation:bool,
  teachers:[teacher] as const, rooms:[room] as const, audiences:[audience] as const, externalAudienceLabel:ns, externalStudentCount:nn };
const external = { id:num, kind:str, completenessLevel:str, counterpartDepartment:str, teacherId:nn, teacherShortCode:ns,
  teacherName:ns, roomId:nn, roomCode:ns, courseLabel:ns, audienceLabel:ns, dayOfWeek:nn, startMinutes:nn, endMinutes:nn,
  credits:nn, verificationStatus:str, source:ns, lastVerifiedAt:ns, notes:ns };
const metadata = {
  teachers:[{ shortCode:str, fullName:str, designation:ns, departmentCode:ns, phone:ns, email:ns, status:str }] as const,
  courses:[{ code:str, title:str, credits:num, courseType:str, semester:num }] as const,
  classRepresentatives:[{ stream, batchLabel:str, fullName:ns, phone:ns, sortOrder:num }] as const,
  queryContacts:[{ fullName:str, designation:str, phone:str, email:ns, sortOrder:num }] as const,
  sourceReconciliations:[{ detail:str, status:str, sourceLabel:str }] as const,
};
const grid = { patterns:[{ id:num, name:str, periods:[{start:num,end:num}] as const,
  breaks:[{name:str,start:num,end:num,blocksClasses:bool}] as const, updatedAt:ns }] as const,
  dayPlans:[{id:num,stream,batchId:nn,dayOfWeek:num,patternId:nn,reason:ns,updatedAt:ns}] as const };
const snapshotShape = { schemaVersion:(v:unknown)=>v===3||v===4, generatedAt:str,
  term:{id:num,name:str,academicYear:num,effectiveFrom:ns}, versionNumber:num, meetings:[meeting] as const,
  batches:[{id:num,stream,label:str,semester:nn,studentCount:nn,sortOrder:num}] as const,
  breaks:[{id:num,name:str,scope:str,stream:ns,dayOfWeek:nn,startMinutes:num,endMinutes:num}] as const,
  externalCommitments:[external] as const,
  issues:[{id:str,severity:(v:unknown)=>v==="blocker"||v==="warning",type:str,title:str,detail:str,dayOfWeek:nn,meetingIds:[num] as const}] as const,
  metadata,
};
/** Validate recursively AND project only named fields; raw stored JSON is never returned. */
function project(shape: Shape, value: unknown): unknown {
  if (typeof shape === "function") { if (!shape(value)) throw new Error("Invalid publication field"); return value; }
  if (Array.isArray(shape)) { if (!Array.isArray(value)) throw new Error("Invalid publication list"); return value.map(item=>project(shape[0],item)); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid publication object");
  return Object.fromEntries(Object.entries(shape).map(([key, child])=>[key,project(child,(value as Record<string,unknown>)[key])]));
}
export function frozenPublication(value: unknown, termId: number, versionNumber: number): PublicationSnapshotV3 | null {
  try {
    const snapshot = project(snapshotShape, value) as PublicationSnapshotV3;
    if (snapshot.term.id !== termId || snapshot.versionNumber !== versionNumber || !Number.isFinite(Date.parse(snapshot.generatedAt))) return null;
    if (snapshot.schemaVersion === 4) snapshot.timeGrid = project(grid,(value as Record<string,unknown>).timeGrid) as NonNullable<PublicationSnapshotV3["timeGrid"]>;
    snapshot.metadata.teachers = snapshot.metadata.teachers.map(t=>({...t,phone:null,email:null}));
    snapshot.metadata.classRepresentatives = snapshot.metadata.classRepresentatives.map(t=>({...t,phone:null}));
    snapshot.metadata.queryContacts = snapshot.metadata.queryContacts.map(t=>({...t,phone:"",email:null}));
    snapshot.metadata.sourceReconciliations = [];
    snapshot.externalCommitments = snapshot.externalCommitments.map(row=>({...row,notes:null,source:null}));
    return snapshot;
  } catch { return null; }
}
export function frozenRoutineSource(snapshot: PublicationSnapshotV3, publishedAt: string | null): RoutineSource {
  return { kind:"published", termName:snapshot.term.name, effectiveFrom:snapshot.term.effectiveFrom,
    generatedAt:snapshot.generatedAt, versionNumber:snapshot.versionNumber,publishedAt, legacyContext:false,
    meetings:snapshot.meetings,batches:snapshot.batches,breaks:snapshot.breaks,
    timeGrid:snapshot.timeGrid??legacyTimeGrid(snapshot.breaks),externals:snapshot.externalCommitments,issues:snapshot.issues };
}
