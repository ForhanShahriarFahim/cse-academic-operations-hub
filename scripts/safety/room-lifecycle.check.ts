/** ROM-01B: both adapters, populated forward upgrade/recovery, audit failure and real lock races. */
import assert from "node:assert/strict";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../../src/db/schema";
import { pgliteFactory, withHandle, openPostgres, type DatabaseFactory, type SafetyDatabase, type SafetyHandle } from "./database";
import { populateSummerFixture } from "./fixture";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { fingerprintDatabase } from "./fingerprint";
import { setAuditInsertFault } from "./faults";
import { lockRooms, RoomAssignmentChanged, saveRoomInTransaction, validateRoomAssignment, type RoomTransaction } from "../../src/lib/room-transaction";
import { assertActiveRooms, lifecycleRoomInTransaction, lockMoveRooms, readRoomLifecycleEvidence, retainAssignedRooms } from "../../src/lib/room-lifecycle-transaction";
import { dhakaToday } from "../../src/lib/room-lifecycle";
import type { Actor } from "../../src/lib/auth/policy";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";
import { REPO_ROOT } from "./targets";

const txType = (tx: unknown) => tx as RoomTransaction;
const legacy = async (h: Pick<SafetyHandle, "exec">) => h.exec("drop index if exists academic_terms_one_active_uq; drop table if exists room_unavailability; alter table rooms drop column is_draft; delete from drizzle.__drizzle_migrations where created_at >= 1793145600000;");
async function upgrade(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    await database.migrate(h); await populateSummerFixture(h.db);
    await h.exec("update rooms set is_active = false where code = 'SX-101'");
    await legacy(h);
    const before = await fingerprintDatabase(h.client);
    const oldRooms = (await h.client.query("select * from rooms order by id")).rows;
    await database.migrate(h);
    const after = await fingerprintDatabase(h.client);
    for (const [name, table] of Object.entries(before.tables)) if (!["public.rooms", "drizzle.__drizzle_migrations"].includes(name)) assert.deepEqual(after.tables[name], table, name);
    assert.deepEqual((await h.client.query("select to_jsonb(r) - 'is_draft' as value from rooms r order by id")).rows.map((r) => (r as { value: unknown }).value), oldRooms);
    assert.ok((await h.db.select().from(s.rooms)).every((r) => r.isDraft === false));
    const [imported] = await h.db.insert(s.rooms).values({ code: "IMPORTED", building: "Synthetic" }).returning(); assert.equal(imported.isDraft, false);
    lines.push("Populated 0010 → 0011 retains every existing room, including inactive rows; complete other-table/snapshot/audit fingerprints and preexisting room fields unchanged; imports default retained");
  });
}
async function transactions(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    // The generic safety fixture deliberately has a minimal unsupported snapshot. Give this
    // scenario a recognized synthetic legacy snapshot; unknown-shape refusal is tested below.
    await h.db.update(s.scheduleVersions).set({ snapshot: { generatedAt: "2026-10-28T00:00:00Z", versionNumber: 1, effectiveFrom: null, termName: "Synthetic legacy", meetings: [] } });
    const [admin] = await h.db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
    const actor: Actor = { id: admin.id, displayName: admin.displayName, email: admin.email, teacherId: null, assignments: [] };
    let serial = 0;
    const create = async () => {
      const result = await h.db.transaction((tx) => saveRoomInTransaction(txType(tx), actor, { roomId: "", revision: "", code: `LIFE-${++serial}`, building: "Synthetic", roomType: "lab", capabilities: ["computer", "theory"], capacity: "50", owningDepartmentId: "", notes: "" }));
      assert.ok(result.ok); return (await h.db.select().from(s.rooms).where(eq(s.rooms.id, result.outcome?.kind === "success" ? result.outcome.entityId! : -1)))[0];
    };
    const mutate = (room: typeof s.rooms.$inferSelect, action: string, extra = {}) => h.db.transaction((tx) => lifecycleRoomInTransaction(txType(tx), actor, { roomId: String(room.id), revision: String(room.revision), action, reason: "Synthetic lifecycle check", confirmation: room.code, ...extra }));
    const current = async (id: number) => (await h.db.select().from(s.rooms).where(eq(s.rooms.id, id)))[0];
    const room = await create(); assert.equal(room.isDraft, true);
    const snapshotsBefore = JSON.stringify(await h.db.select().from(s.scheduleVersions));
    assert.ok((await mutate(room, "deactivate")).ok);
    const inactive = await current(room.id); assert.equal(inactive.revision, room.revision + 1); assert.equal(inactive.isActive, false);
    assert.equal((await mutate(room, "reactivate")).outcome?.kind, "stale");
    const audits = () => h.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entity, "room"), eq(s.auditEvents.entityId, room.id)));
    const n = (await audits()).length;
    assert.match((await mutate(inactive, "deactivate")).message, /Nothing changed/); assert.equal((await audits()).length, n);
    await setAuditInsertFault(h, true);
    await assert.rejects(mutate(inactive, "reactivate")); await setAuditInsertFault(h, false);
    assert.deepEqual(await current(room.id), inactive);
    assert.ok((await mutate(inactive, "reactivate")).ok);
    const deletion = await create();
    assert.equal((await mutate(deletion, "delete", { confirmation: "wrong" })).ok, false);
    await setAuditInsertFault(h, true); await assert.rejects(mutate(deletion, "delete")); await setAuditInsertFault(h, false); assert.ok(await current(deletion.id));
    assert.ok((await mutate(deletion, "delete")).ok); assert.equal((await mutate(deletion, "delete")).outcome?.kind, "stale");
    assert.equal((await h.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, deletion.id), eq(s.auditEvents.action, "room.delete")))).length, 1);
    const [reused] = await h.db.insert(s.rooms).values({ code: deletion.code, building: "Synthetic" }).returning(); assert.notEqual(reused.id, deletion.id);
    assert.equal((await mutate(reused, "delete")).ok, false, "default retained");
    const [term] = await h.db.insert(s.academicTerms).values({ name: "Future non-active status", academicYear: 2099, startDate: "2099-01-01", endDate: "2099-12-31", status: "draft" }).returning();
    const [course] = await h.db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    const [group] = await h.db.insert(s.teachingGroups).values({ termId: term.id, courseId: course.id, externalAudienceLabel: "Synthetic audience", externalStudentCount: 20 }).returning();
    const assigned = await create();
    await h.db.transaction(async (tx) => {
      const t = txType(tx); await lockRooms(t, [assigned.id]); await validateRoomAssignment(t, group.id, [assigned.id]);
      const [m] = await tx.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning();
      await tx.insert(s.meetingRooms).values({ meetingId: m.id, roomId: assigned.id, roomRole: "segment" });
      await retainAssignedRooms(t, actor, [assigned.id, assigned.id], `class #${m.id}`);
    });
    const retained = await current(assigned.id); assert.equal(retained.isDraft, false); assert.equal(retained.revision, 2);
    assert.equal((await h.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.entityId, assigned.id), eq(s.auditEvents.action, "room.retain")))).length, 1);
    const evidence = await readRoomLifecycleEvidence(h.db as never, retained); assert.equal(evidence.blocking.length, 1); assert.equal(evidence.totals.meetings, 1); assert.match(evidence.blocking[0].detail, /segment/);
    assert.equal((await mutate(retained, "deactivate")).ok, false);
    const use = await h.db.select({ id: s.meetingRooms.meetingId }).from(s.meetingRooms).where(eq(s.meetingRooms.roomId, retained.id));
    await h.db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.id, use[0].id));
    assert.ok((await mutate(retained, "deactivate")).ok); assert.equal((await mutate(await current(retained.id), "delete")).ok, false);
    const partial = await create();
    const [od] = await h.db.insert(s.externalCommitments).values({ termId: term.id, roomId: partial.id, kind: "unresolved_note", counterpartDepartment: "Synthetic" }).returning();
    assert.equal((await mutate(partial, "deactivate")).ok, false);
    await h.db.delete(s.externalCommitments).where(eq(s.externalCommitments.id, od.id));
    // Every snapshot state, prior structured code aliases, exact boundaries and unknown shapes.
    const snapRoom = await create();
    await h.db.insert(s.auditEvents).values({ action: "room.update", entity: "room", entityId: snapRoom.id, before: { code: "PAST-ALIAS" }, after: { code: snapRoom.code } });
    const [version] = await h.db.insert(s.scheduleVersions).values({ termId: term.id, versionNumber: 99, state: "draft", snapshot: { generatedAt: "2026-10-28T00:00:00Z", versionNumber: 1, effectiveFrom: null, termName: "Legacy", meetings: [{ rooms: [{ id: 99999, code: "PAST-ALIAS" }] }] } }).returning();
    assert.equal((await mutate(snapRoom, "delete")).ok, false);
    await h.db.update(s.scheduleVersions).set({ snapshot: { unknown: true } }).where(eq(s.scheduleVersions.id, version.id)); assert.equal((await mutate(snapRoom, "delete")).ok, false);
    await h.db.update(s.scheduleVersions).set({ snapshot: { generatedAt: "2026-10-28T00:00:00Z", versionNumber: 1, effectiveFrom: null, termName: "Legacy", meetings: [{ rooms: [{ id: 99999, code: `${snapRoom.code}0` }] }] } }).where(eq(s.scheduleVersions.id, version.id)); assert.ok((await mutate(snapRoom, "delete")).ok);
    await h.db.delete(s.scheduleVersions).where(eq(s.scheduleVersions.id, version.id));
    assert.equal(JSON.stringify(await h.db.select().from(s.scheduleVersions)), snapshotsBefore);
    const rollback = await create();
    await setAuditInsertFault(h, true); await assert.rejects(h.db.transaction(async (tx) => { const t = txType(tx); await lockRooms(t, [rollback.id]); await retainAssignedRooms(t, actor, [rollback.id], "failed assignment"); })); await setAuditInsertFault(h, false);
    assert.deepEqual(await current(rollback.id), rollback);
    lines.push(`Lifecycle stale/no-op/reason/confirmation, atomic status/delete/retention rollback, persistent history/new-ID reuse; all-term canonical roles, cancelled references, partial OD, saved alias/unknown snapshots and publication preservation (${dhakaToday()})`);
  });
}
const latch = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };
async function races(database: SafetyDatabase, lines: string[]) {
  const a = await database.open(), b = await database.open(), monitor = await database.open();
  try {
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
    const actor: Actor = { id: admin.id, displayName: admin.displayName, email: admin.email, teacherId: null, assignments: [] };
    const [term] = await a.db.insert(s.academicTerms).values({ name: "Race future", academicYear: 2098, startDate: "2098-01-01", endDate: "2098-12-31", status: "draft" }).returning();
    const [course] = await a.db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    const [group] = await a.db.insert(s.teachingGroups).values({ termId: term.id, courseId: course.id, externalAudienceLabel: "Synthetic", externalStudentCount: 20 }).returning();
    let serial = 0;
    const room = async () => (await a.db.insert(s.rooms).values({ code: `B-RACE-${++serial}`, building: "Synthetic", roomType: "lab", capabilities: ["computer"], capacity: 30, isDraft: true }).returning())[0];
    async function interleave(first: (tx: RoomTransaction) => Promise<unknown>, second: (tx: RoomTransaction) => Promise<unknown>) {
      const held = latch(), finish = latch(), entered = latch();
      const one = a.db.transaction(async (tx) => { const result = await first(txType(tx)); held.release(); await finish.promise; return result; }).then((value) => ({ value }), (error: unknown) => { held.release(); return { error }; });
      await held.promise;
      const two = b.db.transaction(async (tx) => { await tx.execute(sql`select set_config('application_name', 'rom01b-contender', true)`); entered.release(); return second(txType(tx)); }).then((value) => ({ value }), (error: unknown) => ({ error }));
      await entered.promise;
      try {
        let waiting = false; const deadline = Date.now() + 10000;
        while (!waiting && Date.now() < deadline) { waiting = (await monitor.client.query<{ waiting: boolean }>("select exists(select 1 from pg_stat_activity where application_name = 'rom01b-contender' and wait_event_type = 'Lock') as waiting")).rows[0].waiting; if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10)); }
        assert.ok(waiting, "actual PostgreSQL lock barrier observed");
      } finally { finish.release(); }
      return [await one, await two];
    }
    for (const kind of ["manual-create", "manual-update", "automatic-batch", "OD"] as const) for (const action of ["deactivate", "delete"] as const) for (const lifecycleFirst of [true, false]) {
      const r = await room();
      const lifecycle = (tx: RoomTransaction) => lifecycleRoomInTransaction(tx, actor, { roomId: String(r.id), revision: "1", action, reason: "Synthetic race", confirmation: r.code });
      const assign = async (tx: RoomTransaction) => {
        await lockRooms(tx, [r.id]); await assertActiveRooms(tx, [r.id]);
        if (kind === "OD") await tx.insert(s.externalCommitments).values({ termId: term.id, kind: "unresolved_note", counterpartDepartment: "Synthetic", roomId: r.id });
        else { await validateRoomAssignment(tx, group.id, [r.id]); const [m] = await tx.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning(); await tx.insert(s.meetingRooms).values({ meetingId: m.id, roomId: r.id, roomRole: kind === "manual-update" ? "segment" : "primary" }); }
        await retainAssignedRooms(tx, actor, [r.id], kind);
      };
      const result = await interleave(lifecycleFirst ? lifecycle : assign, lifecycleFirst ? assign : lifecycle);
      if (lifecycleFirst) { assert.ok("value" in result[0] && (result[0].value as { ok: boolean }).ok); assert.ok("error" in result[1] && result[1].error instanceof RoomAssignmentChanged); }
      else assert.ok("value" in result[1] && !(result[1].value as { ok: boolean }).ok);
    }
    // A past-only weekday may be deactivated; a subsequent single/bulk move must refuse.
    for (const bulk of [false, true]) for (const lifecycleFirst of [true, false]) {
      const r = await room();
      const [pastGroup] = await a.db.insert(s.teachingGroups).values({ termId: (await a.db.select().from(s.academicTerms).where(eq(s.academicTerms.name, "Summer 2026")))[0].id, courseId: course.id }).returning();
      const ms = await a.db.insert(s.meetings).values(Array.from({ length: bulk ? 2 : 1 }, () => ({ teachingGroupId: pastGroup.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }))).returning();
      await a.db.insert(s.meetingRooms).values(ms.map((m) => ({ meetingId: m.id, roomId: r.id })));
      const move = async (tx: RoomTransaction) => { await lockMoveRooms(tx, ms.map((m) => m.id).reverse()); for (const m of ms) await tx.update(s.meetings).set({ dayOfWeek: 1 }).where(eq(s.meetings.id, m.id)); };
      const deactivate = (tx: RoomTransaction) => lifecycleRoomInTransaction(tx, actor, { roomId: String(r.id), revision: "1", action: "deactivate", reason: "Past use" });
      const result = await interleave(lifecycleFirst ? deactivate : move, lifecycleFirst ? move : deactivate);
      if (lifecycleFirst) assert.ok("error" in result[1] && result[1].error instanceof RoomAssignmentChanged); else assert.ok("value" in result[1] && (result[1].value as { ok: boolean }).ok);
    }
    lines.push("Real two-connection PostgreSQL barriers: lifecycle/delete versus manual/auto/OD reference-and-retention seams in both commit orders; single/bulk sorted meeting-before-room moves versus lifecycle; unsafe contender refused");
  } finally { await a.close(); await b.close(); await monitor.close(); }
}
export async function checkRoomLifecycle(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const database = await factory("rom01b"); const lines: string[] = [];
  try {
    await upgrade(database, lines); await transactions(database, lines);
    if (database.adapter === "postgresql") await races(database, lines);
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/room-lifecycle-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-6000) || child.stdout.slice(-2000)); lines.push(...(child.report as { lines: string[] }).lines);
    if (database.adapter === "pglite") await pgliteRecovery(lines);
    return lines;
  } finally { await database.dispose(); }
}
async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("rom01b pre-upgrade"), restored = createOwnedRun("rom01b restore"), backup = newBackupLocation("rom01b");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populateSummerFixture(h.db as never); await legacy({ exec: async (q) => { await h.client.exec(q); } }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup);
    const upgraded = await openOwnedPglite(source); try { await migrateOwned(upgraded); assert.ok((await upgraded.db.select().from(s.rooms)).every((r) => !r.isDraft)); } finally { await upgraded.close(); }
    assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    lines.push("PGlite pre-0011 cold backup → populated upgrade → separate-target restore: exact complete fingerprint recovered");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_rom_b_backup"), restored = await cluster.createDatabase("safe01_rom_b_restore");
  const backup = newBackupLocation("rom01b PG"), key = path.join(cluster.run.root, "rom01b.key"); createKeyFile(key);
  const migrator = await factoryFor(cluster)("rom01b migrator");
  try {
    const h = openPostgres(source); try { await migrator.migrate(h); await populateSummerFixture(h.db); await legacy(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key);
    const upgraded = openPostgres(source); try { await migrator.migrate(upgraded); assert.ok((await upgraded.db.select().from(s.rooms)).every((r) => !r.isDraft)); } finally { await upgraded.close(); }
    assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    lines.push("PostgreSQL pre-0011 encrypted dump → populated upgrade → separate-target restore: exact complete fingerprint recovered");
  } finally { await migrator.dispose(); await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}
export async function checkRoomLifecyclePostgres(bin: string | undefined) { return withDisposableCluster(bin, async (cluster) => { const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await checkRoomLifecycle(factoryFor(cluster))]; await postgresRecovery(cluster, lines); return lines; }); }
