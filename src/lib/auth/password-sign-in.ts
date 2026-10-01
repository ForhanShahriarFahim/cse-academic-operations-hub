import { eq, sql } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { db } from "@/db";
import { auditEvents, portalUsers } from "@/db/schema";
import { auth } from "./provider";
import { MAX_FAILED_SIGN_INS, isLocked, isUsableStatus, lockEndsAt, normalizeEmail } from "./account-policy";

export type SignInRefusal = "no_account" | "not_usable" | "password_off" | "locked" | "wrong_password" | "too_long";
export type SignInOutcome = { ok: true; userId: number } | { ok: false; reason: SignInRefusal };

/**
 * AUTH-02 password sign-in. Every refusal looks the same to the person (one
 * message, a password hash's worth of time); `reason` is for tests only.
 * Wrong passwords count towards the lockout; a lock refuses even the right one.
 */
export async function attemptPasswordSignIn(rawEmail: string, password: string, requestHeaders: Headers, now = new Date()): Promise<SignInOutcome> {
  const context = await auth.$context;
  const email = normalizeEmail(rawEmail);
  const [account] = email
    ? await db.select({
      id: portalUsers.id, status: portalUsers.status, passwordEnabled: portalUsers.passwordEnabled, lockedUntil: portalUsers.lockedUntil,
    }).from(portalUsers).where(eq(sql`lower(${portalUsers.email})`, email)).limit(1)
    : [];
  const refusal: SignInRefusal | null = !account ? "no_account"
    : !isUsableStatus(account.status) ? "not_usable"
    : !account.passwordEnabled ? "password_off"
    : isLocked(account.lockedUntil, now) ? "locked"
    : password.length > 128 ? "too_long"
    : null;
  if (refusal || !account) {
    await context.password.hash(password.slice(0, 128));
    return { ok: false, reason: refusal ?? "no_account" };
  }
  try {
    await auth.api.signInEmail({ body: { email, password, rememberMe: true }, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error) && error.statusCode === 401) {
      await recordFailedSignIn(account.id, now);
      return { ok: false, reason: "wrong_password" };
    }
    throw error;
  }
  await db.update(portalUsers).set({ failedSignIns: 0, lockedUntil: null, lastLoginAt: now }).where(eq(portalUsers.id, account.id));
  return { ok: true, userId: account.id };
}

/**
 * One statement counts the failure and, on the fifth, locks and resets the
 * count, so concurrent failures lock (and audit) exactly once.
 */
export async function recordFailedSignIn(userId: number, now: Date): Promise<boolean> {
  const until = lockEndsAt(now);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(portalUsers).set({
      failedSignIns: sql`case when ${portalUsers.failedSignIns} + 1 >= ${MAX_FAILED_SIGN_INS} then 0 else ${portalUsers.failedSignIns} + 1 end`,
      lockedUntil: sql`case when ${portalUsers.failedSignIns} + 1 >= ${MAX_FAILED_SIGN_INS} then ${until.toISOString()}::timestamptz else ${portalUsers.lockedUntil} end`,
    }).where(eq(portalUsers.id, userId)).returning({ failedSignIns: portalUsers.failedSignIns });
    // Only the failure that locks resets the count to 0; comparing lock times would also
    // match a concurrent failure in the same millisecond and audit the lock twice.
    const locked = row?.failedSignIns === 0;
    if (row && locked) {
      await tx.insert(auditEvents).values({
        actor: "sign-in lockout", actorDisplayName: "Sign-in lockout (automatic)", actorKind: "system",
        action: "user.lockout", entity: "portal_user", entityId: userId,
        after: { lockedUntil: until.toISOString(), failedSignIns: MAX_FAILED_SIGN_INS },
      });
    }
    return locked;
  });
}
