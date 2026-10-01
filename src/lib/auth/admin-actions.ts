"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, authAccount, authUser, departments, portalUsers, roleAssignments, teachers } from "@/db/schema";
import { denied, invalid, succeeded, type ActionResult } from "../action-result";
import { AuthenticationError, AuthorizationError, authorize, type Actor } from ".";
import { isUsableStatus, normalizeEmail, type LinkPurpose } from "./account-policy";
import {
  type AccountChange, changeProblem, lastAdministratorMessage, removesLastAdministrator, roleWindow, selfChangeProblem, teacherRoleProblem,
} from "./account-rules";
import {
  type AccountDb, activeAdministratorIds, authUserIdFor, hasPassword, issueLink, openAssignments, revokeOpenLink, revokeSessions,
} from "./account-store";
import { ROLE_LABELS } from "./access-summary";
import { linkUrl } from "./links";
import { isRole, type Role } from "./policy";

/**
 * AUTH-02 People & Access actions. Every action checks `manage_users` on the
 * server, validates its input, and commits its change, any session or link
 * revocation and its audit row in one transaction. Results follow the SAFE-01
 * contract; an issued link is returned once and never stored or logged.
 */

export interface IssuedLink { url: string; purpose: LinkPurpose; expiresAt: string }
export type AccountActionResult = ActionResult & { link?: IssuedLink; existingUserId?: number };

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class Refusal extends Error {
  constructor(readonly result: AccountActionResult) { super(result.message); }
}
const refuse = (message: string, field?: string): never => {
  throw new Refusal(field ? invalid(message, { [field]: [message] }) : invalid(message));
};

async function administrator(): Promise<Actor | AccountActionResult> {
  try { return await authorize("manage_users"); } catch (error) {
    if (error instanceof AuthenticationError) return denied("Sign in before making changes.", "unauthenticated");
    if (error instanceof AuthorizationError) return denied("You do not have permission to manage accounts.", "forbidden");
    throw error;
  }
}

/** Run a change for an administrator; refusals inside roll the transaction back and become results. */
async function asAdministrator(work: (actor: Actor) => Promise<AccountActionResult>): Promise<AccountActionResult> {
  const actor = await administrator();
  if ("ok" in actor) return actor;
  try {
    return await work(actor);
  } catch (error) {
    if (error instanceof Refusal) return error.result;
    throw error;
  }
}

async function audit(tx: Transaction, actor: Actor, action: string, userId: number, change: { before?: unknown; after?: unknown; detail?: unknown }) {
  await tx.insert(auditEvents).values({
    actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
    action, entity: "portal_user", entityId: userId,
    before: change.before ?? null, after: change.after ?? null, detail: change.detail ?? null,
  });
}

const userIdFrom = (formData: FormData) => {
  const id = Number(formData.get("userId"));
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function loadUser(tx: AccountDb, userId: number | null) {
  if (userId == null) return refuse("This account no longer exists.");
  const [user] = await tx.select().from(portalUsers).where(eq(portalUsers.id, userId!)).limit(1);
  return user ?? refuse("This account no longer exists.");
}

async function cseId(tx: AccountDb): Promise<number> {
  const [row] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE")).limit(1);
  if (!row) throw new Error("CSE department is not configured.");
  return row.id;
}

/** Department scope stays as before AUTH-02: administrators and teachers unscoped, other roles CSE. */
const roleDepartment = async (tx: AccountDb, role: Role) => role === "system_administrator" || role === "teacher" ? null : cseId(tx);

const linkFor = (issued: { token: string; expiresAt: Date }, purpose: LinkPurpose): IssuedLink =>
  ({ url: linkUrl(process.env.BETTER_AUTH_URL ?? "http://localhost:3000", issued.token), purpose, expiresAt: issued.expiresAt.toISOString() });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function teacherFrom(tx: AccountDb, raw: FormDataEntryValue | null): Promise<number | null> {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const id = Number(value);
  const [teacher] = Number.isInteger(id) ? await tx.select({ id: teachers.id }).from(teachers).where(eq(teachers.id, id)).limit(1) : [];
  return teacher?.id ?? refuse("Choose a teacher record from the list.", "teacherId");
}

function refresh(userId?: number) {
  revalidatePath("/access");
  if (userId) revalidatePath(`/access/${userId}`);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function createAccountAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const displayName = String(formData.get("displayName") ?? "").trim();
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    const role = String(formData.get("role") ?? "");
    const passwordEnabled = formData.get("password") === "on";
    const googleEnabled = formData.get("google") === "on";
    const fieldErrors: Record<string, string[]> = {};
    if (!displayName) fieldErrors.displayName = ["Enter the person's full name."];
    if (!EMAIL.test(email)) fieldErrors.email = ["Enter a valid email address."];
    if (!isRole(role)) fieldErrors.role = ["Choose a role."];
    const methodProblem = changeProblem({ kind: "set_methods", passwordEnabled, googleEnabled, current: { passwordEnabled, googleEnabled } });
    if (methodProblem) fieldErrors.methods = ["Turn on at least one sign-in method."];
    if (Object.keys(fieldErrors).length) return invalid("Check the highlighted fields.", fieldErrors);
    const now = new Date();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: portalUsers.id, displayName: portalUsers.displayName }).from(portalUsers)
        .where(eq(sql`lower(${portalUsers.email})`, email)).limit(1);
      if (existing) {
        const message = `An account with this email already exists: ${existing.displayName}. Open it to add a role instead.`;
        return { ...invalid(message, { email: [message] }), existingUserId: existing.id };
      }
      const teacherId = await teacherFrom(tx, formData.get("teacherId"));
      const roleProblem = teacherRoleProblem(role as Role, teacherId != null);
      if (roleProblem) refuse("The Teacher role needs a linked teacher record. Choose one, or pick another role.", "teacherId");
      const [user] = await tx.insert(portalUsers).values({
        email, displayName, teacherId, status: "invited", passwordEnabled, googleEnabled, createdAt: now, updatedAt: now,
      }).returning();
      const departmentId = await roleDepartment(tx, role as Role);
      await tx.insert(roleAssignments).values({ userId: user.id, role, departmentId, activeFrom: now, grantedAt: now, grantedByUserId: actor.id });
      await audit(tx, actor, "user.create", user.id, { after: { email, displayName, teacherId, role, departmentId, passwordEnabled, googleEnabled } });
      let link: IssuedLink | undefined;
      if (passwordEnabled) {
        const issued = await issueLink(tx, { userId: user.id, purpose: "setup", issuedByUserId: actor.id, now });
        await audit(tx, actor, "user.link.issue", user.id, { after: { purpose: "setup", expiresAt: issued.expiresAt.toISOString() } });
        link = linkFor(issued, "setup");
      }
      refresh();
      return { ...succeeded(`Account created for ${displayName}.`, { entityId: user.id }), link };
    });
  });
}

export async function updateDetailsAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const displayName = String(formData.get("displayName") ?? "").trim();
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    if (!displayName) return invalid("Enter the person's full name.", { displayName: ["Enter the person's full name."] });
    if (!EMAIL.test(email)) return invalid("Enter a valid email address.", { email: ["Enter a valid email address."] });
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      const teacherId = await teacherFrom(tx, formData.get("teacherId"));
      const emailChanged = email !== normalizeEmail(user.email);
      if (user.teacherId != null && teacherId == null) {
        const teacherRoles = await openAssignments(tx, user.id, ["teacher"], now);
        const problem = changeProblem({ kind: "unlink_teacher", holdsTeacherRole: teacherRoles.length > 0 });
        if (problem) refuse(problem, "teacherId");
      }
      let sessionsRevoked = 0;
      if (emailChanged) {
        const [taken] = await tx.select({ id: portalUsers.id }).from(portalUsers)
          .where(and(eq(sql`lower(${portalUsers.email})`, email), ne(portalUsers.id, user.id))).limit(1);
        if (taken) refuse("Another account already uses this email.", "email");
        const authUserId = await authUserIdFor(tx, user.email);
        if (await authUserIdFor(tx, email)) refuse("This email is still attached to an old sign-in record. Ask the operator to remove it first.", "email");
        sessionsRevoked = await revokeSessions(tx, user.email);
        if (authUserId) {
          // The Google link was proven for the old address; it must be made again with the new one.
          await tx.delete(authAccount).where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "google")));
          await tx.update(authUser).set({ email, emailVerified: false, updatedAt: now }).where(eq(authUser.id, authUserId));
        }
      }
      await tx.update(portalUsers).set({ displayName, email, teacherId, updatedAt: now }).where(eq(portalUsers.id, user.id));
      await audit(tx, actor, "user.details", user.id, {
        before: { displayName: user.displayName, email: user.email, teacherId: user.teacherId },
        after: { displayName, email, teacherId },
        detail: emailChanged ? { sessionsRevoked, reason: "email_change" } : null,
      });
      refresh(user.id);
      return succeeded(emailChanged
        ? `Details saved. ${displayName} was signed out everywhere and signs in with ${email} from now on.`
        : `Details saved for ${displayName}.`, { entityId: user.id });
    });
  });
}

export async function setMethodsAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const passwordEnabled = formData.get("password") === "on";
    const googleEnabled = formData.get("google") === "on";
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      const change: AccountChange = { kind: "set_methods", passwordEnabled, googleEnabled, current: { passwordEnabled: user.passwordEnabled, googleEnabled: user.googleEnabled } };
      const problem = selfChangeProblem(actor.id, user.id, change) ?? changeProblem(change);
      if (problem) refuse(problem);
      if (user.passwordEnabled === passwordEnabled && user.googleEnabled === googleEnabled) return succeeded("No change.", { entityId: user.id });
      let sessionsRevoked = 0;
      let linkRevoked = false;
      if (user.passwordEnabled && !passwordEnabled) {
        sessionsRevoked += await revokeSessions(tx, user.email, { method: "password" });
        linkRevoked = await revokeOpenLink(tx, user.id, now);
      }
      if (user.googleEnabled && !googleEnabled) sessionsRevoked += await revokeSessions(tx, user.email, { method: "google" });
      await tx.update(portalUsers).set({ passwordEnabled, googleEnabled, updatedAt: now }).where(eq(portalUsers.id, user.id));
      await audit(tx, actor, "user.methods", user.id, {
        before: { passwordEnabled: user.passwordEnabled, googleEnabled: user.googleEnabled },
        after: { passwordEnabled, googleEnabled },
        detail: { sessionsRevoked, linkRevoked },
      });
      refresh(user.id);
      const methods = [passwordEnabled && "Password", googleEnabled && "Google"].filter(Boolean).join(" and ");
      return succeeded(`${user.displayName} can now sign in with ${methods}.`, { entityId: user.id });
    });
  });
}

export async function issueLinkAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      if (!isUsableStatus(user.status)) refuse(`${user.displayName}'s account is suspended. Reactivate it before issuing a link.`);
      if (!user.passwordEnabled) refuse(`Turn on Password sign-in for ${user.displayName} before issuing a link.`);
      const purpose: LinkPurpose = await hasPassword(tx, user.email) ? "reset" : "setup";
      const issued = await issueLink(tx, { userId: user.id, purpose, issuedByUserId: actor.id, now });
      await audit(tx, actor, "user.link.issue", user.id, { after: { purpose, expiresAt: issued.expiresAt.toISOString() }, detail: { replacedOpenLink: issued.replaced } });
      refresh(user.id);
      const what = purpose === "reset" ? "Reset" : "Setup";
      return { ...succeeded(`${what} link issued for ${user.displayName}. Copy it now. It is shown only once.`, { entityId: user.id }), link: linkFor(issued, purpose) };
    });
  });
}

export async function revokeLinkAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      if (!await revokeOpenLink(tx, user.id, now)) return succeeded(`${user.displayName} has no open link.`, { entityId: user.id });
      await audit(tx, actor, "user.link.revoke", user.id, {});
      refresh(user.id);
      return succeeded(`The link for ${user.displayName} no longer works.`, { entityId: user.id });
    });
  });
}

export async function clearLockAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      await tx.update(portalUsers).set({ failedSignIns: 0, lockedUntil: null, updatedAt: now }).where(eq(portalUsers.id, user.id));
      await audit(tx, actor, "user.lockout.clear", user.id, { before: { lockedUntil: user.lockedUntil?.toISOString() ?? null, failedSignIns: user.failedSignIns } });
      refresh(user.id);
      return succeeded(`${user.displayName} can try a password again now.`, { entityId: user.id });
    });
  });
}

export async function signOutEverywhereAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      if (user.id === actor.id) refuse("Use My account to sign out your other devices.");
      const sessionsRevoked = await revokeSessions(tx, user.email);
      await audit(tx, actor, "user.sessions.revoke", user.id, { detail: { reason: "administrator", sessionsRevoked } });
      refresh(user.id);
      return succeeded(`${user.displayName} was signed out on ${sessionsRevoked} device${sessionsRevoked === 1 ? "" : "s"}.`, { entityId: user.id });
    });
  });
}

export async function setStatusAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const status = String(formData.get("status") ?? "");
    if (status !== "active" && status !== "suspended") return invalid("Choose suspend or reactivate.");
    const now = new Date();
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      if (status === "suspended") {
        const change: AccountChange = { kind: "suspend" };
        const self = selfChangeProblem(actor.id, user.id, change);
        if (self) refuse(self);
        if (removesLastAdministrator(user.id, await activeAdministratorIds(tx, now), change)) refuse(lastAdministratorMessage(user.displayName));
      }
      if (user.status === status || (status === "active" && user.status === "invited")) return succeeded("No change.", { entityId: user.id });
      // Reactivating an account that never signed in returns it to invited.
      const next = status === "active" && !user.lastLoginAt ? "invited" : status;
      let sessionsRevoked = 0;
      let linkRevoked = false;
      if (status === "suspended") {
        sessionsRevoked = await revokeSessions(tx, user.email);
        linkRevoked = await revokeOpenLink(tx, user.id, now);
      }
      await tx.update(portalUsers).set({ status: next, updatedAt: now }).where(eq(portalUsers.id, user.id));
      await audit(tx, actor, "user.status", user.id, { before: { status: user.status }, after: { status: next }, detail: { sessionsRevoked, linkRevoked } });
      refresh(user.id);
      return succeeded(status === "suspended"
        ? `${user.displayName} is suspended and was signed out on ${sessionsRevoked} device${sessionsRevoked === 1 ? "" : "s"}.`
        : `${user.displayName} is active again.`, { entityId: user.id });
    });
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function grantRoleAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const role = String(formData.get("role") ?? "");
    if (!isRole(role)) return invalid("Choose a role.", { role: ["Choose a role."] });
    const now = new Date();
    const window = roleWindow(String(formData.get("activeFrom") ?? ""), String(formData.get("activeTo") ?? ""), now);
    if (!window.ok) return invalid(window.message, { [window.field]: [window.message] });
    return db.transaction(async (tx) => {
      const user = await loadUser(tx, userIdFrom(formData));
      const roleProblem = teacherRoleProblem(role, user.teacherId != null);
      if (roleProblem) refuse(roleProblem, "role");
      // One open assignment per role: a current or scheduled one must end first.
      const overlapping = await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(and(
        eq(roleAssignments.userId, user.id), eq(roleAssignments.role, role),
        or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, window.activeFrom)),
        window.activeTo ? sql`${roleAssignments.activeFrom} < ${window.activeTo.toISOString()}::timestamptz` : sql`true`,
      )).limit(1);
      if (overlapping.length) refuse(`${user.displayName} already has the ${ROLE_LABELS[role]} role for some of these dates.`, "role");
      const departmentId = await roleDepartment(tx, role);
      const [assignment] = await tx.insert(roleAssignments).values({
        userId: user.id, role, departmentId, activeFrom: window.activeFrom, activeTo: window.activeTo, grantedByUserId: actor.id, grantedAt: now,
      }).returning({ id: roleAssignments.id });
      const scheduled = window.activeFrom > now;
      await audit(tx, actor, scheduled ? "user.role.schedule" : "user.role.grant", user.id, {
        after: { assignmentId: assignment.id, role, departmentId, activeFrom: window.activeFrom.toISOString(), activeTo: window.activeTo?.toISOString() ?? null },
      });
      refresh(user.id);
      return succeeded(scheduled
        ? `${ROLE_LABELS[role]} scheduled for ${user.displayName}.`
        : `${user.displayName} now has the ${ROLE_LABELS[role]} role.`, { entityId: user.id });
    });
  });
}

export async function endRoleAction(_previous: AccountActionResult | null, formData: FormData): Promise<AccountActionResult> {
  return asAdministrator(async (actor) => {
    const assignmentId = Number(formData.get("assignmentId"));
    const now = new Date();
    return db.transaction(async (tx) => {
      const [assignment] = Number.isInteger(assignmentId)
        ? await tx.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId)).limit(1)
        : [];
      if (!assignment || !isRole(assignment.role)) return refuse("This role no longer exists.");
      const user = await loadUser(tx, assignment.userId);
      if (assignment.activeTo && assignment.activeTo <= now) return succeeded("This role had already ended.", { entityId: user.id });
      const change: AccountChange = { kind: "end_role", role: assignment.role as Role };
      const self = selfChangeProblem(actor.id, user.id, change);
      if (self) refuse(self);
      if (removesLastAdministrator(user.id, await activeAdministratorIds(tx, now), change)) refuse(lastAdministratorMessage(user.displayName));
      const scheduled = assignment.activeFrom > now;
      await tx.update(roleAssignments).set({ activeTo: now }).where(eq(roleAssignments.id, assignment.id));
      await audit(tx, actor, scheduled ? "user.role.cancel" : "user.role.end", user.id, {
        before: { assignmentId: assignment.id, role: assignment.role, departmentId: assignment.departmentId, activeFrom: assignment.activeFrom.toISOString(), activeTo: assignment.activeTo?.toISOString() ?? null },
      });
      refresh(user.id);
      const label = ROLE_LABELS[assignment.role as Role];
      return succeeded(scheduled ? `The scheduled ${label} role for ${user.displayName} is cancelled.` : `${user.displayName} no longer has the ${label} role.`, { entityId: user.id });
    });
  });
}
