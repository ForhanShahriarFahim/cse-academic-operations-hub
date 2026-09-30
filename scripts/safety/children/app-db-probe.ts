/**
 * Child probe: load the application database module the way CLI scripts do and
 * report which target it selected. It queries only an embedded PGlite target;
 * a PostgreSQL selection is reported without connecting.
 */
async function main() {
  if (process.argv.includes("--dotenv-first")) await import("dotenv/config");
  const { databaseMode, db } = await import("../../../src/db");
  if (databaseMode === "pglite") {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`select 1`);
  }
  const url = process.env.DATABASE_URL;
  console.log(JSON.stringify({
    databaseMode,
    databaseHost: url ? new URL(url).hostname : null,
    pgliteDataDir: databaseMode === "pglite" ? process.env.PGLITE_DATA_DIR ?? null : null,
  }));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
