import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { databaseTarget, loadDatabaseEnvironment } from "./target";

// CLI migration/seed commands do not inherit Next.js's .env.local loading.
// Existing process variables (including Vercel secrets) always take priority.
loadDatabaseEnvironment();

const target = databaseTarget();
const databaseUrl = target.mode === "postgresql" ? target.url : undefined;
if (process.env.VERCEL && !databaseUrl) {
  throw new Error("DATABASE_URL is required on Vercel; embedded PGlite storage is for local development only.");
}

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

export const db = database;
