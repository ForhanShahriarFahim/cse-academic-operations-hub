/**
 * Owned, on-disk PGlite fixtures for SAFE-01, opened inside owned runs
 * (see ./owned-run) under the run's single writer lock.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { backfillTimeGrids, type GridDb } from "../../src/db/time-grid-backfill";
import * as schema from "../../src/db/schema";
import { REPO_ROOT, UnsafeTargetError } from "./targets";
import { assertOwnedRun, isWriterActive, withWriterLock, type OwnedRun } from "./owned-run";

// The owned-run primitives live in ./owned-run (BUG-48); existing importers keep using this module.
export { assertOwnedRun, createOwnedRun, isWriterActive, removeOwnedRun, withWriterLock, type OwnedRun } from "./owned-run";

export const MIGRATIONS_FOLDER = path.join(REPO_ROOT, "drizzle");

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
