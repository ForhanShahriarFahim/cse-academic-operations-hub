import "dotenv/config";
import path from "node:path";
import { db, databaseMode } from "./index";

export async function migrateDatabase() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (databaseMode === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
    return;
  }

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db, { migrationsFolder });
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
