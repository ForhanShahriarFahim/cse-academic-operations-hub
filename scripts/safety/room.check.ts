/** ROM-01A (#5): populated adapters, rollback, differential impact and room-lock interleavings. */
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../../src/db/schema";
import { pgliteFactory, withHandle, openPostgres, type DatabaseFactory, type SafetyDatabase, type SafetyHandle } from "./database";
import { populateSummerFixture, populateSpringFixture } from "./fixture";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { REPO_ROOT } from "./targets";
import { fingerprintDatabase } from "./fingerprint";
import { setAuditInsertFault } from "./faults";
import { lockRooms, readRoomReferences, RoomAssignmentChanged, saveRoomInTransaction, validateRoomAssignment, type RoomTransaction } from "../../src/lib/room-transaction";
import type { RoomRecord } from "../../src/lib/room-records";
import type { Actor } from "../../src/lib/auth/policy";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";

const txType = (tx: unknown) => tx as RoomTransaction;
const raw = (row: RoomRecord, patch: Record<string, unknown> = {}) => ({ ...row, roomId: String(row.id), revision: String(row.revision), capacity: row.capacity == null ? "" : String(row.capacity), owningDepartmentId: row.owningDepartmentId == null ? "" : String(row.owningDepartmentId), notes: row.notes ?? "", ...patch });
const legacy = async (handle: Pick<SafetyHandle, "exec">) => handle.exec(`drop index if exists academic_terms_one_active_uq; drop table if exists room_unavailability; alter table rooms drop constraint rooms_code_nonblank_ck, drop constraint rooms_building_nonblank_ck, drop constraint rooms_type_ck, drop constraint rooms_capacity_ck, drop constraint rooms_revision_ck; drop index rooms_code_canonical_uq; alter table rooms drop column revision, drop column is_draft; delete from drizzle.__drizzle_migrations where created_at >= 1793059200000;`);

async function upgrade(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    await database.migrate(h);
    const summer = await populateSummerFixture(h.db);
    await populateSpringFixture(h.db, summer);
    await legacy(h);
    // Preserve a noncanonical but otherwise supported legacy code and inactive room.
    await h.exec(`update rooms set code = ' legacy-1 ', is_active = false where code = 'SX-101'`);
    const before = await fingerprintDatabase(h.client);
    const roomBefore = await h.client.query(`select * from rooms order by id`);
    await database.migrate(h);
    const after = await fingerprintDatabase(h.client);
    for (const [name, table] of Object.entries(before.tables)) if (!["public.rooms", "drizzle.__drizzle_migrations"].includes(name)) assert.deepEqual(after.tables[name], table, name);
    assert.deepEqual((await h.client.query(`select to_jsonb(r) - 'revision' - 'is_draft' as value from rooms r order by id`)).rows.map((r) => (r as { value: unknown }).value), roomBefore.rows);
    assert.ok((await h.db.select().from(s.rooms)).every((row) => row.revision === 1));
    await assert.rejects(h.client.query(`insert into rooms (code, building, is_active) values ('LEGACY-1', 'Synthetic', false)`), /rooms_code_canonical_uq/);
    for (const [column, value] of [["capacity", "0"], ["room_type", "'hall'"], ["building", "' '"], ["code", "' '"]]) await assert.rejects(h.client.query(`update rooms set ${column} = ${value}`), /rooms_.*_ck/);
    lines.push("Populated 0009 → 0010: all preexisting room values (including whitespace/case/inactive), business tables, references, snapshots and audits preserved; only revision=1 added; constraints enforce new writes");
    await legacy(h);
    for (const bad of ["insert into rooms (code, building) values ('LEGACY-1', 'Synthetic')", "update rooms set capacity = 0 where code = ' legacy-1 '", "update rooms set room_type = 'hall' where code = ' legacy-1 '", "update rooms set building = ' ' where code = ' legacy-1 '", "update rooms set code = ' ' where code = ' legacy-1 '"]) {
      // A Drizzle transaction pins one PostgreSQL connection as well as PGlite's connection.
      await assert.rejects(h.db.transaction(async (tx) => {
        await tx.execute(sql.raw(bad));
        await tx.execute(sql.raw(readFileSync(path.join(REPO_ROOT, "drizzle/0010_room-directory.sql"), "utf8").split("--> statement-breakpoint")[0]));
      }), (error: unknown) => String((error as { cause?: unknown }).cause ?? error).includes("ROM-01A preflight"));
    }
    // Exercise the actual migrator's failure and transactional rollback, then recover the legacy row.
    await h.exec(`insert into rooms (code, building) values ('LEGACY-1', 'Synthetic')`);
    const invalidBefore = await fingerprintDatabase(h.client);
    await assert.rejects(database.migrate(h), /ROM-01A preflight/);
    assert.deepEqual(await fingerprintDatabase(h.client), invalidBefore);
    await h.exec(`delete from rooms where code = 'LEGACY-1'`);
    await database.migrate(h);
    lines.push("Invalid legacy canonical duplicates/type/capacity/blank fields rejected; actual migrator duplicate failure leaves schema, rows, references, snapshots and journal unchanged; valid legacy state migrates after explicit fixture repair");
  });
}

async function transactions(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    const [admin] = await h.db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
    const actor: Actor = { id: admin.id, displayName: admin.displayName, email: admin.email, teacherId: null, assignments: [] };
    const [room] = await h.db.insert(s.rooms).values({ code: "CHECK-1", building: "Synthetic", capacity: 30, roomType: "lab", capabilities: ["computer", "theory"] }).returning();
    const save = (row: RoomRecord, patch: Record<string, unknown>) => h.db.transaction((tx) => saveRoomInTransaction(txType(tx), actor, raw(row, patch)));
    await setAuditInsertFault(h, true);
    await assert.rejects(save(room, { notes: "Must roll back" }), (error: unknown) => String((error as { cause?: unknown }).cause ?? error).includes("injected audit failure"));
    await setAuditInsertFault(h, false);
    assert.deepEqual((await h.db.select().from(s.rooms).where(eq(s.rooms.id, room.id)))[0], room);
    const [oldTerm] = await h.db.select().from(s.academicTerms).where(eq(s.academicTerms.status, "completed"));
    const [course] = await h.db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    const [group] = await h.db.insert(s.teachingGroups).values({ termId: oldTerm.id, courseId: course.id, externalAudienceLabel: "Synthetic external", externalStudentCount: 50 }).returning();
    const [meeting] = await h.db.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning();
    await h.db.insert(s.meetingRooms).values({ meetingId: meeting.id, roomId: room.id, roomRole: "alternative" });
    const refs = await readRoomReferences(h.db as never, room.id);
    assert.equal(refs.meetings.length, 1); assert.equal(refs.meetings[0].audienceSize, 50); assert.equal(refs.meetings[0].roomRole, "alternative");
    assert.equal((await save(room, { capacity: "20" })).outcome?.kind, "conflict");
    assert.equal((await save(room, { capacity: "" })).outcome?.kind, "conflict");
    assert.equal((await save(room, { capacity: "40" })).ok, true, "partial improvement");
    let current = (await h.db.select().from(s.rooms).where(eq(s.rooms.id, room.id)))[0];
    assert.equal((await save(current, { notes: "Useful correction" })).ok, true);
    current = (await h.db.select().from(s.rooms).where(eq(s.rooms.id, room.id)))[0];
    await h.db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.id, meeting.id));
    assert.equal((await save(current, { capacity: "" })).ok, true, "cancelled use does not block");
    const [emptyGroup] = await h.db.insert(s.teachingGroups).values({ termId: oldTerm.id, courseId: course.id }).returning();
    const [emptyMeeting] = await h.db.insert(s.meetings).values({ teachingGroupId: emptyGroup.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning();
    await h.db.insert(s.meetingRooms).values({ meetingId: emptyMeeting.id, roomId: room.id, roomRole: "segment" });
    assert.equal((await readRoomReferences(h.db as never, room.id)).meetings[0].audienceSize, null, "empty audience is unknown");
    current = (await h.db.select().from(s.rooms).where(eq(s.rooms.id, room.id)))[0];
    assert.ok((await save(current, { capacity: "60" })).warningFingerprint);
    await h.db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.id, emptyMeeting.id));
    await h.db.insert(s.externalCommitments).values({ termId: oldTerm.id, kind: "unresolved_note", counterpartDepartment: "Synthetic EEE", roomId: room.id });
    const warning = await save(current, { capacity: "60" }); assert.ok(warning.warningFingerprint);
    await h.db.insert(s.externalCommitments).values({ termId: oldTerm.id, kind: "teaching", counterpartDepartment: "Synthetic MATH", roomId: room.id });
    assert.notEqual((await save(current, { capacity: "60", acknowledge: "on", warningFingerprint: warning.warningFingerprint })).warningFingerprint, warning.warningFingerprint);
    lines.push("Audit insert failure rolls back fields/revision; older-term alternative/segment references checked; 30→40 for 50 allowed, worsening/clearing blocked; cancelled use ignored, empty audience unknown, partial OD references refresh warnings");
  });
}

export async function checkRooms(factory: DatabaseFactory = pgliteFactory): Promise<string[]> {
  const lines: string[] = [];
  const database = await factory("rom01a");
  try {
    await upgrade(database, lines);
    // A fresh fixture for action tests avoids mutation interference from migration scenarios.
    const actions = await factory("rom01a actions");
    try {
      await withHandle(actions, async (h) => { await actions.migrate(h); await populateSummerFixture(h.db); });
      const child = await actions.runChild(path.join(REPO_ROOT, "scripts/safety/children/room-scenarios.ts"));
      assert.equal(child.status, 0, child.stderr.slice(-5000) || child.stdout.slice(-2000));
      lines.push(...(child.report as { lines: string[] }).lines);
    } finally { await actions.dispose(); }
    await transactions(database, lines);
    if (database.adapter === "postgresql") await races(database, lines);
    else await pgliteRecovery(lines);
    return lines;
  } finally { await database.dispose(); }
}

// Explicit first-holder barrier; contender waits on a real row lock, not an elapsed-time guess.
const latch = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };
async function races(database: SafetyDatabase, lines: string[]) {
  const a = await database.open(); const b = await database.open(); const monitor = await database.open();
  try {
    const [admin] = await a.db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
    const actor: Actor = { id: admin.id, displayName: admin.displayName, email: admin.email, teacherId: null, assignments: [] };
    const [term] = await a.db.select().from(s.academicTerms).limit(1);
    const [course] = await a.db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    const [group] = await a.db.insert(s.teachingGroups).values({ termId: term.id, courseId: course.id, externalAudienceLabel: "Known external", externalStudentCount: 30 }).returning();
    let sequence = 0;
    const newRoom = async () => (await a.db.insert(s.rooms).values({ code: `RACE-${++sequence}`, building: "Synthetic", roomType: "lab", capabilities: ["computer"], capacity: 50 }).returning())[0];
    async function interleave(first: (tx: RoomTransaction) => Promise<unknown>, second: (tx: RoomTransaction) => Promise<unknown>) {
      const held = latch(); const finish = latch(); const entered = latch();
      const holder = a.db.transaction(async (tx) => { const result = await first(txType(tx)); held.release(); await finish.promise; return result; });
      // Attach rejection handlers before barriers to avoid unhandled failures.
      const firstResult = holder.then((value) => ({ value }), (error: unknown) => { held.release(); return { error }; });
      await held.promise;
      const contender = b.db.transaction(async (tx) => { await tx.execute(sql`select set_config('application_name', 'rom01a-contender', true)`); entered.release(); return second(txType(tx)); });
      const secondResult = contender.then((value) => ({ value }), (error: unknown) => ({ error }));
      await entered.promise;
      try {
        const deadline = Date.now() + 10000;
        let waiting = false;
        while (!waiting && Date.now() < deadline) {
          waiting = (await monitor.client.query<{ waiting: boolean }>(`select exists(select 1 from pg_stat_activity where application_name = 'rom01a-contender' and wait_event_type = 'Lock') as waiting`)).rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(waiting, "contender observed blocked on PostgreSQL lock");
      } finally { finish.release(); }
      return [await firstResult, await secondResult];
    }
    const revisionRoom = await newRoom();
    const staleRace = await interleave((tx) => saveRoomInTransaction(tx, actor, raw(revisionRoom, { notes: "Winner" })), (tx) => saveRoomInTransaction(tx, actor, raw(revisionRoom, { notes: "Loser" })));
    assert.equal("value" in staleRace[0] && (staleRace[0].value as { ok: boolean }).ok, true);
    assert.equal("value" in staleRace[1] && (staleRace[1].value as { outcome: { kind: string } }).outcome.kind, "stale");
    for (const mode of ["create", "rename"] as const) {
      const roomA = await newRoom(); const roomB = await newRoom();
      const candidate = (room: RoomRecord) => raw(room, { code: `CANONICAL-${mode.toUpperCase()}`, ...(mode === "create" ? { roomId: "", revision: "" } : {}) });
      const result = await interleave((tx) => saveRoomInTransaction(tx, actor, candidate(roomA)), (tx) => saveRoomInTransaction(tx, actor, candidate(roomB)));
      assert.ok("value" in result[0] && (result[0].value as { ok: boolean }).ok);
      assert.ok("error" in result[1] && ((result[1].error as { cause?: { code?: string } }).cause?.code ?? (result[1].error as { code?: string }).code) === "23505", `${mode} unique loser`);
      assert.equal((await a.db.select().from(s.rooms).where(eq(s.rooms.code, `CANONICAL-${mode.toUpperCase()}`))).length, 1);
    }
    // The exact shared validation seam used by create/update/automatic placement is exercised for both commit orders.
    for (const writer of ["manual-create", "manual-update", "automatic-batch"] as const) for (const editFirst of [true, false]) {
      const room = await newRoom();
      const assign = async (tx: RoomTransaction) => {
        await lockRooms(tx, [room.id]); await validateRoomAssignment(tx, group.id, [room.id]);
        const [meeting] = await tx.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 }).returning();
        await tx.insert(s.meetingRooms).values({ meetingId: meeting.id, roomId: room.id, roomRole: writer === "manual-update" ? "alternative" : "primary" });
        return meeting.id;
      };
      const edit = (tx: RoomTransaction) => saveRoomInTransaction(tx, actor, raw(room, { roomType: "classroom" }));
      const results = await interleave(editFirst ? edit : assign, editFirst ? assign : edit);
      if (editFirst) assert.ok("error" in results[1] && results[1].error instanceof RoomAssignmentChanged, writer);
      else assert.equal("value" in results[1] && (results[1].value as { outcome: { kind: string } }).outcome.kind, "conflict", writer);
    }
    for (const odFirst of [true, false]) {
      const room = await newRoom();
      const insert = async (tx: RoomTransaction) => { await lockRooms(tx, [room.id]); await tx.insert(s.externalCommitments).values({ termId: term.id, kind: "unresolved_note", counterpartDepartment: "Synthetic EEE", roomId: room.id }); };
      const edit = (tx: RoomTransaction) => saveRoomInTransaction(tx, actor, raw(room, { capacity: "60" }));
      const results = await interleave(odFirst ? insert : edit, odFirst ? edit : insert);
      if (odFirst) assert.ok("value" in results[1] && (results[1].value as { warningFingerprint?: string }).warningFingerprint);
      else assert.equal("value" in results[0] && (results[0].value as { ok: boolean }).ok, true);
    }
    const batchRoom = await newRoom();
    const countBefore = await a.client.query(`select count(*) from meetings`);
    await assert.rejects(a.db.transaction(async (tx) => {
      await lockRooms(txType(tx), [batchRoom.id]);
      await tx.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 });
      await tx.insert(s.auditEvents).values({ action: "meeting.auto_create", entity: "meeting", actorKind: "system" });
      await tx.update(s.rooms).set({ capacity: 1 }).where(eq(s.rooms.id, batchRoom.id));
      await validateRoomAssignment(txType(tx), group.id, [batchRoom.id]);
    }), /Room suitability changed/);
    assert.deepEqual(await a.client.query(`select count(*) from meetings`), countBefore);
    assert.equal((await a.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.action, "meeting.auto_create"), eq(s.auditEvents.actorKind, "system")))).length, 0);
    lines.push("Real PostgreSQL lock barriers: two editors produce save+stale; concurrent creates/renames have one unique winner; assignment validation/reference seam (create/update/auto roles) versus edit in both commit orders refuses the unsafe loser; OD insert/edit both orders; failed batch rolls back inserted meetings/audits");
  } finally { await a.close(); await b.close(); await monitor.close(); }
}
export async function checkRoomsPostgres(bin: string | undefined) {
  return withDisposableCluster(bin, async (cluster) => {
    const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await checkRooms(factoryFor(cluster))];
    await postgresRecovery(cluster, lines);
    return lines;
  });
}

async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("rom01a pre-upgrade backup");
  const restored = createOwnedRun("rom01a pre-upgrade restore");
  const backup = newBackupLocation("rom01a pre-upgrade");
  try {
    const h = await openOwnedPglite(source);
    try {
      await migrateOwned(h); await populateSummerFixture(h.db as never);
      await legacy({ exec: async (query) => { await h.client.exec(query); } });
    } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup);
    const upgraded = await openOwnedPglite(source);
    try { await migrateOwned(upgraded); assert.ok((await upgraded.db.select().from(s.rooms)).every((row) => row.revision === 1)); }
    finally { await upgraded.close(); }
    const result = await restoreColdBackup(backup, restored);
    assert.deepEqual(result.fingerprint, manifest.fingerprint);
    lines.push("PGlite pre-0010 cold backup → upgrade → restore to separate owned target: complete schema/sequence/table fingerprint restored exactly");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_rom_backup");
  const restored = await cluster.createDatabase("safe01_rom_restore");
  const backup = newBackupLocation("rom01a pg pre-upgrade");
  const key = path.join(cluster.run.root, "rom01a-backup.key");
  createKeyFile(key);
  try {
    const factory = factoryFor(cluster);
    const migrator = await factory("rom migrator");
    try {
      const h = openPostgres(source);
      try { await migrator.migrate(h); await populateSummerFixture(h.db); await legacy(h); }
      finally { await h.close(); }
      const manifest = await createEncryptedBackup(cluster, source, backup, key);
      const upgraded = openPostgres(source);
      try { await migrator.migrate(upgraded); assert.ok((await upgraded.db.select().from(s.rooms)).every((row) => row.revision === 1)); }
      finally { await upgraded.close(); }
      const result = await restoreEncryptedBackup(cluster, backup, key, restored, source);
      assert.deepEqual(result.fingerprint, manifest.fingerprint);
      lines.push("PostgreSQL pre-0010 encrypted dump → upgrade → restore to separate empty owned target: complete schema/sequence/table fingerprint restored exactly");
    } finally { await migrator.dispose(); }
  } finally { await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}
