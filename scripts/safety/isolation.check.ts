/**
 * T-01 (AC-01): target refusal, owned-run lifecycle, pinned child environment
 * and import boundaries. Uses only owned runs under .tmp/safe-01.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import {
  DEFAULT_PGLITE_DIR, REPO_ROOT, SCRATCH_ROOT, UnsafeTargetError,
  assertDistinctLocations, assertDistinctPostgres, assertEmptyDirectoryTarget, describePostgresTarget,
  resolvePgliteTarget, resolvePostgresTarget,
} from "./targets";
import { assertOwnedRun, createOwnedRun, isWriterActive, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { appChildEnv, runAppChild, runUnpinnedChild } from "./app-env";

const refuses = (work: () => unknown, pattern?: RegExp) => assert.throws(work, (error: unknown) =>
  error instanceof UnsafeTargetError && (!pattern || pattern.test(error.message)));
const refusesAsync = (work: () => Promise<unknown>, pattern?: RegExp) => assert.rejects(work, (error: unknown) =>
  error instanceof UnsafeTargetError && (!pattern || pattern.test(error.message)));
const PROBE = path.join(__dirname, "children", "app-db-probe.ts");

function checkPgliteTargets(): void {
  const env = {};
  refuses(() => resolvePgliteTarget(DEFAULT_PGLITE_DIR, env), /protected/);
  refuses(() => resolvePgliteTarget(path.join(REPO_ROOT, ".data"), env), /protected/);
  refuses(() => resolvePgliteTarget(path.join(REPO_ROOT, ".data", "other"), env), /protected/);
  refuses(() => resolvePgliteTarget(path.join(SCRATCH_ROOT, "..", "..", ".data", "pglite-summer-2026"), env), /protected/);
  if (process.platform === "win32") refuses(() => resolvePgliteTarget(DEFAULT_PGLITE_DIR.toUpperCase(), env), /protected/);
  refuses(() => resolvePgliteTarget(".tmp/safe-01/relative", env), /absolute/);
  refuses(() => resolvePgliteTarget("", env), /absolute/);
  refuses(() => resolvePgliteTarget(REPO_ROOT, env), /protected|inside/);
  refuses(() => resolvePgliteTarget(SCRATCH_ROOT, env), /inside/);
  refuses(() => resolvePgliteTarget(path.join(os.tmpdir(), "safe01-outside"), env), /inside/);
  const inherited = path.join(SCRATCH_ROOT, "inherited-configured-dir");
  refuses(() => resolvePgliteTarget(inherited, { PGLITE_DATA_DIR: inherited }), /protected/);
  assert.equal(resolvePgliteTarget("memory://", env), "memory://");
  assert.ok(resolvePgliteTarget(path.join(SCRATCH_ROOT, "runs", "x", "pgdata"), env).endsWith("pgdata"));

  // A junction inside the scratch root must not let a target escape it.
  const outside = mkdtempSync(path.join(os.tmpdir(), "safe01-escape-"));
  const link = path.join(SCRATCH_ROOT, `junction-${process.pid}`);
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  try {
    symlinkSync(outside, link, "junction");
    refuses(() => resolvePgliteTarget(path.join(link, "pgdata"), env), /inside/);
  } finally {
    rmSync(link, { recursive: false, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

function checkLocationRules(): void {
  const base = path.join(SCRATCH_ROOT, "layout", `${process.pid}`);
  refuses(() => assertDistinctLocations(path.join(base, "a"), path.join(base, "a")), /nested/);
  refuses(() => assertDistinctLocations(path.join(base, "a"), path.join(base, "a", "b")), /nested/);
  refuses(() => assertDistinctLocations(path.join(base, "a", "b"), path.join(base, "a")), /nested/);
  assertDistinctLocations(path.join(base, "a"), path.join(base, "ab"));

  mkdirSync(path.join(base, "full"), { recursive: true });
  writeFileSync(path.join(base, "full", "x"), "x");
  writeFileSync(path.join(base, "file"), "x");
  mkdirSync(path.join(base, "empty"), { recursive: true });
  try {
    refuses(() => assertEmptyDirectoryTarget(path.join(base, "full")), /not empty/);
    refuses(() => assertEmptyDirectoryTarget(path.join(base, "file")), /not a directory/);
    assertEmptyDirectoryTarget(path.join(base, "empty"));
    assertEmptyDirectoryTarget(path.join(base, "missing"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function checkPostgresTargets(): void {
  const good = "postgresql://tester:secret@localhost:5433/safe01_source";
  const env = { DATABASE_URL: "postgresql://app:pw@127.0.0.1:5433/safe01_source" };
  refuses(() => resolvePostgresTarget(undefined, undefined, {}), /explicit/);
  refuses(() => resolvePostgresTarget(good, "safe01_source", env), /configured application/);
  refuses(() => resolvePostgresTarget("postgresql://postgres:postgres@127.0.0.1:5432/app_db", "app_db", {}), /safe01_/);
  refuses(() => resolvePostgresTarget("postgresql://u:p@localhost/postgres", "postgres", {}), /safe01_/);
  refuses(() => resolvePostgresTarget("postgresql://u:p@localhost/safe01_Mixed", "safe01_Mixed", {}), /safe01_/);
  refuses(() => resolvePostgresTarget(good, undefined, {}), /Confirm/);
  refuses(() => resolvePostgresTarget(good, "safe01_other", {}), /Confirm/);
  refuses(() => resolvePostgresTarget("mysql://u:p@localhost/safe01_x", "safe01_x", {}), /postgres:\/\//);
  refuses(() => resolvePostgresTarget("not a url", "x", {}), /valid URL/);
  refuses(() => resolvePostgresTarget(`${good}?host=/var/run/postgresql`, "safe01_source", {}), /redirect/);

  const source = resolvePostgresTarget(good, "safe01_source", {});
  const restore = resolvePostgresTarget("postgresql://tester:secret@localhost:5433/safe01_restore", "safe01_restore", {});
  assertDistinctPostgres(source, restore);
  refuses(() => assertDistinctPostgres(source, resolvePostgresTarget("postgres://x:y@127.0.0.1:5433/safe01_source", "safe01_source", {})), /different/);
  assert.equal(describePostgresTarget(source), "postgresql://localhost:5433/safe01_source");
  assert.ok(!describePostgresTarget(source).includes("secret"));
}

async function checkOwnedLifecycle(): Promise<void> {
  const unmarked = path.join(SCRATCH_ROOT, "runs", `unmarked-${process.pid}`);
  mkdirSync(unmarked, { recursive: true });
  try {
    refuses(() => assertOwnedRun({ root: unmarked, dataDir: path.join(unmarked, "pgdata") }), /ownership/);
    writeFileSync(path.join(unmarked, "safe-01-owner.json"), JSON.stringify({ tool: "something-else" }));
    refuses(() => assertOwnedRun({ root: unmarked, dataDir: path.join(unmarked, "pgdata") }), /ownership/);
  } finally {
    rmSync(unmarked, { recursive: true, force: true });
  }

  const run = createOwnedRun("t01 lifecycle");
  refuses(() => assertOwnedRun({ root: run.root, dataDir: path.join(SCRATCH_ROOT, "elsewhere") }), /inside its owned run/);
  const first = await openOwnedPglite(run);
  try {
    assert.equal(isWriterActive(run), true);
    await refusesAsync(() => openOwnedPglite(run), /already active/);
    refuses(() => removeOwnedRun(run), /active writer/);
    await migrateOwned(first);
    await migrateOwned(first); // idempotent reapplication on the same data
  } finally {
    await first.close();
  }
  assert.equal(isWriterActive(run), false);

  // Cold reopen: schema and journal persisted on disk.
  const reopened = await openOwnedPglite(run);
  try {
    const journal = await reopened.db.execute<{ count: number }>(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
    const expected = readdirSync(path.join(REPO_ROOT, "drizzle")).filter((name) => name.endsWith(".sql")).length;
    assert.equal(journal.rows[0].count, expected);
    const tables = await reopened.db.execute<{ count: number }>(sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`);
    assert.ok(tables.rows[0].count > 20);
  } finally {
    await reopened.close();
  }
  removeOwnedRun(run);
}

async function checkChildEnvironment(): Promise<void> {
  const run = createOwnedRun("t01 child env");
  const poisonDir = path.join(run.root, "poison-pglite");
  const cwd = path.join(run.root, "cwd");
  mkdirSync(cwd);
  const poisonUrl = "postgresql://poison:poison@poison.invalid:5432/app_db";
  try {
    // A: without pinning, a .env.local in the working directory silently selects PostgreSQL.
    writeFileSync(path.join(cwd, ".env.local"), `DATABASE_URL=${poisonUrl}\n`);
    const unpinnedEnv = { ...process.env };
    delete unpinnedEnv.DATABASE_URL;
    delete unpinnedEnv.PGLITE_DATA_DIR;
    const hazard = runUnpinnedChild(PROBE, [], unpinnedEnv, cwd);
    assert.equal(hazard.status, 0, hazard.stderr);
    assert.equal(hazard.report?.databaseMode, "postgresql");

    // B: CLI precedence — scripts importing dotenv/config before src/db load .env
    // first, so .env beats .env.local; the Next-style module order is reversed.
    writeFileSync(path.join(cwd, ".env"), "DATABASE_URL=postgresql://u:p@from-dotenv.invalid/a\n");
    writeFileSync(path.join(cwd, ".env.local"), "DATABASE_URL=postgresql://u:p@from-local.invalid/b\n");
    assert.equal(runUnpinnedChild(PROBE, ["--dotenv-first"], unpinnedEnv, cwd).report?.databaseHost, "from-dotenv.invalid");
    assert.equal(runUnpinnedChild(PROBE, [], unpinnedEnv, cwd).report?.databaseHost, "from-local.invalid");

    // C: pinned children ignore poisoned parent variables and dotenv files.
    writeFileSync(path.join(cwd, ".env"), `DATABASE_URL=${poisonUrl}\nPGLITE_DATA_DIR=${poisonDir}\n`);
    writeFileSync(path.join(cwd, ".env.local"), `DATABASE_URL=${poisonUrl}\nPGLITE_DATA_DIR=${poisonDir}\n`);
    const poisonedParent = {
      ...process.env, DATABASE_URL: poisonUrl, PGLITE_DATA_DIR: poisonDir, VERCEL: "1",
      npm_lifecycle_event: "build", PGHOST: "poison.invalid", GOOGLE_CLIENT_ID: "x",
    };
    const env = appChildEnv(run, poisonedParent);
    assert.equal(env.DATABASE_URL, "");
    assert.equal(env.PGLITE_DATA_DIR, run.dataDir);
    assert.equal(env.PGHOST, undefined);
    assert.equal(env.npm_lifecycle_event, "");
    for (const probeCwd of [cwd, REPO_ROOT]) {
      const pinned = await runAppChild(run, PROBE, ["--dotenv-first"], { cwd: probeCwd });
      assert.equal(pinned.status, 0, pinned.stderr);
      assert.equal(pinned.report?.databaseMode, "pglite");
      assert.equal(pinned.report?.pgliteDataDir, run.dataDir);
    }
    assert.ok(readdirSync(run.dataDir).includes("PG_VERSION"));
    assert.ok(!readdirSync(run.root).includes("poison-pglite"));
    assert.equal(isWriterActive(run), false);

    // The pinned child cannot start while another writer holds the run.
    const holder = await openOwnedPglite(run);
    try { await refusesAsync(() => runAppChild(run, PROBE), /already active/); } finally { await holder.close(); }
  } finally {
    removeOwnedRun(run);
  }
}

/** Safety modules must not import the application singleton, preparation scripts or dotenv. */
function checkImportBoundaries(): void {
  const forbidden = /from\s+["'][^"']*(?:@\/db|src\/db(?:\/index)?|src\/db\/(?:migrate|prepare|seed[^"']*))["']|["']dotenv(?:\/config)?["']/;
  const files = readdirSync(__dirname).filter((name) => name.endsWith(".ts")).map((name) => path.join(__dirname, name));
  files.push(path.join(REPO_ROOT, "scripts", "verify-safety.ts"));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const name = path.basename(file);
    const source = readFileSync(file, "utf8");
    assert.ok(!forbidden.test(source), `${name} imports an application database/preparation module`);
  }
}

export async function checkIsolation(): Promise<string[]> {
  checkPgliteTargets();
  checkLocationRules();
  checkPostgresTargets();
  checkImportBoundaries();
  await checkOwnedLifecycle();
  await checkChildEnvironment();
  return [
    "PGlite targets: default/.data/inherited/relative/outside/junction-escape refused; owned scratch paths accepted",
    "Locations: identical/nested refused; non-empty or non-directory restore targets refused",
    "PostgreSQL targets: implicit/configured/non-safe01/unconfirmed/redirecting URLs refused; credentials redacted",
    "Import boundary: safety modules do not import the app database singleton, preparation scripts or dotenv",
    "Owned runs: unmarked directories refused; single writer lock; idempotent migrations persist after cold reopen",
    "Child env: unpinned .env.local hazard and .env-over-.env.local CLI precedence characterised; pinned children stay on the owned run",
  ];
}
