/** BUG-ATT-MARKS: production attendance actions/loaders on owned synthetic adapters. */
import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, type DatabaseFactory } from "./database";
import { populateSummerFixture } from "./fixture";
import { setAuditInsertFault } from "./faults";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

async function exercise(factory: DatabaseFactory) {
  const database = await factory("attendance_marks");
  try {
    await withHandle(database, async (handle) => {
      await database.migrate(handle);
      await populateSummerFixture(handle.db);
      await setAuditInsertFault(handle, false);
    });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/attendance-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-6000));
    return (child.report as { lines: string[] }).lines;
  } finally { await database.dispose(); }
}

export const checkAttendance = () => exercise(pgliteFactory);
export const checkAttendancePostgres = (bin: string | undefined) => withDisposableCluster(bin, async (cluster) => [
  `Disposable PostgreSQL ${cluster.version}`, ...await exercise(factoryFor(cluster)),
]);
