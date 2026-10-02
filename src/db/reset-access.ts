/**
 * BUG-26: a development reset replaces academic data and keeps portal access.
 *
 * Accounts, passwords, sessions, setup links and roles are never deleted.
 * Departments are kept and updated by code, so a role never loses its
 * department scope (a role without one covers every department). Teacher links
 * are recorded in a `database.reset` audit event before the teachers are
 * deleted, and restored by short code after the reload. If the reload fails,
 * the next reset finds the unfinished event and restores from it.
 */
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

type ResetDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type ResetCommand = "db:reset" | "db:prepare";

interface TeacherLink { userId: number; email: string; teacherShortCode: string }
interface ResetDetail {
  state: "started" | "complete";
  command: ResetCommand;
  teacherLinks: TeacherLink[];
  relinked?: number;
  unlinked?: TeacherLink[];
}

/**
 * Academic tables emptied by a reset (teachers and departments are handled
 * separately). TRUNCATE without CASCADE: a table added later that references one
 * of these makes the reset fail loudly instead of being emptied silently.
 */
const ACADEMIC_TABLES = sql.raw(`
  schedule_versions, attendance_records, attendance_sessions,
  course_enrollments, extra_load_classes, extra_load_manual_summaries, students,
  class_representatives, department_contacts, routine_source_reconciliations,
  academic_policies, workload_allocations, meeting_rooms, meeting_teachers, meetings,
  teaching_requirements, teaching_group_offerings, teaching_groups,
  course_offerings, batch_term_placements, courses, batches,
  day_plans, period_patterns, permitted_windows, break_rules, external_commitments,
  academic_terms, rooms`);

const RESET_ACTION = "database.reset";
/** Audit entities about portal access; every other audit event refers to academic rows. */
const ACCESS_ENTITIES = ["portal_user", "database"];

/** Record teacher links, then delete the academic data. Returns the reset event id. */
export async function clearAcademicData(db: ResetDb, command: ResetCommand): Promise<number> {
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ userId: schema.portalUsers.id, email: schema.portalUsers.email, teacherShortCode: schema.teachers.shortCode })
      .from(schema.portalUsers)
      .innerJoin(schema.teachers, eq(schema.teachers.id, schema.portalUsers.teacherId));

    // A reset whose reload failed has already cleared the links; keep what it recorded.
    const [unfinished] = await tx.select().from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.action, RESET_ACTION), sql`${schema.auditEvents.detail}->>'state' = 'started'`))
      .orderBy(desc(schema.auditEvents.id)).limit(1);
    const recorded = (unfinished?.detail as ResetDetail | undefined)?.teacherLinks ?? [];
    const links = new Map(recorded.map((link) => [link.userId, link]));
    for (const link of current) links.set(link.userId, link);
    const detail: ResetDetail = { state: "started", command, teacherLinks: [...links.values()].sort((a, b) => a.userId - b.userId) };

    let eventId: number;
    if (unfinished) {
      await tx.update(schema.auditEvents).set({ detail }).where(eq(schema.auditEvents.id, unfinished.id));
      eventId = unfinished.id;
    } else {
      [{ id: eventId }] = await tx.insert(schema.auditEvents).values({
        actor: command, actorKind: "system", action: RESET_ACTION, entity: "database", detail,
      }).returning({ id: schema.auditEvents.id });
    }

    // Academic audit events would point at different rows after the reload.
    await tx.delete(schema.auditEvents).where(notInArray(schema.auditEvents.entity, ACCESS_ENTITIES));
    await tx.execute(sql`TRUNCATE TABLE ${ACADEMIC_TABLES} RESTART IDENTITY`);
    await tx.update(schema.portalUsers).set({ teacherId: null }).where(isNotNull(schema.portalUsers.teacherId));
    await tx.delete(schema.teachers);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('teachers', 'id'), 1, false)`);
    // Departments a role is scoped to stay (their names are refreshed by the reload).
    const scoped = tx.select({ id: schema.roleAssignments.departmentId }).from(schema.roleAssignments).where(isNotNull(schema.roleAssignments.departmentId));
    await tx.delete(schema.departments).where(notInArray(schema.departments.id, scoped));
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('departments', 'id'), coalesce((SELECT max(id) FROM departments), 1), (SELECT count(*) > 0 FROM departments))`);
    return eventId;
  });
}

/** Restore teacher links by short code and complete the reset event. */
export async function restoreTeacherLinks(db: ResetDb, eventId: number): Promise<{ relinked: number; unlinked: TeacherLink[] }> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(schema.auditEvents).where(eq(schema.auditEvents.id, eventId));
    const detail = event.detail as ResetDetail;
    const codes = [...new Set(detail.teacherLinks.map((link) => link.teacherShortCode))];
    const teachers = codes.length
      ? await tx.select({ id: schema.teachers.id, shortCode: schema.teachers.shortCode }).from(schema.teachers).where(inArray(schema.teachers.shortCode, codes))
      : [];
    const teacherId = new Map(teachers.map((row) => [row.shortCode, row.id]));
    const unlinked: TeacherLink[] = [];
    let relinked = 0;
    for (const link of detail.teacherLinks) {
      const id = teacherId.get(link.teacherShortCode);
      if (id == null) { unlinked.push(link); continue; }
      const updated = await tx.update(schema.portalUsers).set({ teacherId: id })
        .where(and(eq(schema.portalUsers.id, link.userId), sql`${schema.portalUsers.teacherId} is null`))
        .returning({ id: schema.portalUsers.id });
      relinked += updated.length;
    }
    await tx.update(schema.auditEvents).set({ detail: { ...detail, state: "complete", relinked, unlinked } satisfies ResetDetail })
      .where(eq(schema.auditEvents.id, eventId));
    return { relinked, unlinked };
  });
}

