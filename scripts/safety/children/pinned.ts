/** SAFE-01 children run only inside a process pinned to an owned disposable database. */
export function pinnedTarget(): boolean {
  if (process.env.SAFE01_CHILD !== "1") return false;
  if (process.env.DATABASE_URL === "") return Boolean(process.env.PGLITE_DATA_DIR);
  // PostgreSQL children are pinned to the confirmed disposable safe01_* database only.
  try {
    const database = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1));
    return /^safe01_[a-z0-9_]+$/.test(database) && process.env.SAFE01_PG_TARGET === database;
  } catch {
    return false;
  }
}
