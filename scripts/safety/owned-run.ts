/**
 * Owned run directories for SAFE-01. Every run directory carries an ownership
 * marker, and a writer lock records the one open writer so backup and cleanup
 * can refuse to act while it is active. Kept free of PGlite so the BUG-48
 * cluster watchdog can load it cheaply.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { SCRATCH_ROOT, UnsafeTargetError, isWithin, resolvePgliteTarget } from "./targets";

const OWNER_FILE = "safe-01-owner.json";
const LOCK_FILE = "writer.lock";

export interface OwnedRun {
  root: string;
  dataDir: string;
}

export interface RunMarker {
  tool?: string;
  purpose?: string;
  createdAt?: string;
  pid?: number;
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

const readJson = <T>(file: string): T | null => {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; }
};

export const readRunMarker = (root: string) => readJson<RunMarker>(path.join(root, OWNER_FILE));

export function assertOwnedRun(run: OwnedRun): void {
  resolvePgliteTarget(run.root);
  resolvePgliteTarget(run.dataDir);
  if (!isWithin(run.dataDir, run.root)) throw new UnsafeTargetError("The data directory must be inside its owned run.");
  if (readRunMarker(run.root)?.tool !== "SAFE-01") throw new UnsafeTargetError("Refusing a directory without a SAFE-01 ownership marker.");
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

export function removeOwnedRun(run: OwnedRun): void {
  assertOwnedRun(run);
  if (isWriterActive(run)) throw new UnsafeTargetError("Refusing to remove a run with an active writer.");
  rmSync(run.root, { recursive: true, force: true });
}

/** Whether a process with this PID exists. A reused PID reads as alive, which only makes cleanup more cautious. */
export function pidAlive(pid: number | undefined): boolean {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** PIDs that may still own the run: the creator in the marker and the writer in the lock. */
export function runOwnerPids(run: OwnedRun): number[] {
  const lock = readJson<{ pid?: number }>(path.join(run.root, LOCK_FILE));
  return [readRunMarker(run.root)?.pid, lock?.pid].filter((pid): pid is number => Number.isInteger(pid));
}

/**
 * Remove a run whose owner was killed before its own cleanup ran (BUG-48). The
 * writer lock left behind is ignored only when no PID that recorded it is alive.
 */
export function removeStaleRun(run: OwnedRun): void {
  assertOwnedRun(run);
  const alive = runOwnerPids(run).filter(pidAlive);
  if (alive.length > 0) throw new UnsafeTargetError(`Refusing to remove a run whose owner (PID ${alive.join(", ")}) is still running.`);
  rmSync(run.root, { recursive: true, force: true });
}
