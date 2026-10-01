/**
 * T-04 (AC-05): production write paths commit their audit atomically, roll back
 * completely when the audit insert fails, and leave no domain writes when the
 * request is denied. Categories: invited-user activation, the shared
 * `auditedChange` helper, publication, auto-placement, access management and
 * the first-administrator bootstrap command.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { REPO_ROOT } from "./targets";
import { pgliteFactory, withHandle, type DatabaseFactory, type SafetyDatabase } from "./database";
import { fingerprintDatabase, fingerprintDifferences, type DatabaseFingerprint } from "./fingerprint";
import { populateSummerFixture } from "./fixture";
import { INJECTED_AUDIT_FAILURE, setAuditInsertFault } from "./faults";
import type { ChildInputs } from "./app-env";

const PROBE = path.join(__dirname, "children", "action-probe.ts");
const BOOTSTRAP = path.join(REPO_ROOT, "scripts", "bootstrap-admin.ts");
const ADMIN = "admin@example.invalid";
const TEACHER = "teacher-a@example.invalid";
const VIEWER = "viewer@example.invalid";

type Outcome = {
  result?: { ok?: boolean; message?: string; actorId?: number | null; outcome?: { kind: string; reason?: string } };
  error?: { name: string; message: string };
};

async function probe(run: SafetyDatabase, email: string | null, operation: string, argument?: unknown): Promise<Outcome> {
  const args = [email ?? "-", operation, ...(argument === undefined ? [] : [JSON.stringify(argument)])];
  const result = await run.runChild(PROBE, args);
  assert.equal(result.status, 0, result.stderr.slice(-2000));
  return result.report as Outcome;
}

const fingerprint = (run: SafetyDatabase) => withHandle(run, (handle) => fingerprintDatabase(handle.client));
const fault = (run: SafetyDatabase, enabled: boolean) => withHandle(run, (handle) => setAuditInsertFault(handle, enabled));

/** Row changes only: a rolled-back insert may still advance a sequence, which is not a domain write. */
function rowChanges(before: DatabaseFingerprint, after: DatabaseFingerprint): string[] {
  return fingerprintDifferences(before, after).filter((item) => !item.startsWith("sequence "));
}

/** Run `work` and require that no table row changed. */
async function expectNoWrites<T>(run: SafetyDatabase, label: string, work: () => Promise<T>): Promise<T> {
  const before = await fingerprint(run);
  const result = await work();
  assert.deepEqual(rowChanges(before, await fingerprint(run)), [], `${label} changed rows`);
  return result;
}

/** Run `work` and require exactly the listed tables to change. */
async function expectChanges<T>(run: SafetyDatabase, label: string, tables: string[], work: () => Promise<T>): Promise<T> {
  const before = await fingerprint(run);
  const result = await work();
  assert.deepEqual(rowChanges(before, await fingerprint(run)).sort(), tables.map((table) => `table public.${table}`).sort(), label);
  return result;
}

/** Denied results keep the legacy message and carry the structured permission outcome (T-05 contract). */
const denied = (outcome: Outcome, pattern: RegExp, email: string | null) => {
  assert.ok(outcome.result?.ok === false && pattern.test(outcome.result.message ?? ""), JSON.stringify(outcome));
  assert.deepEqual(outcome.result.outcome, { kind: "permission", reason: email ? "forbidden" : "unauthenticated" });
};
const injected = (outcome: Outcome) => assert.equal(outcome.error?.message, INJECTED_AUDIT_FAILURE, JSON.stringify(outcome));

async function auditRows(run: SafetyDatabase, action: string) {
  return withHandle(run, (handle) => handle.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, action)));
}

/** Deny, fail the audit, then succeed — the order every category follows. */
async function category(
  run: SafetyDatabase,
  name: string,
  deniedCases: Array<[string | null, RegExp]>,
  call: (email: string | null) => Promise<Outcome>,
  changed: string[],
): Promise<Outcome> {
  for (const [email, pattern] of deniedCases) {
    const outcome = await expectNoWrites(run, `${name} denied for ${email ?? "anonymous"}`, () => call(email));
    if (outcome.error) assert.ok(pattern.test(`${outcome.error.name}: ${outcome.error.message}`), JSON.stringify(outcome));
    else denied(outcome, pattern, email);
  }
  await fault(run, true);
  injected(await expectNoWrites(run, `${name} with failing audit`, () => call(ADMIN)));
  await fault(run, false);
  const success = await expectChanges(run, `${name} success`, changed, () => call(ADMIN));
  assert.ok(!success.error && success.result?.ok !== false, JSON.stringify(success));
  return success;
}

async function checkApplicationPaths(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const run = await factory("t04 application paths");
  try {
    const summer = await withHandle(run, async (handle) => {
      await run.migrate(handle);
      const fixture = await populateSummerFixture(handle.db);
      const [viewer] = await handle.db.insert(schema.portalUsers).values({ email: VIEWER, displayName: "Synthetic Viewer", status: "active" }).returning();
      await handle.db.insert(schema.roleAssignments).values({ userId: viewer.id, role: "read_only_viewer", grantedByUserId: fixture.adminUserId });
      await setAuditInsertFault(handle, false);
      return fixture;
    });

    // Activation: failing audit keeps the account invited; success audits once; repeat sign-ins write nothing.
    await fault(run, true);
    injected(await expectNoWrites(run, "activation with failing audit", () => probe(run, TEACHER, "whoami")));
    await fault(run, false);
    const activated = await expectChanges(run, "activation", ["portal_users", "audit_events"], () => probe(run, TEACHER, "whoami"));
    assert.equal(activated.result?.actorId, summer.teacherUserId);
    const before = await fingerprint(run);
    assert.equal((await probe(run, TEACHER, "whoami")).result?.actorId, summer.teacherUserId);
    assert.deepEqual(fingerprintDifferences(before, await fingerprint(run)), [], "second sign-in wrote");
    const activation = await auditRows(run, "user.activate");
    assert.equal(activation.length, 1);
    assert.equal(activation[0].actorUserId, summer.teacherUserId);
    assert.equal(activation[0].actorKind, "user");
    lines.push("Activation: failing audit leaves the user invited and the request fails; first sign-in activates with one user-attributed audit; later sign-ins write nothing");

    const signIn = /Sign in before making changes/;
    const forbidden = /You do not have permission/;

    // Shared auditedChange helper.
    const student = { teachingGroupId: String(summer.mergedGroupId), studentCode: "SYN-0100", fullName: "Synthetic New Student", audienceType: "local" };
    await category(run, "upsertStudent", [[null, signIn], [VIEWER, forbidden], [TEACHER, forbidden]],
      (email) => probe(run, email, "upsertStudent", student), ["students", "course_enrollments", "audit_events"]);
    const [created] = await auditRows(run, "student.create");
    assert.equal(created.actorUserId, summer.adminUserId);

    // Manual transaction: publication (supersede + insert + audit).
    await category(run, "publish", [[null, signIn], [VIEWER, forbidden], [TEACHER, forbidden]],
      (email) => probe(run, email, "publish", "Synthetic T-04 publication"), ["schedule_versions", "audit_events"]);
    const versions = await withHandle(run, (handle) => handle.db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.termId, summer.termId)));
    assert.deepEqual(versions.map((version) => `${version.versionNumber}:${version.state}`).sort(), ["1:superseded", "2:published"]);

    // Manual transaction: auto-placement (meetings, teachers, rooms, one audit per meeting).
    const placed = await category(run, "autoSchedule", [[null, signIn], [VIEWER, forbidden], [TEACHER, forbidden]],
      (email) => probe(run, email, "autoSchedule"), ["meetings", "meeting_teachers", "meeting_rooms", "audit_events"]);
    const autoAudits = await auditRows(run, "meeting.auto_create");
    assert.ok(autoAudits.length >= 1 && autoAudits.every((row) => row.actorUserId === summer.adminUserId), placed.result?.message);

    // UX-01 amendment A: full class edit (day, time, teachers, rooms) as one validated, audited change.
    const lab = await withHandle(run, async (handle) => {
      const [meeting] = await handle.db.select().from(schema.meetings).where(eq(schema.meetings.teachingGroupId, summer.sessionalGroupId));
      const staff = await handle.db.select().from(schema.meetingTeachers).where(eq(schema.meetingTeachers.meetingId, meeting.id));
      const rooms = await handle.db.select().from(schema.meetingRooms).where(eq(schema.meetingRooms.meetingId, meeting.id));
      return { meeting, staff, rooms };
    });
    const labUpdate = {
      meetingId: lab.meeting.id,
      update: {
        dayOfWeek: lab.meeting.dayOfWeek, startMinutes: 510, endMinutes: 660,
        teacherIds: lab.staff.map((row) => row.teacherId), roomIds: lab.rooms.map((row) => row.roomId),
        isException: false, exceptionNote: null,
      },
    };
    await category(run, "updateMeeting", [[null, signIn], [VIEWER, forbidden], [TEACHER, forbidden]],
      (email) => probe(run, email, "updateMeeting", labUpdate), ["meetings", "meeting_teachers", "meeting_rooms", "audit_events"]);
    const edited = await withHandle(run, async (handle) => ({
      meeting: (await handle.db.select().from(schema.meetings).where(eq(schema.meetings.id, lab.meeting.id)))[0],
      staff: await handle.db.select().from(schema.meetingTeachers).where(eq(schema.meetingTeachers.meetingId, lab.meeting.id)),
    }));
    assert.deepEqual([edited.meeting.startMinutes, edited.meeting.endMinutes], [510, 660]);
    assert.deepEqual(edited.staff.map((row) => `${row.teacherId}:${row.role}`).sort(), lab.staff.map((row) => `${row.teacherId}:${row.role}`).sort(), "teacher roles were not preserved");
    const [updateAudit] = await auditRows(run, "meeting.update");
    assert.equal(updateAudit.actorUserId, summer.adminUserId);
    // Moving the co-teacher's class onto the other department's booking of that teacher is refused and writes nothing.
    const external = await withHandle(run, async (handle) => (await handle.db.select().from(schema.externalCommitments))[0]);
    const clash = { ...labUpdate, update: { ...labUpdate.update, dayOfWeek: external.dayOfWeek!, startMinutes: external.startMinutes!, endMinutes: external.endMinutes! } };
    const refused = await expectNoWrites(run, "updateMeeting onto an external booking", () => probe(run, ADMIN, "updateMeeting", clash));
    assert.ok(refused.result?.ok === false && /blocking conflict/.test(refused.result.message ?? ""), JSON.stringify(refused));

    // Manual transaction: access management (AUTH-02 account creation, Google only so no link).
    const invitation = { email: "new-viewer@example.invalid", displayName: "Synthetic Invitee", role: "read_only_viewer", google: "on" };
    await category(run, "createAccount", [[null, signIn], [VIEWER, forbidden], [TEACHER, forbidden]],
      (email) => probe(run, email, "createAccount", invitation), ["portal_users", "role_assignments", "audit_events"]);
    const invited = await withHandle(run, (handle) => handle.db.select().from(schema.portalUsers).where(eq(schema.portalUsers.email, invitation.email)));
    assert.equal(invited.length, 1);
    assert.equal((await auditRows(run, "user.create"))[0].entityId, invited[0].id);
    lines.push("Shared auditedChange (student), publication, auto-placement, class edit and invitation: anonymous/viewer/teacher denied with no row changes; injected audit failure rolls back every domain write; success changes exactly the expected tables with actor-attributed audits; a class edit keeps teacher roles and a clashing edit is refused with no writes");
  } finally {
    await run.dispose();
  }
}

async function bootstrap(run: SafetyDatabase, inputs: ChildInputs) {
  return run.runChild(BOOTSTRAP, [], inputs);
}

async function checkBootstrap(factory: DatabaseFactory, lines: string[]): Promise<void> {
  const run = await factory("t04 bootstrap");
  try {
    await withHandle(run, async (handle) => {
      await run.migrate(handle);
      await setAuditInsertFault(handle, true);
    });
    const first = { PORTAL_BOOTSTRAP_ADMIN_EMAIL: "first-admin@example.invalid", PORTAL_BOOTSTRAP_ADMIN_NAME: "Synthetic First Admin" };
    const failed = await expectNoWrites(run, "bootstrap with failing audit", () => bootstrap(run, first));
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, new RegExp(INJECTED_AUDIT_FAILURE));

    await fault(run, false);
    const created = await expectChanges(run, "bootstrap", ["portal_users", "role_assignments", "audit_events"], () => bootstrap(run, first));
    assert.equal(created.status, 0, created.stderr);
    const [event] = await auditRows(run, "user.bootstrap_admin");
    assert.equal(event.actorKind, "system");
    assert.equal(event.actorUserId, null);
    const admin = await withHandle(run, (handle) => handle.db.select().from(schema.roleAssignments)
      .where(and(eq(schema.roleAssignments.role, "system_administrator"), eq(schema.roleAssignments.userId, event.entityId!))));
    assert.equal(admin.length, 1);

    const rerun = await expectNoWrites(run, "bootstrap rerun", () => bootstrap(run, first));
    assert.equal(rerun.status, 0);
    assert.match(rerun.stdout, /Nothing changed/);
    const other = await expectNoWrites(run, "second administrator", () => bootstrap(run, { PORTAL_BOOTSTRAP_ADMIN_EMAIL: "someone-else@example.invalid" }));
    assert.equal(other.status, 1);
    assert.match(other.stderr, /An administrator already exists/);
    lines.push("Bootstrap command: failing audit leaves no user/role; success writes user, role and one system-attributed audit atomically; rerun writes nothing; a second administrator is refused");
  } finally {
    await run.dispose();
  }
}

export async function checkAudit(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  await checkApplicationPaths(factory, lines);
  await checkBootstrap(factory, lines);
  return lines;
}
