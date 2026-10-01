# AUTH-02 — Implementation plan

Issue: [#36 AUTH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36)
Specification: [spec.md](spec.md)
Verification: verification.md (created during T-11)
Status: Approved 1 October 2026; implementation in progress.
Branch / base: `codex/auth-02` from main `8821e91`
Updated: 1 October 2026, Asia/Dhaka

## Inspection and proposed approach

The code seams are recorded in the [spec baseline](spec.md#problem-and-inspected-baseline). The decisions are D-1–D-7 [as recommended](spec.md#decisions). The installed Better Auth (1.7.6) was checked for the options used below. Before coding, read the installed Next.js guides on authentication, data security, forms and redirecting (`node_modules/next/dist/docs/01-app/02-guides/`).

### Data (migration 0008, forward-only)

- **`portal_users`** gains these columns:
  - `password_enabled` (default false);
  - `google_enabled` (default true, so existing accounts keep Google only);
  - `password_changed_at`;
  - `failed_sign_ins` (default 0);
  - `locked_until`.
  
  A check constraint makes sure at least one method is enabled.
- **New `account_links` table.** Columns: id, user, purpose (`setup` or `reset`), `token_hash` (unique, SHA-256), `expires_at`, `issued_by_user_id` (null means the operator command), `issued_at`, `used_at` and `revoked_at`.
  - A partial unique index allows one open link per user.
  - The portal owns this table rather than `auth_verification`, so screens can show a link as waiting, used, expired or revoked, and audit it.
- **`auth_session`** gains `sign_in_method` (`password` or `google`). Existing sessions have none and are treated as Google, the only method so far.
- Role start and end dates use the existing `role_assignments.active_from` and `active_to` columns.

### Auth configuration (`src/lib/auth/provider.ts`)

- **Two separate flags.** `authConfigured` (secret and URL) gates all sign-in. `googleAuthConfigured` additionally needs the Google client settings. So password sign-in works without Google (AC-06). `getOptionalActor` checks `authConfigured`.
- **Email and password on**, with:
  - `disableSignUp: true` and `autoSignIn: false`;
  - min 12 / max 128 characters, a backstop for the portal's own rules.
- **Disabled HTTP paths**, because the portal sets passwords itself: `/sign-up/email`, `/request-password-reset`, `/reset-password`, `/reset-password/:token`, `/change-password`, `/set-password` and `/update-user`. The server-side calls the portal needs are checked in T-02 to still work.
- **`validateUserInfo` and a `hooks.before` on `/sign-in/email`.** Together they refuse sign-in when:
  - there is no account for the email;
  - the account is suspended;
  - the method is disabled, or no password has been set;
  - or the account is locked.
  
  Every refusal returns the library's normal 401 "invalid email or password". A refused sign-in still hashes a dummy password, so its timing matches a wrong password.
- **`hooks.after` on `/sign-in/email`.** A failure increments `failed_sign_ins`; the fifth one sets `locked_until` to now + 15 minutes and writes an audit event. A success resets the count and sets `last_login_at`.
- **`databaseHooks.session.create.before`** stamps `sign_in_method` from the request path. `getOptionalActor` refuses a session whose method is no longer enabled.
  - Google sessions still require a verified Google email.
  - Password sessions do not need `emailVerified`. Spec: the address is an identifier the administrator entered.
- **Account linking:** `requireLocalEmailVerified: false` and no trusted providers.
  - Google links only when Google reports the email as verified, and only to an invited account with Google enabled.
  - Without this, an account that set a password first could never add Google.
  - The security review in T-10 records this trade-off.
- **Throttling per client address.** Better Auth's rate limit is enabled, with in-memory storage for one server process: a rule of 10 requests per minute on `/sign-in/*`. A small in-memory throttle does the same for the link actions. Trusted proxy headers for client addresses are set in DEP-01.

### Domain modules (pure, tested in `test:domain`)

- **`src/lib/auth/password-rules.ts`.** Length 12–128, counted in Unicode code points. Refuses passwords that contain the email's local part (case-insensitive, 4+ characters) and passwords on a common list. The list is derived once from SecLists' most-common-passwords file (MIT licence, recorded with the file), keeping only entries of 12+ characters. It is committed as `src/lib/auth/common-passwords.txt`. Downloading it needs the owner's go-ahead in T-03; without it, a smaller hand-made list is used and recorded.
- **`src/lib/auth/links.ts`.** Makes a token (32 random bytes, base64url), hashes it, and returns the link URL. The token goes in the URL fragment: `${BETTER_AUTH_URL}/set-password#t=<token>`. A fragment never reaches server logs or the `Referer` header.
- **`src/lib/auth/access-summary.ts`.** Turns role assignments into scheduled, current and ended entries. Each one has its scope and plain-word permissions (one sentence per capability, for example `take_attendance` → "Take attendance for assigned groups").
- **`src/lib/auth/account-rules.ts`** holds the guards:
  - at least one method;
  - no self-suspension or self-demotion;
  - the teacher role needs a linked teacher record;
  - the last active system administrator. That count is taken inside the transaction, under `pg_advisory_xact_lock(hashtext('portal-admin-guard'))`, as the bootstrap command already does.

### Server actions

`src/lib/auth/admin-actions.ts` is rewritten, and `src/lib/auth/account-actions.ts` is new. Every action:
- checks permission on the server first;
- validates with field errors;
- makes its change and its audit row in one transaction;
- returns an `ActionResult` (SAFE-01 contract) instead of throwing.

**Administrator actions:**
- create account;
- edit details. An email change also updates `auth_user.email`, removes any linked Google account record and deletes the person's sessions;
- set methods;
- issue, reissue or revoke a setup or reset link. The token is returned once, in the result, and never stored or logged;
- clear lockout;
- sign out everywhere;
- suspend or reactivate. Suspension deletes the person's sessions;
- grant a role, with an optional start date and end date;
- end a role.

**The person's own actions:**
- inspect a link: returns the name and email, or the single invalid message;
- set a password with a link. The link is used up atomically with `update … where used_at is null and revoked_at is null and expires_at > now returning`. The action then creates or updates the `credential` account with the library's hash, deletes every session, writes the audit row and signs the person in;
- change my password. It needs the current password and keeps only the current session;
- sign out my other sessions.

### Screens (see [mockups](mockups/))

Mockups are static HTML on the UX-01 stylesheet, with renders at 1440 px and 390 px in [mockups/renders](mockups/renders/). There are seven:
- [sign-in](mockups/sign-in.html);
- [set-password](mockups/set-password.html);
- [sign-in states](mockups/sign-in-states.html): without Google, invalid link, someone else signed in, refused password;
- [account list](mockups/access-list.html);
- [one person](mockups/access-person.html), with the link-issued panel, lockout and the confirmations;
- [create account](mockups/access-new.html);
- [My account](mockups/my-account.html).

The addresses, names and links in them are invented.

| Route | Contents |
|---|---|
| `/login` | Rebuilt. Department panel and a password form. The Google button shows only when Google is configured. "Forgot your password?" explains the reset links. |
| `/set-password` | Outside the portal frame. A client component reads the fragment and then clears it with `history.replaceState`. It shows the person or the invalid state. If someone else is signed in, it offers to sign them out first. Served with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. |
| `/account` | My account: details, sign-in methods, change password, my access, my sessions. A "My account" link joins the shell's account block. |
| `/access` | The account list: search, status filter, methods, roles, last sign-in. Cards on phones. |
| `/access/new` | Create an account. It ends on the link-issued panel. |
| `/access/[id]` | One person: details, sign-in and link panel, lockout, roles with dates, effective access, sessions, recent activity. |

- Built with the shared `PageHeader`, `Panel`, `Notice`, `StatusText` and `useConfirm` components, so it covers #31.
- People & Access becomes list plus detail pages, instead of one long page, so a save keeps the person in view.
- **Review data:** `ux:review` seeds a password account, a locked account and an open link in its disposable copy, and `test:ux` gains the new routes.

### Operator command

`scripts/bootstrap-admin.ts` keeps its current Google behaviour, and gains two flags:
- `--password` creates the first administrator with Password and prints a setup link;
- `--reset-link <email>` prints a reset link for an existing system administrator, and refuses anyone else.

Each run writes a system audit event. The link is printed only. The README operator section is updated.

### Migration and recovery

0008 adds columns with defaults and a new table; no rows are rewritten except backfilling defaults. Before the institutional migration, it is checked on a populated PGlite copy and on PostgreSQL 17 (`SAFE01_PG_BIN`), with a restore drill on a disposable copy. Migrating the institutional database follows the BUG-29 T-08 pattern: a cold backup with a SHA-256 manifest in `F:\AI\backups\academic-operations-portal\`, then the migration, then counts compared. It runs only after acceptance and the owner's go-ahead.

## Approval record

- Owner decisions: D-1–D-7 accepted as recommended on 1 October 2026, in the Claude Code session ("Accept all recommendations, write the plan and mockups").
- Owner authorization of this plan: **Approved.**
- Date and evidence: 1 October 2026, in the Claude Code session. After reviewing the plan and mockup renders (commit `e03400d`), the owner replied "approve AUTH-02".
- Approved scope: [spec.md](spec.md), this plan and the [mockups](mockups/) as committed in `e03400d`, with D-1–D-7 as recommended. Downloading the common-password list (T-03) still needs a separate go-ahead.
- Material amendments: none.

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [x] T-01 — Migration 0008 and schema: method, lockout and password columns, `account_links`, `auth_session.sign_in_method`, the check constraint. Checked on a populated PGlite copy and on PostgreSQL 17. Covers AC-16.
- [x] T-02 — Provider configuration: the two config flags, email/password with sign-up and the reset/change paths disabled, sign-in hooks, lockout counting, the session method stamp, the actor's method check, linking settings and rate limits. Covers AC-04–AC-06, AC-08 and AC-10.
- [x] T-03 — Pure modules: password rules with the common list, links, access summary and account rules, with tests in `test:domain`. Covers AC-07, AC-11 and AC-15.
- [ ] T-04 — Administrator actions and the person's own actions, with audit and session revocation, and the last-administrator lock. Covers AC-01–AC-03, AC-09, AC-11–AC-13.
- [ ] T-05 — `/login` and `/set-password` screens. Covers AC-01, AC-04, AC-06, AC-07 and AC-18.
- [ ] T-06 — `/account` (My account) and the shell link. Covers AC-09, AC-15 and AC-18.
- [ ] T-07 — `/access`, `/access/new` and `/access/[id]`, with confirmations, results and the effective-access summary. Covers AC-14, AC-15 and AC-18, and #31.
- [ ] T-08 — Operator command flags and the README operator notes. Covers AC-17.
- [ ] T-09 — Adversarial checks in `test:safety`, a new `auth` group on disposable databases. It covers:
  - the link matrix and the race;
  - the sign-in matrix;
  - lockout with a controlled clock and a restart;
  - session revocation;
  - the role-date timing;
  - the action-call denial matrix;
  - concurrent last-administrator changes;
  - a planted-secret search of audit rows and server output.
  
  Covers AC-02–AC-04, AC-08–AC-13.
- [ ] T-10 — Review data and `test:ux` flows, desktop and 375 px screenshots, axe, a keyboard pass, and the security review of the branch (the `/security-review` skill plus a manual checklist). Covers AC-14, AC-18 and AC-19.
- [ ] T-11 — Final checks, verification record, brief/roadmap/README updates and handoff. After acceptance, with the owner's go-ahead: back up and migrate the institutional database. Covers AC-16 and AC-19.

## Verification and delivery

- **Focused checks:** `test:domain` for the pure modules, and the new `test:safety` auth group for server behaviour, on disposable databases only.
- **Final checks:** `typecheck`, `lint`, `test:domain`, `test:safety` (with `SAFE01_PG_BIN`), `build`, `test:ux`.
- **Pending by design:** a real Google OAuth callback stays PENDING under AUTH-01 (#1) unless credentials are provided. Hosted PostgreSQL stays with AUTH-01 and DEP-01.
- **Data safety:** never run `db:*`, `dev`, `start` or `test:ui` against the institutional database. Review screens with `ux:review` only.
- **Commits** carry the issue ID: schema and provider (T-01–T-02), domain modules and actions (T-03–T-04), screens (T-05–T-07), operator and tests (T-08–T-09), review and records (T-10–T-11). Push after each verified milestone. Merge and closure (and closing #31) wait for the security review and owner acceptance.

## Current checkpoint / handoff

- Approved scope: see Approval record (1 October 2026).
- Commits: `bf214b8` (proposed spec), then the plan, the recorded decisions and the mockups.
- Completed tasks: T-01, T-02, T-03 (with a hand-written starter list of common passwords in `src/lib/auth/common-passwords.ts`, pending the owner's go-ahead for the SecLists-derived list).
- Implementation notes beyond the plan text:
  - Password sign-in runs only through the portal's server action (`sign-in-actions.ts` → `password-sign-in.ts`). The library's `/sign-in/email` HTTP route is disabled too, so lockout and throttling cannot be bypassed. This replaces the planned `hooks.before/after` on that route; the behaviour is the same.
  - The BUG-29 safety check now inserts its pre-0007 rows with explicit SQL and ignores time columns added after 0007, so it keeps testing the database as it was before BUG-29.
  - The SAFE-01 controlled runtime's provider stub exports `authConfigured` and a session sign-in method.
- Next action: T-04 (server actions). The common-password list download still needs the owner's go-ahead.
- Verification so far: `typecheck`, `lint`, `test:domain` pass. `test:safety` T-01–T-04 and BUG-29 (PGlite and PostgreSQL 17) pass with 0008. A throwaway-database smoke test of the real provider passes: correct password, session stamped `password`, lockout after 5 with one audit row, unknown account refused.
- Blockers/capabilities: downloading the common-password list needs the owner's go-ahead (T-03). Google OAuth credentials are not available, so the real callback stays pending.
