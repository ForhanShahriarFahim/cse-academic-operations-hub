"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, authAccount, portalUsers } from "@/db/schema";
import { denied, invalid, succeeded, type ActionResult } from "../action-result";
import { getCurrentSessionToken, requireActor, AuthenticationError } from ".";
import { LINK_REFUSED, isUsableStatus } from "./account-policy";
import { authUserIdFor, consumeLink, findUsableLink, revokeSessions, storePasswordHash } from "./account-store";
import { parseLinkToken } from "./links";
import { emailName, passwordProblem } from "./password-rules";
import { attemptPasswordSignIn } from "./password-sign-in";
import { auth } from "./provider";
import { clientAddress, requestThrottle } from "./throttle";

/**
 * AUTH-02 actions a person takes on their own account: using a setup or reset
 * link, changing their password and signing out their other devices.
 */

export type LinkView =
  | { ok: true; displayName: string; email: string; emailName: string; purpose: "setup" | "reset"; expiresAt: string }
  | { ok: false; message: string };

const linkRefused = (): LinkView => ({ ok: false, message: LINK_REFUSED });

async function throttled(): Promise<boolean> {
  return !requestThrottle.allow("link", clientAddress(await headers()));
}

/** What the set-password page shows for a token, without using it up. */
export async function inspectLinkAction(rawToken: string): Promise<LinkView> {
  const token = parseLinkToken(rawToken);
  if (!token || await throttled()) return linkRefused();
  const link = await findUsableLink(db, token, new Date());
  if (!link) return linkRefused();
  return { ok: true, displayName: link.displayName, email: link.email, emailName: emailName(link.email), purpose: link.purpose, expiresAt: link.expiresAt.toISOString() };
}

export type SetPasswordResult = ActionResult & { linkInvalid?: boolean };

class LinkGone extends Error {}

export async function setPasswordWithLinkAction(_previous: SetPasswordResult | null, formData: FormData): Promise<SetPasswordResult> {
  const token = parseLinkToken(String(formData.get("token") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token || await throttled()) return { ...invalid(LINK_REFUSED), linkInvalid: true };
  const now = new Date();
  const link = await findUsableLink(db, token, now);
  if (!link) return { ...invalid(LINK_REFUSED), linkInvalid: true };
  const problem = passwordProblem(password, link.email);
  if (problem) return invalid(problem, { password: [problem] });
  if (password !== confirm) return invalid("The two passwords do not match.", { confirm: ["The two passwords do not match. Type the same password twice."] });

  const passwordHash = await (await auth.$context).password.hash(password);
  try {
    await db.transaction(async (tx) => {
      if (!await consumeLink(tx, link.linkId, now)) throw new LinkGone();
      const [user] = await tx.select().from(portalUsers).where(eq(portalUsers.id, link.userId)).limit(1);
      if (!user || !isUsableStatus(user.status) || !user.passwordEnabled) throw new LinkGone();
      await storePasswordHash(tx, user, passwordHash, now);
      await tx.update(portalUsers).set({ passwordChangedAt: now, failedSignIns: 0, lockedUntil: null, updatedAt: now }).where(eq(portalUsers.id, user.id));
      const sessionsRevoked = await revokeSessions(tx, user.email);
      await tx.insert(auditEvents).values({
        actor: user.displayName, actorUserId: user.id, actorDisplayName: user.displayName, actorKind: "user",
        action: link.purpose === "setup" ? "user.password.set" : "user.password.reset", entity: "portal_user", entityId: user.id,
        detail: { linkId: link.linkId, sessionsRevoked },
      });
    });
  } catch (error) {
    if (error instanceof LinkGone) return { ...invalid(LINK_REFUSED), linkInvalid: true };
    throw error;
  }
  const signedIn = await attemptPasswordSignIn(link.email, password, await headers(), new Date());
  redirect(signedIn.ok ? "/" : "/login");
}

// ---------------------------------------------------------------------------
// Signed-in person
// ---------------------------------------------------------------------------

async function signedIn() {
  try { return await requireActor(); } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function changeOwnPasswordAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await signedIn();
  if (!actor) return denied("Sign in before changing your password.", "unauthenticated");
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, actor.id)).limit(1);
  if (!user?.passwordEnabled) return invalid("Password sign-in is off for your account. Ask the portal administrator.");
  if (!requestThrottle.allow("sign-in", clientAddress(await headers()))) return invalid("Too many tries. Wait a minute and try again.");
  const context = await auth.$context;
  const authUserId = await authUserIdFor(db, user.email);
  const [credential] = authUserId
    ? await db.select({ password: authAccount.password }).from(authAccount)
      .where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "credential"))).limit(1)
    : [];
  const currentOk = credential?.password ? await context.password.verify({ hash: credential.password, password: current }) : false;
  if (!currentOk) return invalid("Your current password is not correct.", { current: ["Your current password is not correct."] });
  const problem = passwordProblem(password, user.email);
  if (problem) return invalid(problem, { password: [problem] });
  if (password !== confirm) return invalid("The two new passwords do not match.", { confirm: ["The two new passwords do not match."] });

  const passwordHash = await context.password.hash(password);
  const keep = await getCurrentSessionToken();
  const now = new Date();
  const sessionsRevoked = await db.transaction(async (tx) => {
    await storePasswordHash(tx, user, passwordHash, now);
    await tx.update(portalUsers).set({ passwordChangedAt: now, failedSignIns: 0, lockedUntil: null, updatedAt: now }).where(eq(portalUsers.id, user.id));
    const revoked = await revokeSessions(tx, user.email, keep ? { exceptToken: keep } : {});
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.password.change", entity: "portal_user", entityId: actor.id, detail: { sessionsRevoked: revoked },
    });
    return revoked;
  });
  revalidatePath("/account");
  return succeeded(sessionsRevoked
    ? `Password changed. You stay signed in here; ${sessionsRevoked} other device${sessionsRevoked === 1 ? " was" : "s were"} signed out.`
    : "Password changed. You stay signed in here.", { entityId: actor.id });
}

export async function signOutOtherSessionsAction(_previous: ActionResult | null): Promise<ActionResult> {
  const actor = await signedIn();
  if (!actor) return denied("Sign in first.", "unauthenticated");
  const keep = await getCurrentSessionToken();
  if (!keep) return denied("Sign in first.", "unauthenticated");
  const sessionsRevoked = await db.transaction(async (tx) => {
    const revoked = await revokeSessions(tx, actor.email, { exceptToken: keep });
    await tx.insert(auditEvents).values({
      actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user",
      action: "user.sessions.revoke", entity: "portal_user", entityId: actor.id, detail: { reason: "self", sessionsRevoked: revoked },
    });
    return revoked;
  });
  revalidatePath("/account");
  return succeeded(`Signed out on ${sessionsRevoked} other device${sessionsRevoked === 1 ? "" : "s"}.`, { entityId: actor.id });
}
