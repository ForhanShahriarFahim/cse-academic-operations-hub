import path from "node:path";
import { databaseCommand, isCommand } from "./command";
import { backfillTimeGrids, type GridDb } from "./time-grid-backfill";

export async function migrateDatabase() {
  const { db, databaseMode } = await import("./index");
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

if (isCommand("/src/db/migrate.ts")) {
  Promise.resolve().then(async () => {
    if (databaseCommand("db:migrate", process.argv.slice(2)).preview) return;
    await migrateDatabase();
    const { databaseMode } = await import("./index");
    console.log(`Database migrations applied (${databaseMode}).`);
  })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
