/**
 * Production modules open the database singleton in `src/db/index.ts`, which
 * reads DATABASE_URL/PGLITE_DATA_DIR from the process and from .env/.env.local.
 * SAFE-01 therefore runs them only in child processes whose environment pins an
 * owned PGlite run. Keys that exist (even empty) are never overridden by dotenv.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, resolvePgliteTarget, type EnvironmentView } from "./targets";
import { assertOwnedRun, withWriterLock, type OwnedRun } from "./pglite";

const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

/** Variables that could redirect the application database, auth provider or build-time mode. */
const PINNED_EMPTY = [
  "DATABASE_URL", "VERCEL", "npm_lifecycle_event",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
  "PORTAL_BOOTSTRAP_ADMIN_EMAIL", "PORTAL_BOOTSTRAP_ADMIN_NAME",
];

export function appChildEnv(run: OwnedRun, base: EnvironmentView = process.env): EnvironmentView {
  assertOwnedRun(run);
  const env: EnvironmentView = {};
  for (const [key, value] of Object.entries(base)) {
    // libpq-style PG* variables are dropped rather than trusted.
    if (!/^PG/i.test(key) && !/^(npm_|SAFE01_)/i.test(key)) env[key] = value;
  }
  for (const key of PINNED_EMPTY) env[key] = "";
  env.PGLITE_DATA_DIR = resolvePgliteTarget(run.dataDir, base);
  env.NODE_ENV = "test";
  env.SAFE01_CHILD = "1";
  return env;
}

export interface ChildResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Last stdout line parsed as JSON, when present. */
  report: Record<string, unknown> | null;
}

function lastJsonLine(stdout: string): Record<string, unknown> | null {
  const line = stdout.trim().split(/\r?\n/).at(-1);
  try { return line ? JSON.parse(line) : null; } catch { return null; }
}

function spawnTsx(script: string, args: string[], env: EnvironmentView, cwd: string): ChildResult {
  const result = spawnSync(process.execPath, [TSX_CLI, script, ...args], { cwd, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 120_000 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report: lastJsonLine(result.stdout) };
}

/** Run a production-path child against the owned run while holding its writer lock. */
export function runAppChild(run: OwnedRun, script: string, args: string[] = [], cwd = REPO_ROOT): Promise<ChildResult> {
  return withWriterLock(run, async () => spawnTsx(script, args, appChildEnv(run), cwd));
}

/**
 * Characterisation only: run a child with a caller-supplied environment to show
 * what happens without pinning. Never point it at a database it could reach.
 */
export function runUnpinnedChild(script: string, args: string[], env: EnvironmentView, cwd: string): ChildResult {
  return spawnTsx(script, args, env, cwd);
}
