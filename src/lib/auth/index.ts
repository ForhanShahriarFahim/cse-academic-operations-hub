import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceSessions, auditEvents, courses, departments, extraLoadClasses, meetingTeachers,
  meetings, portalUsers, teachers, teachingGroups, workloadAllocations,
} from "@/db/schema";
import { selectActiveAssignments } from "./assignments";
import { auth, googleAuthConfigured } from "./provider";
import { hasCapability, isRole, type Actor, type Capability } from "./policy";

export { hasCapability, type Actor, type Capability, type Role } from "./policy";

export type Resource =
  | { kind: "department"; departmentId: number }
  | { kind: "teaching_group"; teachingGroupId: number }
  | { kind: "teacher"; teacherId: number }
  | { kind: "meeting"; meetingId: number }
  | { kind: "attendance_session"; sessionId: number }
  | { kind: "extra_load_class"; classId: number }
  | { kind: "term"; termId: number };

export class AuthenticationError extends Error {
  constructor() { super("Sign in to continue."); this.name = "AuthenticationError"; }
}
export class AuthorizationError extends Error {
  constructor() { super("You do not have permission for this action."); this.name = "AuthorizationError"; }
}

export async function getOptionalActor(): Promise<Actor | null> {
  if (!googleAuthConfigured) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email || !session.user.emailVerified) return null;
  const email = session.user.email.trim().toLowerCase();
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  if (!user || !["invited", "active"].includes(user.status)) return null;
  const now = new Date();
  const assignments = await selectActiveAssignments(db, user.id, now);
  const actor: Actor = {
    id: user.id,
    email,
    displayName: user.displayName,
    teacherId: user.teacherId,
    assignments: assignments.filter((row) => isRole(row.role)).map((row) => ({
      role: row.role as Actor["assignments"][number]["role"],
      departmentId: row.departmentId,
      activeFrom: row.activeFrom,
      activeTo: row.activeTo,
    })),
  };
  if (user.status === "invited") await activateInvitedUser(user, now);
  return actor;
}

/**
 * First verified sign-in. The conditional transition and its audit commit
 * together, so concurrent first requests activate and record exactly once; if
 * the audit cannot be written the account stays invited and the request fails.
 */
async function activateInvitedUser(user: { id: number; displayName: string }, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const [activated] = await tx.update(portalUsers).set({ status: "active", lastLoginAt: now, updatedAt: now })
      .where(and(eq(portalUsers.id, user.id), eq(portalUsers.status, "invited"))).returning({ id: portalUsers.id });
    if (!activated) return;
    await tx.insert(auditEvents).values({
      actor: user.displayName, actorUserId: user.id, actorDisplayName: user.displayName, actorKind: "user",
      action: "user.activate", entity: "portal_user", entityId: user.id,
      before: { status: "invited" }, after: { status: "active" },
    });
  });
}

export async function requireActor(): Promise<Actor> {
  const actor = await getOptionalActor();
  if (!actor) throw new AuthenticationError();
  return actor;
}

async function cseDepartmentId(): Promise<number | null> {
  const [row] = await db.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE")).limit(1);
  return row?.id ?? null;
}

async function resourceContext(resource?: Resource): Promise<{ departmentId: number | null; teacherId: number | null; teachingGroupId: number | null } | null> {
  if (!resource || resource.kind === "term") return { departmentId: await cseDepartmentId(), teacherId: null, teachingGroupId: null };
  if (resource.kind === "department") return { departmentId: resource.departmentId, teacherId: null, teachingGroupId: null };
  if (resource.kind === "teacher") {
    const [row] = await db.select({ departmentId: teachers.homeDepartmentId }).from(teachers).where(eq(teachers.id, resource.teacherId)).limit(1);
    return row ? { departmentId: row.departmentId, teacherId: resource.teacherId, teachingGroupId: null } : null;
  }
  if (resource.kind === "extra_load_class") {
    const [row] = await db.select({ teacherId: extraLoadClasses.teacherId, teachingGroupId: extraLoadClasses.teachingGroupId })
      .from(extraLoadClasses).where(eq(extraLoadClasses.id, resource.classId)).limit(1);
    if (!row) return null;
    const base = row.teachingGroupId == null
      ? await resourceContext({ kind: "teacher", teacherId: row.teacherId })
      : await resourceContext({ kind: "teaching_group", teachingGroupId: row.teachingGroupId });
    return base && { ...base, teacherId: row.teacherId };
  }
  let teachingGroupId: number;
  if (resource.kind === "teaching_group") teachingGroupId = resource.teachingGroupId;
  else if (resource.kind === "attendance_session") {
    const [row] = await db.select({ teachingGroupId: attendanceSessions.teachingGroupId })
      .from(attendanceSessions).where(eq(attendanceSessions.id, resource.sessionId)).limit(1);
    if (!row) return null;
    teachingGroupId = row.teachingGroupId;
  } else {
    const [row] = await db.select({ teachingGroupId: meetings.teachingGroupId })
      .from(meetings).where(eq(meetings.id, resource.meetingId)).limit(1);
    if (!row) return null;
    teachingGroupId = row.teachingGroupId;
  }
  const [row] = await db.select({ departmentId: courses.owningDepartmentId })
    .from(teachingGroups).innerJoin(courses, eq(teachingGroups.courseId, courses.id))
    .where(eq(teachingGroups.id, teachingGroupId)).limit(1);
  return row ? { departmentId: row.departmentId ?? await cseDepartmentId(), teacherId: null, teachingGroupId } : null;
}

async function assignedTeacher(teacherId: number, teachingGroupId: number): Promise<boolean> {
  const [allocation] = await db.select({ id: workloadAllocations.id }).from(workloadAllocations)
    .where(and(eq(workloadAllocations.teacherId, teacherId), eq(workloadAllocations.teachingGroupId, teachingGroupId))).limit(1);
  if (allocation) return true;
  const [meeting] = await db.select({ id: meetingTeachers.id }).from(meetingTeachers)
    .innerJoin(meetings, eq(meetingTeachers.meetingId, meetings.id))
    .where(and(eq(meetingTeachers.teacherId, teacherId), eq(meetings.teachingGroupId, teachingGroupId))).limit(1);
  return Boolean(meeting);
}

export async function can(actor: Actor, capability: Capability, resource?: Resource): Promise<boolean> {
  const context = await resourceContext(resource);
  if (!context || !hasCapability(actor, capability, context.departmentId)) return false;
  const privileged = actor.assignments.some((assignment) =>
    ["system_administrator", "academic_administrator"].includes(assignment.role)
    && hasCapability({ ...actor, assignments: [assignment] }, capability, context.departmentId));
  if (privileged) return true;
  if (capability === "take_attendance") {
    return actor.teacherId != null && context.teachingGroupId != null
      && await assignedTeacher(actor.teacherId, context.teachingGroupId);
  }
  if (capability === "submit_extra_load") {
    return actor.teacherId != null && context.teacherId === actor.teacherId
      && (context.teachingGroupId == null || await assignedTeacher(actor.teacherId, context.teachingGroupId));
  }
  return true;
}

export async function authorize(capability: Capability, resource?: Resource): Promise<Actor> {
  const actor = await requireActor();
  if (!await can(actor, capability, resource)) throw new AuthorizationError();
  return actor;
}
