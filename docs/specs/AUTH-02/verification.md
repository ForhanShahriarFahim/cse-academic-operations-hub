# AUTH-02 — Verification

Issue: [#36 AUTH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Mockups: [mockups/](mockups/)
Status: **Accepted by the owner on 2 October 2026** ("accept AUTH-02"). The institutional migration and the merge wait for the owner's separate go-ahead.
Updated: 2 October 2026, Asia/Dhaka

## Environment

- Branch `codex/auth-02` from main `8821e91`. Approval recorded in `ea1aa21`. Verified revision: `13ee3e8` (T-10 fix and screenshots), plus this record.
- **Databases:** disposable only. `test:safety` uses synthetic data under `.tmp/safe-01` (PGlite) and a throwaway PostgreSQL 17.11 cluster (`SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`, 127.0.0.1 only, removed afterwards). Browser checks use `npm run ux:review -- --fresh` (`.tmp/ux-review`, seeded from the Summer 2026 source). The configured database under `.data/` was never opened.
- **Browser:** Microsoft Edge through Playwright (channel `msedge`), against the review server on port 3100.
- **Google:** no OAuth credentials are available, so the real Google callback was not exercised (see AC-05).

## Acceptance results, 1 October 2026

| Criterion | Result | Method and evidence |
|---|---|---|
| AC-01 | **Pass** | Browser: an administrator creates a Password account and gets the setup link once; the person opens it, chooses a password, is signed in, and the link then refuses (`accounts.spec.ts`, "setup link…"). Database: only a hash is stored for the password and the link ("Setup link: … use stores a hash only"; "Secrets: 23 planted passwords and link tokens appear in no row"). |
| AC-02 | **Pass** | `test:safety` AUTH-02: used, expired, replaced, revoked, tampered, unknown, malformed, suspended-account and password-off links all get one message and change no row. Browser: an unknown link and a page without a link explain themselves. |
| AC-03 | **Pass** | `test:safety` AUTH-02: "Concurrent use of one link: exactly one succeeds" (PGlite and PostgreSQL). |
| AC-04 | **Pass** | `test:safety` sign-in matrix: the right password is accepted; unknown email, wrong password, method off, never set, suspended and locked are refused with one message, and refusals still hash (≥ 145 ms). The browser flow shows the same message at the field. |
| AC-05 | **Pass with a pending part** | `test:safety` "Google gate": Google is accepted only with Google on for an invited, usable account; other cases refused. The **real Google OAuth callback stays PENDING** under AUTH-01 (#1), as the spec allows, because no credentials are available. |
| AC-06 | **Pass** | `test:safety`: "Password sign-in works with Google unconfigured". The login page shows the Google button only when Google is configured (`googleAuthConfigured`). |
| AC-07 | **Pass** | `test:domain` (`verify-account-rules.ts`): length 12–128 in code points, common list, email name, a 12-character passphrase with spaces accepted. Browser: a short password is refused at the field with `aria-invalid`. The common list is the 80-entry hand-written starter list (see Notes). |
| AC-08 | **Pass** | `test:safety`: 5 failures lock for 15 minutes (concurrent failures lock and audit once); the right password is refused while locked; a new process still refuses it ("Lockout survives a restart"); success, a reset link and an administrator each clear it. Browser: five wrong passwords, then the administrator sees "locked until" and clears it ([screenshot](screenshots/access-person-locked-desktop.png)). |
| AC-09 | **Pass** | `test:safety` "Sessions": suspension, email change and sign out everywhere delete every session; using a link deletes the person's sessions; own password change keeps only this session. Browser: after a password change on one device, the other device is sent to the sign-in page. |
| AC-10 | **Pass** | `test:safety` "Role dates": a scheduled role grants nothing until it starts; a role granted or ended now applies on the next request. |
| AC-11 | **Pass** | `test:safety` "Safeguards": self-suspension, self-demotion and turning off one's own last method refused; two administrators suspending each other at once leaves exactly one active (PGlite and PostgreSQL). Browser: turning off the only method is refused with a reason. |
| AC-12 | **Pass** | `test:safety` "Denials": 30 account action calls as anonymous, a teacher and a suspended administrator are refused with no row changed. |
| AC-13 | **Pass** | `test:safety` "Audit: every account event kind is recorded"; "Secrets": 23 planted passwords and link tokens appear in no row and no output, and no password, token, hash or session token is in the 22 audit rows. The setup link appears only on the issuing panel; it is masked in the committed screenshot. |
| AC-14 | **Pass** | Browser: each risky action has a confirmation naming the person and consequence ([suspend](screenshots/access-person-confirm-desktop.png)); results are announced in `role="status"`, errors in `role="alert"`. axe (WCAG 2 A/AA) reports **no violations** on `/access`, `/access/new`, `/access/[id]`, `/account`, `/login` and `/set-password` at 1366 px and 390 px. People & Access uses the shared `PageHeader`, `Panel`, `Notice`, `StatusText` and `useConfirm` components (#31). |
| AC-15 | **Pass** | `test:domain`: "access summary = policy for all 7 roles". The person page and My account show scope, dates and plain-word permissions ([screenshot](screenshots/access-person-desktop.png)). |
| AC-16 | **Pass on disposable copies; institutional migration pending** | `test:safety` "Upgrade 0007 → 0008" on PGlite and PostgreSQL 17: accounts, statuses and roles unchanged; existing accounts Google only; existing sessions kept; an account cannot lose both methods. Recovery drills (T-02 PGlite cold backup/restore; T-06 PostgreSQL restore) pass on the 0008 schema. The institutional backup and migration wait for acceptance and the owner's go-ahead. |
| AC-17 | **Pass** | `test:safety` "Operator": `--password` creates a Password administrator and prints a setup link once; `--reset-link` replaces it; strangers and suspended administrators are refused; audits are system-attributed; links are stored only as hashes. README operator section updated (T-08). |
| AC-18 | **Pass** | Browser: no page-wide horizontal overflow on all six account routes at 1366 px and 390 px. Keyboard: sign-in order is Skip to content → View the published routine → Email → Password → Show password → Sign in; a confirmation opens with focus on Cancel, Esc closes it and focus returns to the button. Phone screenshots below. |
| AC-19 | **Pass** | `typecheck`, `lint`, `test:domain`, `test:safety` (with PostgreSQL 17) and `build` pass at `13ee3e8`. The security review has no open high findings; its one hardening item is fixed (see Review findings). |

## Checks

All on 1 October 2026, at `13ee3e8` (the return-path fix was in the working tree for the `test:ux` run and then committed unchanged).

- `npm run typecheck`: pass. It first failed on a type-only error in `tests/ux/accounts.spec.ts` (`labels` on `HTMLElement`); fixed by typing the focused element as an input.
- `npm run lint`: pass.
- `npm run test:domain`: pass, including the new return-path cases.
- `SAFE01_PG_BIN=… npm run test:safety`: exit 0. T-01 isolation, T-02 PGlite recovery, T-03 two-term history, T-04 audit atomicity, T-06 PostgreSQL, BUG-29 time zones (PGlite and PostgreSQL) and **AUTH-02 accounts (PGlite and PostgreSQL)** all pass.
- `npm run build`: pass.
- `npm run test:ux` on a fresh review copy: **77 passed**, exit 0. One test skipped by design: the published teacher routine needs a `--publishable` copy (TCH-02), and the plain copy runs its unpublished counterpart instead. A first run on a cold server timed out while the first page compiled (over 2 minutes); the rerun on the warm server is the recorded result.
- Screenshots: captured with a local Playwright script (kept in the ignored `.tmp/`) on a fresh review copy, with synthetic people and the Next.js dev badge hidden.

## Review findings

| Finding | Correction / disposition | Reverification |
|---|---|---|
| Security review at `69a2083` (`/security-review` skill plus the manual checklist): no high- or medium-confidence findings. | — | — |
| Hardening: `safeReturnPath` accepted control characters, so `"/\t/evil.example"` could become `//evil.example` in a browser. | Fixed in `13ee3e8`: control characters (U+0000–U+001F, U+007F) are refused, and the parsed URL must keep the portal's origin. Cases for tab, newline, CRLF, NUL and DEL added to `verify-account-rules.ts`. | `test:domain` pass; `test:ux` sign-in flows pass. |
| Trade-off recorded in the plan: account linking does not require a verified local email, so an account that set a password first can still add Google. Google links only when Google reports the email verified, and only to an invited account with Google enabled. | Accepted as designed (plan, provider configuration). | "Google gate" in `test:safety`. |
| Throttling is in memory, per server process, keyed by client address; trusted proxy headers are a DEP-01 task. | Recorded limitation, not a defect for the local deployment. | — |

## Screenshots

Fresh review copy, synthetic people, 1440 px desktop and 390 px phone.

- Sign-in: [desktop](screenshots/login-desktop.png), [phone](screenshots/login-phone.png), [refused password](screenshots/login-refused-desktop.png)
- Set password: [desktop](screenshots/set-password-desktop.png), [phone](screenshots/set-password-phone.png), [used link](screenshots/set-password-link-used-desktop.png)
- My account: [desktop](screenshots/my-account-desktop.png), [phone](screenshots/my-account-phone.png)
- People & access list: [desktop](screenshots/access-list-desktop.png), [phone](screenshots/access-list-phone.png)
- Create account: [form](screenshots/access-new-desktop.png), [link issued](screenshots/access-new-link-issued-desktop.png) (link masked)
- One person: [desktop](screenshots/access-person-desktop.png), [phone](screenshots/access-person-phone.png), [locked](screenshots/access-person-locked-desktop.png), [suspend confirmation](screenshots/access-person-confirm-desktop.png)

## Notes and limitations

- **Common-password list.** The portal uses an 80-entry hand-written starter list (`src/lib/auth/common-passwords.ts`). Replacing it with the SecLists-derived list (MIT) still needs the owner's go-ahead for the download (T-03).
- **Review data.** The plan said `ux:review` would seed a password account, a locked account and an open link. Instead each browser test and the screenshot script create their own synthetic accounts through the screens, so every state is produced by the real flows.
- **Full-page desktop screenshots** show the sidebar only to the window's height, because the sidebar is fixed to the viewport. This is how the screenshot is stitched, not a layout fault.
- **Date fields** use the browser's own date format (shown as month/day/year in this Edge).
- **Not covered:** the real Google OAuth callback and hosted PostgreSQL stay with AUTH-01 (#1) and DEP-01 (#19).

## Delivery and acceptance

- Commits: `bf214b8` (spec) … `13ee3e8` (T-10) on `codex/auth-02`, plus this record.
- Remaining gates: with the owner's go-ahead, a cold backup of the institutional database with a SHA-256 manifest and migration 0008 (BUG-29 T-08 pattern); merge; close #36 and #31.
- Owner acceptance: **Accepted** on 2 October 2026 in the Claude Code session, after reviewing this record, the screenshots and the delivery summary: "accept AUTH-02". The message did not authorize the institutional migration; that go-ahead is still requested separately, as agreed.
- Merge / closure: Pending.
