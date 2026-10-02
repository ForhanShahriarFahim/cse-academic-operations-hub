/**
 * TCH-01 (#4) safety group: teacher records on owned disposable databases
 * (PGlite, and PostgreSQL with SAFE01_PG_BIN). Covers AC-02 to AC-08, AC-11
 * and AC-12 in docs/specs/TCH-01/spec.md. The actions run in a pinned child
 * with the real loaders, guards and transactions.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { pgliteFactory, withHandle, type DatabaseFactory, type SafetyDatabase } from "./database";
import { MIGRATIONS_FOLDER, createOwnedRun, removeOwnedRun } from "./pglite";
import { populateSummerFixture } from "./fixture";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const SCENARIOS = path.join(REPO_ROOT, "scripts", "safety", "children", "teacher-scenarios.ts");
const LAST_BEFORE_TCH01 = 8; // 0008_account-sign-in

async function using<T>(database: SafetyDatabase, work: () => Promise<T>): Promise<T> {
  try { return await work(); } finally { await database.dispose(); }
}

async function scenarios(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("tch01 scenarios");
  await using(database, async () => {
    await withHandle(database, async (handle) => {
      await database.migrate(handle);
      const fixture = await populateSummerFixture(handle.db);
      const [coordinator] = await handle.db.insert(schema.portalUsers).values({ email: "coordinator@example.invalid", displayName: "Synthetic Coordinator", status: "active" }).returning();
      await handle.db.insert(schema.roleAssignments).values({ userId: coordinator.id, role: "routine_coordinator", departmentId: fixture.departmentIds.cse, grantedByUserId: fixture.adminUserId });
    });
    const result = await database.runChild(SCENARIOS, ["all", "admin@example.invalid", "coordinator@example.invalid", "teacher-a@example.invalid"]);
    assert.equal(result.status, 0, result.stderr.slice(-4000) || result.stdout.slice(-2000));
    lines.push(...(result.report as { lines: string[] }).lines);
  });
}

/** AC-12: a populated database at 0008 keeps every teacher through 0009; placeholders lose only their pseudo employment type. */
async function upgrade(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("tch01 upgrade");
  const scratch = createOwnedRun("tch01 migrations to 0008");
  await using(database, async () => {
    try {
      const folder = path.join(scratch.root, "drizzle-0008");
      mkdirSync(path.join(folder, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
      journal.entries = journal.entries.filter((entry) => entry.idx <= LAST_BEFORE_TCH01);
      for (const entry of journal.entries) copyFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
      writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));

      await withHandle(database, async (handle) => {
        await database.migrateFrom(handle, folder);
        const { client, db } = handle;
        // Rows written with the 0008 column list, as the Summer 2026 import stores them.
        await client.query(`insert into departments (code, name) values ('CSE', 'Computer Science & Engineering'), ('MATH', 'Mathematics')`);
        const rows: Array<[string, string, string, string, string | null]> = [
          ["AKX", "Synthetic Teacher", "full_time", "active", "+000-0000-0001"],
          ["UT", "Upcoming Teacher", "vacancy", "vacancy", "+000-0000-0002"],
          ["SIX", "Unresolved teacher (SIX)", "unresolved", "unresolved", null],
        ];
        for (const [code, name, employment, status, phone] of rows) {
          await client.query(`insert into teachers (short_code, full_name, employment_type, status, phone_private, home_department_id) select $1, $2, $3, $4, $5, id from departments where code = 'CSE'`, [code, name, employment, status, phone]);
        }
        const columns = "id, short_code, full_name, designation, home_department_id, email, phone_private, status, notes";
        const before = await client.query<Record<string, unknown>>(`select ${columns} from teachers order by id`);

        await database.migrate(handle);
        const after = await client.query<Record<string, unknown>>(`select ${columns} from teachers order by id`);
        assert.deepEqual(after.rows, before.rows, "every teacher field is unchanged");
        const extra = await client.query<{ short_code: string; employment_type: string | null; advisory_load_units: string | null; updated_at: Date | null }>(`select short_code, employment_type, advisory_load_units, updated_at from teachers order by id`);
        assert.deepEqual(extra.rows.map((row) => [row.short_code, row.employment_type, row.advisory_load_units]), [["AKX", "full_time", null], ["UT", null, null], ["SIX", null, null]]);
        assert.ok(extra.rows.every((row) => row.updated_at != null));
        await assert.rejects(client.query(`update teachers set status = 'retired' where short_code = 'AKX'`), /teachers_status_ck/);
        await assert.rejects(client.query(`update teachers set employment_type = 'vacancy' where short_code = 'AKX'`), /teachers_employment_type_ck/);
        await assert.rejects(client.query(`update teachers set advisory_load_units = 12.3 where short_code = 'AKX'`), /teachers_advisory_load_units_ck/);
        await assert.rejects(client.query(`insert into teachers (short_code, full_name) values ('akx', 'Case Twin')`), /teachers_short_code_upper_uq/);
        await db.update(schema.teachers).set({ advisoryLoadUnits: "12.5" }).where(eq(schema.teachers.shortCode, "AKX"));
      });
      lines.push("Upgrade 0008 → 0009: every teacher field unchanged; UT and unresolved codes keep their status and lose only the pseudo employment type; status, employment, limit and case-twin codes are enforced");
    } finally {
      removeOwnedRun(scratch);
    }
  });
}

export async function checkTeachers(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  await upgrade(factory, lines);
  await scenarios(factory, lines);
  return lines;
}

export async function checkTeachersPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => [
    `Disposable PostgreSQL ${cluster.version} cluster`,
    ...await checkTeachers(factoryFor(cluster)),
  ]);
}
