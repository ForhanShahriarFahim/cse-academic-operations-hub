/** Owned adapter orchestration; never imports the configured application DB. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pgliteFactory, withHandle, type DatabaseFactory } from "./database";
import { populateSummerFixture } from "./fixture";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

async function exercise(factory: DatabaseFactory, baseline = false) {
  if (baseline) assert.equal(execFileSync("git", ["diff", "d6e3cdb", "--", "src"], { cwd: REPO_ROOT, encoding: "utf8" }), "", "Baseline capture requires unchanged approved-base application source");
  const database = await factory("perf01 bounded readers");
  try {
    await withHandle(database, async h => { await database.migrate(h); await populateSummerFixture(h.db); });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/performance-scenarios.ts"), [baseline ? "baseline" : "verify"]);
    assert.equal(child.status, 0, child.stderr.slice(-6000) || child.stdout.slice(-2000));
    assert.ok(child.report);
    const out = path.join(REPO_ROOT, "output/perf-01"); mkdirSync(out, { recursive: true });
    const base = path.join(out, `baseline-${database.adapter}.json`);
    if (baseline) writeFileSync(base, JSON.stringify({ source: "d6e3cdb (application unchanged at approval a8cb252)", ...child.report }, null, 2) + "\n");
    else {
      assert.deepEqual(child.report.outputs, JSON.parse(readFileSync(base, "utf8")).outputs, "Complete projections/actions/evidence equal captured unmodified-base outputs");
      writeFileSync(path.join(out, `verified-${database.adapter}.json`), JSON.stringify(child.report, null, 2) + "\n");
    }
    return [baseline ? "Unmodified-base 2/20-term projections, real query returned-row counts, action/evidence and multi-cohort digest baseline captured." : "Full base-output parity; 2/20-term bounded reads, one create load/bounded audiences, all-term enrollment union, one fresh rollover snapshot read/digest, no-graduate/empty/denied cases pass."];
  } finally { await database.dispose(); }
}
export const checkPerformance = (baseline = false) => exercise(pgliteFactory, baseline);
export const checkPerformancePostgres = (bin: string | undefined, baseline = false) => withDisposableCluster(bin, cluster => exercise(factoryFor(cluster), baseline));
