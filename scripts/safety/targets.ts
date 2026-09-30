/**
 * SAFE-01 target selection. Safety tooling only ever touches explicitly named,
 * disposable targets: it never inherits DATABASE_URL/PGLITE_DATA_DIR and never
 * opens the default institutional PGlite directory.
 */
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SCRATCH_ROOT = path.join(REPO_ROOT, ".tmp", "safe-01");
export const DEFAULT_PGLITE_DIR = path.join(REPO_ROOT, ".data", "pglite-summer-2026");
const PROTECTED_DATA_ROOT = path.join(REPO_ROOT, ".data");
const DRIZZLE_CONFIG_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const DISPOSABLE_DATABASE = /^safe01_[a-z0-9_]+$/;

/** Environment view used for target checks; any string map, not only `process.env`. */
export type EnvironmentView = Record<string, string | undefined>;

export class UnsafeTargetError extends Error {
  constructor(message: string) { super(message); this.name = "UnsafeTargetError"; }
}

const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
const comparable = (value: string) => caseInsensitive ? value.toLowerCase() : value;

/** Resolve through existing ancestors so a junction or symlink cannot hide an escape. */
export function physicalPath(input: string): string {
  let current = path.resolve(input);
  const missing: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missing.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync.native(current), ...missing);
}

export function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(comparable(physicalPath(parent)), comparable(physicalPath(child)));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export const overlaps = (a: string, b: string) => isWithin(a, b) || isWithin(b, a);

/**
 * Accept `memory://` or an absolute path strictly inside the SAFE-01 scratch
 * root. The default/protected directories and any inherited PGLITE_DATA_DIR are
 * refused even if they were somehow placed inside the scratch root.
 */
export function resolvePgliteTarget(input: string, env: EnvironmentView = process.env): string {
  if (input === "memory://") return input;
  if (!input || !path.isAbsolute(input)) {
    throw new UnsafeTargetError("A PGlite safety target must be an explicit absolute path.");
  }
  const target = physicalPath(input);
  const protectedPaths = [PROTECTED_DATA_ROOT, DEFAULT_PGLITE_DIR, env.PGLITE_DATA_DIR].filter(Boolean) as string[];
  if (protectedPaths.some((protectedPath) => overlaps(target, protectedPath))) {
    throw new UnsafeTargetError("Refusing a protected PGlite location (default/.data or the configured PGLITE_DATA_DIR).");
  }
  if (!isWithin(target, SCRATCH_ROOT) || comparable(target) === comparable(physicalPath(SCRATCH_ROOT))) {
    throw new UnsafeTargetError(`PGlite safety targets must be inside ${path.relative(REPO_ROOT, SCRATCH_ROOT)}.`);
  }
  return target;
}

export function assertDistinctLocations(a: string, b: string, what = "source and destination"): void {
  if (overlaps(a, b)) throw new UnsafeTargetError(`The ${what} must not be the same or nested locations.`);
}

/** A restore destination must be missing or an empty directory. */
export function assertEmptyDirectoryTarget(target: string): void {
  if (!existsSync(target)) return;
  if (!statSync(target).isDirectory()) throw new UnsafeTargetError("The restore target exists and is not a directory.");
  if (readdirSync(target).length > 0) throw new UnsafeTargetError("The restore target is not empty.");
}

export interface PostgresTarget {
  url: string;
  host: string;
  port: string;
  database: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function postgresIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return `${LOOPBACK.has(host) ? "loopback" : host}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
  } catch {
    return null;
  }
}

/**
 * Accept only an explicitly supplied PostgreSQL URL for a `safe01_*` database
 * whose name the operator repeats as confirmation. It must not match the
 * configured application database or the drizzle-kit development URL.
 */
export function resolvePostgresTarget(
  input: string | undefined,
  confirmation: string | undefined,
  env: EnvironmentView = process.env,
): PostgresTarget {
  if (!input) throw new UnsafeTargetError("An explicit disposable PostgreSQL URL is required; DATABASE_URL is never inherited.");
  let url: URL;
  try { url = new URL(input); } catch { throw new UnsafeTargetError("The PostgreSQL target is not a valid URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new UnsafeTargetError("The PostgreSQL target must use postgres:// or postgresql://.");
  if ([...url.searchParams.keys()].some((name) => name !== "sslmode")) {
    throw new UnsafeTargetError("Connection parameters other than sslmode could redirect the target and are refused.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !DISPOSABLE_DATABASE.test(database)) {
    throw new UnsafeTargetError("Disposable PostgreSQL databases must be named safe01_<lowercase_name> on an explicit host.");
  }
  if (confirmation !== database) throw new UnsafeTargetError("Confirm ownership by repeating the exact disposable database name.");
  const identity = postgresIdentity(input);
  const configured = [env.DATABASE_URL, DRIZZLE_CONFIG_URL].map((value) => value && postgresIdentity(value));
  if (configured.includes(identity)) throw new UnsafeTargetError("Refusing the configured application database.");
  return { url: input, host: url.hostname, port: url.port || "5432", database };
}

export function assertDistinctPostgres(a: PostgresTarget, b: PostgresTarget): void {
  if (postgresIdentity(a.url) === postgresIdentity(b.url)) {
    throw new UnsafeTargetError("PostgreSQL backup source and restore destination must be different databases.");
  }
}

/** Target description without credentials, for logs and verification records. */
export const describePostgresTarget = (target: PostgresTarget) =>
  `postgresql://${target.host}:${target.port}/${target.database}`;
