/**
 * Authoritative Summer-2026 development seed.
 *
 * Running db:reset replaces the current database. Back up institutional data
 * before using it outside an expendable development environment.
 */
import { seedSummer2026Database } from "./seed-summer-2026";

export const seedDatabase = seedSummer2026Database;

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/seed.ts")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
