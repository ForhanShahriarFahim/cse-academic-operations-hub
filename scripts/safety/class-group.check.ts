import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, type DatabaseFactory } from "./database";
import { populateSummerFixture } from "./fixture";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { classGroupRaces } from "./class-group-races";

/** CRS-01C adds no migration: the current schema plus the synthetic fixture is the whole setup. */
async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [], database = await factory("crs01c class groups");
  try {
    await withHandle(database, async h => { await database.migrate(h); await populateSummerFixture(h.db); });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/class-group-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-7000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await database.dispose(); }
  return lines;
}
export async function checkClassGroups() { return exercise(pgliteFactory); }
export async function checkClassGroupsPostgres(bin: string | undefined) { return withDisposableCluster(bin, async cluster => { const lines = await exercise(factoryFor(cluster)); await classGroupRaces(cluster, lines); return lines; }); }
