/**
 * BUG-48 watchdog for one disposable cluster, started detached by
 * `launchWatchdog`: `cluster-watchdog.ts <owner PID> <owned run root> <SAFE01_PG_BIN>`.
 * It exits once the run directory is gone (the owner cleaned up). If the owner
 * process ends first, it stops the cluster with pg_ctl and removes the run.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { CLUSTER_PURPOSE, logCleanup, stopCluster } from "./cluster-control";
import { assertOwnedRun, pidAlive, readRunMarker, removeStaleRun, type OwnedRun } from "./owned-run";

const [ownerArg, root, bin] = process.argv.slice(2);
const owner = Number(ownerArg);
const run: OwnedRun = { root, dataDir: path.join(root ?? "", "pgdata") };
const name = path.basename(root ?? "");

try {
  if (!Number.isInteger(owner) || !bin || !path.isAbsolute(bin)) throw new Error("usage: <owner PID> <run root> <SAFE01_PG_BIN>");
  assertOwnedRun(run);
  if (readRunMarker(root)?.purpose !== CLUSTER_PURPOSE) throw new Error("not a cluster run");
} catch (error) {
  logCleanup(`watchdog: refused ${name}: ${(error as Error).message}`);
  process.exit(2);
}

const timer = setInterval(() => {
  if (!existsSync(root)) {
    clearInterval(timer);
    return;
  }
  if (pidAlive(owner)) return;
  clearInterval(timer);
  try {
    // The owner may have died while pg_ctl was still starting the server: keep watching briefly.
    const stopped = stopCluster(bin, run.dataDir, 3_000);
    removeStaleRun(run);
    logCleanup(`watchdog: owner PID ${owner} ended without cleanup; ${stopped ? "stopped and " : ""}removed ${name}`);
  } catch (error) {
    logCleanup(`watchdog: could not clean ${name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}, 1_000);
