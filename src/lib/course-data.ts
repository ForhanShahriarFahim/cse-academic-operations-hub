import { and, desc, eq, lt, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { academicTerms, auditEvents, courses, departments, scheduleVersions } from "@/db/schema";
import { authorize, can, getOptionalActor } from "./auth";
import { cohortRead, readTermContext } from "./term-context";
import { courseInteger, courseKey } from "./course-records";
import { courseEvidence, courseLifecycleFingerprint, type CourseEvidence } from "./course-store";

export async function requireCourseEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await can(actor, "manage_catalog")) redirect("/forbidden");
  return actor;
}
export async function courseDepartments() {
  await authorize("manage_catalog");
  return db.select().from(departments).orderBy(departments.code);
}
export async function getCourseDirectory() {
  const actor = await authorize("view_internal_portal");
  const editor = await can(actor, "manage_catalog");
  return cohortRead(async () => {
    const records = await db.select({ record: courses, owner: departments.code }).from(courses).leftJoin(departments, eq(departments.id, courses.owningDepartmentId)).orderBy(courses.code, courses.id);
    const counts = new Map<string, number>();
    records.forEach(({ record }) => counts.set(courseKey(record.code), (counts.get(courseKey(record.code)) ?? 0) + 1));
    const context = await readTermContext();
    const term = context.state.kind === "one" ? context.state.term : null;
    const [published] = term ? await db.select({ number: scheduleVersions.versionNumber }).from(scheduleVersions).where(and(eq(scheduleVersions.termId, term.id), eq(scheduleVersions.state, "published"))).limit(1) : [];
    // CRS-01B: terms being prepared also have an offerings page; identity only, no term is selected by this list.
    const draftTerms = await db.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms).where(eq(academicTerms.status, "draft")).orderBy(academicTerms.startDate, academicTerms.id);
    return { editor, term, draftTerms, publishedVersion: published?.number ?? null, termProblem: context.state.kind, records: records.map(({ record, owner }) => ({ ...record, owner, duplicate: (counts.get(courseKey(record.code)) ?? 0) > 1 })) };
  });
}
export async function getCourseDetail(value: string) {
  const actor = await authorize("view_internal_portal");
  const editor = await can(actor, "manage_catalog");
  const id = courseInteger(value); if (!id) return null;
  return cohortRead(async () => {
    const [row] = await db.select({ record: courses, owner: departments.code }).from(courses).leftJoin(departments, eq(departments.id, courses.owningDepartmentId)).where(eq(courses.id, id));
    if (!row) return null;
    const evidence = editor ? await courseEvidence(db, row.record) : null;
    return { ...row, editor, evidence, fingerprints: evidence ? { deactivate: courseLifecycleFingerprint(row.record, "deactivate", evidence), reactivate: courseLifecycleFingerprint(row.record, "reactivate", evidence) } : null };
  });
}
export interface CourseChange { id: number; at: string; actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null; acknowledgedImpact: CourseEvidence | null }
export async function getCourseChanges(id: number, before?: number): Promise<{ changes: CourseChange[]; next: number | null }> {
  await authorize("manage_catalog");
  if (!courseInteger(String(id)) || before !== undefined && !courseInteger(String(before))) throw new Error("Invalid course history cursor.");
  const base = and(eq(auditEvents.entity, "course"), eq(auditEvents.entityId, id));
  const [cursor] = before ? await db.select().from(auditEvents).where(and(base, eq(auditEvents.id, before))) : [];
  if (before && !cursor) throw new Error("This cursor does not belong to this course.");
  const rows = await db.select().from(auditEvents).where(and(base, cursor ? or(lt(auditEvents.at, cursor.at), and(eq(auditEvents.at, cursor.at), lt(auditEvents.id, cursor.id))) : undefined)).orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(21);
  return { changes: rows.slice(0, 20).map(row => { const detail = row.detail as { reason?: string; acknowledgedImpact?: CourseEvidence | null } | null; return { id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, action: row.action, before: row.before as Record<string, unknown> | null, after: row.after as Record<string, unknown> | null, reason: detail?.reason ?? null, acknowledgedImpact: detail?.acknowledgedImpact ?? null }; }), next: rows.length > 20 ? rows[19].id : null };
}
