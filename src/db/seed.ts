/**
 * Authoritative Summer-2026 development seed.
 *
 * `npm run db:reset -- --confirm <target>` replaces the academic data in a
 * development database and keeps portal access (BUG-26). It names its target
 * and refuses the default directory, which holds the institutional database.
 */
import { confirmsTarget, databaseTarget, loadDatabaseEnvironment, overlapsDefaultPglite } from "./target";

/** Used by db:prepare on a database with no academic term; no confirmation needed. */
export async function seedDatabase() {
  const { seedSummer2026Database } = await import("./seed-summer-2026");
  await seedSummer2026Database("db:prepare");
}

const KEPT = "portal users, passwords, sessions, roles, setup links and the access audit history";

/** Decide before any database module is imported, so a refused reset opens nothing. */
async function resetCommand(args: string[]): Promise<number> {
  loadDatabaseEnvironment();
  const target = databaseTarget();
  const flag = args.indexOf("--confirm");
  const confirmation = flag >= 0 ? args[flag + 1] : undefined;

  console.log(`Target: ${target.label}`);
  console.log(`Mode: ${target.mode}`);
  if (target.mode === "pglite" && overlapsDefaultPglite(target.directory)) {
    console.error("Refused: this is the default directory, which holds the institutional database. db:reset never runs on it.");
    console.error("Point PGLITE_DATA_DIR at a disposable copy (or set DATABASE_URL to a development database) and run it again.");
    return 1;
  }
  if (!confirmsTarget(target, confirmation)) {
    console.error(confirmation ? "Refused: --confirm does not match the target above. Nothing was changed." : "Nothing was changed.");
    console.error(`This replaces all academic data with the Summer-2026 development seed and keeps ${KEPT}.`);
    console.error("To go ahead, repeat the target exactly:");
    console.error(`  npm run db:reset -- --confirm "${target.label}"`);
    return 1;
  }

  const { seedSummer2026Database } = await import("./seed-summer-2026");
  await seedSummer2026Database("db:reset");
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/seed.ts")) {
  resetCommand(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
