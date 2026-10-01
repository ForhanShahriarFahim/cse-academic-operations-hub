/**
 * Controlled dependencies for production-path SAFE-01 children. Only the
 * identity provider session and the Next.js request-scoped modules (headers,
 * cache revalidation, navigation) are replaced; application loaders, actions,
 * authorization (`getOptionalActor`, `can`, role assignments) and transactions
 * run unchanged against the pinned owned database. Nothing here is reachable
 * from the application: it refuses to load outside a pinned SAFE-01 child.
 */
import Module from "node:module";
import path from "node:path";
import { pinnedTarget } from "./pinned";

if (!pinnedTarget()) {
  throw new Error("The SAFE-01 controlled runtime only runs inside a pinned child process.");
}

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const AUTH_DIR = path.join(REPO_ROOT, "src", "lib", "auth");

export class RedirectSignal extends Error {
  constructor(readonly location: string) { super(`redirect:${location}`); this.name = "RedirectSignal"; }
}

let signedInEmail: string | null = null;
let signedInMethod: "password" | "google" | null = null;
export const revalidations: string[] = [];

/** `method` is the session's AUTH-02 sign-in method; null is a session from before AUTH-02 (Google). */
export function signInAs(email: string | null, method: "password" | "google" | null = null): void {
  signedInEmail = email;
  signedInMethod = method;
}

function stub(request: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(request, { paths: [AUTH_DIR] });
  const entry = new Module(filename);
  entry.filename = filename;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filename] = entry;
}

stub("./provider", {
  authConfigured: true,
  googleAuthConfigured: true,
  auth: {
    api: {
      getSession: async () => signedInEmail
        ? { user: { email: signedInEmail, emailVerified: signedInMethod !== "password" }, session: { signInMethod: signedInMethod } }
        : null,
    },
  },
});
stub("next/headers", { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) });
stub("next/cache", {
  revalidatePath: (target: string) => { revalidations.push(target); },
  revalidateTag: (tag: string) => { revalidations.push(`tag:${tag}`); },
});
stub("next/navigation", {
  redirect: (location: string) => { throw new RedirectSignal(location); },
  notFound: () => { throw new RedirectSignal("not-found"); },
});

/** Load an application module after the stubs are installed (paths relative to the repository). */
export function loadApp<T>(relativePath: string): T {
  return require(path.join(REPO_ROOT, relativePath)) as T;
}

export function report(value: unknown): void {
  console.log(JSON.stringify(value));
}
