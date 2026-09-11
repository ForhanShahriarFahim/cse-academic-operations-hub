import { databaseMode, db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: databaseMode });
  } catch (error) {
    console.error("Database health check failed", error);
    return Response.json({ ok: false, database: databaseMode }, { status: 500 });
  }
}
