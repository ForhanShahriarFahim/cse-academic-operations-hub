/** UX-01 AC-10: the review harness only ever targets disposable PGlite under .tmp/ux-review. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REVIEW_ROOT, UnsafeReviewTarget, resolveCopySource, resolveReviewTarget, reviewEnvironment } from "./ux-review";
import { DEFAULT_PGLITE_DIR, REPO_ROOT } from "./safety/targets";

const refuses = (work: () => unknown, pattern: RegExp) =>
  assert.throws(work, (error: unknown) => error instanceof UnsafeReviewTarget && pattern.test(error.message));
const clean = { PGLITE_DATA_DIR: undefined, DATABASE_URL: undefined };
const inside = path.join(REVIEW_ROOT, "pglite");

assert.equal(resolveReviewTarget(inside, clean).toLowerCase(), inside.toLowerCase());
refuses(() => resolveReviewTarget(inside, { ...clean, DATABASE_URL: "postgresql://user@db.example/app" }), /DATABASE_URL/);
refuses(() => resolveReviewTarget(DEFAULT_PGLITE_DIR, clean), /protected/);
refuses(() => resolveReviewTarget(path.join(REPO_ROOT, ".data"), clean), /protected/);
refuses(() => resolveReviewTarget(path.join(REVIEW_ROOT, "..", "..", ".data", "pglite-summer-2026"), clean), /protected/);
refuses(() => resolveReviewTarget(inside, { ...clean, PGLITE_DATA_DIR: REVIEW_ROOT }), /protected/);
refuses(() => resolveReviewTarget(REVIEW_ROOT, clean), /inside/);
refuses(() => resolveReviewTarget(path.join(REPO_ROOT, ".tmp", "safe-01", "x"), clean), /inside/);
const outside = mkdtempSync(path.join(os.tmpdir(), "ux-review-outside-"));
try {
  refuses(() => resolveReviewTarget(outside, clean), /inside/);
  refuses(() => resolveCopySource(outside, inside), /not a PGlite/);
} finally {
  rmSync(outside, { recursive: true, force: true });
}
const nested = path.join(inside, "nested");
mkdirSync(nested, { recursive: true });
try {
  refuses(() => resolveCopySource(inside, nested), /PGlite|overlap/);
} finally {
  rmSync(nested, { recursive: true, force: true });
}

// Pinned child environment: .env files cannot redirect the target, because present keys are never overridden.
const env = reviewEnvironment(inside, { secret: "s".repeat(64), token: "t", cookie: "c" });
assert.equal(env.DATABASE_URL, "");
assert.equal(env.PGLITE_DATA_DIR, inside);
assert.equal(env.BETTER_AUTH_URL, "http://localhost:3100");
assert.ok(env.GOOGLE_CLIENT_ID?.endsWith(".example.test"));

console.log("UX review harness: target guards and pinned environment verified (AC-10).");
