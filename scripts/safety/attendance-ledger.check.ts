import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, type DatabaseFactory } from "./database";
import { populateSpringFixture, populateSummerFixture } from "./fixture";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

async function verify(factory: DatabaseFactory) {
  const database = await factory("att05 ledger");
  try {
    const fixture = await withHandle(database, async handle => {
      await database.migrate(handle);
      const summer = await populateSummerFixture(handle.db);
      const spring = await populateSpringFixture(handle.db, summer);
      return JSON.stringify({ summer, spring });
    });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/attendance-ledger-scenarios.ts"), [fixture]);
    assert.equal(child.status, 0, child.stderr.slice(-8000) || child.stdout.slice(-4000));
    return (child.report as { lines: string[] }).lines;
  } finally { await database.dispose(); }
}

export const checkAttendanceLedger = () => verify(pgliteFactory);
export const checkAttendanceLedgerPostgres = (bin: string | undefined) =>
  withDisposableCluster(bin, cluster => verify(factoryFor(cluster)));
