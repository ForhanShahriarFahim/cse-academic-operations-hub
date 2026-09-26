"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, departments, portalUsers, roleAssignments, teachers } from "@/db/schema";
import { authorize } from ".";
import { isRole } from "./policy";

async function cseId() {
  const [row] = await db.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE")).limit(1);
  if (!row) throw new Error("CSE department is not configured.");
  return row.id;
}

export async function inviteUserAction(formData: FormData): Promise<void> {
  const actor = await authorize("manage_users");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const teacherCode = String(formData.get("teacherCode") ?? "").trim().toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || !isRole(role)) throw new Error("Enter a valid name, email, and role.");
  const [existing] = await db.select({ id: portalUsers.id }).from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  if (existing) throw new Error("This email is already invited. Add a role to the existing account instead.");
  const [teacher] = teacherCode
    ? await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.shortCode, teacherCode)).limit(1)
    : [];
  if (role === "teacher" && !teacher) throw new Error("A teacher role requires a valid teacher short code.");
  if (teacherCode && !teacher) throw new Error("Teacher short code not found.");
  // Teacher permissions are constrained by their assigned groups rather than
  // course ownership, so a CSE teacher can teach a cross-department group.
  const departmentId = role === "system_administrator" || role === "teacher" ? null : await cseId();
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(portalUsers).values({ email, displayName, teacherId: teacher?.id ?? null }).returning();
    await tx.insert(roleAssignments).values({ userId: user.id, role, departmentId, grantedByUserId: actor.id });
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.invite", entity: "portal_user", entityId: user.id,
      after: { email, role, teacherId: teacher?.id ?? null },
    });
  });
  revalidatePath("/access");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const actor = await authorize("manage_users");
  const userId = Number(formData.get("userId"));
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(userId) || !["active", "suspended"].includes(status) || userId === actor.id) throw new Error("Invalid account or status change.");
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  if (!user) throw new Error("Account not found.");
  await db.transaction(async (tx) => {
    await tx.update(portalUsers).set({ status, updatedAt: new Date() }).where(eq(portalUsers.id, userId));
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.status", entity: "portal_user", entityId: userId,
      before: { status: user.status }, after: { status },
    });
  });
  revalidatePath("/access");
}

export async function grantRoleAction(formData: FormData): Promise<void> {
  const actor = await authorize("manage_users");
  const userId = Number(formData.get("userId"));
  const role = String(formData.get("role") ?? "");
  if (!Number.isInteger(userId) || !isRole(role)) throw new Error("Invalid user or role.");
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  if (!user) throw new Error("Account not found.");
  if (role === "teacher" && !user.teacherId) throw new Error("This account has no linked teacher record.");
  const departmentId = role === "system_administrator" || role === "teacher" ? null : await cseId();
  const [existing] = await db.select({ id: roleAssignments.id }).from(roleAssignments)
    .where(and(eq(roleAssignments.userId, userId), eq(roleAssignments.role, role), isNull(roleAssignments.activeTo))).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    await tx.insert(roleAssignments).values({ userId, role, departmentId, grantedByUserId: actor.id });
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.role.grant", entity: "portal_user", entityId: userId, after: { role, departmentId },
    });
  });
  revalidatePath("/access");
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const actor = await authorize("manage_users");
  const assignmentId = Number(formData.get("assignmentId"));
  const [assignment] = await db.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId)).limit(1);
  if (!assignment || assignment.userId === actor.id) throw new Error("Cannot revoke this role.");
  if (assignment.activeTo) return;
  await db.transaction(async (tx) => {
    await tx.update(roleAssignments).set({ activeTo: new Date() }).where(eq(roleAssignments.id, assignmentId));
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.role.revoke", entity: "portal_user", entityId: assignment.userId,
      before: { role: assignment.role, departmentId: assignment.departmentId },
    });
  });
  revalidatePath("/access");
}
