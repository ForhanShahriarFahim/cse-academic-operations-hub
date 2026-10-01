/**
 * BUG-48: a disposable PostgreSQL cluster never outlives its safety run. Each
 * case maps to an acceptance criterion in docs/specs/BUG-48/spec.md. Killed
 * runs are reproduced with a child process killed the way `timeout` and tool
 * timeouts kill it (TerminateProcess of the whole tree on Windows).
 */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { CLEANUP_LOG, CLUSTER_PURPOSE, clusterRunning, stopCluster, sweepStaleClusters } from "./cluster-control";
import { createOwnedRun, pidAlive, removeOwnedRun, type OwnedRun } from "./owned-run";
import { withDisposableCluster } from "./pg-cluster";
import { REPO_ROOT, SCRATCH_ROOT } from "./targets";

const HOLDER = path.join(__dirname, "children", "cluster-holder.ts");
const RUNS = path.join(SCRATCH_ROOT, "runs");
const INJECTED = "BUG-48 injected work failure";

interface Held { root: string; dataDir: string; port: number; watchdogPid: number | null }
interface Holder { child: ChildProcess; held: Held; exited: Promise<number | null> }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** Wait until `done` holds; returns the seconds it took. */
async function waitFor(what: string, ms: number, done: () => boolean | Promise<boolean>): Promise<string> {
  const started = Date.now();
  while (!(await done())) {
    if (Date.now() - started > ms) throw new Error(`Timed out after ${ms / 1000} s waiting for ${what}.`);
    await sleep(250);
  }
  return ((Date.now() - started) / 1000).toFixed(1);
}

/** The cluster is gone: no server for its data directory, nothing on its port. */
async function clusterGone(bin: string, held: { dataDir: string; port: number }): Promise<boolean> {
  return !clusterRunning(bin, held.dataDir) && !(await listening(held.port));
}

function startHolder(bin: string, args: string[]): Promise<Holder> {
  const child = spawn(process.execPath, ["--import", "tsx", HOLDER, bin, ...args], {
    cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error("The holder's cluster did not start within 90 s.")), 90_000);
    child.stdout!.on("data", (chunk) => {
      out += chunk;
      const line = out.split(/\r?\n/).find((candidate) => candidate.startsWith("HELD "));
      if (line) { clearTimeout(timer); resolve({ child, held: JSON.parse(line.slice(5)), exited }); }
    });
    child.stderr!.on("data", (chunk) => { err += chunk; });
    exited.then((code) => { clearTimeout(timer); reject(new Error(`The holder exited (${code}) before its cluster started: ${err.slice(-800)}`)); });
  });
}

/** Kill as `timeout`/tool timeouts do: no handler, no finally (the whole tree on Windows). */
async function killHard(holder: Holder): Promise<void> {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(holder.child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else holder.child.kill("SIGKILL");
  await holder.exited;
}

const runName = (root: string) => path.basename(root);

/** AC-01: a killed run's cluster is stopped by the watchdog and its run removed. */
async function killedRun(bin: string): Promise<string> {
  const holder = await startHolder(bin, ["wait"]);
  const { held } = holder;
  assert.ok(clusterRunning(bin, held.dataDir) && (await listening(held.port)), "the holder's cluster is serving");
  assert.ok(held.watchdogPid && pidAlive(held.watchdogPid), "the watchdog is running");
  await killHard(holder);
  const seconds = await waitFor("the watchdog to stop the killed run's cluster", 15_000,
    async () => (await clusterGone(bin, held)) && !existsSync(held.root));
  await waitFor("the watchdog to exit", 10_000, () => !pidAlive(held.watchdogPid!));
  assert.match(readFileSync(CLEANUP_LOG, "utf8"), new RegExp(`watchdog: owner PID \\d+ ended without cleanup; stopped and removed ${runName(held.root)}`));
  return `Killed run (process tree terminated, as by \`timeout\`): the watchdog stopped the cluster and removed the run in ${seconds} s, then exited`;
}

/** AC-02: without the watchdog the cluster survives a kill; the sweep stops it and skips live owners. */
async function sweep(bin: string): Promise<string> {
  const holder = await startHolder(bin, ["wait", "--no-watchdog"]);
  const { held } = holder;
  await killHard(holder);
  await sleep(3_000);
  assert.ok(clusterRunning(bin, held.dataDir), "a killed run without the watchdog leaves its cluster running (the reported incident)");
  const live = createOwnedRun(CLUSTER_PURPOSE); // its owner, this process, is alive
  try {
    const lines = sweepStaleClusters(bin);
    assert.ok(lines.includes(`Stopped and removed stale cluster run ${runName(held.root)}`), lines.join("\n"));
    assert.ok(lines.some((line) => line.startsWith(`Skipped ${runName(live.root)}: owner PID ${process.pid}`)), lines.join("\n"));
    assert.ok(await clusterGone(bin, held));
    assert.ok(!existsSync(held.root));
    assert.ok(existsSync(live.root));
  } finally {
    removeOwnedRun(live);
  }
  return "Sweep: without the watchdog a killed run's cluster kept running (reproducing the incident); the next sweep stopped it and removed the run, and skipped a run whose owner is alive";
}

/** AC-03: work that throws still stops and removes the cluster, and the caller gets the original error. */
async function thrown(bin: string): Promise<string> {
  let seen: { run: OwnedRun; port: number } | undefined;
  await assert.rejects(withDisposableCluster(bin, async (cluster) => {
    seen = { run: cluster.run, port: cluster.port };
    throw new Error(INJECTED);
  }, { watchdog: false }), (error: Error) => error.message === INJECTED);
  assert.ok(seen && !existsSync(seen.run.root) && !(await listening(seen.port)));
  return "Thrown error: the cluster is stopped and removed in-process; the original error reaches the caller";
}

/** AC-04: pg_ctl gives up waiting while the server is still starting; the server is still stopped. */
async function failedStart(bin: string): Promise<string> {
  let info: { run: OwnedRun; port: number } | undefined;
  await assert.rejects(withDisposableCluster(bin, async () => assert.fail("work must not run"), {
    watchdog: false, startWaitSeconds: 0, onStarting: ({ run, port }) => { info = { run, port }; },
  }), /pg_ctl start failed/);
  assert.ok(info && !existsSync(info.run.root));
  assert.ok(!(await listening(info.port)));
  assert.match(readFileSync(CLEANUP_LOG, "utf8"), new RegExp(`failed start: stopped the server pg_ctl gave up on in ${runName(info.run.root)}`));
  return "Failed start: `pg_ctl start -t 0` gave up while the postmaster was starting; that server was found, stopped and the run removed";
}

/** AC-05: a stop that cannot be confirmed keeps the run and names it, with the original error as cause. */
async function failedStop(bin: string): Promise<string> {
  let kept: { run: OwnedRun; port: number } | undefined;
  const error = await withDisposableCluster(bin, async (cluster) => {
    kept = { run: cluster.run, port: cluster.port };
    throw new Error(INJECTED);
  }, { watchdog: false, failStop: true }).then(() => assert.fail("expected a stop failure"), (caught: Error) => caught);
  assert.ok(kept);
  try {
    assert.ok(error.message.includes(kept.run.dataDir) && /kept for inspection/.test(error.message), error.message);
    assert.equal((error.cause as Error)?.message, INJECTED);
    assert.ok(existsSync(kept.run.root) && clusterRunning(bin, kept.run.dataDir));
  } finally {
    stopCluster(bin, kept.run.dataDir);
    removeOwnedRun(kept.run);
  }
  return "Failed stop (simulated): the run directory is kept, the error names its data directory and carries the original error as cause";
}

/** AC-06: SIGINT and process.exit in the middle of a run stop the cluster before the process ends. */
async function interrupted(bin: string): Promise<string> {
  const results: string[] = [];
  for (const [mode, code] of [["sigint", 130], ["exit", 3]] as const) {
    const holder = await startHolder(bin, [mode, "--no-watchdog"]);
    assert.equal(await holder.exited, code, `${mode} exit code`);
    assert.ok(await clusterGone(bin, holder.held), `${mode}: the cluster was stopped by the harness itself`);
    // The process ended without its finally blocks, so only the run directory is left for the sweep.
    assert.ok(sweepStaleClusters(bin).includes(`Removed stale cluster run ${runName(holder.held.root)}`));
    results.push(`${mode} → exit ${code}`);
  }
  return `Interrupts: ${results.join(", ")}; each stopped its cluster before exiting (SIGINT through the handler, as a console Ctrl+C would; Windows cannot send a catchable SIGINT to a child)`;
}

/** AC-07: the sweep ignores unmarked directories and refuses junction escapes. */
function boundaries(bin: string): string {
  mkdirSync(RUNS, { recursive: true });
  const unmarked = path.join(RUNS, `bug48-unmarked-${process.pid}`);
  mkdirSync(path.join(unmarked, "pgdata"), { recursive: true });
  const outside = mkdtempSync(path.join(os.tmpdir(), "bug48-escape-"));
  writeFileSync(path.join(outside, "safe-01-owner.json"), JSON.stringify({ tool: "SAFE-01", purpose: CLUSTER_PURPOSE, pid: 0 }));
  const link = path.join(RUNS, `bug48-junction-${process.pid}`);
  symlinkSync(outside, link, "junction");
  try {
    const lines = sweepStaleClusters(bin);
    assert.ok(!lines.some((line) => line.includes(path.basename(unmarked))), lines.join("\n"));
    assert.ok(lines.some((line) => line.startsWith(`Refused ${path.basename(link)}`)), lines.join("\n"));
    assert.ok(existsSync(path.join(unmarked, "pgdata")) && existsSync(path.join(outside, "safe-01-owner.json")));
  } finally {
    rmSync(link, { recursive: false, force: true });
    rmSync(unmarked, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
  return "Boundaries: unmarked run directories are ignored and a junction escaping the scratch root is refused; neither is touched";
}

export async function checkClusterCleanup(bin: string | undefined): Promise<string[]> {
  if (!bin) throw new Error("SAFE01_PG_BIN is required.");
  return [
    await killedRun(bin),
    await sweep(bin),
    await thrown(bin),
    await failedStart(bin),
    await failedStop(bin),
    await interrupted(bin),
    boundaries(bin),
  ];
}
