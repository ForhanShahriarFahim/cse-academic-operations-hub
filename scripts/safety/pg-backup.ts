/**
 * Encrypted PostgreSQL backup and restore for SAFE-01 T-06.
 *
 * Backup: `pg_dump --format=custom` is streamed straight into AES-256-GCM, so
 * no plaintext dump is written. Layout: <backup>/dump.enc, manifest.json
 * (IV, auth tag, plaintext/ciphertext digests, tool/server versions and the
 * source fingerprint) and manifest.sha256.
 *
 * Restore: verify the manifest digest and ciphertext digest, decrypt to a
 * scratch file (the GCM tag is checked before anything is restored), verify the
 * plaintext digest, require an empty `safe01_*` destination, run
 * `pg_restore --single-transaction --exit-on-error`, then compare fingerprints.
 * The key is 32 random bytes as 64 hex characters in a file that must not be a
 * tracked repository path (the ignored scratch area is allowed for tests).
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  REPO_ROOT, SCRATCH_ROOT, UnsafeTargetError,
  assertDistinctPostgres, assertEmptyDirectoryTarget, describePostgresTarget, isWithin, resolvePgliteTarget, resolvePostgresTarget,
  type PostgresTarget,
} from "./targets";
import { openPostgres } from "./database";
import { fingerprintDatabase, fingerprintDifferences, type DatabaseFingerprint } from "./fingerprint";
import { BackupIntegrityError } from "./pglite-backup";
import type { PgCluster } from "./pg-cluster";

export const PG_BACKUP_FORMAT = "safe-01-pg-dump-aes256gcm-v1";

export interface PgBackupManifest {
  format: typeof PG_BACKUP_FORMAT;
  createdAt: string;
  source: string;
  serverVersion: string;
  toolVersion: string;
  cipher: "aes-256-gcm";
  iv: string;
  authTag: string;
  plaintextSha256: string;
  plaintextBytes: number;
  ciphertextSha256: string;
  fingerprint: DatabaseFingerprint;
}

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const fileSha = (file: string) => sha(readFileSync(file));

/** Create a new random key file (tests keep it in the ignored scratch area). */
export function createKeyFile(file: string): void {
  writeFileSync(file, `${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
}

export function readKeyFile(file: string): Buffer {
  if (!path.isAbsolute(file)) throw new UnsafeTargetError("The backup key file path must be absolute.");
  if (isWithin(file, REPO_ROOT) && !isWithin(file, SCRATCH_ROOT)) {
    throw new UnsafeTargetError("Keep the backup key outside the repository (only the ignored .tmp/safe-01 scratch area is allowed for tests).");
  }
  const text = readFileSync(file, "utf8").trim();
  if (!/^[0-9a-f]{64}$/i.test(text)) throw new UnsafeTargetError("The backup key must be 64 hexadecimal characters (32 bytes).");
  return Buffer.from(text, "hex");
}

class Digest extends Transform {
  readonly hash = createHash("sha256");
  bytes = 0;
  _transform(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    done(null, chunk);
  }
}

async function serverVersion(target: PostgresTarget): Promise<string> {
  const handle = openPostgres(target);
  try { return (await handle.client.query<{ server_version: string }>("show server_version")).rows[0].server_version; } finally { await handle.close(); }
}

async function fingerprintTarget(target: PostgresTarget): Promise<DatabaseFingerprint> {
  const handle = openPostgres(target);
  try { return await fingerprintDatabase(handle.client); } finally { await handle.close(); }
}

/** Tables, views, sequences or functions outside the system schemas mean the database is not empty. */
async function userObjectCount(target: PostgresTarget): Promise<number> {
  const handle = openPostgres(target);
  try {
    const { rows } = await handle.client.query<{ count: number }>(`
      select count(*)::int as count from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg_temp%'`);
    return rows[0].count;
  } finally {
    await handle.close();
  }
}

/** The connection string handed to client tools, without the password (supplied via PGPASSWORD). */
const toolUrl = (target: PostgresTarget) => {
  const url = new URL(target.url);
  url.password = "";
  return url.toString();
};

export async function createEncryptedBackup(cluster: PgCluster, source: PostgresTarget, backupDir: string, keyFile: string): Promise<PgBackupManifest> {
  const checked = resolvePostgresTarget(source.url, source.database);
  const location = resolvePgliteTarget(backupDir);
  assertEmptyDirectoryTarget(location);
  const key = readKeyFile(keyFile);
  const fingerprint = await fingerprintTarget(checked);
  mkdirSync(location, { recursive: true });

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = new Digest();
  const encrypted = new Digest();
  const dump = spawn(cluster.tool("pg_dump"), ["--format=custom", "--no-password", `--dbname=${toolUrl(checked)}`], {
    env: cluster.clientEnv(), stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  dump.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise<number | null>((resolve) => dump.on("close", resolve));
  await pipeline(dump.stdout, plain, cipher, encrypted, createWriteStream(path.join(location, "dump.enc"), { flags: "wx" }));
  const status = await exited;
  if (status !== 0) {
    rmSync(location, { recursive: true, force: true });
    throw new Error(`pg_dump failed (${status}): ${stderr.slice(-1500)}`);
  }
  const manifest: PgBackupManifest = {
    format: PG_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    source: describePostgresTarget(checked),
    serverVersion: await serverVersion(checked),
    toolVersion: cluster.version,
    cipher: "aes-256-gcm",
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    plaintextSha256: plain.hash.digest("hex"),
    plaintextBytes: plain.bytes,
    ciphertextSha256: encrypted.hash.digest("hex"),
    fingerprint,
  };
  const text = JSON.stringify(manifest, null, 2);
  writeFileSync(path.join(location, "manifest.json"), text, { flag: "wx" });
  writeFileSync(path.join(location, "manifest.sha256"), `${sha(text)}\n`, { flag: "wx" });
  return manifest;
}

export function verifyEncryptedBackup(backupDir: string): PgBackupManifest {
  const location = resolvePgliteTarget(backupDir);
  const files = ["manifest.json", "manifest.sha256", "dump.enc"].map((name) => path.join(location, name));
  if (!files.every(existsSync)) throw new BackupIntegrityError("Backup is incomplete: manifest, manifest digest or encrypted dump is missing.");
  const text = readFileSync(files[0], "utf8");
  if (sha(text) !== readFileSync(files[1], "utf8").trim()) throw new BackupIntegrityError("Backup manifest does not match its recorded digest.");
  const manifest = JSON.parse(text) as PgBackupManifest;
  if (manifest.format !== PG_BACKUP_FORMAT) throw new BackupIntegrityError(`Unsupported backup format: ${String(manifest.format)}`);
  if (fileSha(files[2]) !== manifest.ciphertextSha256) throw new BackupIntegrityError("Encrypted dump does not match its recorded digest.");
  return manifest;
}

export interface PgRestoreReport {
  manifest: PgBackupManifest;
  fingerprint: DatabaseFingerprint;
}

export async function restoreEncryptedBackup(
  cluster: PgCluster,
  backupDir: string,
  keyFile: string,
  destination: PostgresTarget,
  source?: PostgresTarget,
): Promise<PgRestoreReport> {
  const manifest = verifyEncryptedBackup(backupDir);
  const checked = resolvePostgresTarget(destination.url, destination.database);
  if (source) assertDistinctPostgres(source, checked);
  if (describePostgresTarget(checked) === manifest.source) throw new UnsafeTargetError("Refusing to restore over the backup's source database.");
  if (await userObjectCount(checked) > 0) throw new UnsafeTargetError("The restore destination database is not empty.");
  const key = readKeyFile(keyFile);

  const plainFile = path.join(resolvePgliteTarget(backupDir), `restore-${process.pid}.dump`);
  try {
    // Decrypt fully before restoring: a wrong key or altered ciphertext fails the GCM tag check here.
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.iv, "hex"));
    decipher.setAuthTag(Buffer.from(manifest.authTag, "hex"));
    try {
      await pipeline(createReadStream(path.join(resolvePgliteTarget(backupDir), "dump.enc")), decipher, createWriteStream(plainFile, { flags: "wx" }));
    } catch {
      throw new BackupIntegrityError("Decryption failed: wrong key or altered backup (authentication tag mismatch).");
    }
    if (fileSha(plainFile) !== manifest.plaintextSha256) throw new BackupIntegrityError("Decrypted dump does not match its recorded digest.");

    const restore = await new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(cluster.tool("pg_restore"), [
        "--single-transaction", "--exit-on-error", "--no-password", `--dbname=${toolUrl(checked)}`, plainFile,
      ], { env: cluster.clientEnv(), stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stderr }));
    });
    if (restore.status !== 0) throw new Error(`pg_restore failed (${restore.status}); the single transaction rolled back: ${restore.stderr.slice(-1500)}`);

    const fingerprint = await fingerprintTarget(checked);
    const differences = fingerprintDifferences(manifest.fingerprint, fingerprint);
    if (differences.length > 0) {
      // The destination is a confirmed disposable safe01_* database: clear the mismatched restore.
      const handle = openPostgres(checked);
      try { await handle.exec("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;"); } finally { await handle.close(); }
      throw new BackupIntegrityError(`Restored database differs from the backup: ${differences.slice(0, 5).join(", ")}`);
    }
    return { manifest, fingerprint };
  } finally {
    rmSync(plainFile, { force: true });
  }
}
