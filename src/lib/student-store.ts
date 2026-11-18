import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { academicTerms, auditEvents, batches, courseEnrollments, students, teachingGroups } from "@/db/schema";
import { actionActor } from "./auth/action-guard";
import { invalid, stale, type ActionResult } from "./action-result";
import { readActiveTerm, withActiveTermContext } from "./active-term";
import type { Actor } from "./auth";

export const audiences = ["local", "external", "merged"] as const;
export const identityMismatch = "Check the Student ID and name or contact the student directory administrator.";
export const reviewChanged = "The review has changed or expired. Refresh the preview before continuing.";

export function positiveId(value: unknown) {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}

export function identityFields(code: unknown, name: unknown, phone?: unknown, department?: unknown) {
  function field(value: unknown, max: number, required = false) {
    const text = typeof value === "string" ? value.trim() : "";
    if (value != null && typeof value !== "string" || typeof value === "string" && /[\x00-\x1f\x7f]/.test(value) || text.length > max || required && !text) return undefined;
    return text || null;
  }
  const studentCode = field(code, 120, true);
  const fullName = field(name, 200, true);
  const privatePhone = field(phone, 80);
  const homeDepartmentLabel = field(department, 120);
  const errors: Record<string, string[]> = {};
  if (!studentCode) errors.studentCode = ["Enter a Student ID of up to 120 characters."];
  if (!fullName) errors.fullName = ["Enter a student name of up to 200 characters."];
  if (privatePhone === undefined) errors.phone = ["Enter a phone number of up to 80 characters."];
  if (homeDepartmentLabel === undefined) errors.department = ["Enter a department of up to 120 characters."];
  return studentCode && fullName && privatePhone !== undefined && homeDepartmentLabel !== undefined
    ? { values: { studentCode, fullName, phone: privatePhone, homeDepartmentLabel } }
    : { errors };
}

// Every application writer of a student or enrollment uses this lock. It also
// covers absent rows and changes to a batch's candidate set.
export async function lockStudents() {
  await db.execute(sql`select pg_advisory_xact_lock(61031::integer, 1::integer)`);
}

export async function lockRosterTerm(termId: number) {
  await db.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, termId)).for("update");
}

export function withRoster(groupId: number | null, context: unknown, work: (actor: Actor, termId: number, groupId: number) => Promise<ActionResult>) {
  return withActiveTermContext(async () => {
    if (!groupId) return invalid("Choose a teaching group.");
    const active = await readActiveTerm();
    if (active.kind !== "one") return stale("Choose a group from the active term.");
    await lockRosterTerm(active.term.id);
    const actor = await actionActor("manage_rosters", { kind: "teaching_group", teachingGroupId: groupId });
    if ("ok" in actor) return actor;
    const [group] = await db.select({ id: teachingGroups.id }).from(teachingGroups)
      .where(and(eq(teachingGroups.id, groupId), eq(teachingGroups.termId, active.term.id)));
    if (!group) return stale("Choose a group from the active term.", "not_active_term");
    await lockStudents();
    return work(actor, active.term.id, groupId);
  }, context);
}

export async function studentAudit(actor: Actor, action: string, entity: string, entityId: number | null, detail: unknown, review?: { digest: string; counts?: unknown }) {
  await db.insert(auditEvents).values({ actor: actor.displayName, actorDisplayName: actor.displayName,
    actorKind: "user", actorUserId: actor.id, action, entity, entityId, ...(review ? { detail: { review: review.digest, changes: detail }, after: review.counts } : { detail }) });
}

export type Student = typeof students.$inferSelect;
export type Enrollment = typeof courseEnrollments.$inferSelect;
export function studentFingerprint(row: Student) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

export async function usableHomeBatch(id: number) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, id)).for("share");
  return batch?.status === "active";
}

export async function insertStudent(input: typeof students.$inferInsert) {
  const [row] = await db.insert(students).values(input).onConflictDoNothing({ target: students.studentCode }).returning();
  return row;
}

export function enrollmentWhere(termId: number, groupId: number, studentId: number) {
  return and(eq(courseEnrollments.termId, termId), eq(courseEnrollments.teachingGroupId, groupId), eq(courseEnrollments.studentId, studentId));
}

export function validation(errors: Record<string, string[]>) {
  return invalid("Check the highlighted fields.", errors);
}

function reviewSignature(payload: unknown, expires: number) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Student review signing is unavailable.");
  const key = createHmac("sha256", secret).update("stu-01a:preview:v1").digest();
  return createHmac("sha256", key).update(JSON.stringify([expires, payload])).digest("hex");
}

export function issueStudentReview(payload: unknown) {
  const expires = Date.now() + 15 * 60_000;
  return `${expires}.${reviewSignature(payload, expires)}`;
}

export function verifiesStudentReview(token: unknown, payload: unknown) {
  if (typeof token !== "string" || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const [timestamp, signature] = token.split(".");
  const expires = Number(timestamp);
  return expires > Date.now() && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(reviewSignature(payload, expires), "hex"));
}

/** The preview proof is single-use even if a later edit restores the old roster state. */
export async function unusedStudentReview(token: unknown, payload: unknown, action: string): Promise<string | null> {
  if (typeof token !== "string" || !verifiesStudentReview(token, payload)) return null;
  const digest = createHash("sha256").update(token).digest("hex");
  const [committed] = await db.select({ id: auditEvents.id }).from(auditEvents)
    .where(and(eq(auditEvents.action, action), sql`${auditEvents.detail}->>'review' = ${digest}`)).limit(1);
  return committed ? null : digest;
}
