/**
 * BUG-27 (#27) safety group: deleting a class or an external commitment that
 * other records still use is refused with an explanation and changes nothing
 * (AC-01 to AC-04 in docs/specs/BUG-27/spec.md). The actions run in a pinned
 * child with the real guards and transactions, on owned disposable databases.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { eq, inArray, isNotNull, ne } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { isForeignKeyViolation } from "../../src/lib/db-errors";
import type { ActionResult } from "../../src/lib/action-result";
import { pgliteFactory, withHandle, type DatabaseFactory, type SafetyDatabase } from "./database";
import { populateSummerFixture } from "./fixture";
import { fingerprintDatabase, fingerprintDifferences } from "./fingerprint";
import { withDisposableCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";

const SCENARIOS = path.join(REPO_ROOT, "scripts", "safety", "children", "delete-scenarios.ts");
const ADMIN = "admin@example.invalid";
type Results = Record<"deleteMeeting" | "deleteExternal", ActionResult & { threw?: boolean }>;

async function attempt(database: SafetyDatabase, ids: { meetingId: number; externalId: number }): Promise<Results> {
  const result = await database.runChild(SCENARIOS, ["run", ADMIN, JSON.stringify(ids)]);
  assert.equal(result.status, 0, result.stderr.slice(-4000) || result.stdout.slice(-2000));
  return result.report as Results;
}

const deleteAudits = (database: SafetyDatabase) => withHandle(database, async ({ db }) =>
  (await db.select({ id: schema.auditEvents.id }).from(schema.auditEvents)
    .where(inArray(schema.auditEvents.action, ["meeting.delete", "external.delete"]))).length);

export async function checkDeletes(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  const database = await factory("bug27 deletes");
  try {
    const ids = await withHandle(database, async (handle) => {
      await database.migrate(handle);
      const fixture = await populateSummerFixture(handle.db);
      const { db } = handle;
      const [session] = await db.select().from(schema.attendanceSessions).where(isNotNull(schema.attendanceSessions.meetingId));
      // Five more dates on the same class, so the explanation shortens the list ("and 1 more").
      await db.insert(schema.attendanceSessions).values(["2026-06-20", "2026-06-27", "2026-07-04", "2026-07-11", "2026-07-18"].map((classDate) => ({
        termId: fixture.termId, teachingGroupId: session.teachingGroupId, meetingId: session.meetingId, classDate,
      })));
      const [free] = await db.select().from(schema.meetings).where(ne(schema.meetings.id, session.meetingId!));
      const [allocation] = await db.select().from(schema.workloadAllocations).where(isNotNull(schema.workloadAllocations.externalCommitmentId));
      const [spare] = await db.insert(schema.externalCommitments).values({
        termId: fixture.termId, kind: "room_reservation", completenessLevel: "C", counterpartDepartment: "EEE", courseLabel: "SYN-UNUSED",
      }).returning();
      return { usedMeetingId: session.meetingId!, freeMeetingId: free.id, usedExternalId: allocation.externalCommitmentId!, freeExternalId: spare.id };
    });

    // AC-01, AC-02: refused with an explanation, nothing changed, no audit event.
    const before = await withHandle(database, ({ client }) => fingerprintDatabase(client));
    const blocked = await attempt(database, { meetingId: ids.usedMeetingId, externalId: ids.usedExternalId });
    for (const [name, result] of Object.entries(blocked)) {
      assert.ok(!result.threw, `${name} threw: ${result.message}`);
      assert.equal(result.ok, false, name);
      assert.equal(result.outcome?.kind, "conflict", `${name}: ${JSON.stringify(result)}`);
    }
    assert.equal(blocked.deleteMeeting.message, "This class can't be removed: attendance is recorded against it.");
    assert.deepEqual(blocked.deleteMeeting.issues, [{
      severity: "blocker", title: "Attendance recorded",
      detail: "Attendance was taken in this class on 13 Jun 2026, 20 Jun 2026, 27 Jun 2026, 4 Jul 2026, 11 Jul 2026 and 1 more. Keep the class, or change its time instead.",
    }]);
    assert.equal(blocked.deleteExternal.message, "This commitment can't be removed: it counts toward teaching workload.");
    assert.deepEqual(blocked.deleteExternal.issues, [{ severity: "blocker", title: "Counts toward workload", detail: "SYB's workload counts this commitment (3.00 units)." }]);
    assert.deepEqual(fingerprintDifferences(before, await withHandle(database, ({ client }) => fingerprintDatabase(client))), []);
    lines.push("Refused with a conflict and no change (fingerprint, no audit): a class with attendance on 6 dates (5 listed, \"and 1 more\") and a commitment counted in SYB's workload");

    // AC-03: unused rows are still deleted, each with one audit event.
    const auditsBefore = await deleteAudits(database);
    const allowed = await attempt(database, { meetingId: ids.freeMeetingId, externalId: ids.freeExternalId });
    assert.ok(allowed.deleteMeeting.ok && allowed.deleteExternal.ok, JSON.stringify(allowed));
    await withHandle(database, async ({ db }) => {
      assert.equal((await db.select().from(schema.meetings).where(eq(schema.meetings.id, ids.freeMeetingId))).length, 0);
      assert.equal((await db.select().from(schema.meetingTeachers).where(eq(schema.meetingTeachers.meetingId, ids.freeMeetingId))).length, 0);
      assert.equal((await db.select().from(schema.externalCommitments).where(eq(schema.externalCommitments.id, ids.freeExternalId))).length, 0);
    });
    assert.equal(await deleteAudits(database) - auditsBefore, 2);
    lines.push("Unused class (with its teachers and rooms) and unused commitment are still deleted, one audit event each");

    // AC-04: the race fallback recognises a real foreign-key error, and only that.
    await withHandle(database, async ({ db }) => {
      const fkError = await db.delete(schema.externalCommitments).where(eq(schema.externalCommitments.id, ids.usedExternalId)).then(() => null, (error: unknown) => error);
      assert.ok(fkError && isForeignKeyViolation(fkError), `expected a foreign-key error, got ${String(fkError)}`);
      const uniqueError = await db.insert(schema.teachers).values({ shortCode: "SYA", fullName: "Duplicate" }).then(() => null, (error: unknown) => error);
      assert.ok(uniqueError && !isForeignKeyViolation(uniqueError), "a unique violation is not taken for a foreign-key error");
    });
    lines.push("Race fallback: a real foreign-key error is recognised (code 23503); a unique violation is not");
  } finally {
    await database.dispose();
  }
  return lines;
}

export async function checkDeletesPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => [
    `Disposable PostgreSQL ${cluster.version} cluster`,
    ...await checkDeletes(factoryFor(cluster)),
  ]);
}
