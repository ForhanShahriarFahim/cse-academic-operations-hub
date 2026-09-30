import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { auditEvents, portalUsers, roleAssignments } from "../src/db/schema";
import { migrateDatabase } from "../src/db/migrate";

async function main() {
  const email = process.env.PORTAL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set PORTAL_BOOTSTRAP_ADMIN_EMAIL to the first administrator's Google email.");
  }
  await migrateDatabase();
  // One transaction, serialized by an advisory lock: the invitation, the role
  // and a system-attributed audit event commit together or not at all, and a
  // rerun for the same administrator writes nothing.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('portal-bootstrap-admin'))`);
    const existingAdmins = await tx.select({ userId: roleAssignments.userId }).from(roleAssignments)
      .where(eq(roleAssignments.role, "system_administrator"));
    const [existingUser] = await tx.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
    if (existingAdmins.length > 0 && !existingAdmins.some((row) => row.userId === existingUser?.id)) {
      throw new Error("An administrator already exists. Manage additional administrators from the Access page.");
    }
    if (existingUser && existingAdmins.some((row) => row.userId === existingUser.id)) return "unchanged";
    const [user] = existingUser ? [existingUser] : await tx.insert(portalUsers).values({
      email,
      displayName: process.env.PORTAL_BOOTSTRAP_ADMIN_NAME?.trim() || "Portal Administrator",
      status: "invited",
    }).returning();
    await tx.insert(roleAssignments).values({ userId: user.id, role: "system_administrator" });
    await tx.insert(auditEvents).values({
      actor: "bootstrap-admin",
      actorDisplayName: "First-administrator bootstrap (operator command)",
      actorKind: "system",
      action: "user.bootstrap_admin",
      entity: "portal_user",
      entityId: user.id,
      after: { email, role: "system_administrator", invitationCreated: !existingUser },
    });
    return existingUser ? "role_added" : "created";
  });
  console.log(outcome === "unchanged"
    ? `First administrator already configured: ${email}. Nothing changed.`
    : `First administrator invitation ready: ${email}. Google sign-in activates the account.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
