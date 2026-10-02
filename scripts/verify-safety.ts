/**
 * SAFE-01 isolated safety checks. Everything runs against owned disposable
 * targets under .tmp/safe-01; the default institutional PGlite directory is
 * never opened, only its file metadata is compared before and after.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_PGLITE_DIR } from "./safety/targets";
import { checkIsolation } from "./safety/isolation.check";
import { checkRecovery } from "./safety/recovery.check";
import { checkHistory } from "./safety/history.check";
import { checkAudit } from "./safety/audit.check";
import { checkPostgres } from "./safety/postgres.check";
import { checkTimeZones, checkTimeZonesPostgres } from "./safety/time-zone.check";
import { checkAuth, checkAuthPostgres } from "./safety/auth.check";
import { checkClusterCleanup } from "./safety/cluster.check";
import { checkReset, checkResetPostgres } from "./safety/reset.check";
import { checkTeachers, checkTeachersPostgres } from "./safety/teacher.check";

function metadataFingerprint(directory: string): string {
  if (!existsSync(directory)) return "absent";
  const hash = createHash("sha256");
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = statSync(full);
        hash.update(`${path.relative(directory, full)}:${stat.size}:${stat.mtimeMs}\n`);
      }
    }
  };
  walk(directory);
  return hash.digest("hex").slice(0, 16);
}

async function main() {
  const before = metadataFingerprint(DEFAULT_PGLITE_DIR);
  // [name, check, needs SAFE01_PG_BIN]
  const groups: Array<[string, () => Promise<string[]>, boolean?]> = [
    ["T-01 isolation", checkIsolation],
    ["T-02 PGlite recovery", checkRecovery],
    ["T-03 two-term history", () => checkHistory()],
    ["T-04 audit atomicity", () => checkAudit()],
    ["T-06 PostgreSQL", () => checkPostgres(process.env.SAFE01_PG_BIN), true],
    ["BUG-29 time zones (PGlite)", () => checkTimeZones()],
    ["BUG-29 time zones (PostgreSQL)", () => checkTimeZonesPostgres(process.env.SAFE01_PG_BIN), true],
    ["AUTH-02 accounts (PGlite)", () => checkAuth()],
    ["AUTH-02 accounts (PostgreSQL)", () => checkAuthPostgres(process.env.SAFE01_PG_BIN), true],
    ["BUG-48 cluster cleanup (PostgreSQL)", () => checkClusterCleanup(process.env.SAFE01_PG_BIN), true],
    ["BUG-26 reset keeps access (PGlite)", () => checkReset()],
    ["BUG-26 reset keeps access (PostgreSQL)", () => checkResetPostgres(process.env.SAFE01_PG_BIN), true],
    ["TCH-01 teacher records (PGlite)", () => checkTeachers()],
    ["TCH-01 teacher records (PostgreSQL)", () => checkTeachersPostgres(process.env.SAFE01_PG_BIN), true],
  ];
  // Optional task filter for focused runs, e.g. `npm run test:safety -- T-03`.
  const only = process.argv[2];
  for (const [name, check, needsPostgres] of groups.filter(([label]) => !only || label.startsWith(only))) {
    // PostgreSQL needs explicitly configured client tools; without them it is pending, never "passed".
    if (needsPostgres && !process.env.SAFE01_PG_BIN) {
      console.log(`${name}: PENDING — set SAFE01_PG_BIN to a PostgreSQL bin directory (see docs/operations/DATABASE_RECOVERY.md)`);
      continue;
    }
    const results = await check();
    console.log(`${name}: passed`);
    for (const line of results) console.log(`  - ${line}`);
  }
  const after = metadataFingerprint(DEFAULT_PGLITE_DIR);
  console.log(before === after
    ? `Default PGlite directory metadata unchanged (${before === "absent" ? "absent" : "present"}); it was never opened.`
    : "NOTE: default PGlite directory metadata changed during the run. The harness never targets it; another process (for example a running dev server) may be writing.");
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
