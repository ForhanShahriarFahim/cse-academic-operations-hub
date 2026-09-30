/**
 * Adapter-neutral disposable databases for SAFE-01 checks. A check receives a
 * factory and runs identically on an owned PGlite run or on a `safe01_*`
 * database inside the harness-owned PostgreSQL cluster (T-06).
 */
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import { MIGRATIONS_FOLDER, createOwnedRun, migratePgliteDb, openOwnedPglite, removeOwnedRun } from "./pglite";
import { runAppChild, runPostgresChild, type ChildInputs, type ChildResult } from "./app-env";
import type { PostgresTarget } from "./targets";

export type SafetyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The query shape shared by PGlite and node-postgres. */
export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SafetyHandle {
  db: SafetyDb;
  client: Queryable;
  /** Run several statements without parameters. */
  exec(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

export interface SafetyDatabase {
  adapter: "pglite" | "postgresql";
  label: string;
  open(): Promise<SafetyHandle>;
  migrate(handle: SafetyHandle): Promise<void>;
  runChild(script: string, args?: string[], inputs?: ChildInputs): Promise<ChildResult>;
  dispose(): Promise<void>;
}

export type DatabaseFactory = (purpose: string) => Promise<SafetyDatabase>;

export const pgliteFactory: DatabaseFactory = async (purpose) => {
  const run = createOwnedRun(purpose);
  return {
    adapter: "pglite",
    label: `PGlite ${run.root}`,
    async open() {
      const handle = await openOwnedPglite(run);
      return {
        db: handle.db as unknown as SafetyDb,
        client: handle.client as unknown as Queryable,
        exec: async (sqlText) => { await handle.client.exec(sqlText); },
        close: () => handle.close(),
      };
    },
    migrate: (handle) => migratePgliteDb(handle.db as unknown as PgliteDatabase<typeof schema>),
    runChild: (script, args = [], inputs) => runAppChild(run, script, args, { inputs }),
    dispose: async () => removeOwnedRun(run),
  };
};

/** Open a node-postgres pool on a validated disposable target. */
export function openPostgres(target: PostgresTarget): SafetyHandle {
  const pool = new Pool({ connectionString: target.url, max: 2 });
  return {
    db: drizzlePostgres(pool, { schema }) as unknown as SafetyDb,
    client: pool as unknown as Queryable,
    exec: async (sqlText) => { await pool.query(sqlText); },
    close: () => pool.end(),
  };
}

export function postgresDatabase(target: PostgresTarget, dispose: () => Promise<void>): SafetyDatabase {
  return {
    adapter: "postgresql",
    label: `PostgreSQL ${target.database}`,
    open: async () => openPostgres(target),
    async migrate(handle) {
      await migratePostgres(handle.db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    runChild: (script, args = [], inputs) => runPostgresChild(target, script, args, { inputs }),
    dispose,
  };
}

export async function withHandle<T>(database: SafetyDatabase, work: (handle: SafetyHandle) => Promise<T>): Promise<T> {
  const handle = await database.open();
  try { return await work(handle); } finally { await handle.close(); }
}
