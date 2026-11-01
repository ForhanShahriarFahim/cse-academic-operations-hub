/** BUG-24: fresh-process Next parity and pre-connection CLI contracts, synthetic files only. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRun, removeOwnedRun } from "./pglite";
import { REPO_ROOT } from "./targets";
import { reviewEnvironment } from "../ux-review";

const TSX_LOADER = pathToFileURL(path.join(REPO_ROOT, "node_modules/tsx/dist/loader.mjs")).href;
const PROBE = path.join(__dirname, "children/environment-probe.ts");
const entries = {
  "db:prepare": "src/db/prepare.ts", "db:migrate": "src/db/migrate.ts",
  "db:reset": "src/db/seed.ts", "auth:bootstrap": "scripts/bootstrap-admin.ts",
  "db:check-terms": "scripts/check-terms.ts",
};
type Mode = "development" | "production" | "test";

type Environment = Record<string, string | undefined>;

function cleanEnv(): Environment {
  // Keep OS execution context only. No inherited database, auth, Next cache or Node preload.
  const env: Environment = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "COMSPEC", "TEMP", "TMP", "HOME", "USERPROFILE", "PATHEXT"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

export async function checkDatabaseEnvironment(): Promise<string[]> {
  const run = createOwnedRun("bug24 environment");
  const tripwire = path.join(run.root, "no-db.mjs");
  const hooks = path.join(run.root, "no-db-hooks.mjs");
  const importHit = path.join(run.root, "database-import-hit");
  // Verify the actual runtime import boundary, including transitive imports.
  writeFileSync(hooks, `import { writeFileSync } from 'node:fs';
export async function load(url, context, nextLoad) {
  if (url.includes('/src/db/index.ts') || /node_modules\\/(?:pg|@electric-sql\\/pglite)\\//.test(url)) {
    writeFileSync(${JSON.stringify(importHit)}, 'hit');
    throw new Error('BUG24_DATABASE_IMPORT_TRIPWIRE');
  }
  return nextLoad(url, context);
}\n`);
  writeFileSync(tripwire, `import Module, { register } from 'node:module';
import { writeFileSync } from 'node:fs';
register('./no-db-hooks.mjs', import.meta.url);
const original = Module._load;
Module._load = function(request, parent, ...rest) {
  const resolved = Module._resolveFilename(request, parent).replaceAll('\\\\', '/');
  if (resolved.endsWith('/src/db/index.ts') || /node_modules\\/(?:pg|@electric-sql\\/pglite)\\//.test(resolved)) {
    writeFileSync(${JSON.stringify(importHit)}, 'hit');
    throw new Error('BUG24_DATABASE_IMPORT_TRIPWIRE');
  }
  return original.call(this, request, parent, ...rest);
};\n`);
  let cases = 0;
  const execute = (cwd: string, script: string, args: string[], env: Environment = cleanEnv()) => {
    const result = spawnSync(process.execPath, ["--import", TSX_LOADER, "--import", pathToFileURL(tripwire).href, script, ...args], {
      cwd, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 30_000,
    });
    if (result.error) throw result.error;
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const probe = (cwd: string, env: Environment, args: string[] = []) => {
    const result = execute(cwd, PROBE, args, env);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim()) as Record<string, string>;
  };
  const preview = (cwd: string, env: Environment, expected: Record<string, string>) => {
    for (const [command, file] of Object.entries(entries)) {
      const result = execute(cwd, path.join(REPO_ROOT, file), ["--show-target"], env);
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stdout, `Command: ${command}\nEnvironment: ${expected.environment}\nMode: ${expected.mode}\nTarget: ${expected.label}\nPreview only; no database opened.\n`);
      assert.equal(result.stderr, "");
      cases++;
    }
  };
  try {
    const armed = execute(run.root, path.join(REPO_ROOT, entries["db:migrate"]), [], {
      ...cleanEnv(), DATABASE_URL: "", PGLITE_DATA_DIR: "memory://",
    });
    assert.equal(armed.status, 1);
    assert.match(armed.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE/, "tripwire must intercept real execution before testing previews");
    for (const mode of ["development", "production", "test"] as Mode[]) {
      for (const adapter of ["postgresql", "pglite"]) {
        const cwd = path.join(run.root, `${mode}-${adapter}`);
        mkdirSync(cwd);
        const files = [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"];
        for (let tier = 0; tier < files.length; tier++) {
          const marker = `tier${tier}`;
          const target = adapter === "postgresql" ? `postgresql://user:password@${marker}.invalid/fixture` : `./${marker}`;
          writeFileSync(path.join(cwd, files[tier]), `${adapter === "postgresql" ? "DATABASE_URL" : "PGLITE_DATA_DIR"}=${target}\nBUG24_BASE=expanded\nBUG24_EXPANDED=$BUG24_BASE/value\nBUG24_ESCAPED=literal\\$dollar\nBUG24_PIN=hostile\n`);
        }
        const processPins = { ...cleanEnv(), NODE_ENV: mode, DATABASE_URL: "", PGLITE_DATA_DIR: "memory://", BUG24_PIN: "" };
        assert.deepEqual(probe(cwd, processPins), probe(cwd, processPins, ["--next"]));
        assert.equal(probe(cwd, processPins).label, "memory://");
        const postgresPin = { ...processPins, DATABASE_URL: "postgresql://pinned:pin@process.invalid/fixture" };
        assert.equal(probe(cwd, postgresPin).label, "process.invalid:5432/fixture");
        assert.equal(probe(cwd, { ...cleanEnv(), NODE_ENV: mode }, ["--runtime-pinned"]).label, "memory://");
        assert.equal(probe(cwd, { ...processPins, NEXT_RUNTIME: "nodejs" }).expanded, undefined, "Next runtime must not load files again");
        // Remove precedence layers one at a time without modifying the repository's .env files.
        for (let tier = 0; tier < files.length; tier++) {
          const env = { ...cleanEnv(), NODE_ENV: mode, BUG24_PIN: "" };
          const expected = probe(cwd, env, ["--next"]);
          assert.deepEqual(probe(cwd, env), expected);
          assert.equal(expected.pinned, "");
          assert.equal(expected.expanded, "expanded/value");
          assert.equal(expected.escaped, "literal$dollar");
          const winner = mode === "test" && tier === 1 ? 2 : tier;
          assert.equal(expected.label, adapter === "postgresql" ? `tier${winner}.invalid:5432/fixture` : path.resolve(cwd, `tier${winner}`));
          if (tier === 0) {
            preview(cwd, env, expected);
            assert.deepEqual(probe(cwd, env, ["--runtime"]), expected);
          }
          writeFileSync(path.join(cwd, files[tier]), "");
          cases++;
        }
        const pinned = { ...cleanEnv(), NODE_ENV: mode, DATABASE_URL: "", PGLITE_DATA_DIR: "memory://", BUG24_PIN: "" };
        const expected = probe(cwd, pinned, ["--next"]);
        assert.deepEqual(probe(cwd, pinned), expected);
        assert.equal(expected.label, "memory://");
        preview(cwd, pinned, expected);
      }
    }

    const cwd = path.join(run.root, "commands");
    mkdirSync(cwd);
    mkdirSync(path.join(cwd, "src"));
    writeFileSync(path.join(cwd, "src/.env.local"), "DATABASE_URL=postgresql://u:p@wrong.invalid/fixture\n");
    const defaults = probe(cwd, cleanEnv());
    assert.equal(defaults.environment, "development");
    assert.equal(defaults.label, path.join(cwd, ".data/pglite-summer-2026"));
    preview(cwd, cleanEnv(), defaults);
    const directory = path.join(cwd, "never-opened/pgdata");
    const pinned = { ...cleanEnv(), DATABASE_URL: "", PGLITE_DATA_DIR: directory, VERCEL: "" };
    const expected = probe(cwd, pinned);
    preview(cwd, pinned, expected);
    const imports = execute(cwd, PROBE, ["--imports"], pinned);
    assert.equal(imports.status, 0, imports.stderr);
    assert.match(imports.stdout, /^Helpers imported/);

    for (const [command, file] of Object.entries(entries)) {
      // Actual execution must hit the armed tripwire only AFTER the identical banner.
      const args = command === "db:reset" ? ["--confirm", directory] : [];
      if (existsSync(importHit)) unlinkSync(importHit);
      const result = execute(cwd, path.join(REPO_ROOT, file), args, pinned);
      assert.equal(result.status, 1);
      assert.ok(existsSync(importHit), `${command}: actual driver import intercepted`);
      if (command === "db:check-terms") {
        assert.match(result.stderr, /Term diagnostic failed/);
        assert.doesNotMatch(result.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE/);
      } else assert.match(result.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE/);
      assert.equal(result.stdout, `Command: ${command}\nEnvironment: development\nMode: pglite\nTarget: ${directory}\n`);

      for (const env of [
        { ...pinned, NODE_ENV: "invalid-secret-marker" },
        { ...pinned, DATABASE_URL: "postgresql://secret-user:secret-password@" },
        { ...pinned, DATABASE_URL: "mysql://secret-user:secret-password@db.invalid/fixture" },
        { ...pinned, DATABASE_URL: "postgresql://u:p@db.invalid/%ZZ" },
        { ...pinned, VERCEL: "1" },
      ]) {
        const invalid = execute(cwd, path.join(REPO_ROOT, file), ["--show-target"], env);
        assert.equal(invalid.status, 1);
        assert.doesNotMatch(invalid.stdout + invalid.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE|invalid-secret-marker|secret-user|secret-password|%ZZ/);
      }
      const secrets = { ...pinned, DATABASE_URL: "postgresql://secret%40user:secret%2Fpassword@unreachable.invalid:59999/fixture?password=secret-query&token=secret-token", BETTER_AUTH_SECRET: "secret-auth", PORTAL_BOOTSTRAP_ADMIN_EMAIL: "" };
      const redacted = execute(cwd, path.join(REPO_ROOT, file), command === "db:check-terms" ? ["--show-target"] : ["--show-target", "--password", "--reset-link"], secrets);
      assert.equal(redacted.status, 0, redacted.stderr);
      assert.match(redacted.stdout, /Target: unreachable.invalid:59999\/fixture/);
      assert.doesNotMatch(redacted.stdout + redacted.stderr, /secret|Setup link|Reset link/);
    }

    const lifecycleCwd = path.join(run.root, "lifecycle");
    mkdirSync(lifecycleCwd);
    for (const [lifecycle, mode] of [["predev", "development"], ["prestart", "production"]] as const) {
      writeFileSync(path.join(lifecycleCwd, `.env.${mode}.local`), `DATABASE_URL=postgresql://u:p@${mode}.invalid/fixture\n`);
      const lifecycleEnv = { ...cleanEnv(), npm_lifecycle_event: lifecycle };
      const file = path.join(REPO_ROOT, entries["db:prepare"]);
      const result = execute(lifecycleCwd, file, ["--show-target"], lifecycleEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Environment: ${mode}`));
      assert.match(result.stdout, new RegExp(`Target: ${mode}.invalid:5432/fixture`));
      const contradictory = execute(lifecycleCwd, file, [], { ...lifecycleEnv, NODE_ENV: "test" });
      assert.equal(contradictory.status, 1);
      assert.match(contradictory.stderr, /contradictory NODE_ENV/);
      assert.doesNotMatch(contradictory.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE/);
    }
    for (const args of [[], ["--confirm"], ["--confirm", "wrong"]]) {
      const result = execute(cwd, path.join(REPO_ROOT, entries["db:reset"]), args, pinned);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Nothing was changed/);
      assert.doesNotMatch(result.stderr, /BUG24_DATABASE_IMPORT_TRIPWIRE/);
    }
    const refused = execute(cwd, path.join(REPO_ROOT, entries["db:reset"]), ["--confirm", defaults.label], cleanEnv());
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Refused: this is the default directory/);
    assert.ok(!existsSync(path.join(cwd, ".data")));
    assert.ok(!existsSync(path.dirname(directory)));

    // Review pinning overrides hostile parent targets and every synthetic mode file.
    const review = reviewEnvironment(directory, { secret: "synthetic-secret", token: "t", cookie: "c", teacherToken: "u", teacherCookie: "d" });
    const reviewEnv = { ...cleanEnv(), ...Object.fromEntries(Object.entries(review).filter(([key]) => /^(DATABASE_URL|PGLITE_DATA_DIR|BETTER_AUTH_|GOOGLE_|VERCEL|npm_lifecycle_event)/.test(key))), NODE_ENV: "development" };
    writeFileSync(path.join(cwd, ".env.development.local"), "DATABASE_URL=postgresql://poison:poison@poison.invalid/fixture\nPGLITE_DATA_DIR=./poison\n");
    assert.equal(probe(cwd, reviewEnv).label, directory);
    return [
      `${cases} precedence/preview cases: development, production, test, both adapters, process empty pins, expansion and escaping match fresh installed Next-loader processes`,
      "All five previews open nothing; armed import tripwire and owned-file marker confirm execution prints the identical banner before client import, including safely masked diagnostic failures; helper imports execute no commands",
      "Default and lifecycle modes, contradictory/invalid modes, Vercel requirement, invalid URL redaction, credential/query/auth-token omission and no-email bootstrap preview verified",
      "Missing/wrong reset confirmation and institutional-directory refusal precede import; preview does not waive refusal; review environment remains pinned against hostile files",
    ];
  } finally {
    removeOwnedRun(run);
  }
}
