/**
 * AUTH-02 child runtime. Unlike controlled-runtime.ts, the identity provider is
 * the real one (Better Auth with a synthetic secret), so sign-in, sessions and
 * cookies run unchanged against the pinned owned database. Only Next.js
 * request-scoped modules are replaced: `headers()` returns the cookie and client
 * address of the current `as(...)` call, so concurrent calls can act as
 * different people. It refuses to load outside a pinned SAFE-01 child.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomInt } from "node:crypto";
import Module from "node:module";
import path from "node:path";
import { pinnedTarget } from "./pinned";

if (!pinnedTarget()) throw new Error("The AUTH-02 child runtime only runs inside a pinned child process.");
if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) throw new Error("The AUTH-02 child needs a synthetic BETTER_AUTH_SECRET and BETTER_AUTH_URL.");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const AUTH_DIR = path.join(REPO_ROOT, "src", "lib", "auth");
export const COOKIE = "better-auth.session_token";

export class RedirectSignal extends Error {
  constructor(readonly location: string) { super(`redirect:${location}`); this.name = "RedirectSignal"; }
}

interface Caller { cookie: string | null; ip: string }
const caller = new AsyncLocalStorage<Caller>();

/** Run `work` as the browser holding `cookie` (null: signed out), from a fresh client address unless one is given. */
export function as<T>(cookie: string | null, work: () => Promise<T>, ip = `198.51.100.${randomInt(1, 255)}`): Promise<T> {
  return caller.run({ cookie, ip }, work);
}

/** The cookie value Better Auth sets for a session token. */
export const signedCookie = (token: string) =>
  encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`);

function stub(request: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(request, { paths: [AUTH_DIR] });
  const entry = new Module(filename);
  entry.filename = filename;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filename] = entry;
}

stub("next/headers", {
  headers: async () => {
    const current = caller.getStore();
    const headers = new Headers({ "user-agent": "SAFE-01 AUTH-02 probe", "x-forwarded-for": current?.ip ?? "198.51.100.1", origin: process.env.BETTER_AUTH_URL! });
    if (current?.cookie) headers.set("cookie", `${COOKIE}=${current.cookie}`);
    return headers;
  },
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
});
stub("next/cache", { revalidatePath: () => undefined, revalidateTag: () => undefined });
stub("next/navigation", {
  redirect: (location: string) => { throw new RedirectSignal(location); },
  notFound: () => { throw new RedirectSignal("not-found"); },
});

export function loadApp<T>(relativePath: string): T {
  return require(path.join(REPO_ROOT, relativePath)) as T;
}
