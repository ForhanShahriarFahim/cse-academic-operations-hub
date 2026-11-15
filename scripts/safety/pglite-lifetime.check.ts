/** Duplicate the real bootstrap as compiled server modules, using owned data only. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import ts from "typescript";
import { createOwnedRun, removeOwnedRun, withWriterLock } from "./owned-run";
import { REPO_ROOT } from "./targets";

type Bootstrap = { db: PgliteDatabase & { $client: PGlite } };

export async function checkPgliteLifetime(): Promise<string[]> {
  const run = createOwnedRun("BUG-PGLITE-LIFETIME bootstrap");
  const sourcePath = path.join(REPO_ROOT, "src/db/index.ts");
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const actualRequire = createRequire(sourcePath);
  const clients = new Set<PGlite>();
  const constructed: string[] = [];
  const deniedTarget = path.join(run.root, "must-not-open", "pgdata");
  let directory = run.dataDir;
  let forbidDisk = false;
  class ObservedPglite extends PGlite {
    constructor(selected: string) {
      assert.ok(selected === "memory://" || (!forbidDisk && selected === run.dataDir), "unexpected persistent client construction");
      super(selected);
      constructed.push(selected);
      clients.add(this);
    }
  }
  const loadIn = (context: vm.Context): Bootstrap => {
    const bootstrapModule = { exports: {} };
    const pinnedRequire = (id: string) => {
      if (id === "./target") return {
        loadDatabaseEnvironment() {},
        databaseTarget: () => ({ mode: "pglite", directory, label: directory }),
      };
      if (id === "./schema") return {}; // No application tables are needed for this SQL probe.
      if (id === "@electric-sql/pglite") return { ...actualRequire(id), PGlite: ObservedPglite };
      if (id === "node:fs") return {
        ...actualRequire(id),
        mkdirSync: (...args: Parameters<typeof import("node:fs").mkdirSync>) => {
          assert.ok(!forbidDisk, "build attempted to create a persistent directory");
          assert.equal(args[0], path.dirname(run.dataDir), "refused target attempted a directory write");
          return actualRequire(id).mkdirSync(...args);
        },
      };
      return actualRequire(id);
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename: sourcePath })(pinnedRequire, bootstrapModule, bootstrapModule.exports);
    return bootstrapModule.exports as Bootstrap;
  };
  const realm = (mode: string) => vm.createContext({ process: { env: { NODE_ENV: mode, npm_lifecycle_event: "" } } });
  const count = async (app: Bootstrap) => (await app.db.execute<{ n: number }>(sql`select count(*)::int as n from lifetime_probe`)).rows[0].n;
  try {
    return await withWriterLock(run, async () => {
      const seed = new PGlite(run.dataDir);
      try { await seed.exec("create table lifetime_probe (id integer primary key)"); }
      finally { await seed.close(); }

      const production = realm("production");
      const a = loadIn(production);
      const b = loadIn(production); // A second bootstrap before the first client is ready.
      await Promise.all([a.db.$client.waitReady, b.db.$client.waitReady]);
      assert.ok(a.db.$client === b.db.$client, "production bootstrap copies must share one PGlite client");
      assert.equal(constructed.length, 1);
      await a.db.execute(sql`insert into lifetime_probe values (1)`);
      assert.equal(await count(b), 1);
      await b.db.execute(sql`insert into lifetime_probe values (2)`);
      assert.equal(await count(a), 2);
      await assert.rejects(a.db.transaction(async tx => {
        await tx.execute(sql`insert into lifetime_probe values (3)`);
        throw new Error("rollback probe");
      }), /rollback probe/);
      assert.equal(await count(b), 2);

      directory = deniedTarget;
      assert.throws(() => loadIn(production), /PGlite.*target.*restart/i);
      assert.equal(constructed.length, 1);
      assert.equal(existsSync(path.dirname(deniedTarget)), false);
      assert.equal(await count(a), 2);

      forbidDisk = true;
      production.process.env.npm_lifecycle_event = "build";
      const buildA = loadIn(production);
      const buildB = loadIn(production);
      assert.ok(buildA.db.$client !== buildB.db.$client && buildA.db.$client !== a.db.$client);
      await assert.rejects(buildA.db.execute(sql`select * from lifetime_probe`));
      const freshBuild = realm("production");
      freshBuild.process.env.npm_lifecycle_event = "build";
      const buildC = loadIn(freshBuild);
      assert.ok(buildC.db.$client !== buildB.db.$client);
      assert.deepEqual(constructed.slice(1), ["memory://", "memory://", "memory://"]);
      forbidDisk = false;
      directory = run.dataDir;
      production.process.env.npm_lifecycle_event = "";
      assert.ok(loadIn(production).db.$client === a.db.$client, "build must preserve the runtime client");
      assert.equal(await count(a), 2);

      directory = "memory://";
      for (const mode of ["development", "test"]) {
        const context = realm(mode);
        const first = loadIn(context);
        const second = loadIn(context);
        assert.ok(first.db.$client === second.db.$client, `${mode} must share its runtime client`);
        await first.db.execute(sql`create table lifetime_probe (id integer primary key)`);
        await first.db.execute(sql`insert into lifetime_probe values (1)`);
        assert.equal(await count(second), 1);
      }
      await Promise.all([...clients].map(client => client.close()));
      clients.clear();
      const reopened = new PGlite(run.dataDir);
      try { assert.equal((await reopened.query<{ n: number }>("select count(*)::int as n from lifetime_probe")).rows[0].n, 2); }
      finally { await reopened.close(); }
      return [
        "Production duplicate bootstraps share one client before readiness; alternating writes and rollback agree.",
        "Changed target refused before filesystem/client access; original target stays readable.",
        "Build clients are independent memory stores with a disk-access tripwire; runtime record survives.",
        "Development/test duplicate bootstraps share clients; sequential disk reopen preserves committed rows only.",
      ];
    });
  } finally {
    await Promise.all([...clients].map(client => client.close()));
    removeOwnedRun(run);
  }
}
