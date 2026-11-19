/** CAL-01: forward migration, scenarios, disposable recovery/reapply and PostgreSQL races. */
import assert from "node:assert/strict";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { pgliteFactory, withHandle, openPostgres, postgresDatabase, type DatabaseFactory, type SafetyHandle } from "./database";
import { populateSpringFixture, populateSummerFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";
import * as s from "../../src/db/schema";
import { calendarDatesOutside, changeCalendarInTransaction, readTermCalendar, type CalendarResult, type CalendarTx } from "../../src/lib/calendar-store";
import { lockTermContext } from "../../src/lib/term-lock";
import type { Actor } from "../../src/lib/auth/policy";

const DEMIGRATE = "drop table term_calendar_entries; drop table term_calendars; delete from drizzle.__drizzle_migrations where created_at >= 1794787200000";
const CALENDAR_ROWS = `insert into term_calendars(term_id,teaching_start,teaching_end,teaching_source,revision) select id,start_date,end_date,'Synthetic circular',3 from academic_terms order by id limit 1;
  insert into term_calendar_entries(term_id,kind,title,start_date,end_date,regular_classes,source) select term_id,'midterm','Synthetic midterm',teaching_start,teaching_start,'continue','Synthetic exam notice' from term_calendars;
  insert into term_calendar_entries(term_id,kind,title,start_date,end_date,source,source_url) select term_id,'public_holiday','Synthetic holiday',teaching_end,teaching_end,'Synthetic holiday notice','https://example.invalid/h' from term_calendars;
  insert into audit_events(actor,action,entity,entity_id,detail) select 'Synthetic','term_calendar.teaching.set','term_calendar',term_id,'{"reason":null}' from term_calendars;`;

async function exercise(factory: DatabaseFactory) {
  const lines: string[] = [], database = await factory("cal01 calendar");
  try {
    await withHandle(database, async h => {
      // Populated 0018 database (both fixture terms, attendance, publications, snapshots) → 0019.
      await database.migrate(h); const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
      await h.exec(DEMIGRATE);
      const before = await fingerprintDatabase(h.client);
      await database.migrate(h); const after = await fingerprintDatabase(h.client);
      for (const [name, value] of Object.entries(before.tables)) if (name !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[name], value, name);
      assert.equal(after.tables["public.term_calendars"]?.rows, 0); assert.equal(after.tables["public.term_calendar_entries"]?.rows, 0, "no calendar is inferred for existing terms");
      await database.migrate(h); assert.deepEqual(await fingerprintDatabase(h.client), after, "repeat migration is identical");
      await assert.rejects(h.client.query("insert into term_calendars(term_id,teaching_start) values(1,'2026-06-01')"), Error, "teaching bounds are paired");
      await assert.rejects(h.client.query("insert into term_calendars(term_id,teaching_start,teaching_end,teaching_source) values(1,'2026-07-01','2026-06-01','S')"), Error, "teaching range is ordered");
      await assert.rejects(h.client.query("insert into term_calendars(term_id) values(999999)"), Error, "calendar needs a real term");
      await assert.rejects(h.client.query("insert into term_calendar_entries(term_id,kind,title,start_date,end_date,source) values(1,'public_holiday','Orphan','2026-07-01','2026-07-01','S')"), Error, "entries need a calendar row");
      lines.push("Populated 0018→0019 adds empty calendar tables without touching any existing table (terms, attendance, routines, publications and snapshots identical); repeat migration identical; paired/ordered teaching bounds and foreign keys are enforced.");
    });
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/calendar-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-9000) || child.stdout.slice(-7000));
    lines.push(...(child.report as { lines: string[] }).lines);
  } finally { await database.dispose(); }
  return lines;
}

async function populated(h: Pick<SafetyHandle, "exec" | "db">) { await populateSummerFixture(h.db as never); await h.exec(CALENDAR_ROWS); }

async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("cal01 backup"), restored = createOwnedRun("cal01 restore"), backup = newBackupLocation("cal01 calendar");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populated({ db: h.db as never, exec: q => h.client.exec(q).then(() => undefined) }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup); assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    const r = await openOwnedPglite(restored); try { await migrateOwned(r); } finally { await r.close(); }
    const again = await openOwnedPglite(restored); try { assert.deepEqual(await fingerprintDatabase(again.client as never), manifest.fingerprint, "reapplying migrations to the restore changes nothing"); } finally { await again.close(); }
    lines.push("Cold PGlite backup/separate restore of a populated calendar has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_cal01_backup"), restored = await cluster.createDatabase("safe01_cal01_restore"), backup = newBackupLocation("cal01 PG"), key = path.join(cluster.run.root, "cal01.key"); createKeyFile(key);
  try {
    const h = openPostgres(source); try { await postgresDatabase(source, async () => {}).migrate(h); await populated(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key); assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    const r = openPostgres(restored); try { await postgresDatabase(restored, async () => {}).migrate(r); assert.deepEqual(await fingerprintDatabase(r.client), manifest.fingerprint, "reapply"); } finally { await r.close(); }
    lines.push("Encrypted PostgreSQL backup/separate restore of a populated calendar has an identical full fingerprint, and reapplying migrations to the restore changes nothing.");
  } finally { await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}

const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
type Work = (tx: CalendarTx) => Promise<unknown>;

/** Independent PostgreSQL connections; each contender is observed waiting on a real lock. */
async function calendarRaces(cluster: PgCluster, lines: string[]) {
  const target = await cluster.createDatabase("safe01_cal01_races"), a = openPostgres(target), b = openPostgres(target), monitor = openPostgres(target);
  try {
    await postgresDatabase(target, async () => {}).migrate(a); const fixture = await populateSummerFixture(a.db);
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.id, fixture.adminUserId));
    const actor: Actor = { id: admin.id, email: admin.email, displayName: admin.displayName, teacherId: null, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date(0), activeTo: null }] };
    const [draft] = await a.db.insert(s.academicTerms).values({ name: "Fall 2026", academicYear: 2026, startDate: "2026-09-15", endDate: "2027-02-15", status: "draft", managedSetup: true }).returning();
    const revision = async (termId = draft.id) => (await readTermCalendar(a.db as never, termId))!.revision;
    const add = (title: string, rev: number, termId = draft.id, startDate = "2026-12-16"): Work => tx => changeCalendarInTransaction(tx, actor, { command: "create", termId: String(termId), revision: String(rev), kind: "public_holiday", title, startDate, endDate: startDate, source: "Synthetic notice" });
    async function interleave(first: Work, second: Work) {
      const held = latch(), finish = latch(), entered = latch();
      const firstResult = a.db.transaction(async tx => { const result = await first(tx as unknown as CalendarTx); held.release(); await finish.promise; return result; }).then(value => ({ value }), error => { held.release(); return { error }; });
      await held.promise;
      const secondResult = b.db.transaction(async tx => { await tx.execute(sql`select set_config('application_name','cal01-contender',true)`); entered.release(); return second(tx as unknown as CalendarTx); }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      try {
        let waiting = false; const deadline = Date.now() + 15000;
        while (!waiting && Date.now() < deadline) { waiting = (await monitor.client.query<{ waiting: boolean }>("select exists(select 1 from pg_stat_activity where application_name='cal01-contender' and wait_event_type='Lock') as waiting")).rows[0].waiting; if (!waiting) await new Promise(resolve => setTimeout(resolve, 15)); }
        assert.ok(waiting, "independent PostgreSQL connection observed waiting on a real lock");
      } finally { finish.release(); }
      const results = await Promise.all([firstResult, secondResult]);
      for (const result of results) if ("error" in result) throw result.error;
      return results.map(result => "value" in result ? result.value : undefined) as [unknown, unknown];
    }
    const audits = async () => (await a.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entity, "term_calendar"), eq(s.auditEvents.entityId, draft.id)))).length;

    // Two first saves of the same form: one committed change and one audit event; the second is stale.
    const twins = await interleave(add("Victory Day", 0), add("Victory Day", 0)) as [CalendarResult, CalendarResult];
    assert.equal(twins[0].ok, true); assert.equal(twins[1].outcome?.kind, "stale"); assert.equal((await readTermCalendar(a.db as never, draft.id))!.entries.length, 1); assert.equal(await audits(), 1);
    // Different entries from the same revision still serialize; the second is stale rather than lost.
    const rev = await revision();
    const apart = await interleave(add("Winter break", rev, draft.id, "2026-12-25"), add("Spring break", rev, draft.id, "2027-01-05")) as [CalendarResult, CalendarResult];
    assert.equal(apart[0].ok, true); assert.equal(apart[1].outcome?.kind, "stale"); assert.equal(await audits(), 2);

    // Activation holds the exclusive context lock. Activation first: the calendar write waits, then decides on the active term.
    const activate: Work = async tx => { await lockTermContext(tx, "exclusive"); await tx.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.status, "active")); await tx.update(s.academicTerms).set({ status: "active", revision: sql`${s.academicTerms.revision} + 1` }).where(eq(s.academicTerms.id, draft.id)); return "activated"; };
    const afterActivation = await interleave(activate, add("Ekushey", await revision(), draft.id, "2027-02-10")) as [string, CalendarResult];
    assert.equal(afterActivation[1].ok, true, "an active calendar stays editable"); assert.equal((await a.db.select().from(s.academicTerms).where(eq(s.academicTerms.id, draft.id)))[0].status, "active");
    // Calendar write first: the exclusive writer waits and then sees the committed row.
    const observe: Work = async tx => { await lockTermContext(tx, "exclusive"); return (await readTermCalendar(tx as never, draft.id))!.entries.length; };
    const reverse = await interleave(add("Shab-e-Barat", await revision(), draft.id, "2027-01-15"), observe) as [CalendarResult, number];
    assert.equal(reverse[0].ok, true); assert.equal(reverse[1], 4);

    // Completion first: the waiting calendar write is then refused as read-only.
    const complete: Work = async tx => { await lockTermContext(tx, "exclusive"); await tx.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, draft.id)); return "completed"; };
    const finalRev = await revision();
    const late = await interleave(complete, add("Late notice", finalRev, draft.id, "2027-02-12")) as [string, CalendarResult];
    assert.equal(late[1].outcome?.kind, "conflict"); assert.equal(await revision(), finalRev, "a calendar completed first is not changed");
    // Draft date narrowing (exclusive context lock, as editTermAction) versus a calendar write, both orders.
    const [second] = await a.db.insert(s.academicTerms).values({ name: "Winter 2027", academicYear: 2027, startDate: "2027-03-01", endDate: "2027-06-30", status: "draft", managedSetup: true }).returning();
    const narrow: Work = async tx => { await lockTermContext(tx, "exclusive"); const stranded = await calendarDatesOutside(tx as never, second.id, "2027-04-01", "2027-06-30"); if (stranded.length) return stranded; await tx.update(s.academicTerms).set({ startDate: "2027-04-01" }).where(eq(s.academicTerms.id, second.id)); return []; };
    const narrowFirst = await interleave(narrow, add("Early notice", 0, second.id, "2027-03-10")) as [string[], CalendarResult];
    assert.deepEqual(narrowFirst[0], []); assert.equal(narrowFirst[1].ok, false, "the narrowed term refuses the now out-of-term date"); assert.equal((await readTermCalendar(a.db as never, second.id))!.entries.length, 0);
    const writeFirst = await interleave(add("Edge notice", 0, second.id, "2027-04-05"), async tx => { await lockTermContext(tx, "exclusive"); return calendarDatesOutside(tx as never, second.id, "2027-04-10", "2027-06-30"); }) as [CalendarResult, string[]];
    assert.equal(writeFirst[0].ok, true); assert.deepEqual(writeFirst[1], ["Edge notice (5 April 2027)"], "the waiting narrower sees the committed entry and refuses");
    lines.push("Independent PostgreSQL transactions observe real lock waiting: two first saves (one change, one audit event, second stale), two entries from one revision (second stale), activation and completion versus calendar writes in both orders (active stays editable, completed refuses), and draft date narrowing versus calendar writes in both orders (no stranded dates).");
  } finally { await a.close(); await b.close(); await monitor.close(); await cluster.dropDatabase(target); }
}

export async function checkCalendar() { const lines = await exercise(pgliteFactory); await pgliteRecovery(lines); return lines; }
export async function checkCalendarPostgres(bin: string | undefined) { return withDisposableCluster(bin, async cluster => { const lines = await exercise(factoryFor(cluster)); await calendarRaces(cluster, lines); await postgresRecovery(cluster, lines); return lines; }); }
