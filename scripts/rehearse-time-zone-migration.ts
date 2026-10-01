/**
 * BUG-29 (#29) T-05 rehearsal: migrate a COPY of the institutional PGlite
 * database through 0007 and prove the conversion, then prove a cold backup
 * taken before it restores the pre-migration state (AC-04, AC-05, AC-07).
 *
 *   npx tsx scripts/rehearse-time-zone-migration.ts --writers-stopped
 *
 * The institutional directory is only read (copied), never opened. Everything
 * else happens in owned runs under .tmp/safe-01, which are removed afterwards.
 * The report holds names, counts, time ranges and hashes only, never row data.
 * Embedded PGlite has no lock file, so proving that no writer is active is the
 * operator's job (docs/operations/DATABASE_RECOVERY.md); `--writers-stopped`
 * records that attestation, and the copy is refused if any source file
 * changes while it is taken.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { selectActiveAssignments } from "../src/lib/auth/assignments";
import { DEFAULT_PGLITE_DIR } from "./safety/targets";
import { createOwnedRun, migratePgliteDb, openOwnedPglite, removeOwnedRun, withWriterLock, type OwnedPglite, type OwnedRun } from "./safety/pglite";
import { createColdBackup, inventoryFiles, newBackupLocation, removeBackup, restoreColdBackup } from "./safety/pglite-backup";
import { fingerprintDatabase, fingerprintDifferences, selectFingerprint, type TableFingerprint } from "./safety/fingerprint";
import type { Queryable } from "./safety/database";

const HOUR_MS = 3600_000;

/** Write path of every instant column (docs/specs/BUG-29/plan.md, column classification). */
const APPLICATION_WRITTEN = new Set([
  "portal_users.last_login_at", "role_assignments.active_to",
  "auth_user.created_at", "auth_user.updated_at",
  "auth_session.expires_at", "auth_session.created_at", "auth_session.updated_at",
  "auth_account.access_token_expires_at", "auth_account.refresh_token_expires_at", "auth_account.created_at", "auth_account.updated_at",
  "auth_verification.expires_at", "auth_verification.created_at", "auth_verification.updated_at",
  "external_commitments.last_verified_at", "schedule_versions.published_at",
]);
const MIXED_WITH_CREATED_AT = new Set(["portal_users.updated_at"]);

const rows = async <T>(client: Queryable, query: string, params: unknown[] = []) => (await client.query<T>(query, params)).rows;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function legacyColumns(client: Queryable) {
  return rows<{ table_name: string; column_name: string; data_type: string }>(client, `
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' order by table_name, ordinal_position`);
}

/** id → UTC wall time in ms, for one column, before (session wall time) or after (instant) migration. */
async function columnValues(client: Queryable, table: string, column: string, state: "before" | "after"): Promise<Map<string, number>> {
  const value = state === "before" ? `"${column}"::text` : `("${column}" at time zone 'UTC')::text`;
  const found = await rows<{ k: string; v: string }>(client, `select id::text as k, ${value} as v from "${table}" where "${column}" is not null`);
  return new Map(found.map(({ k, v }) => [k, Date.parse(`${v.replace(" ", "T")}Z`)]));
}

const range = (values: Map<string, number>) => {
  if (!values.size) return "—";
  const sorted = [...values.values()].sort((a, b) => a - b);
  return `${new Date(sorted[0]).toISOString()} … ${new Date(sorted.at(-1)!).toISOString()}`;
};

async function copySource(run: OwnedRun): Promise<number> {
  const source = resolveSource();
  const before = inventoryFiles(source);
  await withWriterLock(run, async () => {
    cpSync(source, run.dataDir, { recursive: true, errorOnExist: true, force: false });
  });
  const after = inventoryFiles(source);
  assert.deepEqual(after, before, "The institutional directory changed while it was copied; a writer is active. Stop it and run again.");
  assert.deepEqual(inventoryFiles(run.dataDir), before, "The copy differs from the source.");
  return before.length;
}

function resolveSource(): string {
  if (process.env.DATABASE_URL || process.env.PGLITE_DATA_DIR) throw new Error("Unset DATABASE_URL and PGLITE_DATA_DIR; this rehearsal copies only the default institutional directory.");
  if (!existsSync(path.join(DEFAULT_PGLITE_DIR, "PG_VERSION"))) throw new Error(`${DEFAULT_PGLITE_DIR} is not a PGlite data directory.`);
  return DEFAULT_PGLITE_DIR;
}

async function withOwned<T>(run: OwnedRun, work: (handle: OwnedPglite) => Promise<T>): Promise<T> {
  const handle = await openOwnedPglite(run);
  try { return await work(handle); } finally { await handle.close(); }
}

async function main() {
  if (!process.argv.includes("--writers-stopped")) {
    throw new Error("Stop the dev server and every other writer of .data/pglite-summer-2026, then pass --writers-stopped.");
  }
  const lines: string[] = [];
  const copy = createOwnedRun("bug29 rehearsal copy");
  const restored = createOwnedRun("bug29 rehearsal restore");
  const backupDir = newBackupLocation("bug29 rehearsal");
  try {
    const files = await copySource(copy);
    lines.push(`Copied ${plural(files, "file")} of the institutional directory into an owned run (source files unchanged during the copy)`);

    // Pre-migration state of the copy.
    type Before = { zone: string; migrations: number; columns: Awaited<ReturnType<typeof legacyColumns>>; values: Map<string, Map<string, number>>; plain: Map<string, TableFingerprint> };
    const before: Before = await withOwned(copy, async ({ client }) => {
      const q = client as unknown as Queryable;
      const zone = (await rows<{ zone: string }>(q, "select current_setting('TimeZone') as zone"))[0].zone;
      const migrations = Number((await rows<{ n: number }>(q, "select count(*)::int as n from drizzle.__drizzle_migrations"))[0].n);
      const columns = await legacyColumns(q);
      const values = new Map<string, Map<string, number>>();
      for (const c of columns.filter((c) => c.data_type.startsWith("timestamp"))) values.set(`${c.table_name}.${c.column_name}`, await columnValues(q, c.table_name, c.column_name, "before"));
      const plain = new Map<string, TableFingerprint>();
      for (const table of new Set(columns.map((c) => c.table_name))) {
        const kept = columns.filter((c) => c.table_name === table && !c.data_type.startsWith("timestamp")).map((c) => `"${c.column_name}"`);
        plain.set(table, await selectFingerprint(q, `select ${kept.join(", ")} from "${table}"`));
      }
      return { zone, migrations, columns, values, plain };
    });
    const legacyTypes = new Set(before.columns.filter((c) => c.data_type.startsWith("timestamp")).map((c) => c.data_type));
    lines.push(`Before: session zone ${before.zone}; ${plural(before.migrations, "migration")} applied; ${before.values.size} time columns, all ${[...legacyTypes].join(", ")}; ${[...before.values.values()].reduce((n, m) => n + m.size, 0)} stored values`);

    // AC-07 (part 1): a cold backup of the pre-migration copy.
    const manifest = await createColdBackup(copy, backupDir);
    lines.push(`Cold backup taken before migrating: ${plural(manifest.fileCount, "file")}, manifest with database fingerprint`);

    // The production migration path: pending migrations, then the RUT-04 grid backfill.
    await withOwned(copy, async (handle) => { await migratePgliteDb(handle.db); });

    await withOwned(copy, async ({ client, db }) => {
      const q = client as unknown as Queryable;
      const migrations = Number((await rows<{ n: number }>(q, "select count(*)::int as n from drizzle.__drizzle_migrations"))[0].n);
      const types = await rows<{ data_type: string; n: number }>(q, `select data_type, count(*)::int as n from information_schema.columns
        where table_schema = 'public' and data_type like 'timestamp%' group by 1 order by 1`);
      assert.deepEqual(types.map((t) => t.data_type), ["timestamp with time zone"], "every instant column is timestamptz");
      lines.push(`After: ${plural(migrations, "migration")} applied; ${types[0].n} time columns, all timestamp with time zone`);

      // AC-04: every pre-existing value moved by exactly its class's correction.
      const zoneOffset = (await rows<{ ms: number }>(q, "select (extract(epoch from now()::timestamp - (now() at time zone 'UTC')) * 1000)::bigint as ms"))[0].ms;
      lines.push(`Conversion per column (default-stamped values read in ${before.zone}, a correction of ${-Number(zoneOffset) / HOUR_MS} h; application values unchanged):`);
      for (const [key, beforeValues] of before.values) {
        const [table, column] = key.split(".");
        const afterValues = await columnValues(q, table, column, "after");
        assert.deepEqual([...afterValues.keys()].sort(), [...beforeValues.keys()].sort(), `${key}: same rows`);
        const createdAt = MIXED_WITH_CREATED_AT.has(key) ? before.values.get(`${table}.created_at`)! : null;
        const shifts = new Map<string, number>();
        for (const [id, wall] of beforeValues) {
          const fromDefault = createdAt ? createdAt.get(id) === wall : !APPLICATION_WRITTEN.has(key);
          const expected = fromDefault ? wall - Number(zoneOffset) : wall;
          assert.equal(afterValues.get(id), expected, `${key} row ${id}: expected ${new Date(expected).toISOString()}`);
          const label = fromDefault ? "default-stamped" : "application";
          shifts.set(label, (shifts.get(label) ?? 0) + 1);
        }
        if (beforeValues.size) {
          lines.push(`  ${key}: ${[...shifts].map(([label, n]) => `${n} ${label}`).join(", ")}; ${range(afterValues)}`);
        }
      }
      const empty = [...before.values].filter(([, values]) => !values.size).length;
      lines.push(`  ${empty} other time columns hold no values`);

      // Nothing but the times changed: row counts and non-time columns of every pre-existing table.
      for (const [table, fingerprint] of before.plain) {
        const kept = before.columns.filter((c) => c.table_name === table && !c.data_type.startsWith("timestamp")).map((c) => `"${c.column_name}"`);
        const now = await selectFingerprint(q, `select ${kept.join(", ")} from "${table}"`);
        assert.deepEqual(now, fingerprint, `${table}: non-time data changed`);
      }
      const newTables = (await rows<{ table_name: string; n: number }>(q, `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' and not (table_name = any($1)) order by 1`, [[...before.plain.keys()]])).map((r) => r.table_name);
      const gridRows = newTables.length ? (await rows<{ n: number }>(q, newTables.map((t) => `select count(*)::int as n from "${t}"`).join(" union all "))).map((r) => r.n) : [];
      lines.push(`Row counts and every non-time column unchanged in all ${before.plain.size} pre-existing tables; new tables from 0006: ${newTables.map((t, i) => `${t} (${gridRows[i]} rows from the grid backfill)`).join(", ") || "none"}`);

      // AC-05: existing grants are in force; a grant made now works at once.
      const holders = await db.selectDistinct({ userId: schema.roleAssignments.userId }).from(schema.roleAssignments);
      const now = new Date();
      let inForce = 0;
      for (const { userId } of holders) inForce += (await selectActiveAssignments(db as never, userId, now)).length;
      const [admin] = await db.select({ userId: schema.roleAssignments.userId }).from(schema.roleAssignments).where(eq(schema.roleAssignments.role, "system_administrator")).limit(1);
      assert.ok(admin, "the copy has a bootstrap administrator");
      assert.ok((await selectActiveAssignments(db as never, admin.userId, now)).some((row) => row.role === "system_administrator"), "administrator role in force");
      const [granted] = await db.insert(schema.roleAssignments).values({ userId: admin.userId, role: "read_only_viewer" }).returning();
      const active = await selectActiveAssignments(db as never, admin.userId, new Date());
      assert.ok(active.some((row) => row.id === granted.id), "a role granted now is in force at once");
      lines.push(`Access: ${plural(inForce, "existing role assignment")} in force for ${plural(holders.length, "user")}, including the bootstrap administrator; a role granted on the copy now is in force at once (start ${Math.round((granted.activeFrom.getTime() - now.getTime()))} ms from now)`);
    });

    // AC-07 (part 2): the backup restores the pre-migration state exactly.
    const restoredReport = await restoreColdBackup(backupDir, restored);
    assert.deepEqual(fingerprintDifferences(manifest.fingerprint, restoredReport.fingerprint), []);
    const migrated = await withOwned(copy, ({ client }) => fingerprintDatabase(client as unknown as Queryable));
    assert.notDeepEqual(fingerprintDifferences(manifest.fingerprint, migrated), [], "the migrated copy differs from the backup");
    const restoredState = await withOwned(restored, async ({ client }) => {
      const q = client as unknown as Queryable;
      return {
        migrations: Number((await rows<{ n: number }>(q, "select count(*)::int as n from drizzle.__drizzle_migrations"))[0].n),
        legacy: Number((await rows<{ n: number }>(q, "select count(*)::int as n from information_schema.columns where table_schema = 'public' and data_type = 'timestamp without time zone'"))[0].n),
      };
    });
    assert.deepEqual(restoredState, { migrations: before.migrations, legacy: before.values.size });
    lines.push(`Restore: the backup verified and restored into a separate run with an identical fingerprint (schema, sequences, every table's rows): ${restoredState.migrations} migrations, ${restoredState.legacy} legacy time columns, as before the migration`);
  } finally {
    for (const run of [copy, restored]) removeOwnedRun(run);
    removeBackup(backupDir);
  }
  lines.push("Removed the copy, the restore and the backup from .tmp/safe-01");
  console.log(lines.join("\n"));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
