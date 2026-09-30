import "dotenv/config";
import path from "node:path";
import { db, databaseMode } from "./index";
import { backfillTimeGrids, type GridDb } from "./time-grid-backfill";

export async function migrateDatabase() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (databaseMode === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder });
  }
  // RUT-04: terms created before term grids get the periods they were drawn with.
  const filled = await backfillTimeGrids(db as unknown as GridDb);
  if (filled.length) console.log(`Term grids created for ${filled.length} existing term(s).`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/migrate.ts")) {
  migrateDatabase()
    .then(() => {
      console.log(`Database migrations applied (${databaseMode}).`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
