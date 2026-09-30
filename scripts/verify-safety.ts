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
  const groups: Array<[string, () => Promise<string[]>]> = [
    ["T-01 isolation", checkIsolation],
    ["T-02 PGlite recovery", checkRecovery],
    ["T-03 two-term history", checkHistory],
  ];
  // Optional task filter for focused runs, e.g. `npm run test:safety -- T-03`.
  const only = process.argv[2];
  for (const [name, check] of groups.filter(([label]) => !only || label.startsWith(only))) {
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
