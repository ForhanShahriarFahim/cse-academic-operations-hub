/**
 * T-06 (AC-03, PostgreSQL halves of AC-04/05): inside a harness-owned
 * disposable cluster, run the T-03 history and T-04 audit checks unchanged
 * on PostgreSQL, then exercise an encrypted pg_dump/pg_restore into a separate
 * empty database with its refusal and corruption cases.
 */
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as schema from "../../src/db/schema";
import { REPO_ROOT, UnsafeTargetError, resolvePgliteTarget, type PostgresTarget } from "./targets";
import { openPostgres, postgresDatabase, withHandle, type DatabaseFactory } from "./database";
import { fingerprintDatabase, fingerprintDifferences } from "./fingerprint";
import { populateSpringFixture, populateSummerFixture } from "./fixture";
import { withDisposableCluster, type PgCluster } from "./pg-cluster";
import { newBackupLocation, removeBackup, BackupIntegrityError } from "./pglite-backup";
import { createEncryptedBackup, createKeyFile, readKeyFile, restoreEncryptedBackup, verifyEncryptedBackup } from "./pg-backup";
import { checkHistory } from "./history.check";
import { checkAudit } from "./audit.check";

const SCENARIO = path.join(__dirname, "children", "term-scenario.ts");
const unsafe = (pattern: RegExp) => (error: unknown) => error instanceof UnsafeTargetError && pattern.test(error.message);
const corrupt = (pattern: RegExp) => (error: unknown) => error instanceof BackupIntegrityError && pattern.test(error.message);

function factoryFor(cluster: PgCluster): DatabaseFactory {
  let counter = 0;
  return async (purpose) => {
    const name = `safe01_${purpose.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${counter++}`;
    const target = await cluster.createDatabase(name);
    return postgresDatabase(target, () => cluster.dropDatabase(target));
  };
}

async function fingerprintOf(target: PostgresTarget) {
  const handle = openPostgres(target);
  try { return await fingerprintDatabase(handle.client); } finally { await handle.close(); }
}

async function view(target: PostgresTarget) {
  const database = postgresDatabase(target, async () => undefined);
  const result = await database.runChild(SCENARIO, ["view", "admin@example.invalid"]);
  assert.equal(result.status, 0, result.stderr.slice(-2000));
  return result.report;
}

async function checkBackupRestore(cluster: PgCluster, lines: string[]): Promise<void> {
  const backups: string[] = [];
  const keyFile = path.join(cluster.run.root, "backup.key");
  createKeyFile(keyFile);

  // Populated two-term source with a real publication.
  const sourceTargetResolved = await cluster.createDatabase("safe01_source");
  const sourceDb = postgresDatabase(sourceTargetResolved, async () => undefined);
  await withHandle(sourceDb, async (handle) => {
    await sourceDb.migrate(handle);
    const summer = await populateSummerFixture(handle.db);
    await populateSpringFixture(handle.db, summer);
  });
  const publish = await sourceDb.runChild(SCENARIO, ["publish", "admin@example.invalid", "Synthetic PostgreSQL publication"]);
  assert.equal(publish.status, 0, publish.stderr);
  assert.equal((publish.report as { ok: boolean }).ok, true, JSON.stringify(publish.report));
  // The production database module in a pinned child really selects this PostgreSQL database.
  const probe = await sourceDb.runChild(path.join(__dirname, "children", "app-db-probe.ts"));
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual([probe.report?.databaseMode, probe.report?.databaseHost], ["postgresql", "127.0.0.1"]);
  const original = await fingerprintOf(sourceTargetResolved);
  const sourceView = await view(sourceTargetResolved);

  // Refusals before any backup work.
  await assert.rejects(() => cluster.createDatabase("postgres"), unsafe(/safe01_/));
  await assert.rejects(() => cluster.createDatabase("app_db"), unsafe(/safe01_/));
  assert.throws(() => readKeyFile(path.join(REPO_ROOT, "backup.key")), unsafe(/outside the repository/));
  const badKey = path.join(cluster.run.root, "bad.key");
  writeFileSync(badKey, "not-a-key\n");
  assert.throws(() => readKeyFile(badKey), unsafe(/64 hexadecimal/));
  await assert.rejects(() => createEncryptedBackup(cluster, sourceTargetResolved, path.join(REPO_ROOT, "backups"), keyFile), unsafe(/inside/));

  // Encrypted backup: no plaintext on disk, manifest matches the live source.
  const backup = newBackupLocation("t06 postgres");
  backups.push(backup);
  const manifest = await createEncryptedBackup(cluster, sourceTargetResolved, backup, keyFile);
  assert.deepEqual(fingerprintDifferences(original, manifest.fingerprint), []);
  const ciphertext = readFileSync(path.join(backup, "dump.enc"));
  for (const marker of ["Synthetic Student One", "SYN-0001", "admin@example.invalid", "PGDMP"]) {
    assert.equal(ciphertext.includes(Buffer.from(marker)), false, `plaintext marker ${marker} found in encrypted dump`);
  }
  verifyEncryptedBackup(backup);
  lines.push(`Encrypted backup: pg_dump ${manifest.toolVersion} (server ${manifest.serverVersion}) custom format streamed through AES-256-GCM; ${(manifest.plaintextBytes / 1024).toFixed(0)} KiB plaintext never written; no plaintext markers in the ciphertext; manifest fingerprint equals the live two-term source`);

  // Restore into a separate empty safe01_* database and compare everything.
  const restored = await cluster.createDatabase("safe01_restore");
  const report = await restoreEncryptedBackup(cluster, backup, keyFile, restored, sourceTargetResolved);
  assert.deepEqual(fingerprintDifferences(original, report.fingerprint), []);
  assert.deepEqual(await view(restored), sourceView, "restored loaders/exports differ from the source");
  const handle = openPostgres(restored);
  try {
    const [department] = await handle.db.insert(schema.departments).values({ code: "NEW", name: "Post-restore" }).returning();
    const max = (await handle.client.query<{ max: number }>("select max(id)::int as max from departments where code <> 'NEW'")).rows[0].max;
    assert.equal(department.id, max + 1, "sequence did not continue after the restored maximum");
    const before = await fingerprintDatabase(handle.client);
    await postgresDatabase(restored, async () => undefined).migrate(handle);
    assert.deepEqual(fingerprintDifferences(before, await fingerprintDatabase(handle.client)), [], "migrations changed the restored database");
  } finally {
    await handle.close();
  }
  lines.push("Restore: separate empty safe01_restore database, single transaction; schema, constraints, indexes, sequences, journal and every row equal the source; real loaders/exports identical to the source; sequences continue; migrations are no-ops");

  // Refusals and corruption: nothing is restored.
  await assert.rejects(() => restoreEncryptedBackup(cluster, backup, keyFile, restored, sourceTargetResolved), unsafe(/not empty/));
  await assert.rejects(() => restoreEncryptedBackup(cluster, backup, keyFile, sourceTargetResolved, sourceTargetResolved), unsafe(/different databases|source/));
  const empty = await cluster.createDatabase("safe01_restore_negative");
  const stillEmpty = async (label: string) => {
    const count = (await withHandle(postgresDatabase(empty, async () => undefined), (h) =>
      h.client.query<{ count: number }>("select count(*)::int as count from pg_tables where schemaname in ('public', 'drizzle')"))).rows[0].count;
    assert.equal(count, 0, `${label}: destination not left empty`);
  };
  const otherKey = path.join(cluster.run.root, "other.key");
  createKeyFile(otherKey);
  await assert.rejects(() => restoreEncryptedBackup(cluster, backup, otherKey, empty), corrupt(/wrong key or altered/));
  await stillEmpty("wrong key");

  const clone = (label: string) => { const location = newBackupLocation(label); cpSync(backup, location, { recursive: true }); backups.push(location); return location; };
  const flipped = clone("t06 flipped");
  const bytes = readFileSync(path.join(flipped, "dump.enc"));
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  writeFileSync(path.join(flipped, "dump.enc"), bytes);
  assert.throws(() => verifyEncryptedBackup(flipped), corrupt(/Encrypted dump does not match/));
  // Same damage with the digests rewritten: only the GCM tag can catch it.
  const forged = clone("t06 forged");
  writeFileSync(path.join(forged, "dump.enc"), bytes);
  const forgedManifest = JSON.parse(readFileSync(path.join(forged, "manifest.json"), "utf8"));
  forgedManifest.ciphertextSha256 = createHash("sha256").update(bytes).digest("hex");
  const forgedText = JSON.stringify(forgedManifest, null, 2);
  writeFileSync(path.join(forged, "manifest.json"), forgedText);
  writeFileSync(path.join(forged, "manifest.sha256"), `${createHash("sha256").update(forgedText).digest("hex")}\n`);
  await assert.rejects(() => restoreEncryptedBackup(cluster, forged, keyFile, empty), corrupt(/wrong key or altered/));
  await stillEmpty("forged ciphertext");
  const noManifest = clone("t06 no manifest");
  writeFileSync(path.join(noManifest, "manifest.json"), "{}");
  assert.throws(() => verifyEncryptedBackup(noManifest), corrupt(/manifest does not match/));
  lines.push("Rejected: non-safe01 databases, key inside the repository or malformed, backup outside scratch, non-empty or source destination, wrong key, altered ciphertext (digest and, when digests are forged, the GCM tag), edited manifest; the destination stays empty");

  for (const location of backups) removeBackup(resolvePgliteTarget(location));
}

export async function checkPostgres(bin: string | undefined): Promise<string[]> {
  return withDisposableCluster(bin, async (cluster) => {
    const lines = [`Disposable cluster: PostgreSQL ${cluster.version} tools from SAFE01_PG_BIN, owned data under .tmp/safe-01, 127.0.0.1:${cluster.port} only, random SCRAM password, stopped and removed afterwards`];
    const factory = factoryFor(cluster);
    lines.push(...(await checkHistory(factory)).map((line) => `PostgreSQL T-03 — ${line}`));
    lines.push(...(await checkAudit(factory)).map((line) => `PostgreSQL T-04 — ${line}`));
    await checkBackupRestore(cluster, lines);
    return lines;
  });
}
