/** ROM-01C: populated upgrade/recovery, atomic maintenance history and shared room-lock evidence. */
import assert from "node:assert/strict";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as s from "../../src/db/schema";
import { pgliteFactory, withHandle, openPostgres, type DatabaseFactory, type SafetyDatabase, type SafetyHandle } from "./database";
import { populateSummerFixture, populateSpringFixture } from "./fixture";
import { fingerprintDatabase } from "./fingerprint";
import { setAuditInsertFault } from "./faults";
import { saveMaintenanceInTransaction } from "../../src/lib/room-maintenance-transaction";
import { lifecycleRoomInTransaction } from "../../src/lib/room-lifecycle-transaction";
import type { RoomTransaction } from "../../src/lib/room-transaction";
import type { Actor } from "../../src/lib/auth/policy";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { factoryFor } from "./postgres.check";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun } from "./pglite";
import { createColdBackup, newBackupLocation, removeBackup, restoreColdBackup } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, restoreEncryptedBackup } from "./pg-backup";
import { REPO_ROOT } from "./targets";
const txType = (tx: unknown) => tx as RoomTransaction;
const legacy = (h: Pick<SafetyHandle, "exec">) => h.exec("drop table room_unavailability; delete from drizzle.__drizzle_migrations where created_at >= 1793232000000;");
async function upgrade(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    await database.migrate(h); const summer = await populateSummerFixture(h.db); await populateSpringFixture(h.db, summer);
    await legacy(h); const before = await fingerprintDatabase(h.client);
    await database.migrate(h); const after = await fingerprintDatabase(h.client);
    for (const [name, table] of Object.entries(before.tables)) if (name !== "drizzle.__drizzle_migrations") assert.deepEqual(after.tables[name], table, name);
    for (const [name, position] of Object.entries(before.sequences)) assert.equal(after.sequences[name], position, name);
    assert.equal((await h.db.select().from(s.roomUnavailability)).length, 0);
    const [room] = await h.db.select().from(s.rooms);
    // Independent direct-SQL invalid writes verify database invariants, including null/duplicate weekdays.
    for (const [column, value] of [["end_date", "'2026-06-12'"], ["start_date", "'0001-01-01 BC'"], ["end_date", "'10000-01-01'"], ["weekdays", "ARRAY[]::integer[]"], ["weekdays", "ARRAY[0,0]"], ["weekdays", "ARRAY[NULL]::integer[]"], ["weekdays", "ARRAY[7]"], ["weekdays", "ARRAY[1]"], ["weekdays", "ARRAY[[0,1]]"], ["start_minutes", "600"], ["end_minutes", "1441"], ["reason", "' '"], ["reason", "repeat('x',301)"], ["revision", "0"]]) {
      const columns = { room_id: String(room.id), start_date: "'2026-06-13'", end_date: "'2026-06-13'", weekdays: "ARRAY[0]", start_minutes: "540", end_minutes: "600", reason: "'Synthetic'", revision: "1", [column]: value };
      await assert.rejects(h.client.query(`insert into room_unavailability (${Object.keys(columns).join(",")}) values (${Object.values(columns).join(",")})`), /room_unavailability_.*_ck/);
    }
    lines.push("Populated 0011 → 0012 adds an empty table; every preexisting table/sequence/snapshot fingerprint unchanged across two terms. Direct SQL rejects invalid years/ranges, absent/nonoccurring/duplicate/null/multidimensional weekdays, minute/reason/revision violations.");
  });
}
async function transactions(database: SafetyDatabase, lines: string[]) {
  await withHandle(database, async (h) => {
    await h.db.update(s.scheduleVersions).set({ snapshot: { generatedAt: "2026-10-29T00:00:00Z", versionNumber: 1, effectiveFrom: null, termName: "Synthetic legacy", meetings: [] } });
    const [admin] = await h.db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
    const actor: Actor = { id: admin.id, displayName: admin.displayName, email: admin.email, teacherId: null, assignments: [] };
    const [room] = await h.db.insert(s.rooms).values({ code: "MAINT-DRAFT", building: "Synthetic", isDraft: true, isActive: false }).returning();
    const current = async () => (await h.db.select().from(s.rooms).where(eq(s.rooms.id, room.id)))[0];
    const command = { roomId: String(room.id), revision: "1", action: "create", startDate: "2026-06-13", endDate: "2026-06-13", weekdays: ["0"], startMinutes: "540", endMinutes: "600", reason: "Synthetic outage" };
    const save = (raw: Record<string, unknown>) => h.db.transaction((tx) => saveMaintenanceInTransaction(txType(tx), actor, raw));
    const snapshots = JSON.stringify(await h.db.select().from(s.scheduleVersions));
    await setAuditInsertFault(h, true); await assert.rejects(save(command)); await setAuditInsertFault(h, false);
    assert.deepEqual(await current(), room); assert.equal((await h.db.select().from(s.roomUnavailability)).length, 0);
    const created = await save(command); assert.ok(created.ok, created.message);
    const retained = await current(); assert.equal(retained.revision, 2); assert.equal(retained.isDraft, false); assert.equal(retained.isActive, false);
    const [entry] = await h.db.select().from(s.roomUnavailability).where(eq(s.roomUnavailability.roomId, room.id));
    const edit = { ...command, revision: "2", action: "edit", entryId: String(entry.id), entryRevision: "1", correctionReason: "Synthetic correction" };
    const audits = (await h.db.select().from(s.auditEvents)).length;
    assert.match((await save(edit)).message, /Nothing changed/); assert.equal((await h.db.select().from(s.auditEvents)).length, audits);
    assert.equal((await save({ ...edit, revision: "1" })).outcome?.kind, "stale");
    assert.ok((await save({ ...edit, reason: "Corrected operational reason" })).ok);
    assert.equal((await current()).revision, 3);
    const cancel = { roomId: String(room.id), revision: "3", entryId: String(entry.id), entryRevision: "2", action: "cancel", correctionReason: "Outage removed", confirmCancellation: "on" };
    assert.equal((await save({ ...cancel, confirmCancellation: "" })).ok, false);
    await setAuditInsertFault(h, true); await assert.rejects(save(cancel)); await setAuditInsertFault(h, false);
    assert.equal((await current()).revision, 3);
    assert.ok((await save(cancel)).ok); assert.match((await save(cancel)).message, /Already cancelled/);
    assert.equal((await h.db.select().from(s.roomUnavailability).where(eq(s.roomUnavailability.id, entry.id)))[0].revision, 3);
    const deletion = await h.db.transaction((tx) => lifecycleRoomInTransaction(txType(tx), actor, { roomId: String(room.id), revision: "4", action: "delete", confirmation: room.code, reason: "Synthetic deletion" }));
    assert.equal(deletion.ok, false); assert.match(deletion.issues![0].detail, /maintenance history/);
    assert.equal((await current()).isActive, false);
    await assert.rejects(h.db.delete(s.rooms).where(eq(s.rooms.id, room.id)), /foreign key|violates|Failed query/);
    assert.equal(JSON.stringify(await h.db.select().from(s.scheduleVersions)), snapshots);
    lines.push("Inactive draft accepts maintenance without reactivation; first use retains with one parent revision. Stale/no-op, edit/cancel reasons, repeated cancellation, maintenance FK/delete retention, failed audit rollback and frozen snapshot bytes verified.");
  });
}
export async function checkRoomMaintenance(factory: DatabaseFactory = pgliteFactory) {
  const database = await factory("rom01c"), lines: string[] = [];
  try {
    await upgrade(database, lines); await transactions(database, lines);
    const child = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/room-maintenance-scenarios.ts"));
    assert.equal(child.status, 0, child.stderr.slice(-7000) || child.stdout.slice(-2000));
    lines.push(...(child.report as { lines: string[] }).lines);
    if (database.adapter === "pglite") await pgliteRecovery(lines);
    return lines;
  } finally { await database.dispose(); }
}
async function pgliteRecovery(lines: string[]) {
  const source = createOwnedRun("rom01c pre-upgrade"), restored = createOwnedRun("rom01c restore"), backup = newBackupLocation("rom01c");
  try {
    const h = await openOwnedPglite(source); try { await migrateOwned(h); await populateSummerFixture(h.db as never); await legacy({ exec: async (q) => { await h.client.exec(q); } }); } finally { await h.close(); }
    const manifest = await createColdBackup(source, backup);
    const upgraded = await openOwnedPglite(source); try { await migrateOwned(upgraded); assert.equal((await upgraded.db.select().from(s.roomUnavailability)).length, 0); } finally { await upgraded.close(); }
    assert.deepEqual((await restoreColdBackup(backup, restored)).fingerprint, manifest.fingerprint);
    lines.push("PGlite pre-0012 cold backup → populated forward upgrade → separate-target restore: exact complete fingerprint recovered.");
  } finally { removeOwnedRun(source); removeOwnedRun(restored); removeBackup(backup); }
}
async function postgresRecovery(cluster: PgCluster, lines: string[]) {
  const source = await cluster.createDatabase("safe01_rom_c_backup"), restored = await cluster.createDatabase("safe01_rom_c_restore");
  const backup = newBackupLocation("rom01c PG"), key = path.join(cluster.run.root, "rom01c.key"); createKeyFile(key);
  const migrator = await factoryFor(cluster)("rom01c migrator");
  try {
    const h = openPostgres(source); try { await migrator.migrate(h); await populateSummerFixture(h.db); await legacy(h); } finally { await h.close(); }
    const manifest = await createEncryptedBackup(cluster, source, backup, key);
    const upgraded = openPostgres(source); try { await migrator.migrate(upgraded); assert.equal((await upgraded.db.select().from(s.roomUnavailability)).length, 0); } finally { await upgraded.close(); }
    assert.deepEqual((await restoreEncryptedBackup(cluster, backup, key, restored, source)).fingerprint, manifest.fingerprint);
    lines.push("PostgreSQL pre-0012 encrypted backup → populated upgrade → separate-target restore: exact complete fingerprint recovered.");
  } finally { await migrator.dispose(); await cluster.dropDatabase(source); await cluster.dropDatabase(restored); removeBackup(backup); }
}
export async function checkRoomMaintenancePostgres(bin: string | undefined) { return withDisposableCluster(bin, async (cluster) => { const lines = [`Disposable PostgreSQL ${cluster.version}`, ...await checkRoomMaintenance(factoryFor(cluster))]; await postgresRecovery(cluster, lines); return lines; }); }
