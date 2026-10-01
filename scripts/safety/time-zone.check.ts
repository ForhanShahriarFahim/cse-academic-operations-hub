/**
 * BUG-29 (#29): stored times are absolute instants whatever the session zone.
 * Runs on owned disposable PGlite runs, and on `safe01_*` databases inside the
 * harness-owned PostgreSQL cluster when SAFE01_PG_BIN is set. Covers AC-01–AC-06
 * and the database half of AC-08 in docs/specs/BUG-29/spec.md.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../src/db/schema";
import { selectActiveAssignments } from "../../src/lib/auth/assignments";
import { pgliteFactory, withHandle, type DatabaseFactory, type Queryable, type SafetyDatabase, type SafetyHandle } from "./database";
import { MIGRATIONS_FOLDER, createOwnedRun, removeOwnedRun } from "./pglite";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const { academicPolicies, academicTerms, auditEvents, authSession, authUser, periodPatterns, portalUsers, roleAssignments } = schema;
const BOOTSTRAP = path.join(REPO_ROOT, "scripts", "bootstrap-admin.ts");
const DHAKA = "Etc/GMT-6"; // what PGlite records for Asia/Dhaka (UTC+06, no daylight saving)
const DHAKA_OFFSET_MS = 6 * 3600_000;
const ZONES = ["UTC", DHAKA, "America/New_York"];
const LAST_LEGACY_MIGRATION = 6; // 0006_term-time-grids, the last migration before BUG-29
const SLACK_MS = 2000; // database and harness share one clock; this only absorbs statement latency

type ColumnType = "timestamp with time zone" | "timestamp without time zone" | "date";

/** "table.column" → SQL type for every instant or date column the schema declares. */
function schemaTimeColumns(): Map<string, ColumnType> {
  const columns = new Map<string, ColumnType>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    for (const column of config.columns) {
      const type = column.getSQLType();
      if (type.startsWith("timestamp") || type === "date") columns.set(`${config.name}.${column.name}`, type as ColumnType);
    }
  }
  return columns;
}

async function catalogTimeColumns(client: Queryable): Promise<Map<string, ColumnType>> {
  const { rows } = await client.query<{ table_name: string; column_name: string; data_type: ColumnType }>(
    `select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public' and data_type in ('timestamp with time zone', 'timestamp without time zone', 'date')`,
  );
  return new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row.data_type]));
}

/** After 0007 the catalog matches the schema exactly; before it (or after a rolled-back 0007) every instant is legacy. */
async function assertCatalog(client: Queryable, state: "current" | "legacy"): Promise<number> {
  const expected = schemaTimeColumns();
  if (state === "legacy") {
    for (const [key, type] of expected) if (type === "timestamp with time zone") expected.set(key, "timestamp without time zone");
  }
  assert.deepEqual(Object.fromEntries([...await catalogTimeColumns(client)].sort()), Object.fromEntries([...expected].sort()));
  return [...expected.values()].filter((type) => type.startsWith("timestamp")).length;
}

async function sessionZone(client: Queryable): Promise<string> {
  const { rows } = await client.query<{ zone: string }>("select current_setting('TimeZone') as zone");
  return rows[0].zone;
}

async function appliedMigrations(client: Queryable): Promise<number> {
  const { rows } = await client.query<{ n: number | string }>("select count(*) as n from drizzle.__drizzle_migrations");
  return Number(rows[0].n);
}

function assertWithin(value: Date | null | undefined, before: number, after: number, what: string): void {
  assert.ok(value instanceof Date, `${what}: missing`);
  const at = value.getTime();
  assert.ok(at >= before - SLACK_MS && at <= after + SLACK_MS,
    `${what}: ${value.toISOString()} is outside ${new Date(before).toISOString()} … ${new Date(after).toISOString()}`);
}

const errorText = (error: unknown): string => {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = (current as Error & { cause?: unknown }).cause) parts.push(current.message);
  return parts.join(" | ");
};

/** A fresh database whose sessions run in `zone`, migrated exactly as production migrates. */
async function freshDatabase(factory: DatabaseFactory, purpose: string, zone: string): Promise<SafetyDatabase> {
  const database = await factory(purpose);
  try {
    await database.setTimeZone(zone);
    await withHandle(database, async (handle) => {
      assert.equal(await sessionZone(handle.client), zone, `${purpose}: session zone`);
      await database.migrate(handle);
    });
    return database;
  } catch (error) {
    await database.dispose();
    throw error;
  }
}

async function using<T>(database: SafetyDatabase, work: (database: SafetyDatabase) => Promise<T>): Promise<T> {
  try { return await work(database); } finally { await database.dispose(); }
}

/** AC-01 (in-process), AC-02, AC-03, AC-06: fresh migration, round trips and access timing in one zone. */
async function checkZone(factory: DatabaseFactory, zone: string): Promise<number> {
  const slug = zone.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return using(await freshDatabase(factory, `bug29 zone ${slug}`, zone), (database) => withHandle(database, async ({ db, client }) => {
    const instantColumns = await assertCatalog(client, "current");

    // The database default and an application write of the same instant read back identically.
    const before = Date.now();
    const [stamped] = await db.insert(auditEvents).values({ action: "bug29.default", entity: "probe" }).returning();
    const after = Date.now();
    assertWithin(stamped.at, before, after, `${zone}: default-stamped audit time`);
    const [written] = await db.insert(auditEvents).values({ action: "bug29.app", entity: "probe", at: stamped.at }).returning();
    const reread = await db.select().from(auditEvents).orderBy(auditEvents.id);
    assert.deepEqual(reread.map((row) => row.at.getTime()), [stamped.at.getTime(), stamped.at.getTime()]);
    assert.equal(written.at.getTime(), stamped.at.getTime());

    // A role granted now (column default) is in force at once; a role revoked now is not.
    const [user] = await db.insert(portalUsers).values({ email: `zone-${slug}@example.invalid`, displayName: "Zone probe", status: "active" }).returning();
    const [granted] = await db.insert(roleAssignments).values({ userId: user.id, role: "teacher" }).returning();
    const [revoked] = await db.insert(roleAssignments).values({ userId: user.id, role: "read_only_viewer" }).returning();
    await db.update(roleAssignments).set({ activeTo: new Date() }).where(eq(roleAssignments.id, revoked.id));
    const active = await selectActiveAssignments(db, user.id, new Date());
    assert.deepEqual(active.map((row) => row.id), [granted.id], `${zone}: active assignments right after grant/revoke`);
    return instantColumns;
  }));
}

/** AC-01: the operator bootstrap, run as a pinned child in a UTC+06 database, grants a role that works at once. */
async function checkBootstrap(factory: DatabaseFactory): Promise<void> {
  await using(await freshDatabase(factory, "bug29 bootstrap", DHAKA), async (database) => {
    const email = "zone-admin@example.invalid";
    const before = Date.now();
    const result = await database.runChild(BOOTSTRAP, [], { PORTAL_BOOTSTRAP_ADMIN_EMAIL: email });
    const after = Date.now();
    assert.equal(result.status, 0, result.stderr.slice(-2000));
    await withHandle(database, async ({ db }) => {
      const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
      const active = await selectActiveAssignments(db, user.id, new Date());
      assert.deepEqual(active.map((row) => row.role), ["system_administrator"]);
      assertWithin(active[0].activeFrom, before, after, "bootstrap role start");
      const [event] = await db.select().from(auditEvents).where(eq(auditEvents.action, "user.bootstrap_admin"));
      assertWithin(event.at, before, after, "bootstrap audit time");
    });
  });
}

/** Copy migrations 0000–0006 into an owned scratch folder, so a database can be stopped just before BUG-29. */
function legacyMigrations(root: string): string {
  const folder = path.join(root, "drizzle-0006");
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= LAST_LEGACY_MIGRATION);
  for (const entry of journal.entries) copyFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));
  return folder;
}

interface LegacyRows { before: number; after: number; ids: Record<string, number> }

/**
 * Rows of every write-path class, written the way the code wrote them before
 * BUG-29: omitted columns take now() (session wall time); Drizzle sends
 * application values as ISO strings, and the legacy column keeps their UTC wall time.
 */
async function stampLegacyRows({ db }: SafetyHandle, values: typeof APP): Promise<LegacyRows> {
  const before = Date.now();
  const [defaultUser] = await db.insert(portalUsers).values({ email: "upgrade-default@example.invalid", displayName: "Default stamped", status: "active" }).returning({ id: portalUsers.id });
  const [editedUser] = await db.insert(portalUsers).values({
    email: "upgrade-edited@example.invalid", displayName: "Edited", status: "active", updatedAt: values.edited, lastLoginAt: values.login,
  }).returning({ id: portalUsers.id });
  const [role] = await db.insert(roleAssignments).values({ userId: defaultUser.id, role: "teacher", activeTo: values.roleEnds }).returning({ id: roleAssignments.id });
  const [event] = await db.insert(auditEvents).values({ action: "bug29.legacy", entity: "probe" }).returning({ id: auditEvents.id });
  const [term] = await db.insert(academicTerms).values({ name: "Upgrade term", academicYear: 2026, startDate: "2026-06-01", endDate: "2026-09-30" }).returning({ id: academicTerms.id });
  const [policy] = await db.insert(academicPolicies).values({ termId: term.id }).returning({ id: academicPolicies.id });
  const [backfilled] = await db.insert(periodPatterns).values({ termId: term.id, name: "Backfilled" }).returning({ id: periodPatterns.id });
  const [edited] = await db.insert(periodPatterns).values({ termId: term.id, name: "Edited", createdAt: values.grid, updatedAt: values.grid }).returning({ id: periodPatterns.id });
  await db.insert(authUser).values({ id: "upgrade-auth", name: "Upgrade", email: "upgrade-auth@example.invalid", createdAt: values.login, updatedAt: values.login });
  await db.insert(authSession).values({ id: "upgrade-session", token: "synthetic-not-a-real-token", userId: "upgrade-auth", expiresAt: values.sessionEnds, createdAt: values.login, updatedAt: values.login });
  const after = Date.now();
  return {
    before, after,
    ids: { defaultUser: defaultUser.id, editedUser: editedUser.id, role: role.id, event: event.id, policy: policy.id, backfilled: backfilled.id, edited: edited.id },
  };
}

const APP = {
  login: new Date("2026-09-20T04:00:00.123Z"),
  edited: new Date("2026-09-21T05:30:00.456Z"),
  grid: new Date("2026-09-22T06:45:00.789Z"),
  roleEnds: new Date(Date.now() + 86_400_000),
  sessionEnds: new Date(Date.now() + 30 * 86_400_000), // an application time legitimately in the future
};

/** AC-03, AC-04, AC-05, AC-08 (database level): a UTC+06 database stamped before BUG-29, then upgraded. */
async function checkUpgrade(factory: DatabaseFactory, legacyFolder: string): Promise<string> {
  return using(await factory("bug29 upgrade"), async (database) => {
    await database.setTimeZone(DHAKA);
    return withHandle(database, async (handle) => {
      const { db, client } = handle;
      await database.migrateFrom(handle, legacyFolder);
      assert.equal(await appliedMigrations(client), LAST_LEGACY_MIGRATION + 1);
      await assertCatalog(client, "legacy");
      const { before, after, ids } = await stampLegacyRows(handle, APP);

      await database.migrateFrom(handle, MIGRATIONS_FOLDER);
      assert.equal(await appliedMigrations(client), LAST_LEGACY_MIGRATION + 2);
      await assertCatalog(client, "current");

      const byId = async <T>(rows: Promise<T[]>) => (await rows)[0];
      const defaultUser = await byId(db.select().from(portalUsers).where(eq(portalUsers.id, ids.defaultUser)));
      const editedUser = await byId(db.select().from(portalUsers).where(eq(portalUsers.id, ids.editedUser)));
      const role = await byId(db.select().from(roleAssignments).where(eq(roleAssignments.id, ids.role)));
      const event = await byId(db.select().from(auditEvents).where(eq(auditEvents.id, ids.event)));
      const policy = await byId(db.select().from(academicPolicies).where(eq(academicPolicies.id, ids.policy)));
      const backfilled = await byId(db.select().from(periodPatterns).where(eq(periodPatterns.id, ids.backfilled)));
      const editedGrid = await byId(db.select().from(periodPatterns).where(eq(periodPatterns.id, ids.edited)));
      const [account] = await db.select().from(authUser);
      const [session] = await db.select().from(authSession);

      // Default-stamped (session zone): now the true instant, no longer six hours ahead.
      for (const [what, value] of Object.entries({
        "portal_users.created_at": defaultUser.createdAt, "portal_users.updated_at (= created_at)": defaultUser.updatedAt,
        "portal_users.created_at (edited row)": editedUser.createdAt, "role_assignments.active_from": role.activeFrom,
        "role_assignments.granted_at": role.grantedAt, "audit_events.at": event.at, "academic_policies.updated_at": policy.updatedAt,
        "period_patterns.created_at (backfill)": backfilled.createdAt, "period_patterns.updated_at (backfill)": backfilled.updatedAt,
      })) assertWithin(value, before, after, `upgrade ${what}`);

      // Application-written (UTC): unchanged to the millisecond, including future expiries.
      for (const [what, actual, expected] of [
        ["portal_users.updated_at (edited)", editedUser.updatedAt, APP.edited], ["portal_users.last_login_at", editedUser.lastLoginAt, APP.login],
        ["role_assignments.active_to", role.activeTo, APP.roleEnds], ["auth_user.created_at", account.createdAt, APP.login],
        ["auth_session.created_at", session.createdAt, APP.login], ["auth_session.expires_at", session.expiresAt, APP.sessionEnds],
      ] as const) assert.equal(actual?.getTime(), expected.getTime(), `upgrade ${what}`);

      // D-2's accepted limit: an editor-written term-grid time is read as default-stamped, so it lands one zone offset early.
      assert.equal(editedGrid.updatedAt.getTime(), APP.grid.getTime() - DHAKA_OFFSET_MS);
      assert.equal(editedGrid.createdAt.getTime(), APP.grid.getTime() - DHAKA_OFFSET_MS);

      // AC-05: the role granted before the upgrade is in force now.
      assert.deepEqual((await selectActiveAssignments(db, ids.defaultUser, new Date())).map((row) => row.id), [ids.role]);

      // AC-08: the Days & periods stale-edit token round-trips exactly and changes on save.
      const token = backfilled.updatedAt.toISOString();
      const again = await byId(db.select().from(periodPatterns).where(eq(periodPatterns.id, ids.backfilled)));
      assert.equal(again.updatedAt.toISOString(), token, "an unchanged pattern keeps its token");
      const savedAt = new Date();
      await db.update(periodPatterns).set({ name: "Backfilled, renamed", updatedAt: savedAt }).where(eq(periodPatterns.id, ids.backfilled));
      const saved = await byId(db.select().from(periodPatterns).where(eq(periodPatterns.id, ids.backfilled)));
      assert.equal(saved.updatedAt.toISOString(), savedAt.toISOString(), "a saved token round-trips exactly");
      assert.notEqual(saved.updatedAt.toISOString(), token, "a copy opened before the save is stale");
      return `stamped in ${DHAKA} at 0006, upgraded: 9 default-stamped values now at their true instant (formerly 6 h ahead), 6 application values unchanged to the ms, editor-written term-grid time 6 h early as D-2 accepts, prior role in force, stale-edit token exact`;
    });
  });
}

/** D-2 guard: default-stamped UTC+06 values migrated from a UTC session make 0007 fail and roll back. */
async function checkGuard(factory: DatabaseFactory, legacyFolder: string): Promise<void> {
  await using(await factory("bug29 guard"), async (database) => {
    await database.setTimeZone(DHAKA);
    await withHandle(database, async (handle) => {
      await database.migrateFrom(handle, legacyFolder);
      await handle.db.insert(portalUsers).values({ email: "guard@example.invalid", displayName: "Guard", status: "active" });
    });
    await database.setTimeZone("UTC");
    await withHandle(database, async (handle) => {
      assert.equal(await sessionZone(handle.client), "UTC");
      await assert.rejects(() => database.migrateFrom(handle, MIGRATIONS_FOLDER),
        (error: unknown) => /BUG-29: \d+ value\(s\) in portal_users\.created_at would lie in the future/.test(errorText(error)));
      assert.equal(await appliedMigrations(handle.client), LAST_LEGACY_MIGRATION + 1, "0007 is not recorded");
      await assertCatalog(handle.client, "legacy");
    });
  });
}

export async function checkTimeZones(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  let instantColumns = 0;
  for (const zone of ZONES) instantColumns = await checkZone(factory, zone);
  lines.push(`Fresh migration in ${ZONES.join(", ")}: all ${instantColumns} instant columns are timestamptz and date columns unchanged; a default-stamped and an application-written time read back equal; a role granted now is in force at once and one revoked now is not`);
  await checkBootstrap(factory);
  lines.push(`auth:bootstrap child in ${DHAKA}: the administrator role and its audit event carry the true time and the role is in force at once`);
  const scratch = createOwnedRun("bug29 legacy migrations");
  try {
    const legacyFolder = legacyMigrations(scratch.root);
    lines.push(`Upgrade: ${await checkUpgrade(factory, legacyFolder)}`);
    await checkGuard(factory, legacyFolder);
    lines.push(`Guard: values stamped in ${DHAKA} but migrated from a UTC session make 0007 fail; it is not recorded and every column stays as it was`);
  } finally {
    removeOwnedRun(scratch);
  }
  return lines;
}

export async function checkTimeZonesPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => [
    `Disposable PostgreSQL ${cluster.version} cluster (server zone UTC; each database sets its own zone)`,
    ...await checkTimeZones(factoryFor(cluster)),
  ]);
}
