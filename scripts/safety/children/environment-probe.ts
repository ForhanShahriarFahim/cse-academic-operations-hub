/** Database-free child: compare our boundary with the installed Next loader in fresh processes. */
import { loadEnvConfig } from "@next/env";
import { loadDatabaseEnvironment } from "../../../src/db/environment";
import { databaseTarget } from "../../../src/db/target";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--imports")) {
    await import("../../../src/db/migrate");
    await import("../../../src/db/prepare");
    await import("../../../src/db/seed");
    await import("../../../src/db/seed-summer-2026");
    await import("../../bootstrap-admin");
    await import("../../check-terms");
    console.log("Helpers imported without opening a database or executing a command.");
    return;
  }
  if (args.includes("--next") || args.includes("--runtime") || args.includes("--runtime-pinned")) {
    if (process.env.NODE_ENV === undefined) Object.assign(process.env, { NODE_ENV: "development" });
    loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");
  }
  if (args.includes("--runtime-pinned")) Object.assign(process.env, { DATABASE_URL: "", PGLITE_DATA_DIR: "memory://" });
  if (!args.includes("--next")) loadDatabaseEnvironment();
  const target = databaseTarget();
  console.log(JSON.stringify({
    environment: process.env.NODE_ENV, mode: target.mode, label: target.label,
    expanded: process.env.BUG24_EXPANDED, escaped: process.env.BUG24_ESCAPED,
    pinned: process.env.BUG24_PIN,
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
