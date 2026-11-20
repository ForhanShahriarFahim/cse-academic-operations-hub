/** Injected transaction only. Importing this module must never open configured storage. */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { academicPolicies, academicTerms, auditEvents, batches, batchTermPlacements, dayPlans, externalCommitments, periodPatterns, permittedWindows, rooms, teachers, termContext, termRollovers } from "@/db/schema";
import type { Actor } from "./auth/policy";
import { auditBatch, batchEvidence, fingerprint, readBatchSnapshots, type BatchTx } from "./batch-store";
import { countStatus } from "./batch-records";
import { classifyActiveTerms } from "./term-state";
import { TERM_PROTECTED_TABLES } from "./term-protection";
import { validateStartingPolicy, validateTermFields } from "./term-records";
import { eligibleCohort, planGridClone, rolloverDecisions, type CarryReview, type RolloverCohort, type RolloverPlan, type RolloverReview } from "./rollover";
import { completenessLevel, isCommitmentKind, parseCommitmentDates, reviewReasons, scheduleText } from "./commitment-records";
import { validInterval, validWeekday } from "./room-lifecycle";
import { assertMaintenanceClear } from "./room-maintenance-transaction";
import { lockRooms, RoomAssignmentChanged } from "./room-transaction";
import { retainAssignedRooms } from "./room-lifecycle-transaction";

export class RolloverRefusal extends Error {}
const refuse = (message: string): never => { throw new RolloverRefusal(message); };
export async function rolloverSource(tx: BatchTx, sourceId: number) {
  const records = await tx.select({ b: batches, p: batchTermPlacements }).from(batchTermPlacements).innerJoin(batches, eq(batches.id, batchTermPlacements.batchId)).where(eq(batchTermPlacements.termId, sourceId)).orderBy(batches.id);
  const cohorts: RolloverCohort[] = records.map(({b,p}) => ({ id:b.id, label:b.label, stream:b.stream, status:b.status, semester:p.semester, studentCount:p.studentCount, confidence:countStatus(p) }));
  const all = await tx.select().from(batches).orderBy(batches.id);
  return { records, cohorts, all, unplaced: all.filter(b => b.status === "active" && !cohorts.some(c => c.id === b.id)).map(b => ({id:b.id,label:b.label,stream:b.stream})) };
}
export async function rolloverCommitmentCandidates(tx: BatchTx, sourceId: number) {
  const rows = await tx.select({ record: externalCommitments, teacher: teachers.shortCode, teacherStatus: teachers.status, room: rooms.code, roomActive: rooms.isActive, roomRevision: rooms.revision })
    .from(externalCommitments).leftJoin(teachers, eq(teachers.id, externalCommitments.teacherId)).leftJoin(rooms, eq(rooms.id, externalCommitments.roomId))
    .where(eq(externalCommitments.termId, sourceId)).orderBy(asc(externalCommitments.id));
  return rows.map((row) => {
    const e = row.record;
    const malformed = e.kind === "unresolved_note"
      ? !e.notes?.trim() || [e.teacherId, e.roomId, e.dayOfWeek, e.startMinutes, e.endMinutes, e.credits].some((value) => value !== null)
      : !validWeekday(e.dayOfWeek) || !validInterval(e.startMinutes, e.endMinutes) || (e.kind === "teaching" && e.roomId !== null);
    const exclusion = e.lifecycleStatus !== "active" ? "Archived" : e.linkedTeachingGroupId != null ? "Linked to a teaching group"
      : !isCommitmentKind(e.kind) || !e.counterpartDepartment.trim() || reviewReasons(e).length || malformed ? "Correct the source record first"
      : e.teacherId != null && row.teacherStatus === "inactive" ? "Teacher is inactive" : e.roomId != null && !row.roomActive ? "Room is inactive" : null;
    const label = [e.counterpartDepartment, e.courseLabel, row.teacher, row.room && `Room ${row.room}`, scheduleText(e)].filter(Boolean).join(" · ");
    return { ...row, id: e.id, label, exclusion, bounded: e.effectiveFrom !== null, canDate: e.kind !== "unresolved_note" };
  });
}

async function carryEvidence(tx: BatchTx, plan: RolloverPlan, target: typeof academicTerms.$inferSelect, commit: boolean) {
  if (!plan.commitments?.length) return [];
  if (commit) {
    const sourceRows = await tx.select({ room: externalCommitments.roomId }).from(externalCommitments)
      .where(and(eq(externalCommitments.termId, plan.sourceId), inArray(externalCommitments.id, plan.commitments.map((c) => c.id))));
    await lockRooms(tx, sourceRows.flatMap(({ room }) => room == null ? [] : [room]));
  }
  const candidates = await rolloverCommitmentCandidates(tx, plan.sourceId);
  const carried = [];
  for (const choice of plan.commitments) {
    const selected = candidates.find((e) => e.id === choice.id);
    if (!selected || selected.exclusion) return refuse(`Commitment #${choice.id} cannot be carried. ${selected?.exclusion ?? "Choose a commitment from the selected source term."}`);
    const bounds = { termStart: target.startDate, termEnd: target.endDate };
    const { dates, errors } = parseCommitmentDates({ ...choice }, selected.record.dayOfWeek, bounds);
    if (!selected.canDate && (choice.effectiveFrom || choice.effectiveTo)) return refuse(`${selected.label}: An unresolved note has no effective dates.`);
    if (Object.keys(errors).length || (selected.bounded && dates.effectiveFrom === null)) return refuse(`${selected.label}: ${Object.values(errors).flat()[0] ?? "Choose a complete destination range for this bounded record."}`);
    try {
      const maintenance = selected.record.roomId == null ? [] : await assertMaintenanceClear(tx, [selected.record.roomId], { ...bounds, ...dates }, selected.record);
      carried.push({ selected, dates, maintenance });
    } catch (error) {
      if (error instanceof RoomAssignmentChanged) return refuse(`${selected.label}: ${error.message}`);
      throw error;
    }
  }
  return carried;
}

export async function rolloverEvidence(tx: BatchTx, plan: RolloverPlan, commit = false) {
  const terms = await tx.select().from(academicTerms).where(inArray(academicTerms.id, [plan.sourceId, plan.targetId])).orderBy(academicTerms.id);
  const source = terms.find(t => t.id === plan.sourceId), target = terms.find(t => t.id === plan.targetId);
  if (!source || !target || source.id === target.id || !["active", "completed"].includes(source.status) || target.status !== "draft") refuse("Choose an active/completed source and a different unused draft destination.");
  // Narrow explicitly after the fail-closed gate for adapter-neutral TypeScript.
  const sourceTerm = source!, targetTerm = target!;
  if (targetTerm.startDate <= sourceTerm.startDate) refuse("The destination must start later than the source term.");
  const context = (await tx.select().from(termContext).where(eq(termContext.id, 1)))[0];
  const active = classifyActiveTerms(await tx.select().from(academicTerms).where(eq(academicTerms.status, "active")));
  if (!context || active.kind === "ambiguous") refuse("Academic term configuration is unavailable. Refresh or contact the administrator.");
  const [existing] = await tx.select().from(termRollovers).where(eq(termRollovers.targetTermId, targetTerm.id));
  if (existing) refuse("This destination was already prepared. View its existing receipt; no new records were created.");
  const policy = (await tx.select().from(academicPolicies).where(eq(academicPolicies.termId, targetTerm.id)))[0];
  if (!validateTermFields(targetTerm).ok || !policy || !validateStartingPolicy(policy).ok) refuse("Save valid draft details and an explicit starting policy before preparing placements.");
  for (const table of TERM_PROTECTED_TABLES) {
    const result = await tx.execute<{count:number}>(sql`select count(*)::int as count from ${sql.identifier(table)} where term_id = ${targetTerm.id}`);
    if (Number(result.rows[0]?.count)) refuse(`The destination is already used by ${table.replaceAll("_", " ")}. Choose an unused draft.`);
  }
  const sourceData = await rolloverSource(tx, sourceTerm.id);
  let decisions: ReturnType<typeof rolloverDecisions>;
  try { decisions = rolloverDecisions(sourceData.cohorts, plan.choices); } catch (e) { return refuse((e as Error).message); }
  const lifecycle: unknown[] = [];
  const graduating = decisions.filter(d => d.disposition === "graduate");
  const snapshots = graduating.length ? await readBatchSnapshots(tx) : undefined;
  for (const d of graduating) {
    const record = sourceData.records.find(r => r.b.id === d.id)!.b;
    const evidence = await batchEvidence(tx, record, snapshots);
    const blocks = evidence.references.filter(r => r.blocksLifecycle);
    if (blocks.length) refuse(`${d.stream}-${d.label}: resolve ongoing planning or teaching before graduation. ${blocks.map(r => `${r.term}: ${r.detail}`).join("; ")}`);
    lifecycle.push({record,evidence});
  }
  const patterns = await tx.select().from(periodPatterns).where(eq(periodPatterns.termId, sourceTerm.id)).orderBy(periodPatterns.id);
  const plans = await tx.select().from(dayPlans).where(eq(dayPlans.termId, sourceTerm.id)).orderBy(dayPlans.id);
  const windows = await tx.select().from(permittedWindows).where(or(eq(permittedWindows.termId, sourceTerm.id), isNull(permittedWindows.termId))).orderBy(permittedWindows.id);
  const targetPatterns = await tx.select().from(periodPatterns).where(eq(periodPatterns.termId, targetTerm.id)).orderBy(periodPatterns.id);
  const targetPlans = await tx.select().from(dayPlans).where(eq(dayPlans.termId, targetTerm.id)).orderBy(dayPlans.id);
  const targetWindows = await tx.select().from(permittedWindows).where(eq(permittedWindows.termId, targetTerm.id)).orderBy(permittedWindows.id);
  if (plan.cloneGrid && (targetPatterns.length || targetPlans.length || targetWindows.length)) refuse("The destination grid is not empty. Turn cloning off; existing grid setup will be retained.");
  let clone: ReturnType<typeof planGridClone> | null = null;
  if (plan.cloneGrid) {
    try { clone = planGridClone(sourceTerm.id, patterns, plans, windows, sourceData.all, decisions.filter(d => d.destinationSemester != null).map(d => d.id)); }
    catch (e) { return refuse((e as Error).message); }
  }
  const carried = await carryEvidence(tx, plan, targetTerm, commit);
  if (!decisions.length && !carried.length && !(clone && (clone.patterns.length || clone.plans.length || clone.windows.length))) refuse("There are no eligible cohort decisions or time-grid records to prepare.");
  const hash = fingerprint({plan,context,active,terms,policy,sourceData,lifecycle,patterns,plans,windows,targetPatterns,targetPlans,targetWindows,...(carried.length ? { carried } : {})});
  const review: RolloverReview = {
    fingerprint:hash, source:sourceTerm.name, target:targetTerm.name, targetIdentity:`${targetTerm.name} · ${targetTerm.academicYear}`, decisions,
    ...(carried.length ? { commitments: carried.map(({ selected, dates }) => ({ sourceId: selected.id, label: selected.label, ...dates })) } : {}),
    grid:{patterns:clone?.patterns.length ?? 0,plans:clone?.plans.length ?? 0,windows:clone?.windows.length ?? 0,excludedExceptions:clone?.excludedExceptions ?? 0,legacyWindows:windows.filter(w => w.termId == null).length},
    warnings:[...(targetTerm.startDate <= sourceTerm.endDate ? ["Source and destination dates overlap; preparation does not change term statuses."] : []), "Copied counts need reconfirmation after activation.", "Adding placements freezes draft identity and starting-policy setup.", "Preparation is recorded once; this wizard cannot append or overwrite.", "Academic calendar copying is unavailable."]
  };
  return {review,source:sourceTerm,target:targetTerm,sourceData,clone,carried};
}

export async function writeRollover(tx: BatchTx, actor: Actor, plan: RolloverPlan, evidence: Awaited<ReturnType<typeof rolloverEvidence>>) {
  const {review,sourceData,clone,target,carried} = evidence;
  const placementIds: number[] = [], patternMap: Record<number,number> = {};
  for (const d of review.decisions) {
    const record = sourceData.records.find(r => r.b.id === d.id)!;
    if (d.destinationSemester != null) {
      const [p] = await tx.insert(batchTermPlacements).values({termId:plan.targetId,batchId:d.id,semester:d.destinationSemester,studentCount:d.destinationCount,countVerifiedAt:null,countVerifiedBy:null,countSource:d.destinationCount == null ? null : `Carried from term #${plan.sourceId}, placement #${record.p.id}; requires reconfirmation.`,countOrigin:"rollover"}).returning();
      placementIds.push(p.id);
      await auditBatch(tx,actor,"rollover.placement",d.id,null,p,plan.reason,{sourceTermId:plan.sourceId,sourcePlacementId:record.p.id});
    } else if (d.disposition === "graduate") {
      const [updated] = await tx.update(batches).set({status:"graduated",revision:record.b.revision + 1}).where(eq(batches.id,d.id)).returning();
      await auditBatch(tx,actor,"rollover.graduate",d.id,record.b,updated,d.reason,{sourceTermId:plan.sourceId,targetTermId:plan.targetId});
    }
  }
  if (clone) {
    for (const p of clone.patterns) {
      const [saved] = await tx.insert(periodPatterns).values({termId:plan.targetId,name:p.name,periods:p.periods,breaks:p.breaks}).returning(); patternMap[p.id] = saved.id;
    }
    for (const p of clone.plans) await tx.insert(dayPlans).values({termId:plan.targetId,stream:p.stream,batchId:p.batchId,dayOfWeek:p.dayOfWeek,patternId:p.patternId == null ? null : patternMap[p.patternId],reason:p.reason});
    for (const w of clone.windows) await tx.insert(permittedWindows).values({termId:plan.targetId,stream:w.stream,batchId:w.batchId,dayOfWeek:w.dayOfWeek,startMinutes:w.startMinutes,endMinutes:w.endMinutes,requiresExceptionNote:w.requiresExceptionNote});
  }
  const commitments: CarryReview[] = [];
  for (const { selected, dates } of carried) {
    const { id, kind, counterpartDepartment, teacherId, roomId, dayOfWeek, startMinutes, endMinutes, courseLabel, audienceLabel, credits, notes } = selected.record;
    if (!isCommitmentKind(kind)) return refuse("The source commitment changed. Review the latest values.");
    const [saved] = await tx.insert(externalCommitments).values({
      termId: target.id, kind, counterpartDepartment, teacherId, roomId, dayOfWeek, startMinutes, endMinutes, courseLabel, audienceLabel, credits,
      notes: kind === "unresolved_note" ? notes : null, ...dates, completenessLevel: completenessLevel({ kind, teacherId, roomId, courseLabel, credits }),
      source: "Term preparation", carriedFromTermId: plan.sourceId, carriedFromCommitmentId: id, updatedAt: new Date(),
    }).returning();
    if (roomId !== null) await retainAssignedRooms(tx, actor, [roomId], `OD #${saved.id}`);
    await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action: "external.carry", entity: "external_commitment", entityId: saved.id, after: saved, detail: { reason: plan.reason, sourceTermId: plan.sourceId, sourceCommitmentId: id } });
    commitments.push({ sourceId: id, destinationId: saved.id, label: selected.label, ...dates });
  }
  const [receipt] = await tx.insert(termRollovers).values({sourceTermId:plan.sourceId,targetTermId:plan.targetId,actorUserId:actor.id,reason:plan.reason,summary:{ ...review, ...(commitments.length ? { commitments } : {}) }}).returning();
  await tx.update(academicTerms).set({revision:target.revision + 1}).where(eq(academicTerms.id,target.id));
  await tx.insert(auditEvents).values({actor:actor.displayName,actorUserId:actor.id,actorDisplayName:actor.displayName,actorKind:"user",action:"term.rollover.prepare",entity:"academic_term",entityId:target.id,before:{target,receipt:null},after:{receiptId:receipt.id,summary:review},detail:{reason:plan.reason,sourceTermId:plan.sourceId,targetTermId:target.id,placementIds,patternMap}});
  return receipt.id;
}

/** Lock after exclusive context; deterministic term/cohort/placement order. */
export async function lockRolloverRows(tx: BatchTx, plan: RolloverPlan) {
  await tx.select({id:academicTerms.id}).from(academicTerms).where(inArray(academicTerms.id,[plan.sourceId,plan.targetId])).orderBy(asc(academicTerms.id)).for("update");
  if (plan.choices.length) {
    await tx.select({id:batches.id}).from(batches).where(inArray(batches.id,plan.choices.map(c => c.batchId))).orderBy(asc(batches.id)).for("update");
    await tx.select({id:batchTermPlacements.id}).from(batchTermPlacements).where(and(eq(batchTermPlacements.termId,plan.sourceId),inArray(batchTermPlacements.batchId,plan.choices.map(c => c.batchId)))).orderBy(asc(batchTermPlacements.id)).for("update");
  }
}
