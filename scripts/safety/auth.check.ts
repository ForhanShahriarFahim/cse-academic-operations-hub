/**
 * AUTH-02 (#36) safety group: email/password sign-in and account administration
 * on owned disposable databases (PGlite, and PostgreSQL with SAFE01_PG_BIN).
 * Covers AC-02–AC-06, AC-08–AC-13, AC-16 and AC-17 in docs/specs/AUTH-02/spec.md.
 * The scenarios run in a pinned child with the real provider and a synthetic secret.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { pgliteFactory, withHandle, type DatabaseFactory, type Queryable, type SafetyDatabase } from "./database";
import { MIGRATIONS_FOLDER, createOwnedRun, removeOwnedRun } from "./pglite";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const SCENARIOS = path.join(REPO_ROOT, "scripts", "safety", "children", "auth-scenarios.ts");
const BOOTSTRAP = path.join(REPO_ROOT, "scripts", "bootstrap-admin.ts");
const ORIGIN = "http://auth02.safe01.invalid";
const LAST_BEFORE_AUTH02 = 7; // 0007_instant-timestamps

const inputs = () => ({ BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: ORIGIN });

async function using<T>(database: SafetyDatabase, work: () => Promise<T>): Promise<T> {
  try { return await work(); } finally { await database.dispose(); }
}

/** Every row of every public table as text, for planted-secret searches. */
async function everyRow(client: Queryable): Promise<string> {
  const { rows: tables } = await client.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
  const parts: string[] = [];
  for (const { table_name: table } of tables) {
    const { rows } = await client.query<{ row: string }>(`select t::text as row from "${table}" t`);
    parts.push(...rows.map((row) => `${table} ${row.row}`));
  }
  return parts.join("\n");
}

async function scenarios(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("auth02 scenarios");
  await using(database, async () => {
    await withHandle(database, (handle) => database.migrate(handle));
    const scratch = createOwnedRun("auth02 secrets");
    try {
      const secretsFile = path.join(scratch.root, "secrets.json");
      const env = inputs();
      const result = await database.runChild(SCENARIOS, ["all", secretsFile], env);
      assert.equal(result.status, 0, result.stderr.slice(-4000) || result.stdout.slice(-2000));
      const report = result.report as { lines: string[]; lockedEmail: string };
      lines.push(...report.lines);

      const restart = await database.runChild(SCENARIOS, ["still-locked", report.lockedEmail], env);
      assert.equal(restart.status, 0, restart.stderr.slice(-2000));
      lines.push(...(restart.report as { lines: string[] }).lines);

      // AC-13: no password, token or token hash appears in audit rows, and no password or
      // token in any row or in the child's output. Only the token's hash is in account_links.
      const { secrets, sessionTokens } = JSON.parse(readFileSync(secretsFile, "utf8")) as { secrets: string[]; sessionTokens: string[] };
      const output = `${result.stdout}\n${result.stderr}\n${restart.stdout}\n${restart.stderr}`;
      await withHandle(database, async ({ client, db }) => {
        const rows = await everyRow(client);
        const audit = (await db.select().from(schema.auditEvents)).map((row) => JSON.stringify(row)).join("\n");
        const hashes = (await db.select({ password: schema.authAccount.password }).from(schema.authAccount)).map((row) => row.password).filter(Boolean) as string[];
        const tokenHashes = (await db.select({ hash: schema.accountLinks.tokenHash }).from(schema.accountLinks)).map((row) => row.hash);
        const where = (text: string, secret: string) => text.split("\n").find((line) => line.includes(secret))?.split(" ")[0] ?? "?";
        for (const [index, secret] of secrets.entries()) {
          assert.ok(!rows.includes(secret), `planted secret #${index} is stored in plain text (table ${where(rows, secret)})`);
          assert.ok(!output.includes(secret), `planted secret #${index} reached the output`);
          assert.ok(!audit.includes(createHash("sha256").update(secret).digest("hex")), `planted secret #${index}: its hash is in the audit`);
        }
        for (const token of sessionTokens) assert.ok(!audit.includes(token) && !output.includes(token), "a session token reached the audit or output");
        for (const hash of [...hashes, ...tokenHashes]) assert.ok(!audit.includes(hash), "a password or token hash is in the audit");
        lines.push(`Secrets: ${secrets.length} planted passwords and link tokens appear in no row and no output; no password, token or session token is in the ${audit.split("\n").length} audit rows`);
      });
    } finally {
      removeOwnedRun(scratch);
    }
  });
}

/** AC-17: the operator command's password and recovery paths. */
async function operator(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("auth02 operator");
  await using(database, async () => {
    await withHandle(database, (handle) => database.migrate(handle));
    const env = { ...inputs(), PORTAL_BOOTSTRAP_ADMIN_EMAIL: "owner@example.invalid", PORTAL_BOOTSTRAP_ADMIN_NAME: "Synthetic Owner" };
    const linkIn = (stdout: string) => stdout.match(new RegExp(`${ORIGIN.replace(/\./g, "\\.")}/set-password#t=([A-Za-z0-9_-]{43})`))?.[1] ?? null;

    const created = await database.runChild(BOOTSTRAP, ["--password"], env);
    assert.equal(created.status, 0, created.stderr.slice(-2000));
    const setupToken = linkIn(created.stdout);
    assert.ok(setupToken, "a setup link is printed");
    const rerun = await database.runChild(BOOTSTRAP, ["--password"], env);
    assert.match(rerun.stdout, /Nothing changed/);
    assert.equal(linkIn(rerun.stdout), null, "a rerun prints no new link");

    const recovered = await database.runChild(BOOTSTRAP, ["--reset-link", "OWNER@example.invalid"], env);
    assert.equal(recovered.status, 0, recovered.stderr.slice(-2000));
    const recoveryToken = linkIn(recovered.stdout);
    assert.ok(recoveryToken && recoveryToken !== setupToken);
    const stranger = await database.runChild(BOOTSTRAP, ["--reset-link", "nobody@example.invalid"], env);
    assert.equal(stranger.status, 1);
    assert.match(stranger.stderr, /No current system administrator/);

    await withHandle(database, async ({ db, client }) => {
      const [owner] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.email, "owner@example.invalid"));
      assert.equal(owner.passwordEnabled, true);
      assert.equal(owner.googleEnabled, false);
      const links = await db.select().from(schema.accountLinks).where(eq(schema.accountLinks.userId, owner.id));
      const hash = (token: string) => createHash("sha256").update(token).digest("hex");
      assert.deepEqual(links.map((link) => [link.tokenHash, link.revokedAt != null, link.issuedByUserId]).sort(),
        [[hash(setupToken!), true, null], [hash(recoveryToken!), false, null]].sort(), "the first link is replaced; only hashes are stored");
      const audits = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, owner.id));
      assert.ok(audits.every((row) => row.actorKind === "system" && row.actorUserId == null));
      assert.deepEqual(audits.map((row) => row.action).sort(), ["user.bootstrap_admin", "user.recovery_link", "user.recovery_link"]);
      const rows = await everyRow(client);
      assert.ok(!rows.includes(setupToken!) && !rows.includes(recoveryToken!), "printed links are not stored");
      await db.update(schema.portalUsers).set({ status: "suspended" }).where(eq(schema.portalUsers.id, owner.id));
    });
    const suspended = await database.runChild(BOOTSTRAP, ["--reset-link", "owner@example.invalid"], env);
    assert.equal(suspended.status, 1);
    assert.match(suspended.stderr, /suspended/);
    lines.push("Operator: --password creates a Password administrator and prints a setup link once; --reset-link replaces it; strangers and suspended administrators are refused; system-attributed audits; links stored only as hashes");
  });
}

/** AC-16: a populated database at 0007 keeps every account, status and role through 0008; existing accounts get Google only. */
async function upgrade(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("auth02 upgrade");
  const scratch = createOwnedRun("auth02 migrations to 0007");
  await using(database, async () => {
    try {
      const folder = path.join(scratch.root, "drizzle-0007");
      mkdirSync(path.join(folder, "meta"), { recursive: true });
      const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
      journal.entries = journal.entries.filter((entry) => entry.idx <= LAST_BEFORE_AUTH02);
      for (const entry of journal.entries) copyFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
      writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal, null, 2));

      await withHandle(database, async (handle) => {
        await database.migrateFrom(handle, folder);
        const { client } = handle;
        // Rows written with the 0007 column lists, as the institutional database holds them.
        await client.query(`insert into departments (code, name) values ('CSE', 'Computer Science & Engineering')`);
        for (const [email, status] of [["a@example.invalid", "active"], ["b@example.invalid", "invited"], ["c@example.invalid", "suspended"]]) {
          await client.query(`insert into portal_users (email, display_name, status) values ($1, $1, $2)`, [email, status]);
        }
        await client.query(`insert into role_assignments (user_id, role, active_to) select id, 'system_administrator', null from portal_users where email = 'a@example.invalid'`);
        await client.query(`insert into role_assignments (user_id, role, active_to) select id, 'teacher', now() from portal_users where email = 'b@example.invalid'`);
        await client.query(`insert into auth_user (id, name, email, email_verified) values ('legacy-user', 'A', 'a@example.invalid', true)`);
        await client.query(`insert into auth_session (id, token, user_id, expires_at) values ('legacy-session', 'legacy-token', 'legacy-user', now() + interval '1 day')`);
        const before = await client.query<{ row: string }>(`select (u.id, u.email, u.status, u.created_at, r.role, r.active_from, r.active_to)::text as row from portal_users u left join role_assignments r on r.user_id = u.id order by u.id, r.id`);

        await database.migrateFrom(handle, MIGRATIONS_FOLDER);
        const after = await client.query<{ row: string }>(`select (u.id, u.email, u.status, u.created_at, r.role, r.active_from, r.active_to)::text as row from portal_users u left join role_assignments r on r.user_id = u.id order by u.id, r.id`);
        assert.deepEqual(after.rows, before.rows, "accounts, statuses and roles unchanged");
        const methods = await client.query<{ password_enabled: boolean; google_enabled: boolean; failed_sign_ins: number; locked_until: string | null }>(`select password_enabled, google_enabled, failed_sign_ins, locked_until from portal_users`);
        assert.ok(methods.rows.every((row) => !row.password_enabled && row.google_enabled && row.failed_sign_ins === 0 && row.locked_until == null), "existing accounts get Google only");
        const session = await client.query<{ sign_in_method: string | null }>(`select sign_in_method from auth_session`);
        assert.deepEqual(session.rows, [{ sign_in_method: null }], "existing sessions keep working as Google sessions");
        await assert.rejects(client.query(`update portal_users set google_enabled = false where email = 'a@example.invalid'`), /portal_users_sign_in_method_ck/);
      });
      lines.push("Upgrade 0007 → 0008: accounts, statuses and roles unchanged; existing accounts Google only; existing sessions kept; an account cannot lose both methods");
    } finally {
      removeOwnedRun(scratch);
    }
  });
}

export async function checkAuth(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  await scenarios(factory, lines);
  await operator(factory, lines);
  await upgrade(factory, lines);
  return lines;
}

export async function checkAuthPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => [
    `Disposable PostgreSQL ${cluster.version} cluster`,
    ...await checkAuth(factoryFor(cluster)),
  ]);
}
