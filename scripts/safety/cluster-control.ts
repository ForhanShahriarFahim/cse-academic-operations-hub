/**
 * Lifetime control for SAFE-01 disposable PostgreSQL clusters (BUG-48).
 *
 * On Windows `pg_ctl start` launches the postmaster through `cmd /C` and exits,
 * so the server is no longer a descendant of the harness. A harness killed
 * outright (TerminateProcess from `timeout`, `taskkill /F`, a tool timeout)
 * runs no `finally`, exit or signal handler. Three layers therefore stop a
 * cluster: the in-process path with signal/exit hooks, a detached watchdog that
 * outlives a killed owner, and a sweep of stale owned cluster runs before each
 * new cluster. Every stop is `pg_ctl stop` on an owned data directory; nothing
 * kills postgres by PID or image name.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, SCRATCH_ROOT, resolvePgliteTarget } from "./targets";
import { assertOwnedRun, pidAlive, readRunMarker, removeStaleRun, runOwnerPids, type OwnedRun } from "./owned-run";

export const CLUSTER_PURPOSE = "t06 postgres cluster";
export const CLEANUP_LOG = path.join(SCRATCH_ROOT, "cluster-cleanup.log");
const WATCHDOG_SCRIPT = path.join(__dirname, "cluster-watchdog.ts");

export const pgExe = (bin: string, name: string) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);

/** The process environment without libpq PG* variables, so no tool is redirected. */
export function toolEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const clean: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^PG/i.test(key)) clean[key] = value;
  return { ...clean, ...extra } as unknown as NodeJS.ProcessEnv;
}

export class ClusterStopError extends Error {
  constructor(readonly dataDir: string) {
    super(`The disposable cluster at ${dataDir} is still running after pg_ctl stop (fast, then immediate).`);
    this.name = "ClusterStopError";
  }
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** `pg_ctl status` exits 0 only while a postmaster serves this data directory (3: stopped, 4: no directory). */
export function clusterRunning(bin: string, dataDir: string): boolean {
  const status = spawnSync(pgExe(bin, "pg_ctl"), ["status", "-D", dataDir], { stdio: "ignore", env: toolEnv(), windowsHide: true });
  if (status.error) throw status.error;
  return status.status === 0;
}

/**
 * Stop the cluster on `dataDir` if it is running: fast shutdown, then
 * immediate. `settleMs` keeps watching for a server that is still starting (a
 * failed `pg_ctl start -w`, or an owner killed mid-start). Returns whether a
 * server was found; throws ClusterStopError if one is still running.
 */
export function stopCluster(bin: string, dataDir: string, settleMs = 0): boolean {
  const deadline = Date.now() + settleMs;
  let found = false;
  for (;;) {
    if (clusterRunning(bin, dataDir)) {
      found = true;
      for (const mode of ["fast", "immediate"]) {
        spawnSync(pgExe(bin, "pg_ctl"), ["stop", "-D", dataDir, "-m", mode, "-w", "-t", "30"], { stdio: "ignore", env: toolEnv(), windowsHide: true });
        if (!clusterRunning(bin, dataDir)) break;
      }
      if (clusterRunning(bin, dataDir)) throw new ClusterStopError(dataDir);
    }
    if (Date.now() >= deadline) return found;
    sleepSync(250);
  }
}

export function logCleanup(line: string): void {
  try {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    appendFileSync(CLEANUP_LOG, `${new Date().toISOString()} [${process.pid}] ${line}\n`);
  } catch {
    // The log is evidence only; cleanup itself must not fail on it.
  }
}

// --- In-process: interrupts and early exits stop every active cluster. ---

const active = new Map<string, string>(); // data directory -> SAFE01_PG_BIN
const SIGNALS: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] : ["SIGINT", "SIGTERM", "SIGHUP"];

function stopActive(reason: string): void {
  for (const [dataDir, bin] of active) {
    try {
      if (stopCluster(bin, dataDir)) logCleanup(`${reason}: stopped ${path.basename(path.dirname(dataDir))}`);
    } catch (error) {
      logCleanup(`${reason}: ${(error as Error).message}`); // the watchdog and the next sweep remain
    }
  }
  active.clear();
}

const onExit = () => stopActive("exit");
function onSignal(signal: NodeJS.Signals): void {
  stopActive(signal);
  process.exit(128 + (os.constants.signals[signal] ?? 1));
}

/** Stop this cluster if the process is interrupted or exits before its own cleanup; returns the release. */
export function trackCluster(bin: string, dataDir: string): () => void {
  if (active.size === 0) {
    process.on("exit", onExit);
    for (const signal of SIGNALS) process.on(signal, onSignal);
  }
  active.set(dataDir, bin);
  return () => {
    if (!active.delete(dataDir) || active.size > 0) return;
    process.off("exit", onExit);
    for (const signal of SIGNALS) process.off(signal, onSignal);
  };
}

// --- Out of process: a watchdog that survives a killed owner. ---

/**
 * Start the watchdog for `run` and return its PID. A short-lived intermediate
 * process launches it detached and exits, so the watchdog is not a descendant
 * of this process and a tree kill of the run (taskkill /T) cannot reach it.
 */
export function launchWatchdog(run: OwnedRun, bin: string): number {
  assertOwnedRun(run);
  const launcher = [
    "const child = require('node:child_process').spawn(process.execPath, process.argv.slice(1),",
    "  { detached: true, stdio: 'ignore', windowsHide: true });",
    "child.unref(); process.stdout.write(String(child.pid));",
  ].join("\n");
  const launched = spawnSync(process.execPath, ["-e", launcher, "--", "--import", "tsx", WATCHDOG_SCRIPT, String(process.pid), run.root, bin], {
    cwd: REPO_ROOT, env: toolEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 15_000,
  });
  const pid = Number(launched.stdout);
  if (launched.status !== 0 || !Number.isInteger(pid) || pid <= 0) throw new Error("Could not start the BUG-48 cluster watchdog.");
  return pid;
}

// --- Before each cluster: sweep stale owned cluster runs. ---

/**
 * Stop and remove cluster runs under .tmp/safe-01/runs whose owner is gone.
 * Only runs with a SAFE-01 marker for a T-06 cluster are considered; a run whose
 * owner PID is alive is reported and left alone. Returns report lines.
 */
export function sweepStaleClusters(bin: string): string[] {
  const runsDir = path.join(SCRATCH_ROOT, "runs");
  if (!existsSync(runsDir)) return [];
  const lines: string[] = [];
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const name = entry.name;
    let run: OwnedRun;
    try {
      const root = resolvePgliteTarget(path.join(runsDir, name));
      run = { root, dataDir: path.join(root, "pgdata") };
      if (readRunMarker(run.root)?.purpose !== CLUSTER_PURPOSE) continue;
      assertOwnedRun(run);
    } catch (error) {
      if (readRunMarker(path.join(runsDir, name))?.purpose === CLUSTER_PURPOSE) lines.push(`Refused ${name}: ${(error as Error).message}`);
      continue;
    }
    const alive = runOwnerPids(run).filter(pidAlive);
    if (alive.length > 0) {
      lines.push(`Skipped ${name}: owner PID ${alive.join(", ")} is still running`);
      continue;
    }
    try {
      const stopped = stopCluster(bin, run.dataDir);
      removeStaleRun(run);
      const line = `${stopped ? "Stopped and removed" : "Removed"} stale cluster run ${name}`;
      logCleanup(`sweep: ${line}`);
      lines.push(line);
    } catch (error) {
      logCleanup(`sweep: ${name}: ${(error as Error).message}`);
      lines.push(`Could not clean ${name}: ${(error as Error).message}`);
    }
  }
  return lines;
}
