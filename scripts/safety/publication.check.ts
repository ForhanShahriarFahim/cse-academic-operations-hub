/** BUG-25: publication uniqueness on the real migrators, and the real publish action under contention. */
import assert from "node:assert/strict";
import path from "node:path";
import { pgliteFactory, withHandle, type DatabaseFactory, type SafetyHandle } from "./database";
import { populateSummerFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const legacy = (h: Pick<SafetyHandle, "exec">) => h.exec("drop index schedule_versions_term_version_uq; drop index schedule_versions_one_published_uq; delete from drizzle.__drizzle_migrations where created_at >= 1794182400000;");
const errorCode = (error: unknown): string | undefined => (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
const errorText = (error: unknown): string => (error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message;
const PROBE = "BUG-25 probe";
const copy = (number: string, state: string, where = "") => `insert into schedule_versions(term_id,version_number,state,change_summary) select term_id,${number},'${state}','${PROBE}' from schedule_versions where change_summary is distinct from '${PROBE}' ${where} order by id limit 1`;

async function exercise(factory: DatabaseFactory) {
  const database = await factory("bug25_publication"), lines: string[] = [];
  try {
    await withHandle(database, async (h) => {
      await database.migrate(h); await populateSummerFixture(h.db);
      await h.exec("insert into academic_terms(name,academic_year,start_date,end_date,status) values ('BUG-25 other', 2031, '2031-01-01', '2031-05-01', 'draft')");
      const rows = async () => JSON.stringify((await h.client.query("select * from schedule_versions order by id")).rows);
      const refused = async (statement: string) => { const before = await rows(); await assert.rejects(h.client.query(statement), (error) => errorCode(error) === "23505", statement); assert.equal(await rows(), before, statement); };

      // AC-07: populated upgrade changes no row, and reapplying is identical.
      await legacy(h);
      const before = await fingerprintDatabase(h.client);
      await database.migrate(h);
      const after = await fingerprintDatabase(h.client);
      for (const [name, table] of Object.entries(before.tables)) if (name !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[name], table, name);
      for (const [name, value] of Object.entries(before.sequences)) if (name !== "drizzle.__drizzle_migrations_id_seq") assert.equal(after.sequences[name], value, name);
      await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after);
      const indexes = Object.fromEntries((await h.client.query<{ indexname: string; indexdef: string }>("select indexname,indexdef from pg_indexes where tablename='schedule_versions'")).rows.map((row) => [row.indexname, row.indexdef]));
      assert.match(indexes.schedule_versions_term_version_uq, /UNIQUE.*\(term_id, version_number\)/);
      assert.match(indexes.schedule_versions_one_published_uq, /UNIQUE.*\(term_id\).*WHERE.*published/);
      lines.push("Populated 0016→0017 adds both unique indexes without changing any table row or sequence; repeat migration is identical.");

      // AC-01: one number per term.
      await refused(copy("version_number", "superseded"));
      // AC-02: one published version per term, by insert and by update; history rows are unlimited.
      await refused(copy("version_number+1", "published", "and state='published'"));
      await h.exec(copy("version_number+1", "superseded", "and state='published'"));
      await h.exec(copy("version_number+2", "superseded", "and state='published'"));
      await refused(`update schedule_versions set state='published' where change_summary='${PROBE}'`);
      await h.exec(`insert into schedule_versions(term_id,version_number,state,change_summary) select id,1,'published','${PROBE}' from academic_terms where name='BUG-25 other'`);
      assert.equal((await h.client.query("select 1 from schedule_versions where state='published'")).rows.length, 2);
      await h.exec(`delete from schedule_versions where change_summary='${PROBE}'`);
      lines.push("Duplicate term/version numbers and a second published version (insert or update) are refused with 23505 and change nothing; several superseded versions and one published version in another term are accepted.");

      // AC-08: existing violations stop the real migrator with nothing changed.
      for (const [plant, message] of [
        [copy("version_number", "superseded"), /BUG-25 preflight: 1 term\/version-number pair\(s\) are duplicated and 0 term\(s\)/],
        [copy("version_number+1", "published", "and state='published'"), /BUG-25 preflight: 0 term\/version-number pair\(s\) are duplicated and 1 term\(s\)/],
      ] as const) {
        await legacy(h); await h.exec(plant);
        const dirty = await fingerprintDatabase(h.client);
        await assert.rejects(database.migrate(h), (error) => errorCode(error) === "23514" && message.test(errorText(error)));
        assert.deepEqual(await fingerprintDatabase(h.client), dirty, "refused migration keeps schema, rows and journal");
        await h.exec(`delete from schedule_versions where change_summary='${PROBE}'`);
        await database.migrate(h);
      }
      assert.deepEqual((await fingerprintDatabase(h.client)).tables["public.schedule_versions"], after.tables["public.schedule_versions"]);
      lines.push("With a planted duplicate number, then a planted second published version, the actual migrator refuses (23514, counts named) and leaves schema, rows and journal identical; after removal it applies.");
    });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/publication-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-6000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await database.dispose(); }
  return lines;
}

export const checkPublications = () => exercise(pgliteFactory);
export const checkPublicationsPostgres = (bin: string | undefined) => withDisposableCluster(bin, async (cluster) => [`Disposable PostgreSQL ${cluster.version}`, ...await exercise(factoryFor(cluster))]);
