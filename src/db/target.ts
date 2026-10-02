/**
 * Which database the application and the database CLI open. Kept free of any
 * database import so a command can name and check its target before connecting.
 */
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";

/** CLI commands do not inherit Next.js's .env.local loading. Existing process variables always win. */
export function loadDatabaseEnvironment(): void {
  loadDotEnv({ path: path.join(process.cwd(), ".env.local"), quiet: true });
  loadDotEnv({ path: path.join(process.cwd(), ".env"), quiet: true });
}

/** The default local directory. It holds the institutional database and is never reset. */
export const defaultPgliteDirectory = () => path.join(process.cwd(), ".data", "pglite-summer-2026");

export type DatabaseTarget =
  | { mode: "postgresql"; url: string; label: string }
  | { mode: "pglite"; directory: string; label: string };

export function databaseTarget(env: NodeJS.ProcessEnv = process.env): DatabaseTarget {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    // host:port/database, never credentials or parameters.
    return { mode: "postgresql", url: env.DATABASE_URL, label: `${url.hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}` };
  }
  const configured = env.PGLITE_DATA_DIR || defaultPgliteDirectory();
  // memory:// is PGlite's in-memory store, not a path.
  const directory = configured.startsWith("memory://") ? configured : path.resolve(configured);
  return { mode: "pglite", directory, label: directory };
}

/** Resolve through existing ancestors so a junction or symlink cannot disguise the default directory. */
function physicalPath(input: string): string {
  let current = path.resolve(input);
  const missing: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missing.unshift(path.basename(current));
    current = parent;
  }
  const resolved = path.join(realpathSync.native(current), ...missing);
  return process.platform === "win32" || process.platform === "darwin" ? resolved.toLowerCase() : resolved;
}

/** True when the directory is, contains or lies inside the default institutional directory. */
export function overlapsDefaultPglite(directory: string): boolean {
  if (directory.startsWith("memory://")) return false;
  const target = physicalPath(directory);
  const protectedDirectory = physicalPath(defaultPgliteDirectory());
  const inside = (child: string, parent: string) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  return inside(target, protectedDirectory) || inside(protectedDirectory, target);
}

/** Whether `confirmation` names `target` exactly (paths compared after resolving). */
export function confirmsTarget(target: DatabaseTarget, confirmation: string | undefined): boolean {
  if (!confirmation) return false;
  if (target.mode === "postgresql" || target.directory.startsWith("memory://")) return confirmation === target.label;
  return physicalPath(confirmation) === physicalPath(target.directory);
}
