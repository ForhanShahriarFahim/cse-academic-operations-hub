/**
 * Cold PGlite backup and restore for owned SAFE-01 runs. A backup is taken only
 * while no writer is active: the run's writer lock is held throughout, the
 * database is fingerprinted, closed and then copied file by file. This is not a
 * hot-copy method and must not be presented as one.
 *
 * Layout: <backup>/pgdata/** (copied files), <backup>/manifest.json and
 * <backup>/manifest.sha256 (digest of manifest.json).
 */
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  REPO_ROOT, SCRATCH_ROOT, UnsafeTargetError,
  assertDistinctLocations, assertEmptyDirectoryTarget, resolvePgliteTarget,
} from "./targets";
import { assertOwnedRun, isWriterActive, withWriterLock, type OwnedRun } from "./pglite";
import { fingerprintDatabase, fingerprintDifferences, type DatabaseFingerprint } from "./fingerprint";

export const BACKUP_FORMAT = "safe-01-pglite-cold-v1";
const MANIFEST = "manifest.json";
const MANIFEST_DIGEST = "manifest.sha256";
const DATA = "pgdata";

export class BackupIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "BackupIntegrityError"; }
}

export interface BackupFile {
  path: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  sourceRun: string;
  fileCount: number;
  totalBytes: number;
  files: BackupFile[];
  fingerprint: DatabaseFingerprint;
}

export interface RestoreReport {
  manifest: BackupManifest;
  fingerprint: DatabaseFingerprint;
}

const fileSha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Every regular file below `root`, as sorted forward-slash relative paths with size and digest. */
export function inventoryFiles(root: string): BackupFile[] {
  const files: BackupFile[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ path: path.relative(root, full).split(path.sep).join("/"), size: statSync(full).size, sha256: fileSha(full) });
      else throw new BackupIntegrityError(`Unsupported file type in backup source: ${entry.name}`);
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function compareFiles(expected: BackupFile[], actual: BackupFile[], where: string): void {
  const byPath = new Map(actual.map((file) => [file.path, file]));
  for (const file of expected) {
    const found = byPath.get(file.path);
    if (!found) throw new BackupIntegrityError(`${where}: missing file ${file.path}`);
    if (found.size !== file.size || found.sha256 !== file.sha256) throw new BackupIntegrityError(`${where}: file ${file.path} does not match its recorded digest`);
    byPath.delete(file.path);
  }
  if (byPath.size > 0) throw new BackupIntegrityError(`${where}: unexpected file ${[...byPath.keys()][0]}`);
}

async function withClient<T>(dataDir: string, work: (client: PGlite) => Promise<T>): Promise<T> {
  const client = new PGlite(dataDir);
  try {
    await client.waitReady;
    return await work(client);
  } finally {
    await client.close();
  }
}

export function newBackupLocation(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return resolvePgliteTarget(path.join(SCRATCH_ROOT, "backups", `${Date.now()}-${slug}-${randomBytes(3).toString("hex")}`));
}

export async function createColdBackup(source: OwnedRun, backupDir: string): Promise<BackupManifest> {
  assertOwnedRun(source);
  if (isWriterActive(source)) throw new UnsafeTargetError("A writer is active; stop it before taking a cold backup.");
  const target = resolvePgliteTarget(backupDir);
  assertDistinctLocations(source.root, target, "backup source and backup location");
  assertEmptyDirectoryTarget(target);
  if (!existsSync(path.join(source.dataDir, "PG_VERSION"))) throw new UnsafeTargetError("The source is not an initialised PGlite data directory.");

  return withWriterLock(source, async () => {
    const fingerprint = await withClient(source.dataDir, fingerprintDatabase);
    // The client is closed and the lock prevents a new writer: the copy is cold.
    const sourceFiles = inventoryFiles(source.dataDir);
    mkdirSync(target, { recursive: true });
    cpSync(source.dataDir, path.join(target, DATA), { recursive: true, errorOnExist: true, force: false });
    const copied = inventoryFiles(path.join(target, DATA));
    compareFiles(sourceFiles, copied, "Backup copy");
    compareFiles(sourceFiles, inventoryFiles(source.dataDir), "Backup source changed during copy");
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      sourceRun: path.relative(REPO_ROOT, source.root).split(path.sep).join("/"),
      fileCount: copied.length,
      totalBytes: copied.reduce((sum, file) => sum + file.size, 0),
      files: copied,
      fingerprint,
    };
    const text = JSON.stringify(manifest, null, 2);
    writeFileSync(path.join(target, MANIFEST), text, { flag: "wx" });
    writeFileSync(path.join(target, MANIFEST_DIGEST), `${createHash("sha256").update(text).digest("hex")}\n`, { flag: "wx" });
    return manifest;
  });
}

/** Check the manifest's own digest and every file's size/digest; reject missing or extra files. */
export function verifyBackup(backupDir: string): BackupManifest {
  const location = resolvePgliteTarget(backupDir);
  const manifestPath = path.join(location, MANIFEST);
  const digestPath = path.join(location, MANIFEST_DIGEST);
  if (!existsSync(manifestPath) || !existsSync(digestPath)) throw new BackupIntegrityError("Backup is incomplete: manifest or manifest digest is missing.");
  const text = readFileSync(manifestPath, "utf8");
  if (createHash("sha256").update(text).digest("hex") !== readFileSync(digestPath, "utf8").trim()) {
    throw new BackupIntegrityError("Backup manifest does not match its recorded digest.");
  }
  const manifest = JSON.parse(text) as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT) throw new BackupIntegrityError(`Unsupported backup format: ${String(manifest.format)}`);
  if (!existsSync(path.join(location, DATA))) throw new BackupIntegrityError("Backup is incomplete: data directory is missing.");
  compareFiles(manifest.files, inventoryFiles(path.join(location, DATA)), "Backup verification");
  return manifest;
}

/**
 * Restore into the empty data directory of a separate owned run, then reopen
 * and compare the canonical fingerprint. On any failure the partially restored
 * data directory is removed so it cannot be mistaken for a good restore.
 */
export async function restoreColdBackup(backupDir: string, target: OwnedRun): Promise<RestoreReport> {
  const manifest = verifyBackup(backupDir);
  const location = resolvePgliteTarget(backupDir);
  assertOwnedRun(target);
  assertDistinctLocations(location, target.root, "backup location and restore target");
  assertDistinctLocations(path.join(REPO_ROOT, manifest.sourceRun), target.root, "backup source run and restore target");
  assertEmptyDirectoryTarget(target.dataDir);

  return withWriterLock(target, async () => {
    try {
      cpSync(path.join(location, DATA), target.dataDir, { recursive: true, errorOnExist: true, force: false });
      compareFiles(manifest.files, inventoryFiles(target.dataDir), "Restored files");
      const fingerprint = await withClient(target.dataDir, fingerprintDatabase);
      const differences = fingerprintDifferences(manifest.fingerprint, fingerprint);
      if (differences.length > 0) throw new BackupIntegrityError(`Restored database differs from the backup: ${differences.slice(0, 5).join(", ")}`);
      writeFileSync(path.join(target.root, "restored-from.json"), JSON.stringify({
        backup: path.relative(REPO_ROOT, location).split(path.sep).join("/"),
        manifestCreatedAt: manifest.createdAt,
        restoredAt: new Date().toISOString(),
      }, null, 2));
      return { manifest, fingerprint };
    } catch (error) {
      rmSync(target.dataDir, { recursive: true, force: true });
      throw error;
    }
  });
}

export function removeBackup(backupDir: string): void {
  rmSync(resolvePgliteTarget(backupDir), { recursive: true, force: true });
}
