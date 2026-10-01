import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { type LinkPurpose, isUsableStatus, linkExpiresAt, normalizeEmail } from "./account-policy";
import { hashLinkToken, newLinkToken } from "./links";

/**
 * AUTH-02 database helpers shared by the server actions, the operator command
 * and the safety checks. Each takes the caller's transaction, so a change, its
 * session revocation and its audit row commit together.
 */
export type AccountDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const { accountLinks, authAccount, authSession, authUser, portalUsers, roleAssignments } = schema;

export async function authUserIdFor(tx: AccountDb, email: string): Promise<string | null> {
  const [row] = await tx.select({ id: authUser.id }).from(authUser).where(eq(sql`lower(${authUser.email})`, normalizeEmail(email))).limit(1);
  return row?.id ?? null;
}

/**
 * Delete the person's sessions: all of them, only those from one method
 * (sessions from before AUTH-02 count as Google), or all but one token.
 */
export async function revokeSessions(tx: AccountDb, email: string, options: { method?: "password" | "google"; exceptToken?: string } = {}): Promise<number> {
  const authUserId = await authUserIdFor(tx, email);
  if (!authUserId) return 0;
  const conditions = [eq(authSession.userId, authUserId)];
  if (options.method === "password") conditions.push(eq(authSession.signInMethod, "password"));
  if (options.method === "google") conditions.push(or(isNull(authSession.signInMethod), eq(authSession.signInMethod, "google"))!);
  if (options.exceptToken) conditions.push(ne(authSession.token, options.exceptToken));
  const removed = await tx.delete(authSession).where(and(...conditions)).returning({ id: authSession.id });
  return removed.length;
}

export async function hasPassword(tx: AccountDb, email: string): Promise<boolean> {
  const authUserId = await authUserIdFor(tx, email);
  if (!authUserId) return false;
  const [row] = await tx.select({ password: authAccount.password }).from(authAccount)
    .where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "credential"))).limit(1);
  return Boolean(row?.password);
}

/** Revoke the person's open link, if any. Returns whether one was open. */
export async function revokeOpenLink(tx: AccountDb, userId: number, now: Date): Promise<boolean> {
  const revoked = await tx.update(accountLinks).set({ revokedAt: now })
    .where(and(eq(accountLinks.userId, userId), isNull(accountLinks.usedAt), isNull(accountLinks.revokedAt)))
    .returning({ id: accountLinks.id });
  return revoked.length > 0;
}

/** Issue a new link, replacing any open one. The token is returned once and never stored. */
export async function issueLink(tx: AccountDb, input: { userId: number; purpose: LinkPurpose; issuedByUserId: number | null; now: Date }) {
  const replaced = await revokeOpenLink(tx, input.userId, input.now);
  const token = newLinkToken();
  const expiresAt = linkExpiresAt(input.purpose, input.now);
  const [link] = await tx.insert(accountLinks).values({
    userId: input.userId, purpose: input.purpose, tokenHash: hashLinkToken(token), expiresAt,
    issuedByUserId: input.issuedByUserId, issuedAt: input.now,
  }).returning({ id: accountLinks.id });
  return { linkId: link.id, token, expiresAt, replaced };
}

export interface OpenLink {
  linkId: number;
  purpose: LinkPurpose;
  expiresAt: Date;
  userId: number;
  displayName: string;
  email: string;
}

/** A link that can still be used: open, unexpired, for a usable account with Password on. */
export async function findUsableLink(tx: AccountDb, token: string, now: Date): Promise<OpenLink | null> {
  const [row] = await tx.select({
    linkId: accountLinks.id, purpose: accountLinks.purpose, expiresAt: accountLinks.expiresAt, userId: portalUsers.id,
    displayName: portalUsers.displayName, email: portalUsers.email, status: portalUsers.status, passwordEnabled: portalUsers.passwordEnabled,
  }).from(accountLinks).innerJoin(portalUsers, eq(accountLinks.userId, portalUsers.id))
    .where(and(eq(accountLinks.tokenHash, hashLinkToken(token)), isNull(accountLinks.usedAt), isNull(accountLinks.revokedAt), gt(accountLinks.expiresAt, now)))
    .limit(1);
  if (!row || !isUsableStatus(row.status) || !row.passwordEnabled) return null;
  return { linkId: row.linkId, purpose: row.purpose as LinkPurpose, expiresAt: row.expiresAt, userId: row.userId, displayName: row.displayName, email: row.email };
}

/** Use up a link atomically: exactly one of two racing submissions gets it. */
export async function consumeLink(tx: AccountDb, linkId: number, now: Date): Promise<boolean> {
  const used = await tx.update(accountLinks).set({ usedAt: now })
    .where(and(eq(accountLinks.id, linkId), isNull(accountLinks.usedAt), isNull(accountLinks.revokedAt), gt(accountLinks.expiresAt, now)))
    .returning({ id: accountLinks.id });
  return used.length === 1;
}

/** Set (or replace) the password on the person's auth identity, creating it if they have never signed in. */
export async function storePasswordHash(tx: AccountDb, person: { email: string; displayName: string }, passwordHash: string, now: Date): Promise<string> {
  const email = normalizeEmail(person.email);
  let authUserId = await authUserIdFor(tx, email);
  if (!authUserId) {
    authUserId = randomUUID();
    await tx.insert(authUser).values({ id: authUserId, name: person.displayName, email, emailVerified: false, createdAt: now, updatedAt: now });
  }
  const [credential] = await tx.select({ id: authAccount.id }).from(authAccount)
    .where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "credential"))).limit(1);
  if (credential) await tx.update(authAccount).set({ password: passwordHash, updatedAt: now }).where(eq(authAccount.id, credential.id));
  else await tx.insert(authAccount).values({ id: randomUUID(), accountId: authUserId, providerId: "credential", userId: authUserId, password: passwordHash, createdAt: now, updatedAt: now });
  return authUserId;
}

/**
 * Accounts that are active and hold the system administrator role now. Taken
 * under a transaction-scoped advisory lock, so two administrators removing each
 * other at once cannot both pass the last-administrator check.
 */
export async function activeAdministratorIds(tx: AccountDb, now: Date): Promise<Set<number>> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('portal-admin-guard'))`);
  const rows = await tx.selectDistinct({ userId: roleAssignments.userId }).from(roleAssignments)
    .innerJoin(portalUsers, eq(roleAssignments.userId, portalUsers.id))
    .where(and(
      eq(roleAssignments.role, "system_administrator"), lte(roleAssignments.activeFrom, now),
      or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, now)), eq(portalUsers.status, "active"),
    ));
  return new Set(rows.map((row) => row.userId));
}

/** Roles not yet ended (current or scheduled) of the given kinds. */
export async function openAssignments(tx: AccountDb, userId: number, roles: string[], now: Date) {
  return tx.select().from(roleAssignments).where(and(
    eq(roleAssignments.userId, userId), inArray(roleAssignments.role, roles),
    or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, now)),
  ));
}
