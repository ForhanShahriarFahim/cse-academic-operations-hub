/** CRS-01A injected evidence and writes; no configured client import. */
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, attendanceSessions, auditEvents, batches, courseEnrollments, courseOfferings, courses, departments, extraLoadClasses, meetings, scheduleVersions, teachingGroupOfferings, teachingGroups, workloadAllocations } from "@/db/schema";
import { hasCapability, type Actor } from "./auth/policy";
import { conflicted, denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { COURSE_FIELDS, courseInteger, courseKey, courseText, parseCourse, snapshotCourseEvidence, type CourseRecord } from "./course-records";
import { lockTermContext } from "./term-lock";

export type CourseTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CourseReader = Pick<CourseTx, "select">;
export const courseFingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface CourseEvidence {
  references: Array<{ key: string; termId: number; term: string; detail: string; blocksLifecycle: boolean }>;
  totals: { offerings: number; groups: number; meetings: number; allocations: number; enrollments: number; attendanceSessions: number; claims: number; snapshots: number };
  uncertainSnapshots: number;
}
export interface CourseResult extends ActionResult { evidence?: CourseEvidence; fingerprint?: string; candidate?: string }

export async function courseAliases(reader: CourseReader, record: CourseRecord) {
  const aliases = new Set([record.code]);
  const events = await reader.select({ before: auditEvents.before, after: auditEvents.after }).from(auditEvents).where(and(eq(auditEvents.entity, "course"), eq(auditEvents.entityId, record.id))).orderBy(auditEvents.id);
  for (const event of events) for (const data of [event.before, event.after]) if (data && typeof data === "object" && "code" in data && typeof data.code === "string") aliases.add(data.code);
  return [...aliases];
}
export async function courseEvidence(reader: CourseReader, record: CourseRecord): Promise<CourseEvidence> {
  const references: CourseEvidence["references"] = [];
  const terms = await reader.select().from(academicTerms).orderBy(academicTerms.id);
  const termMap = new Map(terms.map(term => [term.id, term]));
  const audiences = new Map((await reader.select({ id: batches.id, label: batches.label, stream: batches.stream }).from(batches)).map(batch => [batch.id, `${batch.stream}-${batch.label}`]));
  const add = (key: string, termId: number, detail: string, blocksLifecycle: boolean) => references.push({ key, termId, term: termMap.get(termId)?.name ?? `Unknown term #${termId}`, detail, blocksLifecycle });
  const offerings = await reader.select().from(courseOfferings).where(eq(courseOfferings.courseId, record.id)).orderBy(courseOfferings.id);
  for (const offering of offerings) {
    const known = ["planned", "open", "cancelled", "completed"].includes(offering.status);
    add(`offering:${offering.id}:${offering.status}`, offering.termId, `Offering #${offering.id} · ${audiences.get(offering.batchId) ?? "Unknown audience"} · ${offering.status} · ${termMap.get(offering.termId)?.status ?? "unknown term status"}`, !known || termMap.get(offering.termId)?.status !== "completed" && !["cancelled", "completed"].includes(offering.status));
  }
  const links = offerings.length ? await reader.select().from(teachingGroupOfferings).where(inArray(teachingGroupOfferings.offeringId, offerings.map(offering => offering.id))).orderBy(teachingGroupOfferings.id) : [];
  const direct = await reader.select().from(teachingGroups).where(eq(teachingGroups.courseId, record.id)).orderBy(teachingGroups.id);
  const linkedIds = links.map(link => link.teachingGroupId).filter(id => !direct.some(group => group.id === id));
  const linked = linkedIds.length ? await reader.select().from(teachingGroups).where(inArray(teachingGroups.id, linkedIds)).orderBy(teachingGroups.id) : [];
  const groups = [...direct, ...linked].sort((a, b) => a.id - b.id);
  const ids = groups.map(group => group.id);
  for (const group of groups) add(`group:${group.id}`, group.termId, `Teaching group #${group.id} · ${group.deliveryMode}${group.externalAudienceLabel ? ` · ${group.externalAudienceLabel}` : ""} · ${termMap.get(group.termId)?.status ?? "unknown term status"}`, termMap.get(group.termId)?.status !== "completed");
  const events = ids.length ? await reader.select().from(meetings).where(inArray(meetings.teachingGroupId, ids)).orderBy(meetings.id) : [];
  const allocations = ids.length ? await reader.select().from(workloadAllocations).where(inArray(workloadAllocations.teachingGroupId, ids)).orderBy(workloadAllocations.id) : [];
  const enrollments = ids.length ? await reader.select({ id: courseEnrollments.id, termId: courseEnrollments.termId, status: courseEnrollments.status }).from(courseEnrollments).where(inArray(courseEnrollments.teachingGroupId, ids)).orderBy(courseEnrollments.id) : [];
  const sessions = ids.length ? await reader.select({ id: attendanceSessions.id, termId: attendanceSessions.termId }).from(attendanceSessions).where(inArray(attendanceSessions.teachingGroupId, ids)).orderBy(attendanceSessions.id) : [];
  // A descendant in another unresolved term must not be hidden by its group's completed term.
  for (const [kind, rows] of [["enrollment", enrollments], ["attendance session", sessions], ["allocation", allocations]] as const) for (const row of rows) if (termMap.get(row.termId)?.status !== "completed") add(`${kind}:${row.id}`, row.termId, `${kind} #${row.id} · unresolved term`, true);
  const aliases = await courseAliases(reader, record);
  const allClaims = await reader.select({ id: extraLoadClasses.id, termId: extraLoadClasses.termId, groupId: extraLoadClasses.teachingGroupId, code: extraLoadClasses.courseCodeSnapshot }).from(extraLoadClasses).orderBy(extraLoadClasses.id);
  const claims = allClaims.filter(claim => claim.groupId != null && ids.includes(claim.groupId) || aliases.some(alias => courseKey(alias) === courseKey(claim.code)));
  for (const claim of claims) add(`claim:${claim.id}`, claim.termId, `Captured extra-load class #${claim.id}`, false);
  let snapshots = 0, uncertainSnapshots = 0;
  for (const version of await reader.select().from(scheduleVersions).orderBy(scheduleVersions.id)) {
    const evidence = snapshotCourseEvidence(version.snapshot, record.id, aliases);
    if (evidence.uncertain) uncertainSnapshots++;
    if (evidence.reference) { snapshots++; add(`snapshot:${version.id}:${courseFingerprint(version.snapshot)}`, version.termId, `Saved routine version ${version.versionNumber} · ${version.state}`, false); }
  }
  return { references, totals: { offerings: offerings.length, groups: groups.length, meetings: events.length, allocations: allocations.length, enrollments: enrollments.length, attendanceSessions: sessions.length, claims: claims.length, snapshots }, uncertainSnapshots };
}
export const courseProtected = (evidence: CourseEvidence) => evidence.references.length > 0 || evidence.uncertainSnapshots > 0;
export const courseLifecycleFingerprint = (record: CourseRecord, command: string, evidence: CourseEvidence) => courseFingerprint({ id: record.id, revision: record.revision, command, evidence });
export async function courseDuplicate(reader: CourseReader, code: string, self?: number) {
  const key = courseKey(code);
  const records = await reader.select().from(courses).orderBy(courses.id);
  if (records.some(record => record.id !== self && courseKey(record.code) === key)) return true;
  const events = await reader.select({ id: auditEvents.entityId, before: auditEvents.before, after: auditEvents.after }).from(auditEvents).where(eq(auditEvents.entity, "course"));
  return events.some(event => event.id !== self && [event.before, event.after].some(value => value && typeof value === "object" && "code" in value && typeof value.code === "string" && courseKey(value.code) === key));
}
async function auditCourse(tx: CourseTx, actor: Actor, action: string, id: number, before: unknown, after: unknown, reason: string | null, evidence: CourseEvidence | null, acknowledged: boolean) {
  await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action: `course.${action}`, entity: "course", entityId: id, before, after, detail: { reason, acknowledgedImpact: acknowledged ? evidence : null } });
}

/** Standalone transaction only: exclusive context before course row. Never upgrade a shared lock. */
export async function saveCourseInTransaction(tx: CourseTx, actor: Actor, raw: Record<string, unknown>): Promise<CourseResult> {
  const [scope] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  if (!hasCapability(actor, "manage_catalog", scope?.id ?? null)) return denied("You do not have permission to manage this catalog.", "forbidden");
  await lockTermContext(tx, "exclusive");
  const command = raw.command;
  if (!["save", "deactivate", "reactivate"].includes(String(command))) return invalid("Choose a supported catalog action.");
  const id = raw.courseId === "" || raw.courseId == null ? null : courseInteger(raw.courseId);
  const revision = courseInteger(raw.revision);
  if (raw.courseId != null && raw.courseId !== "" && !id || id && !revision || !id && raw.revision != null && raw.revision !== "") return invalid("Invalid course or revision. Reload before saving.");
  const [existing] = id ? await tx.select().from(courses).where(eq(courses.id, id)).for("update") : [];
  if (id && !existing) return stale("This course no longer exists. Return to the catalog.", "missing");
  if (existing && existing.revision !== revision) return stale("Someone else changed this course. Review the latest values before saving.");
  const reason = courseText(raw.reason, 300);
  if (command !== "save") {
    if (!existing) return invalid("Choose an existing course.");
    const active = command === "reactivate";
    if (existing.isActive === active) return succeeded("Nothing changed.", { entityId: existing.id });
    if (!reason) return invalid("Enter an administrative reason.", { reason: ["Use 1–300 plain-text characters without personal/student details."] });
    const evidence = await courseEvidence(tx, existing);
    if (!active && (evidence.references.some(ref => ref.blocksLifecycle) || evidence.uncertainSnapshots)) return { ...conflicted("Unresolved teaching/planning use or unsupported snapshot evidence prevents deactivation.", [{ severity: "blocker", title: "Course must remain active", detail: "Review Recorded use. No references are removed or cancelled." }]), evidence };
    const fingerprint = courseLifecycleFingerprint(existing, String(command), evidence);
    if (raw.fingerprint !== fingerprint || raw.confirmation !== existing.code || raw.acknowledge !== "on") return { ...invalid("Review the current impact, type the course code and confirm this status change.", { confirmation: raw.confirmation === existing.code ? [] : [`Type ${existing.code} exactly.`] }), evidence, fingerprint };
    const [saved] = await tx.update(courses).set({ isActive: active, revision: existing.revision + 1 }).where(eq(courses.id, existing.id)).returning();
    await auditCourse(tx, actor, String(command), saved.id, { isActive: existing.isActive }, { isActive: saved.isActive }, reason, evidence, true);
    return succeeded(active ? "Course reactivated. No offering or group was created." : "Course deactivated. All history and references are retained.", { entityId: saved.id });
  }
  const departmentIds = new Set((await tx.select({ id: departments.id }).from(departments)).map(row => row.id));
  const parsed = parseCourse(raw, departmentIds, existing ?? null);
  if (!parsed.ok) return invalid("Check the highlighted fields.", parsed.errors);
  const fields = parsed.fields;
  const changed = COURSE_FIELDS.filter(field => !existing || existing[field] !== fields[field]);
  if (!changed.length) return succeeded("Nothing changed.", { entityId: existing!.id });
  if (existing && !reason || !existing && raw.reason !== "" && raw.reason != null && !reason) return invalid("Enter an administrative reason.", { reason: ["Use 1–300 plain-text characters without personal/student details."] });
  const evidence = existing ? await courseEvidence(tx, existing) : null;
  if (existing && evidence && courseProtected(evidence) && changed.some(field => field !== "title")) return { ...invalid("Code and academic fields are frozen by recorded use or unsupported snapshot evidence. Only a title correction is available.", Object.fromEntries(changed.filter(field => field !== "title").map(field => [field, ["Protected by recorded use; a historical academic correction requires a separate workflow."]]))), evidence };
  if ((!existing || fields.code !== existing.code) && await courseDuplicate(tx, fields.code, existing?.id)) return invalid("This code is already reserved by a course or its recorded alias.", { code: ["Choose an unused code, including inactive records and earlier aliases."] });
  if (existing && evidence && courseProtected(evidence) && changed.includes("title")) {
    const fingerprint = courseFingerprint({ id: existing.id, revision: existing.revision, fields, evidence });
    if (raw.fingerprint !== fingerprint || raw.acknowledge !== "on") return { ...invalid("Review this title correction and its current impact before saving."), evidence, fingerprint, candidate: fields.title };
  }
  const [saved] = existing ? await tx.update(courses).set({ ...fields, revision: existing.revision + 1 }).where(eq(courses.id, existing.id)).returning() : await tx.insert(courses).values({ ...fields, isActive: true, revision: 1 }).returning();
  const before = existing ? Object.fromEntries(changed.map(field => [field, existing[field]])) : null;
  const after = Object.fromEntries(changed.map(field => [field, saved[field]]));
  await auditCourse(tx, actor, existing ? "update" : "create", saved.id, before, after, reason, evidence, !!existing && !!evidence && courseProtected(evidence));
  return succeeded(existing ? "Course saved. Live working views use its current title; captured labels are unchanged." : "Course added. No term offering or teaching group has been created.", { entityId: saved.id });
}
