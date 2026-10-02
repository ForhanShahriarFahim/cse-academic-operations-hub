/**
 * BUG-26 (#26) safety group: `db:reset` keeps portal access and names its target.
 * Covers AC-01 to AC-07 in docs/specs/BUG-26/spec.md. The real `db:reset` and
 * `db:prepare` commands run as pinned children on owned disposable databases
 * (PGlite, and PostgreSQL with SAFE01_PG_BIN). The refusal of the default
 * directory runs in an owned scratch working directory, never in the repository.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { clearAcademicData } from "../../src/db/reset-access";
import { pgliteFactory, withHandle, type DatabaseFactory, type Queryable, type SafetyDatabase, type SafetyDb } from "./database";
import { runUnpinnedChild, type ChildResult } from "./app-env";
import { createOwnedRun, removeOwnedRun } from "./pglite";
import { fingerprintDatabase, fingerprintDifferences } from "./fingerprint";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const SEED = path.join(REPO_ROOT, "src", "db", "seed.ts");
const PREPARE = path.join(REPO_ROOT, "src", "db", "prepare.ts");
const RESET = "database.reset";

async function using<T>(database: SafetyDatabase, work: () => Promise<T>): Promise<T> {
  try { return await work(); } finally { await database.dispose(); }
}

const failure = (result: ChildResult) => result.stderr.slice(-3000) || result.stdout.slice(-2000);
const targetOf = (result: ChildResult) => {
  const label = result.stdout.match(/^Target: (.+)$/m)?.[1]?.trim();
  assert.ok(label, `the command names its target:\n${result.stdout}`);
  return label;
};

/** Every row of the access tables, without the teacher link a reset re-creates. */
async function accessRows(client: Queryable): Promise<string> {
  const parts: string[] = [];
  for (const table of ["auth_user", "auth_account", "auth_session", "auth_verification", "account_links", "role_assignments", "portal_users"]) {
    const { rows } = await client.query<Record<string, unknown>>(`select * from "${table}" order by 1`);
    parts.push(`${table} ${JSON.stringify(rows.map(({ teacher_id: _link, ...rest }) => rest))}`);
  }
  return parts.join("\n");
}

const departmentCodes = (client: Queryable) => client.query<{ id: number; code: string; department: string | null }>(
  `select r.id, r.role as code, d.code as department from role_assignments r left join departments d on d.id = r.department_id order by r.id`,
).then((result) => result.rows);

interface Planted { linkedEmail: string; linkedCode: string; orphanEmail: string }

/** Synthetic accounts: a linked password user with a session, an orphaned link, scoped, revoked and custom-department roles. */
async function plantAccess(db: SafetyDb): Promise<Planted> {
  const [teacher] = await db.select().from(schema.teachers).orderBy(schema.teachers.id).limit(1);
  const [cse] = await db.select().from(schema.departments).where(eq(schema.departments.code, "CSE"));
  const [orphanTeacher] = await db.insert(schema.teachers).values({ shortCode: "ZZQ", fullName: "Synthetic Departed Teacher" }).returning();
  const [extra] = await db.insert(schema.departments).values({ code: "XSYN", name: "Synthetic Department" }).returning();

  await db.insert(schema.authUser).values({ id: "bug26-linked", name: "Synthetic Linked", email: "linked@example.invalid" });
  await db.insert(schema.authAccount).values({ id: "bug26-account", accountId: "bug26-linked", providerId: "credential", userId: "bug26-linked", password: "synthetic-hash" });
  await db.insert(schema.authSession).values({ id: "bug26-session", token: "bug26-session-token", userId: "bug26-linked", expiresAt: new Date(Date.now() + 86_400_000), signInMethod: "password" });
  const [linked] = await db.insert(schema.portalUsers).values({
    email: "linked@example.invalid", displayName: "Synthetic Linked", status: "active", teacherId: teacher.id, passwordEnabled: true, googleEnabled: false,
  }).returning();
  const [orphan] = await db.insert(schema.portalUsers).values({ email: "orphan@example.invalid", displayName: "Synthetic Orphan", teacherId: orphanTeacher.id }).returning();
  await db.insert(schema.accountLinks).values({ userId: orphan.id, purpose: "setup", tokenHash: "bug26-synthetic-hash", expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(schema.roleAssignments).values([
    { userId: linked.id, role: "routine_coordinator", departmentId: cse.id },
    { userId: linked.id, role: "teacher", departmentId: extra.id },
    { userId: orphan.id, role: "teacher", departmentId: cse.id, activeTo: new Date(Date.now() - 86_400_000) },
  ]);
  await db.insert(schema.auditEvents).values({ actor: "synthetic", actorKind: "system", action: "user.create", entity: "portal_user", entityId: linked.id });
  return { linkedEmail: linked.email, linkedCode: teacher.shortCode, orphanEmail: orphan.email };
}

async function scenario(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const database = await factory("bug26 reset");
  await using(database, async () => {
    await withHandle(database, (handle) => database.migrate(handle));

    // The first, confirmed reset loads the dataset.
    const label = targetOf(await database.runChild(SEED));
    const first = await database.runChild(SEED, ["--confirm", label]);
    assert.equal(first.status, 0, failure(first));
    const planted = await withHandle(database, ({ db }) => plantAccess(db));
    const before = await withHandle(database, async ({ client }) => ({
      fingerprint: await fingerprintDatabase(client), access: await accessRows(client), roles: await departmentCodes(client),
    }));

    // AC-02: no confirmation, or the wrong one, changes nothing.
    for (const args of [[], ["--confirm"], ["--confirm", `${label}-other`]]) {
      const refused = await database.runChild(SEED, args);
      assert.equal(refused.status, 1, `db:reset ${args.join(" ")} must refuse`);
      assert.match(refused.stderr, /Nothing was changed/);
    }
    await withHandle(database, async ({ client }) => {
      assert.deepEqual(fingerprintDifferences(before.fingerprint, await fingerprintDatabase(client)), [], "an unconfirmed reset changed the database");
    });
    lines.push(`Unconfirmed: no --confirm, an empty one and a different target all exit 1 and leave the fingerprint unchanged (target printed as ${database.adapter === "pglite" ? "the resolved directory" : "host:port/database"})`);

    // AC-01, AC-04, AC-05: a confirmed reset keeps access and re-links by short code.
    const reset = await database.runChild(SEED, ["--confirm", label]);
    assert.equal(reset.status, 0, failure(reset));
    assert.match(reset.stdout, /1 account re-linked/);
    assert.match(reset.stdout, new RegExp(`Not re-linked: ${planted.orphanEmail.replace(/\./g, "\\.")} \\(teacher ZZQ`));
    await withHandle(database, async ({ client, db }) => {
      assert.equal(await accessRows(client), before.access, "accounts, passwords, sessions, links or roles changed");
      assert.deepEqual(await departmentCodes(client), before.roles, "a role changed department");
      const [linked] = await db.select({ code: schema.teachers.shortCode }).from(schema.portalUsers)
        .innerJoin(schema.teachers, eq(schema.teachers.id, schema.portalUsers.teacherId)).where(eq(schema.portalUsers.email, planted.linkedEmail));
      assert.equal(linked?.code, planted.linkedCode, "the linked user is re-linked to the same teacher");
      const [orphan] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.email, planted.orphanEmail));
      assert.equal(orphan.teacherId, null, "a missing teacher leaves the user unlinked");
      const { rows: [ids] } = await client.query<{ teachers: number; terms: number; unscoped: number }>(
        `select (select min(id) from teachers) as teachers, (select min(id) from academic_terms) as terms, (select count(*)::int from role_assignments where department_id is null) as unscoped`);
      assert.deepEqual([ids.teachers, ids.terms, ids.unscoped], [1, 1, 0], "identities restart; no role is unscoped");
      const audit = await db.select().from(schema.auditEvents).orderBy(schema.auditEvents.id);
      assert.deepEqual(audit.filter((row) => row.entity === "portal_user").map((row) => row.action), ["user.create"], "access audit history is kept");
      assert.deepEqual(audit.filter((row) => !["portal_user", "database"].includes(row.entity)).map((row) => row.action), ["summer_2026_imported"], "only the new import's academic event remains");
      const resets = audit.filter((row) => row.action === RESET);
      assert.equal(resets.length, 2, "one reset event per reset");
      const last = resets.at(-1)!.detail as { state: string; relinked: number; unlinked: { email: string }[] };
      assert.deepEqual([last.state, last.relinked, last.unlinked.map((link) => link.email)], ["complete", 1, [planted.orphanEmail]]);
    });
    lines.push("Confirmed reset: accounts, password hashes, sessions, setup links and roles unchanged; user re-linked to the same teacher code; a missing teacher reported and left unlinked; roles keep their departments (a custom one too); access audit kept, academic audit replaced; one complete reset event");

    // AC-06: a reset that stopped after the delete step is resumed from its event.
    await withHandle(database, ({ db }) => clearAcademicData(db, "db:reset"));
    const resumed = await database.runChild(SEED, ["--confirm", label]);
    assert.equal(resumed.status, 0, failure(resumed));
    await withHandle(database, async ({ client, db }) => {
      assert.equal(await accessRows(client), before.access);
      const [linked] = await db.select({ code: schema.teachers.shortCode }).from(schema.portalUsers)
        .innerJoin(schema.teachers, eq(schema.teachers.id, schema.portalUsers.teacherId)).where(eq(schema.portalUsers.email, planted.linkedEmail));
      assert.equal(linked?.code, planted.linkedCode);
      const resets = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, RESET));
      assert.deepEqual(resets.map((row) => (row.detail as { state: string }).state), ["complete", "complete", "complete"], "the unfinished event is completed, not duplicated");
    });
    lines.push("Interrupted after the delete step: the next reset re-links from the unfinished event and completes it");
  });

  // AC-07: db:prepare on an empty database loads the dataset and keeps existing access rows.
  const fresh = await factory("bug26 prepare");
  await using(fresh, async () => {
    await withHandle(fresh, async (handle) => {
      await fresh.migrate(handle);
      const [cse] = await handle.db.insert(schema.departments).values({ code: "CSE", name: "CSE" }).returning();
      const [user] = await handle.db.insert(schema.portalUsers).values({ email: "early@example.invalid", displayName: "Synthetic Early" }).returning();
      await handle.db.insert(schema.roleAssignments).values({ userId: user.id, role: "system_administrator", departmentId: cse.id });
    });
    const prepared = await fresh.runChild(PREPARE);
    assert.equal(prepared.status, 0, failure(prepared));
    await withHandle(fresh, async ({ client }) => {
      const { rows } = await client.query<{ email: string; department: string; name: string; terms: number }>(
        `select u.email, d.code as department, d.name, (select count(*)::int from academic_terms) as terms
         from portal_users u join role_assignments r on r.user_id = u.id join departments d on d.id = r.department_id`);
      assert.deepEqual(rows.map((row) => [row.email, row.department, row.terms]), [["early@example.invalid", "CSE", 1]]);
      assert.equal(rows[0].name, "Computer Science & Engineering", "the kept department is refreshed by code");
    });
  });
  lines.push("db:prepare on an empty database: loads the dataset with no prompt and keeps the existing user and role");
}

/** AC-03: the default directory is refused before anything opens, in an owned scratch working directory. */
function defaultDirectory(lines: string[]): void {
  const scratch = createOwnedRun("bug26 default");
  try {
    const cwd = scratch.root;
    const protectedDirectory = path.join(cwd, ".data", "pglite-summer-2026");
    const env: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) if (!/^(PG|npm_|SAFE01_)/i.test(key)) env[key] = value;
    Object.assign(env, { DATABASE_URL: "", VERCEL: "", NODE_ENV: "test" });
    const attempts: Array<[string, string]> = [
      ["", protectedDirectory],
      [protectedDirectory, protectedDirectory],
      [path.join(".data", "pglite-summer-2026"), path.join(".", ".data", "pglite-summer-2026")],
      [path.join(protectedDirectory, "nested"), path.join(protectedDirectory, "nested")],
      [path.join(cwd, ".data"), path.join(cwd, ".data")],
    ];
    for (const [configured, confirmation] of attempts) {
      const result = runUnpinnedChild(SEED, ["--confirm", confirmation], { ...env, PGLITE_DATA_DIR: configured }, cwd);
      assert.equal(result.status, 1, failure(result));
      assert.match(result.stderr, /Refused: this is the default directory/);
    }
    assert.ok(!existsSync(path.join(cwd, ".data")), "a refused reset created or opened nothing");
    lines.push(`Default directory: refused with a matching --confirm for ${attempts.length} spellings (unset, absolute, relative, nested, parent); nothing created`);
  } finally {
    removeOwnedRun(scratch);
  }
}

export async function checkReset(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  if (factory === pgliteFactory) defaultDirectory(lines);
  await scenario(factory, lines);
  return lines;
}

export async function checkResetPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => [
    `Disposable PostgreSQL ${cluster.version} cluster`,
    ...await checkReset(factoryFor(cluster)),
  ]);
}
