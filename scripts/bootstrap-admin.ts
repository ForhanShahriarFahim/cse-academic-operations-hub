/**
 * First administrator and administrator recovery (operator command).
 *
 *   npm run auth:bootstrap                          Google invitation for PORTAL_BOOTSTRAP_ADMIN_EMAIL (AUTH-01)
 *   npm run auth:bootstrap -- --password            first administrator with Password; prints a setup link (AUTH-02 D-7)
 *   npm run auth:bootstrap -- --reset-link <email>  setup or reset link for an existing system administrator (recovery)
 *
 * Links are printed to this terminal only and never stored or logged: only
 * their hash is kept. Every change commits with a system-attributed audit event.
 */
import "dotenv/config";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { auditEvents, portalUsers, roleAssignments } from "../src/db/schema";
import { migrateDatabase } from "../src/db/migrate";
import { normalizeEmail, type LinkPurpose } from "../src/lib/auth/account-policy";
import { hasPassword, issueLink } from "../src/lib/auth/account-store";
import { linkUrl } from "../src/lib/auth/links";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function linkBase(): string {
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base) throw new Error("Set BETTER_AUTH_URL to the portal's address, so the printed link opens the right site.");
  return base;
}

function printLink(email: string, purpose: LinkPurpose, token: string, expiresAt: Date) {
  console.log(`\n${purpose === "setup" ? "Setup" : "Reset"} link for ${email} (works once, expires ${expiresAt.toISOString()}):\n\n  ${linkUrl(linkBase(), token)}\n`);
  console.log("Give it only to that person. It is not stored anywhere and will not be shown again.");
}

async function bootstrap(email: string, withPassword: boolean) {
  if (withPassword) linkBase();
  // One transaction, serialized by an advisory lock: the account, the role, any
  // link and the system-attributed audit events commit together or not at all,
  // and a rerun for the same administrator writes nothing.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('portal-bootstrap-admin'))`);
    const existingAdmins = await tx.select({ userId: roleAssignments.userId }).from(roleAssignments)
      .where(eq(roleAssignments.role, "system_administrator"));
    const [existingUser] = await tx.select().from(portalUsers).where(eq(sql`lower(${portalUsers.email})`, email)).limit(1);
    if (existingAdmins.length > 0 && !existingAdmins.some((row) => row.userId === existingUser?.id)) {
      throw new Error("An administrator already exists. Manage additional administrators from the Access page, or use --reset-link for recovery.");
    }
    if (existingUser && existingAdmins.some((row) => row.userId === existingUser.id)) return { result: "unchanged" as const };
    const now = new Date();
    const [user] = existingUser ? [existingUser] : await tx.insert(portalUsers).values({
      email,
      displayName: process.env.PORTAL_BOOTSTRAP_ADMIN_NAME?.trim() || "Portal Administrator",
      status: "invited",
      passwordEnabled: withPassword,
      googleEnabled: !withPassword,
    }).returning();
    if (existingUser && withPassword && !existingUser.passwordEnabled) {
      await tx.update(portalUsers).set({ passwordEnabled: true, updatedAt: now }).where(eq(portalUsers.id, existingUser.id));
    }
    // Start the role on the app clock that sign-in checks it against, not the database's (#59).
    await tx.insert(roleAssignments).values({ userId: user.id, role: "system_administrator", activeFrom: now, grantedAt: now });
    await tx.insert(auditEvents).values({
      actor: "bootstrap-admin",
      actorDisplayName: "First-administrator bootstrap (operator command)",
      actorKind: "system",
      action: "user.bootstrap_admin",
      entity: "portal_user",
      entityId: user.id,
      after: { email, role: "system_administrator", invitationCreated: !existingUser, method: withPassword ? "password" : "google" },
    });
    const link = withPassword ? await issueLink(tx, { userId: user.id, purpose: "setup", issuedByUserId: null, now }) : null;
    if (link) {
      await tx.insert(auditEvents).values({
        actor: "bootstrap-admin", actorDisplayName: "First-administrator bootstrap (operator command)", actorKind: "system",
        action: "user.recovery_link", entity: "portal_user", entityId: user.id, after: { purpose: "setup", expiresAt: link.expiresAt.toISOString() },
      });
    }
    return { result: existingUser ? "role_added" as const : "created" as const, link };
  });
  if (outcome.result === "unchanged") {
    console.log(`First administrator already configured: ${email}. Nothing changed.${withPassword ? " For a new link, use --reset-link." : ""}`);
    return;
  }
  if (outcome.link) {
    console.log(`First administrator ready: ${email}. Password sign-in starts once the setup link is used.`);
    printLink(email, "setup", outcome.link.token, outcome.link.expiresAt);
  } else {
    console.log(`First administrator invitation ready: ${email}. Google sign-in activates the account.`);
  }
}

/** Recovery: a link for an account that holds the system administrator role now. Password is turned on if it was off. */
async function resetLink(email: string) {
  linkBase();
  const now = new Date();
  const issued = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(portalUsers).where(eq(sql`lower(${portalUsers.email})`, email)).limit(1);
    const [admin] = user ? await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(and(
      eq(roleAssignments.userId, user.id), eq(roleAssignments.role, "system_administrator"), lte(roleAssignments.activeFrom, now),
      or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, now)),
    )).limit(1) : [];
    if (!user || !admin) throw new Error("No current system administrator has this email. Recovery links are only for system administrators; manage other accounts from People & access.");
    if (user.status === "suspended") throw new Error("This administrator is suspended. Another system administrator must reactivate the account first.");
    const purpose: LinkPurpose = await hasPassword(tx, user.email) ? "reset" : "setup";
    await tx.update(portalUsers).set({ passwordEnabled: true, failedSignIns: 0, lockedUntil: null, updatedAt: now }).where(eq(portalUsers.id, user.id));
    const link = await issueLink(tx, { userId: user.id, purpose, issuedByUserId: null, now });
    await tx.insert(auditEvents).values({
      actor: "bootstrap-admin", actorDisplayName: "Administrator recovery (operator command)", actorKind: "system",
      action: "user.recovery_link", entity: "portal_user", entityId: user.id,
      before: { passwordEnabled: user.passwordEnabled, lockedUntil: user.lockedUntil?.toISOString() ?? null },
      after: { purpose, expiresAt: link.expiresAt.toISOString(), passwordEnabled: true },
      detail: { replacedOpenLink: link.replaced },
    });
    return { purpose, ...link };
  });
  printLink(email, issued.purpose, issued.token, issued.expiresAt);
}

async function main(args: string[]) {
  await migrateDatabase();
  const resetIndex = args.indexOf("--reset-link");
  if (resetIndex >= 0) {
    const email = normalizeEmail(args[resetIndex + 1] ?? "");
    if (!EMAIL.test(email)) throw new Error("Usage: npm run auth:bootstrap -- --reset-link <administrator email>");
    return resetLink(email);
  }
  const email = normalizeEmail(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAIL ?? "");
  if (!EMAIL.test(email)) {
    throw new Error("Set PORTAL_BOOTSTRAP_ADMIN_EMAIL to the first administrator's email.");
  }
  return bootstrap(email, args.includes("--password"));
}

main(process.argv.slice(2)).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
