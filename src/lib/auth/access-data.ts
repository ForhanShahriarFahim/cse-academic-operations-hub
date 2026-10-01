import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountLinks, auditEvents, authAccount, authSession, authUser, departments, portalUsers, roleAssignments, teachers } from "@/db/schema";
import { isLocked } from "./account-policy";
import { summarizeAccess, roleState, ROLE_LABELS, type AccessSummary, type SummaryWording } from "./access-summary";
import { isRole, type Role } from "./policy";

/** AUTH-02 People & Access and My account read models. Server only; nothing secret leaves here. */

export type LinkState = { purpose: "setup" | "reset"; state: "waiting" | "used" | "expired" | "revoked"; expiresAt: string; issuedAt: string; usedAt: string | null };

export type AccountStatus =
  | { kind: "active" } | { kind: "invited" } | { kind: "suspended" }
  | { kind: "locked"; until: string } | { kind: "setup_waiting"; expiresAt: string } | { kind: "setup_expired" };

function linkState(row: typeof accountLinks.$inferSelect | undefined, now: Date): LinkState | null {
  if (!row) return null;
  const state = row.usedAt ? "used" : row.revokedAt ? "revoked" : row.expiresAt <= now ? "expired" : "waiting";
  return { purpose: row.purpose as "setup" | "reset", state, expiresAt: row.expiresAt.toISOString(), issuedAt: row.issuedAt.toISOString(), usedAt: row.usedAt?.toISOString() ?? null };
}

function accountStatus(user: typeof portalUsers.$inferSelect, link: LinkState | null, passwordSet: boolean, now: Date): AccountStatus {
  if (user.status === "suspended") return { kind: "suspended" };
  if (isLocked(user.lockedUntil, now)) return { kind: "locked", until: user.lockedUntil!.toISOString() };
  if (user.status === "invited" && user.passwordEnabled && !passwordSet) {
    if (link?.state === "waiting") return { kind: "setup_waiting", expiresAt: link.expiresAt };
    if (!user.googleEnabled) return { kind: "setup_expired" };
  }
  return user.status === "invited" ? { kind: "invited" } : { kind: "active" };
}

async function departmentCodes(): Promise<Map<number, string>> {
  return new Map((await db.select({ id: departments.id, code: departments.code }).from(departments)).map((row) => [row.id, row.code]));
}

/** Emails (lower case) whose auth identity has a password set. */
async function emailsWithPassword(): Promise<Set<string>> {
  const rows = await db.select({ email: authUser.email }).from(authAccount).innerJoin(authUser, eq(authAccount.userId, authUser.id))
    .where(and(eq(authAccount.providerId, "credential"), sql`${authAccount.password} is not null`));
  return new Set(rows.map((row) => row.email.toLowerCase()));
}

async function latestLinks(userIds: number[]) {
  if (!userIds.length) return new Map<number, typeof accountLinks.$inferSelect>();
  const rows = await db.select().from(accountLinks).where(inArray(accountLinks.userId, userIds)).orderBy(desc(accountLinks.issuedAt), desc(accountLinks.id));
  const latest = new Map<number, typeof accountLinks.$inferSelect>();
  for (const row of rows) if (!latest.has(row.userId)) latest.set(row.userId, row);
  return latest;
}

export interface AccountListRow {
  id: number;
  displayName: string;
  email: string;
  teacherCode: string | null;
  passwordEnabled: boolean;
  googleEnabled: boolean;
  status: AccountStatus;
  roles: Array<{ label: string; state: "current" | "scheduled"; from: string }>;
  lastLoginAt: string | null;
}

export async function loadAccountList(now = new Date()): Promise<AccountListRow[]> {
  const [users, assignments, teacherRows, withPassword] = await Promise.all([
    db.select().from(portalUsers).orderBy(portalUsers.displayName),
    db.select().from(roleAssignments),
    db.select({ id: teachers.id, code: teachers.shortCode }).from(teachers),
    emailsWithPassword(),
  ]);
  const links = await latestLinks(users.map((user) => user.id));
  const codes = new Map(teacherRows.map((row) => [row.id, row.code]));
  return users.map((user) => {
    const link = linkState(links.get(user.id), now);
    const roles = assignments.filter((row) => row.userId === user.id && isRole(row.role))
      .map((row) => ({ row, state: roleState(row, now) }))
      .filter((entry) => entry.state !== "ended")
      .sort((a, b) => (a.state === b.state ? 0 : a.state === "current" ? -1 : 1) || a.row.activeFrom.getTime() - b.row.activeFrom.getTime())
      .map(({ row, state }) => ({ label: ROLE_LABELS[row.role as Role], state: state as "current" | "scheduled", from: row.activeFrom.toISOString() }));
    return {
      id: user.id, displayName: user.displayName, email: user.email, teacherCode: user.teacherId ? codes.get(user.teacherId) ?? null : null,
      passwordEnabled: user.passwordEnabled, googleEnabled: user.googleEnabled,
      status: accountStatus(user, link, withPassword.has(user.email.toLowerCase()), now),
      roles, lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  });
}

export interface SessionRow { id: string; device: string | null; method: "password" | "google"; createdAt: string; lastSeenAt: string; current: boolean }

async function sessionsFor(email: string, currentToken: string | null, now: Date): Promise<SessionRow[]> {
  const rows = await db.select({
    id: authSession.id, token: authSession.token, userAgent: authSession.userAgent, signInMethod: authSession.signInMethod,
    createdAt: authSession.createdAt, updatedAt: authSession.updatedAt, expiresAt: authSession.expiresAt,
  }).from(authSession).innerJoin(authUser, eq(authSession.userId, authUser.id))
    .where(eq(sql`lower(${authUser.email})`, email.toLowerCase())).orderBy(desc(authSession.updatedAt));
  return rows.filter((row) => row.expiresAt > now).map((row) => ({
    id: row.id, device: row.userAgent, method: row.signInMethod === "password" ? "password" : "google",
    createdAt: row.createdAt.toISOString(), lastSeenAt: row.updatedAt.toISOString(), current: currentToken != null && row.token === currentToken,
  }));
}

export interface AccountDetail {
  id: number;
  displayName: string;
  email: string;
  teacherId: number | null;
  teacherLabel: string | null;
  status: AccountStatus;
  rawStatus: string;
  passwordEnabled: boolean;
  googleEnabled: boolean;
  passwordSet: boolean;
  passwordChangedAt: string | null;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  link: LinkState | null;
  summary: AccessSummary;
  sessions: SessionRow[];
  activity: Array<{ at: string; action: string; actorName: string | null; actorUserId: number | null; detail: unknown; before: unknown; after: unknown }>;
}

export async function loadAccountDetail(userId: number, options: { now?: Date; currentToken?: string | null; wording?: SummaryWording; activity?: boolean } = {}): Promise<AccountDetail | null> {
  const now = options.now ?? new Date();
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  if (!user) return null;
  const [assignments, codes, links, withPassword, teacher, sessions] = await Promise.all([
    db.select().from(roleAssignments).where(eq(roleAssignments.userId, user.id)),
    departmentCodes(),
    latestLinks([user.id]),
    emailsWithPassword(),
    user.teacherId ? db.select({ code: teachers.shortCode, name: teachers.fullName }).from(teachers).where(eq(teachers.id, user.teacherId)).limit(1) : Promise.resolve([]),
    sessionsFor(user.email, options.currentToken ?? null, now),
  ]);
  const activity = options.activity === false ? [] : await db.select({
    at: auditEvents.at, action: auditEvents.action, actorName: auditEvents.actorDisplayName, actorUserId: auditEvents.actorUserId,
    detail: auditEvents.detail, before: auditEvents.before, after: auditEvents.after,
  }).from(auditEvents).where(and(eq(auditEvents.entity, "portal_user"), eq(auditEvents.entityId, user.id))).orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(8);
  const link = linkState(links.get(user.id), now);
  const passwordSet = withPassword.has(user.email.toLowerCase());
  return {
    id: user.id, displayName: user.displayName, email: user.email, teacherId: user.teacherId,
    teacherLabel: teacher[0] ? `${teacher[0].code} · ${teacher[0].name}` : null,
    status: accountStatus(user, link, passwordSet, now), rawStatus: user.status,
    passwordEnabled: user.passwordEnabled, googleEnabled: user.googleEnabled, passwordSet,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    lockedUntil: isLocked(user.lockedUntil, now) ? user.lockedUntil!.toISOString() : null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    link,
    summary: summarizeAccess(assignments, codes, now, options.wording),
    sessions,
    activity: activity.map((row) => ({ ...row, at: row.at.toISOString() })),
  };
}

export async function teacherOptions() {
  return db.select({ id: teachers.id, code: teachers.shortCode, name: teachers.fullName }).from(teachers).orderBy(teachers.shortCode);
}
