import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { databaseTarget, loadDatabaseEnvironment } from "./target";
import { AsyncLocalStorage } from "node:async_hooks";

// Standalone children use Next's supported loader; initialized Next runtimes keep their environment.
loadDatabaseEnvironment();

const target = databaseTarget();
const databaseUrl = target.mode === "postgresql" ? target.url : undefined;

const globalForDb = globalThis as typeof globalThis & {
  __pundraPostgresqlPool?: Pool;
  __pundraPglite?: PGlite;
};

export const databaseMode = databaseUrl ? "postgresql" : "pglite";

let database: NodePgDatabase<typeof schema>;

if (databaseUrl) {
  const pool =
    globalForDb.__pundraPostgresqlPool ??
    new Pool({ connectionString: databaseUrl, max: process.env.VERCEL ? 5 : 10 });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pundraPostgresqlPool = pool;
  }

  database = drizzlePostgres(pool, { schema });
} else {
  // Zero-configuration local development database. Production deployments can
  // keep using a normal PostgreSQL DATABASE_URL without changing application code.
  // Next's build workers each get an isolated in-memory instance; dynamic pages
  // do not need application data while the route manifest is being collected.
  const isBuild = process.env.npm_lifecycle_event === "build";
  const dataDirectory = isBuild
    ? "memory://"
    : (target as Extract<typeof target, { mode: "pglite" }>).directory;
  if (!isBuild && !dataDirectory.startsWith("memory://")) mkdirSync(path.dirname(dataDirectory), { recursive: true });
  const client = globalForDb.__pundraPglite ?? new PGlite(dataDirectory);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pundraPglite = client;
  }

  database = drizzlePglite(client, { schema }) as unknown as NodePgDatabase<typeof schema>;
}

type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
const transactionScope = new AsyncLocalStorage<Transaction>();

/**
 * Term actions enclose their existing readers, guards and audited savepoints in
 * one transaction. The scope is asynchronous-request-local, never process-wide.
 * Outside that scope the original database is used unchanged. Nested transaction
 * calls remain real Drizzle savepoints, so caught domain errors roll back writes.
 */
export function inDatabaseTransaction<T>(tx: Transaction, work: () => Promise<T>): Promise<T> {
  return transactionScope.run(tx, work);
}
/** pg 8.20 deprecates concurrent queries on one client. Keep pool reads
 * parallel, but explicitly sequence lazy reads on a transaction connection. */
export async function databaseReadBatch<T extends readonly (() => unknown)[]>(reads: [...T], forceSerial = false): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const values: unknown[] = [];
  if (forceSerial || transactionScope.getStore()) {
    for (const read of reads) values.push(await read());
  } else values.push(...await Promise.all(reads.map(read => read())));
  return values as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
export const db: typeof database = new Proxy(database, {
  get(target, property) {
    const reader = transactionScope.getStore() ?? target;
    const value = Reflect.get(reader, property, reader);
    return typeof value === "function" ? value.bind(reader) : value;
  },
});
