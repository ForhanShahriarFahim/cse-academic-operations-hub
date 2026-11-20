/** OD-01A: populated forward migration 0022 and real commitment lifecycle scenarios on both adapters. */
import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, type DatabaseFactory } from "./database";
import { populateSpringFixture, populateSummerFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { setAuditInsertFault } from "./faults";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const REMOVE_CONTINUITY = `alter table external_commitments
  drop column effective_from, drop column effective_to, drop column linked_teaching_group_id,
  drop column carried_from_term_id, drop column carried_from_commitment_id;
  drop index tg_term_id_uq;
  delete from drizzle.__drizzle_migrations where created_at >= 1795132800000`;
const DEMIGRATE = `${REMOVE_CONTINUITY};
  alter table external_commitments drop constraint external_commitments_lifecycle_ck;
  alter table external_commitments drop constraint external_commitments_revision_ck;
  alter table external_commitments drop constraint external_commitments_verification_note_ck;
  alter table external_commitments drop column lifecycle_status, drop column archived_at, drop column archive_reason,
    drop column verification_note, drop column revision, drop column updated_at;
  delete from drizzle.__drizzle_migrations where created_at >= 1795046400000`;
const ORIGINAL = `select id, term_id, kind, completeness_level, counterpart_department, teacher_id, room_id, course_label, audience_label,
  day_of_week, start_minutes, end_minutes, credits::text as credits, verification_status, source, last_verified_at::text as last_verified_at, notes
  from external_commitments order by id`;
const ADDED = `select lifecycle_status, archived_at, archive_reason, verification_note, revision, updated_at from external_commitments order by id`;

async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [];
  const database = await factory("od01a migration");
  try {
    await withHandle(database, async (h) => {
      // Populated 0021 database (both fixture terms, commitments with workload, publications) → 0022.
      await database.migrate(h); const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
      await h.exec(DEMIGRATE);
      const before = await fingerprintDatabase(h.client);
      const originalBefore = (await h.client.query(ORIGINAL)).rows;
      assert.ok(originalBefore.length >= 2, "the fixture has commitments in both terms");
      await database.migrate(h);
      const after = await fingerprintDatabase(h.client);
      for (const [name, value] of Object.entries(before.tables)) {
        if (name === "drizzle.__drizzle_migrations" || name === "public.external_commitments") continue;
        assert.deepEqual(after.tables[name], value, name);
      }
      assert.deepEqual((await h.client.query(ORIGINAL)).rows, originalBefore, "every existing commitment value is unchanged");
      for (const row of (await h.client.query(ADDED)).rows as Array<Record<string, unknown>>) {
        assert.deepEqual(row, { lifecycle_status: "active", archived_at: null, archive_reason: null, verification_note: null, revision: 1, updated_at: null });
      }
      await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after, "repeat migration is identical");
      await assert.rejects(h.exec("update external_commitments set lifecycle_status = 'archived' where id = (select min(id) from external_commitments)"), "archived needs a time and reason");
      await assert.rejects(h.exec("update external_commitments set revision = 0 where id = (select min(id) from external_commitments)"));
      lines.push(`Populated 0021→0022 keeps every existing value of ${originalBefore.length} commitments and every other table; rows become active at revision 1; repeat migration is identical; lifecycle and revision checks refuse invalid states.`);
    });
  } finally { await database.dispose(); }

  const scenarios = await factory("od01a scenarios");
  try {
    await withHandle(scenarios, async (h) => { await scenarios.migrate(h); await populateSummerFixture(h.db); await setAuditInsertFault(h, false); });
    const child = await scenarios.runChild(path.join(REPO_ROOT, "scripts/safety/children/commitments-scenarios.ts"), [], {
      BETTER_AUTH_SECRET: "synthetic-od-01a-preview-test-secret-only",
    });
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-6000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await scenarios.dispose(); }
  return lines;
}

export async function checkCommitments() { return exercise(pgliteFactory); }
export async function checkCommitmentsPostgres(bin: string | undefined) {
  return withDisposableCluster(bin, async (cluster) => [`Disposable PostgreSQL ${cluster.version}`, ...await exercise(factoryFor(cluster))]);
}

async function exerciseContinuity(factory: DatabaseFactory) {
  const database = await factory("od01b migration");
  const columns = ["effective_from", "effective_to", "linked_teaching_group_id", "carried_from_term_id", "carried_from_commitment_id"];
  try {
    return await withHandle(database, async (h) => {
      await database.migrate(h);
      const summer = await populateSummerFixture(h.db);
      await populateSpringFixture(h.db, summer);
      await h.exec(REMOVE_CONTINUITY);
      const before = await fingerprintDatabase(h.client);
      const originals = await h.client.query("select to_jsonb(e) as row from external_commitments e order by id");
      assert.ok(originals.rows.length >= 2);
      await database.migrate(h);
      const after = await fingerprintDatabase(h.client);
      for (const [name, value] of Object.entries(before.tables)) {
        if (name !== "drizzle.__drizzle_migrations" && name !== "public.external_commitments") assert.deepEqual(after.tables[name], value, name);
      }
      const migrated = await h.client.query(`select to_jsonb(e) - array[${columns.map((name) => `'${name}'`).join(",")}] as row from external_commitments e order by id`);
      assert.deepEqual(migrated.rows, originals.rows);
      const defaults = await h.client.query(`select ${columns.join(",")} from external_commitments`);
      assert.ok(defaults.rows.every((row) => Object.values(row as object).every((value) => value === null)));
      await assert.rejects(h.exec("update external_commitments set effective_from = '2026-05-01'"), /ec_effective_range_ck/);
      await assert.rejects(h.exec("update external_commitments set carried_from_commitment_id = 1"), /ec_carry_origin_ck/);
      await assert.rejects(h.exec("update external_commitments set linked_teaching_group_id = (select id from teaching_groups where term_id <> external_commitments.term_id limit 1) where exists (select 1 from teaching_groups where term_id <> external_commitments.term_id)"), /ec_linked_group_fk/);
      await database.migrate(h);
      assert.deepEqual(await fingerprintDatabase(h.client), after);
      return ["Populated 0022 → 0023 preserves previous commitment values, snapshots and other tables. All new fields default to null. Invalid ranges, incomplete provenance and cross-term links are refused. Repeating migration preserves the result."];
    });
  } finally { await database.dispose(); }
}

export async function checkCommitmentContinuity() { return exerciseContinuity(pgliteFactory); }
export async function checkCommitmentContinuityPostgres(bin: string | undefined) {
  return withDisposableCluster(bin, (cluster) => exerciseContinuity(factoryFor(cluster)));
}
