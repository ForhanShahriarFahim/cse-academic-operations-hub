/**
 * UX-01 review harness: run the portal against a disposable PGlite database with
 * a synthetic signed-in reviewer, so internal screens can be reviewed and
 * checked without Google OAuth and without touching institutional data.
 *
 *   npm run ux:review                       prepare (seed from source fixture if empty) and start on :3100
 *   npm run ux:review -- --fresh            discard the disposable database and rebuild it
 *   npm run ux:review -- --from-copy <dir>  start from a copy of another PGlite directory (stop its server first)
 *   npm run ux:review -- --role <role>      reviewer role (default system_administrator)
 *   npm run ux:review -- --prepare-only     prepare and seed, but do not start the server
 *   npm run ux:review -- --print-cookie     print a browser snippet that signs in the reviewer
 *
 * Everything lives under .tmp/ux-review. DATABASE_URL is refused and every
 * variable that could redirect the database or auth provider is pinned for the
 * child processes, so .env/.env.local cannot change the target (#24).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { ROLES } from "../src/lib/auth/policy";
import { REPO_ROOT, DEFAULT_PGLITE_DIR, isWithin, overlaps, physicalPath } from "./safety/targets";

export const REVIEW_ROOT = path.join(REPO_ROOT, ".tmp", "ux-review");
export const REVIEW_PORT = 3100;
export const REVIEW_ORIGIN = `http://localhost:${REVIEW_PORT}`;
export const REVIEW_EMAIL = "ux-reviewer@example.test";
export const SESSION_COOKIE = "better-auth.session_token";
const SESSION_FILE = path.join(REVIEW_ROOT, "session.local.json");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const NEXT_CLI = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");

export class UnsafeReviewTarget extends Error {
  constructor(message: string) { super(message); this.name = "UnsafeReviewTarget"; }
}

/** Only a directory strictly inside .tmp/ux-review, never overlapping .data or the configured PGlite path. */
export function resolveReviewTarget(input: string, env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_URL) throw new UnsafeReviewTarget("DATABASE_URL is set. The review harness only runs on disposable PGlite; unset it first.");
  const target = physicalPath(path.resolve(input));
  const protectedPaths = [path.join(REPO_ROOT, ".data"), DEFAULT_PGLITE_DIR, env.PGLITE_DATA_DIR].filter(Boolean) as string[];
  if (protectedPaths.some((protectedPath) => overlaps(target, protectedPath))) {
    throw new UnsafeReviewTarget("Refusing a protected PGlite location (.data or the configured PGLITE_DATA_DIR).");
  }
  if (!isWithin(target, REVIEW_ROOT) || isWithin(REVIEW_ROOT, target)) {
    throw new UnsafeReviewTarget(`Review databases must be inside ${path.relative(REPO_ROOT, REVIEW_ROOT)}.`);
  }
  return target;
}

/** A copy source may be read, but never the review target itself or anything nested with it. */
export function resolveCopySource(input: string, target: string): string {
  const source = physicalPath(path.resolve(input));
  if (!existsSync(path.join(source, "PG_VERSION"))) throw new UnsafeReviewTarget("The copy source is not a PGlite data directory.");
  if (overlaps(source, target)) throw new UnsafeReviewTarget("The copy source and review target must not overlap.");
  return source;
}

interface ReviewSession { secret: string; token: string; cookie: string }

export function reviewSession(): ReviewSession {
  if (existsSync(SESSION_FILE)) return JSON.parse(readFileSync(SESSION_FILE, "utf8")) as ReviewSession;
  const secret = randomBytes(32).toString("hex");
  const token = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  const session = { secret, token, cookie: encodeURIComponent(`${token}.${signature}`) };
  mkdirSync(REVIEW_ROOT, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(session));
  return session;
}

/** Child environment: every database/auth variable pinned, so dotenv and Next.js cannot override it. */
export function reviewEnvironment(target: string, session: ReviewSession): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: "",
    VERCEL: "",
    npm_lifecycle_event: "",
    PGLITE_DATA_DIR: target,
    BETTER_AUTH_URL: REVIEW_ORIGIN,
    BETTER_AUTH_SECRET: session.secret,
    // Test-only values: they satisfy the "configured" check; no request ever reaches Google.
    GOOGLE_CLIENT_ID: "ux-review.apps.example.test",
    GOOGLE_CLIENT_SECRET: "ux-review-not-a-secret",
  };
}

async function seedReviewer(target: string, session: ReviewSession, role: string): Promise<void> {
  const db = new PGlite(target);
  try {
    await db.transaction(async (tx) => {
      await tx.query(`insert into auth_user (id, name, email, email_verified) values ('ux-reviewer', 'UX Reviewer', $1, true)
        on conflict (id) do update set email_verified = true`, [REVIEW_EMAIL]);
      await tx.query(`delete from auth_session where user_id = 'ux-reviewer'`);
      await tx.query(`insert into auth_session (id, expires_at, token, user_id) values ('ux-review-session', now() + interval '30 days', $1, 'ux-reviewer')`, [session.token]);
      const user = await tx.query<{ id: number }>(`insert into portal_users (email, display_name, status) values ($1, 'UX Reviewer', 'active')
        on conflict (email) do update set status = 'active' returning id`, [REVIEW_EMAIL]);
      const userId = user.rows[0].id;
      await tx.query(`delete from role_assignments where user_id = $1`, [userId]);
      // Backdated a day: database-stamped times are currently ahead of UTC on local PGlite (#29).
      await tx.query(`insert into role_assignments (user_id, role, active_from, granted_at) values ($1, $2, now() - interval '1 day', now() - interval '1 day')`, [userId, role]);
    });
  } finally {
    await db.close();
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

async function main(args: string[]) {
  const role = option(args, "--role") ?? "system_administrator";
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`Unknown role "${role}". Use one of: ${ROLES.join(", ")}.`);
  const target = resolveReviewTarget(path.join(REVIEW_ROOT, "pglite"));
  const copyFrom = option(args, "--from-copy");

  if (args.includes("--fresh") || copyFrom) rmSync(target, { recursive: true, force: true });
  if (copyFrom) {
    const source = resolveCopySource(copyFrom, target);
    cpSync(source, target, { recursive: true, filter: (file) => path.basename(file) !== "postmaster.pid" });
    console.log(`Copied ${path.relative(REPO_ROOT, source) || source} into ${path.relative(REPO_ROOT, target)} (source only read).`);
  }

  const session = reviewSession();
  const env = reviewEnvironment(target, session);
  console.log(`Review database: ${path.relative(REPO_ROOT, target)} (PGlite, disposable)`);
  const prepared = spawnSync(process.execPath, [TSX_CLI, "src/db/prepare.ts"], { cwd: REPO_ROOT, env, stdio: "inherit" });
  if (prepared.status !== 0) {
    // Embedded PGlite is not crash-safe: a hard-stopped server can leave the disposable copy unreadable.
    throw new Error("Preparing the review database failed. It is disposable; rebuild it with `npm run ux:review -- --fresh`.");
  }
  await seedReviewer(target, session, role);
  console.log(`Reviewer ${REVIEW_EMAIL} signed in as ${role.replaceAll("_", " ")}.`);

  if (args.includes("--print-cookie")) {
    console.log(`\nIn the browser console on ${REVIEW_ORIGIN}:\n  document.cookie = "${SESSION_COOKIE}=${session.cookie}; path=/; SameSite=Lax"\n`);
  }
  if (args.includes("--prepare-only")) return;

  console.log(`Starting ${REVIEW_ORIGIN} (Ctrl+C to stop). UX checks: npm run test:ux`);
  const server = spawn(process.execPath, [NEXT_CLI, "dev", "-p", String(REVIEW_PORT)], { cwd: REPO_ROOT, env, stdio: "inherit" });
  server.on("exit", (code) => process.exit(code ?? 0));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
