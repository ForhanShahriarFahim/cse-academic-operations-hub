/**
 * T-02 (AC-01/02): cold PGlite backup and restore of an owned, populated
 * synthetic fixture, plus the refusal and corruption cases.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { DEFAULT_PGLITE_DIR, UnsafeTargetError } from "./targets";
import { createOwnedRun, migrateOwned, openOwnedPglite, removeOwnedRun, type OwnedRun } from "./pglite";
import { fingerprintDatabase, fingerprintDifferences, type DatabaseFingerprint } from "./fingerprint";
import { populateSummerFixture } from "./fixture";
import {
  BackupIntegrityError, createColdBackup, inventoryFiles, newBackupLocation, removeBackup, restoreColdBackup, verifyBackup,
} from "./pglite-backup";
import { runAppChild } from "./app-env";

const PROBE = path.join(__dirname, "children", "app-db-probe.ts");
const unsafe = (pattern: RegExp) => (error: unknown) => error instanceof UnsafeTargetError && pattern.test(error.message);
const corrupt = (pattern: RegExp) => (error: unknown) => error instanceof BackupIntegrityError && pattern.test(error.message);

async function fingerprintRun(run: OwnedRun): Promise<DatabaseFingerprint> {
  const handle = await openOwnedPglite(run);
  try { return await fingerprintDatabase(handle.client); } finally { await handle.close(); }
}

/** Copy a verified backup so each corruption case starts from a good backup. */
function cloneBackup(backupDir: string, label: string): string {
  const clone = newBackupLocation(label);
  cpSync(backupDir, clone, { recursive: true });
  return clone;
}

function rewriteManifest(backupDir: string, edit: (manifest: Record<string, unknown>) => void, updateDigest: boolean): void {
  const file = path.join(backupDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  edit(manifest);
  const text = JSON.stringify(manifest, null, 2);
  writeFileSync(file, text);
  if (updateDigest) writeFileSync(path.join(backupDir, "manifest.sha256"), `${createHash("sha256").update(text).digest("hex")}\n`);
}

export async function checkRecovery(): Promise<string[]> {
  const runs: OwnedRun[] = [];
  const backups: string[] = [];
  const own = (run: OwnedRun) => { runs.push(run); return run; };
  const backupAt = (label: string) => { const location = newBackupLocation(label); backups.push(location); return location; };
  const lines: string[] = [];
  try {
    // Populated source fixture.
    const source = own(createOwnedRun("t02 source"));
    const handle = await openOwnedPglite(source);
    let original: DatabaseFingerprint;
    try {
      await migrateOwned(handle);
      await populateSummerFixture(handle.db);
      original = await fingerprintDatabase(handle.client);

      // Refused while the writer is active.
      await assert.rejects(() => createColdBackup(source, backupAt("active")), unsafe(/writer is active/));
    } finally {
      await handle.close();
    }
    const populated = Object.entries(original.tables).filter(([, table]) => table.rows > 0);
    assert.ok(populated.length >= 30, `fixture should populate most tables, got ${populated.length}`);
    assert.equal(original.tables["drizzle.__drizzle_migrations"].rows, 6);

    // Location refusals.
    await assert.rejects(() => createColdBackup(source, path.join(source.root, "backup")), unsafe(/same or nested/));
    await assert.rejects(() => createColdBackup(source, DEFAULT_PGLITE_DIR), unsafe(/protected/));
    const occupied = backupAt("occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(path.join(occupied, "keep"), "x");
    await assert.rejects(() => createColdBackup(source, occupied), unsafe(/not empty/));

    // Cold backup: manifest matches the live fingerprint; the source is unchanged.
    const backup = backupAt("good");
    const manifest = await createColdBackup(source, backup);
    assert.deepEqual(fingerprintDifferences(original, manifest.fingerprint), []);
    assert.deepEqual(fingerprintDifferences(original, await fingerprintRun(source)), []);
    verifyBackup(backup);
    lines.push(`Cold backup: ${manifest.fileCount} files, ${(manifest.totalBytes / 1_048_576).toFixed(1)} MiB; fingerprint equals the populated source (${populated.length} non-empty tables)`);

    // Later source changes do not leak into the backup.
    const later = await openOwnedPglite(source);
    try {
      await later.db.insert(schema.auditEvents).values({ action: "fixture.after_backup", entity: "none", actorKind: "system" });
    } finally {
      await later.close();
    }
    assert.deepEqual(fingerprintDifferences(original, await fingerprintRun(source)), ["sequence public.audit_events_id_seq", "table public.audit_events"]);

    // Restore into a separate empty owned run and reopen cold.
    const restored = own(createOwnedRun("t02 restore"));
    const report = await restoreColdBackup(backup, restored);
    assert.deepEqual(fingerprintDifferences(original, report.fingerprint), []);
    assert.ok(existsSync(path.join(restored.root, "restored-from.json")));
    const reopened = await openOwnedPglite(restored);
    try {
      assert.deepEqual(fingerprintDifferences(original, await fingerprintDatabase(reopened.client)), []);
      // Relationships survive: the merged group still serves both streams' offerings.
      const merged = await reopened.db.execute<{ streams: string }>(sql`
        select string_agg(distinct b.stream, ',' order by b.stream) as streams
        from teaching_group_offerings tgo
        join course_offerings o on o.id = tgo.offering_id
        join batches b on b.id = o.batch_id
        group by tgo.teaching_group_id having count(*) > 1`);
      assert.deepEqual(merged.rows.map((row) => row.streams), ["DIPLOMA,HSC"]);
      const [published] = await reopened.db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.state, "published"));
      assert.equal((published.snapshot as { versionNumber: number }).versionNumber, 1);
      const roles = await reopened.db.select().from(schema.roleAssignments);
      assert.equal(roles.length, 3);
      // Sequences continue after the restored maximum; migrations reapply without new journal rows.
      const [department] = await reopened.db.insert(schema.departments).values({ code: "NEW", name: "Post-restore" }).returning();
      assert.equal(department.id, 3);
      await migrateOwned(reopened);
      const journal = await reopened.db.execute<{ count: number }>(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
      assert.equal(journal.rows[0].count, 6);
    } finally {
      await reopened.close();
    }
    // The production database module opens the restored copy through a pinned child.
    const probe = await runAppChild(restored, PROBE);
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(probe.report?.databaseMode, "pglite");
    lines.push("Restore: separate empty run reopened cold with identical schema, journal, rows, sequences, roles, audits and snapshot; sequences continue; app module opens it");

    // Restore refusals.
    await assert.rejects(() => restoreColdBackup(backup, restored), unsafe(/not empty/));
    await assert.rejects(() => restoreColdBackup(backup, source), unsafe(/same or nested|not empty/));
    const unmarked = { root: path.join(path.dirname(restored.root), `unmarked-${process.pid}`), dataDir: "" };
    unmarked.dataDir = path.join(unmarked.root, "pgdata");
    await assert.rejects(() => restoreColdBackup(backup, unmarked), unsafe(/ownership/));

    // Corrupt or incomplete backups are rejected before anything is restored.
    const largest = [...manifest.files].sort((a, b) => b.size - a.size)[0].path;
    const cases: Array<[string, (dir: string) => void, RegExp]> = [
      ["flipped byte", (dir) => {
        const file = path.join(dir, "pgdata", largest);
        const bytes = readFileSync(file);
        bytes[Math.floor(bytes.length / 2)] ^= 0xff;
        writeFileSync(file, bytes);
      }, /does not match/],
      ["missing file", (dir) => unlinkSync(path.join(dir, "pgdata", "PG_VERSION")), /missing file PG_VERSION/],
      ["extra file", (dir) => writeFileSync(path.join(dir, "pgdata", "stray"), "x"), /unexpected file stray/],
      ["missing manifest", (dir) => unlinkSync(path.join(dir, "manifest.json")), /incomplete/],
      ["edited manifest", (dir) => rewriteManifest(dir, (m) => { m.createdAt = "2000-01-01T00:00:00.000Z"; }, false), /manifest does not match/],
      ["wrong format", (dir) => rewriteManifest(dir, (m) => { m.format = "other"; }, true), /Unsupported backup format/],
    ];
    for (const [label, damage, pattern] of cases) {
      const clone = cloneBackup(backup, label);
      backups.push(clone);
      damage(clone);
      assert.throws(() => verifyBackup(clone), corrupt(pattern), label);
      const target = own(createOwnedRun(`t02 ${label}`));
      await assert.rejects(() => restoreColdBackup(clone, target), corrupt(pattern), label);
      assert.equal(existsSync(target.dataDir), false, `${label}: nothing restored`);
    }

    // Files intact but the recorded fingerprint disagrees: caught after reopening, restore removed.
    const mismatch = cloneBackup(backup, "fingerprint mismatch");
    backups.push(mismatch);
    rewriteManifest(mismatch, (m) => {
      const fingerprint = m.fingerprint as DatabaseFingerprint;
      fingerprint.tables["public.students"].digest = "0".repeat(64);
    }, true);
    verifyBackup(mismatch);
    const mismatchTarget = own(createOwnedRun("t02 mismatch"));
    await assert.rejects(() => restoreColdBackup(mismatch, mismatchTarget), corrupt(/differs from the backup: table public.students/));
    assert.equal(existsSync(mismatchTarget.dataDir), false);
    lines.push(`Rejected: active writer, nested/protected/non-empty locations, unmarked or non-empty restore targets, ${cases.length} corrupt/incomplete backups and a fingerprint mismatch (partial restore removed)`);
    assert.ok(inventoryFiles(source.dataDir).length > 0);
    return lines;
  } finally {
    for (const location of backups) removeBackup(location);
    for (const run of runs) removeOwnedRun(run);
  }
}
