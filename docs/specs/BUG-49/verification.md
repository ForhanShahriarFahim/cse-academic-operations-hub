# BUG-49 — Sign-out without Google; tokens in the dev log

Issue: [#49](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/49) · Follows [AUTH-02](../AUTH-02/verification.md) (#36, PR #47)
Status: **Accepted by the owner on 2 October 2026** ("accept BUG-49"); merged.
Updated: 2 October 2026, Asia/Dhaka

A small bug, so this one record holds the problem, the fix and the evidence.

## Problem

Found by the owner on 2 October 2026, on the local portal right after AUTH-02 was merged.

1. **Sign out did nothing.** With sign-in configured but no Google settings, `POST /api/auth/sign-out` returned 503 ("Google sign-in is not configured."). The session cookie stayed, so the person landed back on the dashboard. `src/app/api/auth/[...all]/route.ts` (from AUTH-01) refused every auth route unless Google was configured. AUTH-02 made password sign-in work without Google (AC-06), but its checks missed this: the browser tests run with placeholder Google settings, and the scripted AC-06 check covered sign-in only.
2. **Tokens in the dev log.** In development, Next.js logs every Server Function call with its arguments, so the terminal showed `inspectLinkAction("<token>")`. That breaks AUTH-02 AC-13. The owner's link had already been used, so it could no longer be used. Production builds do not log these calls.

## Fix

- The auth route now requires only `authConfigured` (a secret and URL). Google's own routes need no extra gate: without Google settings the provider is not registered.
- `next.config.ts` sets `logging.serverFunctions: false`.

## Verification, 2 October 2026

| Check | Result |
|---|---|
| New `test:safety` case: sign in with a password, then `POST /api/auth/sign-out` through the real route with Google unconfigured; expect 200, the session removed and the cookie refused | **Fails on the old route** ("sign-out through the route: 503"); **passes** with the fix on PGlite and PostgreSQL 17.11 |
| Live portal (port 3000, the owner's configuration: no Google) | `POST /api/auth/sign-out` as the browser client sends it returns 200 `{"success":true}`; `get-session` 200 |
| Dev log after the change | Opening `/set-password` with a made-up token logs `POST /set-password 200` with no function name or arguments; the page shows the invalid-link message |
| `typecheck`, `lint`, `test:domain`, `build` | Pass |

Not repeated: the full `test:ux` run. The change touches only the auth route gate and dev logging, and the review server runs with placeholder Google settings, so the route behaved the same there before and after.

## Delivery and acceptance

- Branch `codex/bug-49` from main `cb51925`.
- Owner acceptance: **Accepted** on 2 October 2026 in the Claude Code session, after trying Sign out on the running portal: "accept BUG-49".
- Merge / closure: merged into `main` through PR #50 on 2 October 2026; #49 closed.
