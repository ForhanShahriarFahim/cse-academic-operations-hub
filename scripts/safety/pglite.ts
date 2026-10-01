/**
 * Owned, on-disk PGlite fixtures for SAFE-01. Every run directory carries an
 * ownership marker, and a writer lock records the one open writer so backup and
 * cleanup can refuse to act while it is active.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { backfillTimeGrids, type GridDb } from "../../src/db/time-grid-backfill";
import * as schema from "../../src/db/schema";
import { REPO_ROOT, SCRATCH_ROOT, UnsafeTargetError, isWithin, resolvePgliteTarget } from "./targets";

const OWNER_FILE = "safe-01-owner.json";
const LOCK_FILE = "writer.lock";
export const MIGRATIONS_FOLDER = path.join(REPO_ROOT, "drizzle");

export interface OwnedRun {
  root: string;
  dataDir: string;
}

export function createOwnedRun(purpose: string): OwnedRun {
  const slug = purpose.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const root = resolvePgliteTarget(path.join(SCRATCH_ROOT, "runs", `${Date.now()}-${slug}-${randomBytes(3).toString("hex")}`));
  mkdirSync(root, { recursive: true });
  const marker = { tool: "SAFE-01", purpose, createdAt: new Date().toISOString(), pid: process.pid };
  const fd = openSync(path.join(root, OWNER_FILE), "wx");
  try { writeSync(fd, JSON.stringify(marker, null, 2)); } finally { closeSync(fd); }
  return { root, dataDir: path.join(root, "pgdata") };
}

export function assertOwnedRun(run: OwnedRun): void {
  resolvePgliteTarget(run.root);
  resolvePgliteTarget(run.dataDir);
  if (!isWithin(run.dataDir, run.root)) throw new UnsafeTargetError("The data directory must be inside its owned run.");
  let marker: { tool?: string } | null = null;
  try { marker = JSON.parse(readFileSync(path.join(run.root, OWNER_FILE), "utf8")); } catch { marker = null; }
  if (marker?.tool !== "SAFE-01") throw new UnsafeTargetError("Refusing a directory without a SAFE-01 ownership marker.");
}

export const isWriterActive = (run: OwnedRun) => existsSync(path.join(run.root, LOCK_FILE));

/** Hold the run's exclusive writer lock while `work` runs (in-process or as a child). */
export async function withWriterLock<T>(run: OwnedRun, work: () => Promise<T>): Promise<T> {
  assertOwnedRun(run);
  const lockPath = path.join(run.root, LOCK_FILE);
  let fd: number;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new UnsafeTargetError("A writer is already active for this run.");
    throw error;
  }
  try { writeSync(fd, JSON.stringify({ pid: process.pid, openedAt: new Date().toISOString() })); } finally { closeSync(fd); }
  try { return await work(); } finally { rmSync(lockPath, { force: true }); }
}

export interface OwnedPglite {
  run: OwnedRun;
  client: PGlite;
  db: PgliteDatabase<typeof schema>;
  close(): Promise<void>;
}

/** Open the run's single writer. The lock is released only after the client has closed. */
export async function openOwnedPglite(run: OwnedRun): Promise<OwnedPglite> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let ready!: (handle: OwnedPglite) => void;
  let failed!: (error: unknown) => void;
  const opened = new Promise<OwnedPglite>((resolve, reject) => { ready = resolve; failed = reject; });

  const lockHeld = withWriterLock(run, async () => {
    const client = new PGlite(run.dataDir);
    try {
      await client.waitReady;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
    let closing: Promise<void> | null = null;
    ready({
      run,
      client,
      db: drizzle(client, { schema }),
      close() {
        closing ??= client.close().finally(release);
        return closing.then(() => lockHeld);
      },
    });
    await released;
  });
  lockHeld.catch(failed);
  return opened;
}

export async function migrateOwned(handle: OwnedPglite): Promise<void> {
  await migratePgliteDb(handle.db);
}

export async function migratePgliteDb(db: PgliteDatabase<typeof schema>): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await backfillTimeGrids(db as unknown as GridDb); // as migrateDatabase does in production
}

/** Drizzle migrations only, from `folder` (BUG-29 upgrades start from a trimmed copy). */
export async function migratePgliteFrom(db: PgliteDatabase<typeof schema>, folder: string): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}

export const isTimeZoneName = (zone: string) => /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone);

/**
 * PGlite fixes its session TimeZone when the data directory is created (from the
 * creating process's TZ) and keeps it in postgresql.conf; neither TZ nor
 * ALTER DATABASE changes it later. Rewriting that line while no writer is open
 * pins the zone for every later session, including child processes.
 */
export function setPgliteTimeZone(run: OwnedRun, zone: string): void {
  assertOwnedRun(run);
  if (!isTimeZoneName(zone)) throw new UnsafeTargetError(`Not a time zone name: ${zone}`);
  if (isWriterActive(run)) throw new UnsafeTargetError("Refusing to change the time zone while a writer is active.");
  const conf = path.join(run.dataDir, "postgresql.conf");
  const text = readFileSync(conf, "utf8");
  const pattern = /^timezone = .*$/gm;
  if ((text.match(pattern) ?? []).length !== 1) throw new Error("Expected exactly one timezone line in postgresql.conf.");
  writeFileSync(conf, text.replace(pattern, `timezone = '${zone}'`));
}

export function removeOwnedRun(run: OwnedRun): void {
  assertOwnedRun(run);
  if (isWriterActive(run)) throw new UnsafeTargetError("Refusing to remove a run with an active writer.");
  rmSync(run.root, { recursive: true, force: true });
}
