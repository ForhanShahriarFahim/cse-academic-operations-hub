import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { portalUsers, roleAssignments } from "../src/db/schema";
import { migrateDatabase } from "../src/db/migrate";

async function main() {
  const email = process.env.PORTAL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set PORTAL_BOOTSTRAP_ADMIN_EMAIL to the first administrator's Google email.");
  }
  await migrateDatabase();
  const existingAdmins = await db.select({ userId: roleAssignments.userId }).from(roleAssignments)
    .where(eq(roleAssignments.role, "system_administrator"));
  const [existingUser] = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
  if (existingAdmins.length > 0 && !existingAdmins.some((row) => row.userId === existingUser?.id)) {
    throw new Error("An administrator already exists. Manage additional administrators from the Access page.");
  }
  const [user] = existingUser ? [existingUser] : await db.insert(portalUsers).values({
    email,
    displayName: process.env.PORTAL_BOOTSTRAP_ADMIN_NAME?.trim() || "Portal Administrator",
    status: "invited",
  }).returning();
  if (!existingAdmins.some((row) => row.userId === user.id)) {
    await db.insert(roleAssignments).values({ userId: user.id, role: "system_administrator" });
  }
  console.log(`First administrator invitation ready: ${email}. Google sign-in activates the account.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
