/**
 * AUTH-02 (#36) adversarial scenarios, run in one pinned child against the real
 * provider and server actions:
 *   auth-scenarios.ts all <secrets-file>     every scenario; secrets used are written to the file, never printed
 *   auth-scenarios.ts still-locked <email>   a fresh process (a restart) still sees the lockout
 * Reports one JSON line: { lines: string[] }.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";
import { as, loadApp, RedirectSignal, signedCookie } from "./auth-runtime";
import type * as DbModule from "../../../src/db";
import type * as SchemaModule from "../../../src/db/schema";
import type * as AuthModule from "../../../src/lib/auth";
import type * as ProviderModule from "../../../src/lib/auth/provider";
import type * as SignInModule from "../../../src/lib/auth/password-sign-in";
import type * as StoreModule from "../../../src/lib/auth/account-store";
import type * as AdminModule from "../../../src/lib/auth/admin-actions";
import type * as AccountModule from "../../../src/lib/auth/account-actions";
import type * as PolicyModule from "../../../src/lib/auth/account-policy";
import type * as RouteModule from "../../../src/app/api/auth/[...all]/route";

const { db } = loadApp<typeof DbModule>("src/db/index.ts");
const schema = loadApp<typeof SchemaModule>("src/db/schema.ts");
const auth = loadApp<typeof AuthModule>("src/lib/auth/index.ts");
const { auth: provider } = loadApp<typeof ProviderModule>("src/lib/auth/provider.ts");
const { attemptPasswordSignIn } = loadApp<typeof SignInModule>("src/lib/auth/password-sign-in.ts");
const store = loadApp<typeof StoreModule>("src/lib/auth/account-store.ts");
const admin = loadApp<typeof AdminModule>("src/lib/auth/admin-actions.ts");
const own = loadApp<typeof AccountModule>("src/lib/auth/account-actions.ts");
const { LINK_REFUSED } = loadApp<typeof PolicyModule>("src/lib/auth/account-policy.ts");
const { portalUsers, roleAssignments, departments, teachers, accountLinks, authSession, authAccount, authUser, auditEvents } = schema;

const secrets: string[] = [];
/** Session tokens live in auth_session by design; they must still never reach audit rows or output. */
const sessionTokens: string[] = [];
const PASSWORD = "safe01 long passphrase one";
const lines: string[] = [];

function form(fields: Record<string, string | number | boolean>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== false) data.set(key, value === true ? "on" : String(value));
  return data;
}

const TABLES = ["portal_users", "role_assignments", "account_links", "auth_session", "auth_account", "auth_user", "audit_events"];
async function fingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const table of TABLES) {
    const { rows } = await db.execute<{ digest: string }>(sql.raw(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as digest from ${table} t`));
    parts.push(`${table}:${rows[0].digest}`);
  }
  return parts.join(",");
}

async function person(email: string, displayName: string, options: { password?: string | null; google?: boolean; status?: string; role?: string | null; teacherId?: number | null } = {}) {
  const [user] = await db.insert(portalUsers).values({
    email, displayName, status: options.status ?? "active", teacherId: options.teacherId ?? null,
    passwordEnabled: options.password !== null, googleEnabled: options.google ?? false,
  }).returning();
  if (options.role !== null) await db.insert(roleAssignments).values({ userId: user.id, role: options.role ?? "read_only_viewer", departmentId: null, activeFrom: new Date(Date.now() - 60_000) });
  if (options.password) {
    const hash = await (await provider.$context).password.hash(options.password);
    await db.transaction((tx) => store.storePasswordHash(tx as never, user, hash, new Date()));
    secrets.push(options.password);
  }
  return user;
}

/** Signs in with the real password flow and returns the browser cookie for that new session. */
async function signIn(email: string, password: string): Promise<string> {
  const outcome = await as(null, async () => attemptPasswordSignIn(email, password, new Headers({ "user-agent": "SAFE-01" })));
  assert.equal(outcome.ok, true, `sign-in for ${email}: ${JSON.stringify(outcome)}`);
  const authUserId = await store.authUserIdFor(db as never, email);
  const [session] = await db.select().from(authSession).where(eq(authSession.userId, authUserId!)).orderBy(desc(authSession.createdAt)).limit(1);
  assert.equal(session.signInMethod, "password");
  sessionTokens.push(session.token);
  return signedCookie(session.token);
}

const sessionsOf = async (email: string) => {
  const authUserId = await store.authUserIdFor(db as never, email);
  return authUserId ? db.select().from(authSession).where(eq(authSession.userId, authUserId)) : [];
};
const actorWith = (cookie: string | null) => as(cookie, () => auth.getOptionalActor());

async function issue(userId: number, purpose: "setup" | "reset", issuer: number | null, now = new Date()) {
  const link = await db.transaction((tx) => store.issueLink(tx as never, { userId, purpose, issuedByUserId: issuer, now }));
  secrets.push(link.token);
  return link;
}

async function usesLink(token: string, password: string, confirm = password) {
  try {
    return await as(null, () => own.setPasswordWithLinkAction(null, form({ token, password, confirm })));
  } catch (error) {
    if (error instanceof RedirectSignal) return { ok: true as const, redirect: error.location };
    throw error;
  }
}

async function credentialHash(email: string) {
  const authUserId = await store.authUserIdFor(db as never, email);
  if (!authUserId) return null;
  const [row] = await db.select({ password: authAccount.password }).from(authAccount).where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "credential")));
  return row?.password ?? null;
}

// ---------------------------------------------------------------------------

async function seed() {
  const [cse] = await db.insert(departments).values({ code: "CSE", name: "Computer Science & Engineering" }).returning();
  const [teacher] = await db.insert(teachers).values({ shortCode: "SAF", fullName: "Safety Teacher", homeDepartmentId: cse.id }).returning();
  const alpha = await person("alpha-admin@example.invalid", "Alpha Admin", { password: "alpha admin long phrase", role: "system_administrator" });
  const beta = await person("beta-admin@example.invalid", "Beta Admin", { password: "beta admin long phrase", role: "system_administrator" });
  const teach = await person("teacher@example.invalid", "Plain Teacher", { password: "plain teacher long phrase", role: "teacher", teacherId: teacher.id });
  return { cse, teacher, alpha, beta, teach };
}

async function linkMatrix(alphaId: number) {
  // AC-01: a setup link sets a password, uses itself up, activates the sign-in path and stores only a hash.
  const fresh = await person("fresh@example.invalid", "Fresh Person", { status: "invited" });
  const setup = await issue(fresh.id, "setup", alphaId);
  const view = await as(null, () => own.inspectLinkAction(setup.token));
  assert.ok(view.ok && view.email === "fresh@example.invalid" && view.purpose === "setup");
  const [stored] = await db.select().from(accountLinks).where(eq(accountLinks.id, setup.linkId));
  assert.notEqual(stored.tokenHash, setup.token, "only the hash is stored");
  assert.equal((await usesLink(setup.token, "short")).ok, false, "rules are checked before the link is used");
  assert.equal((await db.select().from(accountLinks).where(eq(accountLinks.id, setup.linkId)))[0].usedAt, null, "a refused password does not burn the link");
  secrets.push(PASSWORD);
  const used = await usesLink(setup.token, PASSWORD);
  assert.deepEqual(used, { ok: true, redirect: "/" });
  const hash = await credentialHash("fresh@example.invalid");
  assert.ok(hash && hash !== PASSWORD, "a hash, never the password, is stored");
  assert.equal((await sessionsOf("fresh@example.invalid")).length, 1, "using the link signs the person in");
  lines.push("Setup link: inspect shows the person; a refused password leaves the link usable; use stores a hash only, signs in, and marks the link used");

  // AC-02: every unusable link gets the same refusal and changes nothing.
  const refusedAll = async (token: string, why: string) => {
    const before = await fingerprint();
    const inspected = await as(null, () => own.inspectLinkAction(token));
    assert.deepEqual(inspected, { ok: false, message: LINK_REFUSED }, `${why}: inspect`);
    const result = await usesLink(token, "another long passphrase");
    assert.equal(result.ok, false, `${why}: use`);
    assert.equal((result as { message: string }).message, LINK_REFUSED, `${why}: same message`);
    assert.equal(await fingerprint(), before, `${why}: no change`);
  };
  await refusedAll(setup.token, "used");
  const expired = await issue(fresh.id, "reset", alphaId, new Date(Date.now() - 25 * 3_600_000));
  await refusedAll(expired.token, "expired");
  const replaced = await issue(fresh.id, "reset", alphaId);
  const replacing = await issue(fresh.id, "reset", alphaId);
  await refusedAll(replaced.token, "replaced by a newer link");
  await db.transaction((tx) => store.revokeOpenLink(tx as never, fresh.id, new Date()));
  await refusedAll(replacing.token, "revoked");
  const tampered = await issue(fresh.id, "reset", alphaId);
  await refusedAll(tampered.token.slice(0, -1) + (tampered.token.endsWith("A") ? "B" : "A"), "tampered");
  await refusedAll("x".repeat(43), "unknown");
  await refusedAll("not-a-token", "malformed");
  await db.update(portalUsers).set({ status: "suspended" }).where(eq(portalUsers.id, fresh.id));
  await refusedAll(tampered.token, "suspended account");
  await db.update(portalUsers).set({ status: "active", passwordEnabled: false, googleEnabled: true }).where(eq(portalUsers.id, fresh.id));
  await refusedAll(tampered.token, "password turned off");
  await db.update(portalUsers).set({ passwordEnabled: true }).where(eq(portalUsers.id, fresh.id));
  lines.push("Unusable links (used, expired, replaced, revoked, tampered, unknown, malformed, suspended account, password off): one message, no row changed");

  // AC-03: two submissions of one link at once, exactly one wins.
  const race = await issue(fresh.id, "reset", alphaId);
  const [first, second] = await Promise.all([usesLink(race.token, "race winner phrase one"), usesLink(race.token, "race winner phrase two")]);
  assert.equal([first, second].filter((result) => result.ok).length, 1, `exactly one succeeds: ${JSON.stringify([first, second])}`);
  secrets.push("race winner phrase one", "race winner phrase two");
  lines.push("Concurrent use of one link: exactly one succeeds");
  // A reset through a link removes every session.
  assert.equal((await sessionsOf("fresh@example.invalid")).length, 1, "only the session made by the winning reset remains");
}

async function signInMatrix() {
  // AC-04: one accepted sign-in; every refusal reason maps to the same outcome shape.
  await person("off@example.invalid", "Password Off", { password: "password off long one", google: true });
  await db.update(portalUsers).set({ passwordEnabled: false }).where(eq(portalUsers.email, "off@example.invalid"));
  await person("unset@example.invalid", "No Password Yet", { status: "invited" });
  await person("gone@example.invalid", "Suspended Person", { password: "suspended long phrase", status: "suspended" });
  const cases: Array<[string, string, string]> = [
    ["nobody@example.invalid", "whatever long phrase", "no_account"],
    ["teacher@example.invalid", "wrong long phrase!", "wrong_password"],
    ["off@example.invalid", "password off long one", "password_off"],
    ["unset@example.invalid", "anything long enough", "wrong_password"],
    ["gone@example.invalid", "suspended long phrase", "not_usable"],
  ];
  for (const [email, password, reason] of cases) {
    const outcome = await as(null, () => attemptPasswordSignIn(email, password, new Headers()));
    assert.deepEqual(outcome, { ok: false, reason }, email);
  }
  const timed = async (email: string, password: string) => {
    const start = performance.now();
    await as(null, () => attemptPasswordSignIn(email, password, new Headers()));
    return performance.now() - start;
  };
  const unknown = Math.min(await timed("nobody@example.invalid", "x long phrase 1"), await timed("nobody@example.invalid", "x long phrase 2"));
  const wrong = Math.min(await timed("off@example.invalid", "x long phrase 3"), await timed("off@example.invalid", "x long phrase 4"));
  assert.ok(unknown > 10 && wrong > 10, `refusals take a password hash's time (unknown ${unknown.toFixed(0)} ms, method off ${wrong.toFixed(0)} ms)`);
  assert.equal((await as(null, () => attemptPasswordSignIn("TEACHER@Example.invalid ", "plain teacher long phrase", new Headers()))).ok, true, "email is case- and space-insensitive");
  lines.push(`Sign-in: right password accepted; unknown, wrong, method off, never set and suspended all refused; refusals still hash (≥ ${Math.min(unknown, wrong).toFixed(0)} ms)`);

  // AC-05 (provider hook): Google only for invited, usable accounts with Google on.
  const validate = provider.options.user!.validateUserInfo! as unknown as (input: unknown) => Promise<{ error: string } | undefined>;
  const google = (email: string) => validate({ user: { email }, source: { method: "oauth", oauth: { providerId: "google" } } });
  assert.equal(await google("off@example.invalid"), undefined);
  assert.deepEqual(await google("teacher@example.invalid"), { error: "method_not_allowed" });
  assert.deepEqual(await google("gone@example.invalid"), { error: "account_not_invited" });
  assert.deepEqual(await google("stranger@example.invalid"), { error: "account_not_invited" });
  assert.deepEqual(await validate({ user: { email: "off@example.invalid" }, source: { method: "email" } }), { error: "provider_not_allowed" });
  lines.push("Google gate: accepted only with Google on for an invited, usable account; other methods refused");

  // AC-06: all of the above ran with no Google settings at all.
  assert.equal(process.env.GOOGLE_CLIENT_ID ?? "", "");
  // #49: the auth route used to refuse everything without Google, so Sign out did nothing.
  const route = loadApp<typeof RouteModule>("src/app/api/auth/[...all]/route.ts");
  const cookie = await signIn("teacher@example.invalid", "plain teacher long phrase");
  const before = (await sessionsOf("teacher@example.invalid")).length;
  const signOut = await route.POST(new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-out`, {
    method: "POST", headers: { origin: process.env.BETTER_AUTH_URL!, cookie: `better-auth.session_token=${cookie}` },
  }));
  assert.equal(signOut.status, 200, `sign-out through the route: ${signOut.status}`);
  assert.equal((await sessionsOf("teacher@example.invalid")).length, before - 1, "sign-out removes that session");
  assert.equal(await actorWith(cookie), null, "the signed-out cookie no longer works");
  lines.push("Password sign-in and sign-out work with Google unconfigured");
}

async function lockout(alphaCookie: string) {
  const email = "locked@example.invalid";
  const user = await person(email, "Locked Person", { password: "locked person phrase" });
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.equal((await as(null, () => attemptPasswordSignIn(email, `wrong ${attempt} long phrase`, new Headers()))).ok, false);
  }
  // The fifth and sixth failures arrive together: one lock, one audit row.
  await Promise.all([1, 2].map((n) => as(null, () => attemptPasswordSignIn(email, `wrong race ${n} phrase`, new Headers()))));
  const [locked] = await db.select().from(portalUsers).where(eq(portalUsers.id, user.id));
  assert.ok(locked.lockedUntil && locked.lockedUntil > new Date(), "locked");
  assert.equal((await db.select().from(auditEvents).where(and(eq(auditEvents.action, "user.lockout"), eq(auditEvents.entityId, user.id)))).length, 1, "one lockout audit");
  assert.deepEqual(await as(null, () => attemptPasswordSignIn(email, "locked person phrase", new Headers())), { ok: false, reason: "locked" }, "the right password is refused while locked");
  const later = new Date(Date.now() + 16 * 60_000);
  assert.equal((await as(null, () => attemptPasswordSignIn(email, "locked person phrase", new Headers(), later))).ok, true, "the lock ends after 15 minutes");
  const [cleared] = await db.select().from(portalUsers).where(eq(portalUsers.id, user.id));
  assert.equal(cleared.failedSignIns, 0, "success clears the count");
  for (let attempt = 0; attempt < 5; attempt++) await as(null, () => attemptPasswordSignIn(email, `again ${attempt} long phrase`, new Headers()));
  const result = await as(alphaCookie, () => admin.clearLockAction(null, form({ userId: user.id })));
  assert.equal(result.ok, true);
  assert.equal((await as(null, () => attemptPasswordSignIn(email, "locked person phrase", new Headers()))).ok, true, "an administrator can clear the lock");
  // A reset through a link clears a lock.
  const other = await person("relock@example.invalid", "Relock Person", { password: "relock person phrase" });
  for (let attempt = 0; attempt < 5; attempt++) await as(null, () => attemptPasswordSignIn("relock@example.invalid", `x ${attempt} long phrase`, new Headers()));
  const unlock = await issue(other.id, "reset", null);
  assert.equal((await usesLink(unlock.token, "an unrelated fresh phrase")).ok, true);
  secrets.push("an unrelated fresh phrase");
  const [unlocked] = await db.select().from(portalUsers).where(eq(portalUsers.id, other.id));
  assert.equal(unlocked.lockedUntil, null, "a reset clears the lock");
  for (let attempt = 0; attempt < 5; attempt++) await as(null, () => attemptPasswordSignIn(email, `persist ${attempt} long phrase`, new Headers()));
  const reset = await issue(user.id, "reset", null);
  const [relock] = await db.select().from(portalUsers).where(eq(portalUsers.id, user.id));
  assert.ok(relock.lockedUntil && relock.lockedUntil > new Date(), "locked again for the restart check");
  lines.push("Lockout: 5 failures lock (concurrent failures lock and audit once); right password refused while locked; ends after 15 min; success, a reset link and an administrator clear each end it");
  return { email, resetToken: reset.token };
}

async function sessions(alphaCookie: string) {
  // AC-09: suspension, reset through a link, email change and "sign out everywhere" delete every session.
  const s1 = await person("sess@example.invalid", "Session Person", { password: "session person phrase", google: true });
  await signIn("sess@example.invalid", "session person phrase");
  await signIn("sess@example.invalid", "session person phrase");
  assert.equal((await sessionsOf("sess@example.invalid")).length, 2);
  assert.equal((await as(alphaCookie, () => admin.signOutEverywhereAction(null, form({ userId: s1.id })))).ok, true);
  assert.equal((await sessionsOf("sess@example.invalid")).length, 0, "sign out everywhere");

  const cookie = await signIn("sess@example.invalid", "session person phrase");
  assert.ok(await actorWith(cookie));
  assert.equal((await as(alphaCookie, () => admin.setStatusAction(null, form({ userId: s1.id, status: "suspended" })))).ok, true);
  assert.equal((await sessionsOf("sess@example.invalid")).length, 0, "suspension");
  assert.equal(await actorWith(cookie), null);
  assert.equal((await as(alphaCookie, () => admin.setStatusAction(null, form({ userId: s1.id, status: "active" })))).ok, true);

  await signIn("sess@example.invalid", "session person phrase");
  const authUserId = await store.authUserIdFor(db as never, "sess@example.invalid");
  await db.insert(authAccount).values({ id: "safe01-google", accountId: "google-sub-1", providerId: "google", userId: authUserId! });
  const renamed = await as(alphaCookie, () => admin.updateDetailsAction(null, form({ userId: s1.id, displayName: "Session Person", email: "sess-new@example.invalid", teacherId: "" })));
  assert.equal(renamed.ok, true, renamed.message);
  assert.equal((await sessionsOf("sess-new@example.invalid")).length, 0, "email change");
  assert.equal((await db.select().from(authAccount).where(eq(authAccount.providerId, "google"))).length, 0, "the Google link is dropped");
  assert.equal((await db.select().from(authUser).where(eq(authUser.id, authUserId!)))[0].email, "sess-new@example.invalid");
  assert.equal((await as(null, () => attemptPasswordSignIn("sess-new@example.invalid", "session person phrase", new Headers()))).ok, true, "signs in with the new address");

  // Turning a method off ends that method's sessions, and the actor check refuses any left behind.
  const methodCookie = await signIn("sess-new@example.invalid", "session person phrase");
  await db.update(portalUsers).set({ passwordEnabled: false }).where(eq(portalUsers.id, s1.id));
  assert.equal(await actorWith(methodCookie), null, "a session whose method is off is refused on the next request");
  await db.update(portalUsers).set({ passwordEnabled: true }).where(eq(portalUsers.id, s1.id));
  assert.ok(await actorWith(methodCookie));
  assert.equal((await as(alphaCookie, () => admin.setMethodsAction(null, form({ userId: s1.id, google: true })))).ok, true);
  assert.equal((await sessionsOf("sess-new@example.invalid")).filter((row) => row.signInMethod === "password").length, 0, "turning Password off deletes password sessions");

  // Changing my own password keeps this session only.
  await db.update(portalUsers).set({ passwordEnabled: true }).where(eq(portalUsers.id, s1.id));
  const mine = await signIn("sess-new@example.invalid", "session person phrase");
  await signIn("sess-new@example.invalid", "session person phrase");
  const changed = await as(mine, () => own.changeOwnPasswordAction(null, form({ current: "session person phrase", password: "session person phrase two", confirm: "session person phrase two" })));
  assert.equal(changed.ok, true, changed.message);
  secrets.push("session person phrase two");
  const left = await sessionsOf("sess-new@example.invalid");
  assert.equal(left.length, 1);
  assert.ok(await actorWith(mine), "the current session stays");
  const wrongCurrent = await as(mine, () => own.changeOwnPasswordAction(null, form({ current: "nope nope nope", password: "x long phrase here", confirm: "x long phrase here" })));
  assert.equal(wrongCurrent.ok, false);
  lines.push("Sessions: suspension, email change (Google link dropped) and sign out everywhere delete all; method off refused at once; own password change keeps only this session");
}

async function rolesAndGuards(ids: { alpha: number; beta: number; teach: number }, cookies: { alpha: string; beta: string; teacher: string }) {
  // AC-10: role dates.
  const later = new Date(Date.now() + 3 * 86_400_000 + 6 * 3_600_000).toISOString().slice(0, 10);
  const scheduled = await as(cookies.alpha, () => admin.grantRoleAction(null, form({ userId: ids.teach, role: "routine_coordinator", activeFrom: later })));
  assert.equal(scheduled.ok, true, scheduled.message);
  const teacherActor = await actorWith(cookies.teacher);
  assert.equal(await auth.can(teacherActor!, "manage_routine"), false, "a scheduled role grants nothing yet");
  const now = await as(cookies.alpha, () => admin.grantRoleAction(null, form({ userId: ids.teach, role: "accounts_officer" })));
  assert.equal(now.ok, true, now.message);
  assert.equal(await auth.can((await actorWith(cookies.teacher))!, "view_payment_reports"), true, "a role granted now applies on the next request");
  const [granted] = await db.select().from(roleAssignments).where(and(eq(roleAssignments.userId, ids.teach), eq(roleAssignments.role, "accounts_officer")));
  assert.equal((await as(cookies.alpha, () => admin.endRoleAction(null, form({ assignmentId: granted.id })))).ok, true);
  assert.equal(await auth.can((await actorWith(cookies.teacher))!, "view_payment_reports"), false, "an ended role stops on the next request");
  const duplicate = await as(cookies.alpha, () => admin.grantRoleAction(null, form({ userId: ids.teach, role: "routine_coordinator", activeFrom: later })));
  assert.equal(duplicate.ok, false, "overlapping role refused");
  lines.push("Role dates: scheduled role grants nothing until it starts; a role granted or ended now applies on the next request; overlaps refused");

  // AC-11: self-changes and the last active system administrator.
  assert.equal((await as(cookies.alpha, () => admin.setStatusAction(null, form({ userId: ids.alpha, status: "suspended" })))).ok, false, "self-suspension");
  const [alphaAdmin] = await db.select().from(roleAssignments).where(and(eq(roleAssignments.userId, ids.alpha), eq(roleAssignments.role, "system_administrator")));
  assert.equal((await as(cookies.alpha, () => admin.endRoleAction(null, form({ assignmentId: alphaAdmin.id })))).ok, false, "self-demotion");
  assert.equal((await as(cookies.alpha, () => admin.setMethodsAction(null, form({ userId: ids.alpha, google: true })))).ok, false, "turning off one's own method");
  const both = await Promise.all([
    as(cookies.alpha, () => admin.setStatusAction(null, form({ userId: ids.beta, status: "suspended" }))),
    as(cookies.beta, () => admin.setStatusAction(null, form({ userId: ids.alpha, status: "suspended" }))),
  ]);
  assert.equal(both.filter((result) => result.ok).length, 1, `two administrators suspending each other: exactly one succeeds (${both.map((result) => result.message).join(" | ")})`);
  const survivor = both[0].ok ? { id: ids.alpha, cookie: cookies.alpha } : { id: ids.beta, cookie: cookies.beta };
  const loser = both[0].ok ? ids.beta : ids.alpha;
  const [active] = await db.select({ count: sql<number>`count(*)::int` }).from(portalUsers).innerJoin(roleAssignments, eq(roleAssignments.userId, portalUsers.id))
    .where(and(eq(portalUsers.status, "active"), eq(roleAssignments.role, "system_administrator")));
  assert.equal(active.count, 1, "one active administrator remains");
  assert.equal((await as(survivor.cookie, () => admin.setStatusAction(null, form({ userId: loser, status: "active" })))).ok, true);
  lines.push("Safeguards: self-suspension, self-demotion and turning off one's own method refused; two administrators suspending each other at once leaves exactly one active");
  return survivor;
}

async function denials(cookies: { teacher: string; suspendedAdmin: string }, targetId: number) {
  // AC-12: every account action, as anonymous, a signed-in non-administrator and a suspended administrator.
  const actions: Array<[string, () => Promise<{ ok: boolean; outcome?: { kind: string } }>]> = [
    ["create", () => admin.createAccountAction(null, form({ displayName: "X", email: "x-new@example.invalid", role: "read_only_viewer", password: true }))],
    ["details", () => admin.updateDetailsAction(null, form({ userId: targetId, displayName: "X", email: "x@example.invalid" }))],
    ["methods", () => admin.setMethodsAction(null, form({ userId: targetId, google: true }))],
    ["issue link", () => admin.issueLinkAction(null, form({ userId: targetId }))],
    ["revoke link", () => admin.revokeLinkAction(null, form({ userId: targetId }))],
    ["clear lock", () => admin.clearLockAction(null, form({ userId: targetId }))],
    ["sign out everywhere", () => admin.signOutEverywhereAction(null, form({ userId: targetId }))],
    ["suspend", () => admin.setStatusAction(null, form({ userId: targetId, status: "suspended" }))],
    ["grant role", () => admin.grantRoleAction(null, form({ userId: targetId, role: "system_administrator" }))],
    ["end role", () => admin.endRoleAction(null, form({ assignmentId: 1 }))],
  ];
  let checked = 0;
  for (const [who, cookie] of [["anonymous", null], ["teacher", cookies.teacher], ["suspended administrator", cookies.suspendedAdmin]] as const) {
    for (const [name, call] of actions) {
      const before = await fingerprint();
      const result = await as(cookie, call);
      assert.equal(result.ok, false, `${name} as ${who}`);
      assert.equal(result.outcome?.kind, "permission", `${name} as ${who}: ${JSON.stringify(result)}`);
      assert.equal(await fingerprint(), before, `${name} as ${who}: no change`);
      checked++;
    }
  }
  const anonymousChange = await as(null, () => own.changeOwnPasswordAction(null, form({ current: "a", password: "b long phrase here", confirm: "b long phrase here" })));
  assert.equal(anonymousChange.outcome?.kind, "permission");
  lines.push(`Denials: ${checked} account action calls as anonymous, a teacher and a suspended administrator are refused with no row changed`);
}

async function audits() {
  // AC-13: each kind of account event wrote audit rows; none contain a secret (checked again by the parent).
  const actions = new Set((await db.select({ action: auditEvents.action }).from(auditEvents)).map((row) => row.action));
  for (const action of ["user.create", "user.details", "user.methods", "user.link.issue", "user.link.revoke", "user.password.set", "user.password.reset",
    "user.password.change", "user.lockout", "user.lockout.clear", "user.sessions.revoke", "user.status", "user.role.grant", "user.role.schedule", "user.role.end"]) {
    assert.ok(actions.has(action), `audit rows include ${action}`);
  }
  lines.push("Audit: every account event kind is recorded");
}

async function all(secretsFile: string) {
  const people = await seed();
  const cookies = {
    alpha: await signIn("alpha-admin@example.invalid", "alpha admin long phrase"),
    beta: await signIn("beta-admin@example.invalid", "beta admin long phrase"),
    teacher: await signIn("teacher@example.invalid", "plain teacher long phrase"),
  };
  // Account creation through the action: a Password account gets a setup link returned once.
  const created = await as(cookies.alpha, () => admin.createAccountAction(null, form({ displayName: "Made Here", email: "MADE@example.invalid ", role: "read_only_viewer", password: true })));
  assert.equal(created.ok, true, created.message);
  assert.ok(created.link?.url.includes("/set-password#t="));
  secrets.push(created.link!.url.split("#t=")[1]);
  const madeId = created.outcome?.kind === "success" ? created.outcome.entityId! : 0;
  assert.equal((await as(cookies.alpha, () => admin.revokeLinkAction(null, form({ userId: madeId })))).ok, true);
  assert.equal((await as(null, () => own.inspectLinkAction(created.link!.url.split("#t=")[1]))).ok, false, "a revoked link no longer works");
  const duplicate = await as(cookies.alpha, () => admin.createAccountAction(null, form({ displayName: "Again", email: "made@example.invalid", role: "read_only_viewer", password: true })));
  assert.equal(duplicate.ok, false, "duplicate email refused");
  const noMethod = await as(cookies.alpha, () => admin.createAccountAction(null, form({ displayName: "None", email: "none@example.invalid", role: "read_only_viewer" })));
  assert.equal(noMethod.ok, false, "an account needs a method");
  lines.push("Create: a Password account returns its setup link once; duplicate emails and no-method accounts refused");

  await linkMatrix(people.alpha.id);
  await signInMatrix();
  const lock = await lockout(cookies.alpha);
  await sessions(cookies.alpha);
  const survivor = await rolesAndGuards({ alpha: people.alpha.id, beta: people.beta.id, teach: people.teach.id }, cookies);
  const suspended = await person("suspended-admin@example.invalid", "Suspended Admin", { password: "suspended admin phrase", role: "system_administrator" });
  const suspendedCookie = await signIn("suspended-admin@example.invalid", "suspended admin phrase");
  await db.update(portalUsers).set({ status: "suspended" }).where(eq(portalUsers.id, suspended.id));
  await denials({ teacher: cookies.teacher, suspendedAdmin: suspendedCookie }, people.teach.id);
  void survivor;
  await audits();
  writeFileSync(secretsFile, JSON.stringify({ secrets: [...new Set(secrets)], sessionTokens }));
  return { lines, lockedEmail: lock.email };
}

async function stillLocked(email: string) {
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
  assert.ok(user.lockedUntil && user.lockedUntil > new Date(), "the lock is stored");
  assert.deepEqual(await as(null, () => attemptPasswordSignIn(email, "locked person phrase", new Headers())), { ok: false, reason: "locked" });
  return { lines: ["Lockout survives a restart: a new process still refuses the right password"] };
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  const result = command === "all" ? await all(argument) : command === "still-locked" ? await stillLocked(argument) : null;
  if (!result) throw new Error(`Unknown command ${command}`);
  console.log(JSON.stringify(result));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
