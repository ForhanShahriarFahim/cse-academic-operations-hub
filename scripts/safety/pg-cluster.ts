/**
 * A disposable PostgreSQL cluster owned by the SAFE-01 harness (T-06). It is
 * initialised inside an owned run under .tmp/safe-01, listens only on
 * 127.0.0.1 on a free port, uses a random per-run password and is stopped and
 * removed afterwards. Client tools come only from the explicit SAFE01_PG_BIN
 * directory; nothing is taken from PATH or PG* variables. BUG-48: the cluster is
 * stopped on every exit path, including a killed harness (see ./cluster-control).
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Pool } from "pg";
import { createOwnedRun, removeOwnedRun, withWriterLock, type OwnedRun } from "./owned-run";
import {
  CLUSTER_PURPOSE, ClusterStopError, launchWatchdog, logCleanup, pgExe, stopCluster, sweepStaleClusters, toolEnv, trackCluster,
} from "./cluster-control";
import { UnsafeTargetError, resolvePostgresTarget, type PostgresTarget } from "./targets";

const TOOLS = ["initdb", "pg_ctl", "pg_dump", "pg_restore", "psql"] as const;
export type PgTool = (typeof TOOLS)[number];
const OWNER = "safe01_owner";

export interface PgCluster {
  bin: string;
  version: string;
  port: number;
  run: OwnedRun;
  tool(name: PgTool): string;
  /** Environment for client tools: password supplied out of band, nothing inherited from PG*. */
  clientEnv(): NodeJS.ProcessEnv;
  createDatabase(name: string): Promise<PostgresTarget>;
  dropDatabase(target: PostgresTarget): Promise<void>;
}

const exe = pgExe;

/** Test hooks for the BUG-48 cleanup group; production checks pass none. */
export interface ClusterOptions {
  /** Start the out-of-process watchdog (default true). */
  watchdog?: boolean;
  /** `pg_ctl start -w -t` seconds (default 60); 0 makes start fail while the server is still starting. */
  startWaitSeconds?: number;
  /** Simulate a stop that cannot be confirmed: the server is left running and the run kept. */
  failStop?: boolean;
  /** Called before `pg_ctl start` with the run, its port and the watchdog PID (if any). */
  onStarting?: (info: { run: OwnedRun; port: number; watchdogPid: number | null }) => void;
}

/** Validate an explicit client-tool directory and return its major.minor version. */
export function resolvePgBin(bin: string | undefined): { bin: string; version: string } {
  if (!bin || !path.isAbsolute(bin)) throw new UnsafeTargetError("Set SAFE01_PG_BIN to the absolute PostgreSQL bin directory.");
  for (const name of TOOLS) if (!existsSync(exe(bin, name))) throw new UnsafeTargetError(`${name} was not found in SAFE01_PG_BIN.`);
  const versions = TOOLS.map((name) => {
    const out = spawnSync(exe(bin, name), ["--version"], { encoding: "utf8" });
    const match = /(\d+\.\d+)/.exec(out.stdout ?? "");
    if (out.status !== 0 || !match) throw new UnsafeTargetError(`Could not read the ${name} version.`);
    return match[1];
  });
  if (new Set(versions).size !== 1) throw new UnsafeTargetError(`PostgreSQL tools have mixed versions: ${versions.join(", ")}.`);
  return { bin, version: versions[0] };
}

function freePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => (start < 55532 ? freePort(start + 1).then(resolve, reject) : reject(new Error("No free port"))));
    probe.listen(start, "127.0.0.1", () => probe.close(() => resolve(start)));
  });
}

function check(result: SpawnSyncReturns<string>, what: string): void {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${what} failed (${result.status}): ${(result.stderr || result.stdout || "").slice(-1500)}`);
}

/** Start a disposable cluster, run `work`, then always stop and remove it. */
export async function withDisposableCluster<T>(
  binInput: string | undefined,
  work: (cluster: PgCluster) => Promise<T>,
  options: ClusterOptions = {},
): Promise<T> {
  const { bin, version } = resolvePgBin(binInput);
  for (const line of sweepStaleClusters(bin)) console.log(`  [cleanup] ${line}`);
  const run = createOwnedRun(CLUSTER_PURPOSE);
  const password = randomBytes(24).toString("base64url");
  const env = () => toolEnv({ PGPASSWORD: password, PGCONNECT_TIMEOUT: "10" });
  let keepRun = false;
  try {
    return await withWriterLock(run, async () => {
      const pwfile = path.join(run.root, "initdb.pw");
      writeFileSync(pwfile, password, { flag: "wx" });
      try {
        check(spawnSync(exe(bin, "initdb"), [
          "-D", run.dataDir, "-U", OWNER, `--pwfile=${pwfile}`, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C", "--no-instructions",
        ], { encoding: "utf8", env: env() }), "initdb");
      } finally {
        rmSync(pwfile, { force: true });
      }
      const port = await freePort(55432);

      // From here on the server may exist, so every exit path must stop it (BUG-48).
      const watchdogPid = options.watchdog === false ? null : launchWatchdog(run, bin);
      options.onStarting?.({ run, port, watchdogPid });
      const release = trackCluster(bin, run.dataDir);
      const stopOrKeep = (failure: unknown, settleMs: number) => {
        try {
          if (options.failStop) throw new ClusterStopError(run.dataDir);
          return stopCluster(bin, run.dataDir, settleMs);
        } catch (stopError) {
          keepRun = true;
          logCleanup(`kept ${path.basename(run.root)}: ${(stopError as Error).message}`);
          throw new Error(`${(stopError as Error).message} Its run directory was kept for inspection.`, { cause: failure ?? stopError });
        } finally {
          release();
        }
      };

      // Start detached with no inherited pipes (pg_ctl would otherwise keep them open on Windows).
      const started = spawnSync(exe(bin, "pg_ctl"), [
        "start", "-D", run.dataDir, "-l", path.join(run.root, "postgres.log"), "-w", "-t", String(options.startWaitSeconds ?? 60),
        "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c timezone=UTC`,
      ], { stdio: "ignore", env: env(), windowsHide: true });
      if (started.error || started.status !== 0) {
        // The run (and its log) is removed afterwards, so the log tail travels with the error.
        const log = path.join(run.root, "postgres.log");
        const tail = existsSync(log) ? readFileSync(log, "utf8").slice(-1500).trim() : "";
        const failure = started.error ?? new Error(`pg_ctl start failed (${started.status})${tail ? `; postgres.log ends:\n${tail}` : ""}`);
        // The postmaster may still be starting after pg_ctl gave up waiting.
        if (stopOrKeep(failure, 10_000)) logCleanup(`failed start: stopped the server pg_ctl gave up on in ${path.basename(run.root)}`);
        throw failure;
      }

      const url = (database: string) =>
        `postgresql://${OWNER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
      const admin = new Pool({ connectionString: url("postgres"), max: 1 });
      const cluster: PgCluster = {
        bin, version, port, run,
        tool: (name) => exe(bin, name),
        clientEnv: env,
        async createDatabase(name) {
          const target = resolvePostgresTarget(url(name), name);
          await admin.query(`create database "${target.database}"`);
          return target;
        },
        async dropDatabase(target) {
          const checked = resolvePostgresTarget(target.url, target.database);
          await admin.query(`drop database if exists "${checked.database}" with (force)`);
        },
      };
      let result: T;
      try {
        try {
          result = await work(cluster);
        } finally {
          await admin.end();
        }
      } catch (error) {
        stopOrKeep(error, 0);
        throw error;
      }
      stopOrKeep(undefined, 0);
      return result;
    });
  } finally {
    if (!keepRun) removeOwnedRun(run);
  }
}
