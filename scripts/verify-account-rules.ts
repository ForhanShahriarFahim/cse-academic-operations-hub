/**
 * AUTH-02 (#36) pure rules: passwords (AC-07), links, sign-in methods and
 * lockout timing, throttling, administration safeguards (AC-11) and the
 * effective-access summary matching server policy (AC-15).
 */
import assert from "node:assert/strict";
import {
  LINK_LIFETIME_HOURS, SIGN_IN_REFUSED, isLocked, linkExpiresAt, lockEndsAt, safeReturnPath, sessionAllowed, sessionMethod,
} from "../src/lib/auth/account-policy";
import { passwordChecks, passwordProblem } from "../src/lib/auth/password-rules";
import { hashLinkToken, linkUrl, newLinkToken, parseLinkToken } from "../src/lib/auth/links";
import { Throttle } from "../src/lib/auth/throttle";
import {
  KEEP_ONE_METHOD, changeProblem, dhakaToday, removesLastAdministrator, roleWindow, selfChangeProblem, teacherRoleProblem,
} from "../src/lib/auth/account-rules";
import { CAPABILITY_LABELS, summarizeAccess } from "../src/lib/auth/access-summary";
import { ROLES, hasCapability, type Actor, type Capability } from "../src/lib/auth/policy";

const email = "tanvir.sarker@pundra.example";

// AC-07: length in characters, common list, email name; spaces and any characters allowed.
assert.equal(passwordProblem("short pass", email), "Use at least 12 characters. This one has 10.");
assert.equal(passwordProblem("a".repeat(129), email), "Use at most 128 characters. This one has 129.");
assert.equal(passwordProblem("x".repeat(128) + "", email), null);
assert.equal(passwordProblem("river otter 7", email), null, "a 12+ character passphrase with spaces is accepted");
assert.equal(passwordProblem("নদীর ধারে বসে আছি", email), null, "non-Latin passphrases are accepted");
assert.equal(passwordProblem("😀😀😀😀😀😀😀😀😀😀😀", email), "Use at least 12 characters. This one has 11.", "emoji count as one character each");
assert.match(passwordProblem("Password1234", email) ?? "", /too common/);
assert.match(passwordProblem("password 1234", email) ?? "", /too common/, "spaces do not dodge the common list");
assert.match(passwordProblem("my Tanvir.Sarker phrase", email) ?? "", /tanvir\.sarker/);
assert.equal(passwordProblem("bob is my uncle!", "bob@pundra.example"), null, "email names under 4 characters are not refused");
assert.deepEqual(passwordChecks("river otter 7", email).map((check) => check.met), [true, true, true]);
assert.deepEqual(passwordChecks("", email).map((check) => check.met), [false, false, true]);

// Links: 32 random bytes, fragment URL, hash only stored.
const token = newLinkToken();
assert.equal(parseLinkToken(token), token);
assert.notEqual(newLinkToken(), token);
assert.equal(parseLinkToken("short"), null);
assert.equal(parseLinkToken(token + "x"), null);
assert.equal(parseLinkToken(null), null);
assert.equal(hashLinkToken(token).length, 64);
assert.notEqual(hashLinkToken(token), token);
assert.equal(linkUrl("https://ops.example/", token), `https://ops.example/set-password#t=${token}`);
const issued = new Date("2026-10-01T09:40:00Z");
assert.equal(linkExpiresAt("setup", issued).toISOString(), "2026-10-04T09:40:00.000Z");
assert.equal(linkExpiresAt("reset", issued).toISOString(), "2026-10-02T09:40:00.000Z");
assert.deepEqual(LINK_LIFETIME_HOURS, { setup: 72, reset: 24 });

// Sessions: method still enabled and account usable; pre-AUTH-02 sessions are Google.
const both = { status: "active", passwordEnabled: true, googleEnabled: true };
assert.equal(sessionMethod(null), "google");
assert.equal(sessionMethod("password"), "password");
assert.equal(sessionMethod("magic-link"), null);
assert.equal(sessionAllowed(both, "password"), true);
assert.equal(sessionAllowed({ ...both, passwordEnabled: false }, "password"), false);
assert.equal(sessionAllowed({ ...both, googleEnabled: false }, null), false);
assert.equal(sessionAllowed({ ...both, status: "suspended" }, "google"), false);
assert.equal(sessionAllowed({ ...both, status: "invited" }, "google"), true);
assert.equal(sessionAllowed(both, "magic-link"), false);

// Lockout window: 15 minutes, a lock ending now no longer applies.
const failedAt = new Date("2026-10-01T10:00:00Z");
const until = lockEndsAt(failedAt);
assert.equal(until.toISOString(), "2026-10-01T10:15:00.000Z");
assert.equal(isLocked(until, new Date("2026-10-01T10:14:59Z")), true);
assert.equal(isLocked(until, until), false);
assert.equal(isLocked(null, failedAt), false);
assert.match(SIGN_IN_REFUSED, /After 5 failed tries, wait 15 minutes/);

// Return paths after sign-in stay on this site.
for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, 42]) assert.equal(safeReturnPath(bad), "/");
assert.equal(safeReturnPath("/my-routine?x=1"), "/my-routine?x=1");

// Throttle: 10 sign-in attempts a minute per client, separate per client and bucket.
const throttle = new Throttle();
for (let i = 0; i < 10; i++) assert.equal(throttle.allow("sign-in", "1.2.3.4", 1_000 + i), true);
assert.equal(throttle.allow("sign-in", "1.2.3.4", 1_100), false);
assert.equal(throttle.allow("sign-in", "5.6.7.8", 1_100), true);
assert.equal(throttle.allow("link", "1.2.3.4", 1_100), true);
assert.equal(throttle.allow("sign-in", "1.2.3.4", 61_100), true, "the window slides");

// AC-11 (pure part): self-changes, one method kept, last administrator, teacher link.
const methods = (passwordEnabled: boolean, googleEnabled: boolean, current = { passwordEnabled: true, googleEnabled: true }) =>
  ({ kind: "set_methods" as const, passwordEnabled, googleEnabled, current });
assert.match(selfChangeProblem(1, 1, { kind: "suspend" }) ?? "", /your own account/);
assert.match(selfChangeProblem(1, 1, { kind: "end_role", role: "system_administrator" }) ?? "", /your own system administrator/);
assert.equal(selfChangeProblem(1, 1, { kind: "end_role", role: "teacher" }), null);
assert.match(selfChangeProblem(1, 1, methods(true, false)) ?? "", /turn off your own/);
assert.equal(selfChangeProblem(1, 1, methods(true, true, { passwordEnabled: true, googleEnabled: false })), null, "turning one's own method on is fine");
assert.equal(selfChangeProblem(1, 2, { kind: "suspend" }), null);
assert.equal(changeProblem(methods(false, false)), KEEP_ONE_METHOD);
assert.equal(changeProblem(methods(false, true)), null);
assert.match(changeProblem({ kind: "unlink_teacher", holdsTeacherRole: true }) ?? "", /End the Teacher role first/);
assert.equal(removesLastAdministrator(7, new Set([7]), { kind: "suspend" }), true);
assert.equal(removesLastAdministrator(7, new Set([7]), { kind: "end_role", role: "system_administrator" }), true);
assert.equal(removesLastAdministrator(7, new Set([7]), { kind: "end_role", role: "teacher" }), false);
assert.equal(removesLastAdministrator(7, new Set([7, 8]), { kind: "suspend" }), false);
assert.equal(removesLastAdministrator(9, new Set([7]), { kind: "suspend" }), false);
assert.match(teacherRoleProblem("teacher", false) ?? "", /linked teacher record/);
assert.equal(teacherRoleProblem("teacher", true), null);
assert.equal(teacherRoleProblem("accounts_officer", false), null);

// Role dates are Asia/Dhaka days; today starts now, the end day is inclusive.
const at = new Date("2026-09-30T19:30:00Z"); // 1 October 01:30 in Dhaka
assert.equal(dhakaToday(at), "2026-10-01");
assert.deepEqual(roleWindow("2026-10-01", "", at), { ok: true, activeFrom: at, activeTo: null });
assert.deepEqual(roleWindow("", "", at), { ok: true, activeFrom: at, activeTo: null });
const window = roleWindow("2026-10-05", "2026-12-31", at);
assert.ok(window.ok);
assert.equal(window.activeFrom.toISOString(), "2026-10-04T18:00:00.000Z");
assert.equal(window.activeTo?.toISOString(), "2026-12-31T18:00:00.000Z");
assert.deepEqual(roleWindow("2026-09-30", "", at), { ok: false, field: "activeFrom", message: "A role cannot start in the past. Use today or a later date." });
assert.equal((roleWindow("2026-10-05", "2026-10-04", at) as { field: string }).field, "activeTo");
assert.equal((roleWindow("2026-13-45", "", at) as { field: string }).field, "activeFrom");
assert.equal(roleWindow("2026-10-05", "2026-10-05", at).ok, true, "a one-day role is allowed");

// AC-15: for every role alone, the summary lists exactly what the server policy grants.
const now = new Date("2026-10-01T06:00:00Z");
const CSE = 1;
const departments = new Map([[CSE, "CSE"]]);
for (const role of ROLES) {
  const departmentId = role === "system_administrator" || role === "teacher" ? null : CSE;
  const row = { id: 1, role, departmentId, activeFrom: new Date("2026-09-01T00:00:00Z"), activeTo: null };
  const actor: Actor = { id: 1, email, displayName: "Probe", teacherId: 1, assignments: [{ ...row, role }] };
  const granted = (Object.keys(CAPABILITY_LABELS) as Capability[]).filter((capability) => hasCapability(actor, capability, CSE, now));
  const summary = summarizeAccess([row], departments, now);
  assert.deepEqual(summary.now.map((line) => line.capability), granted, `${role}: summary matches policy`);
  assert.equal(summary.roles[0].state, "current");
}

// Dates: scheduled roles add permissions from their start; ended roles grant nothing.
const tanvir = summarizeAccess([
  { id: 1, role: "teacher", departmentId: null, activeFrom: new Date("2026-08-12T00:00:00Z"), activeTo: null },
  { id: 2, role: "routine_coordinator", departmentId: CSE, activeFrom: new Date("2026-10-05T00:00:00Z"), activeTo: new Date("2026-12-31T00:00:00Z") },
  { id: 3, role: "read_only_viewer", departmentId: CSE, activeFrom: new Date("2026-07-01T00:00:00Z"), activeTo: new Date("2026-08-11T00:00:00Z") },
], departments, now, { assignedGroups: "Only for groups you teach", ownClasses: "Only your own classes" });
assert.deepEqual(tanvir.roles.map((entry) => [entry.label, entry.state, entry.scope]), [
  ["Teacher", "current", "All departments, for assigned groups"],
  ["Routine coordinator", "scheduled", "CSE"],
  ["Read-only viewer", "ended", "CSE"],
]);
assert.deepEqual(tanvir.now.map((line) => [line.label, line.detail]), [
  ["Open the internal portal", null],
  ["Take attendance", "Only for groups you teach"],
  ["Submit extra class load", "Only your own classes"],
]);
assert.equal(tanvir.later.length, 1);
assert.equal(tanvir.later[0].from.toISOString(), "2026-10-05T00:00:00.000Z");
assert.deepEqual(tanvir.later[0].lines.map((line) => line.capability),
  ["view_private_contacts", "manage_routine", "manage_external_commitments", "run_auto_schedule"]);

// A privileged role widens a teacher's attendance to all groups.
const both2 = summarizeAccess([
  { id: 1, role: "teacher", departmentId: null, activeFrom: new Date("2026-08-12T00:00:00Z"), activeTo: null },
  { id: 2, role: "academic_administrator", departmentId: CSE, activeFrom: new Date("2026-08-12T00:00:00Z"), activeTo: null },
], departments, now);
assert.equal(both2.now.find((line) => line.capability === "take_attendance")?.detail, "CSE");
assert.equal(both2.now.find((line) => line.capability === "submit_extra_load")?.detail, "Only their own classes");

console.log("Account rules verification passed: passwords, links, sign-in methods, lockout, throttle, safeguards, access summary = policy for all 7 roles.");
