# AUTH-02 — Email/password sign-in and account administration

Issue: [#36 AUTH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36)
Status: Approved 1 October 2026 with the recommended decisions D-1–D-7 (see the [plan approval record](plan.md#approval-record)); implementation in progress.
Updated: 1 October 2026, Asia/Dhaka

## Problem and inspected baseline

The owner wants to create accounts, set up passwords and control access from the portal. Today only invited Google accounts can sign in. Not every teacher is confirmed to have a university Google account, and Google OAuth credentials are still not configured (AUTH-01 #1). So nobody can sign in to the real portal yet.

Inspected on 1 October 2026 at `8821e91` (main after BUG-29):

- **Provider** (`src/lib/auth/provider.ts`). Better Auth 1.7.6 with the Drizzle adapter. `emailAndPassword` is disabled. `validateUserInfo` refuses any sign-in that is not Google, and any address not invited in `portal_users`. The session cookie cache is off, so every request reads the session from the database.
- **Actor** (`src/lib/auth/index.ts`). `getOptionalActor` returns no one unless Google is configured. It also needs `emailVerified` on the session user. It then maps the email to a `portal_users` row with status `invited` or `active`, and loads roles in force now. The first verified sign-in moves `invited` to `active`, with an audit event. Roles and status are read on every request, so a role change or suspension already applies on the next request. Suspension does not delete existing sessions.
- **Roles** (`src/lib/auth/policy.ts`). Seven fixed roles map to capabilities. A person can have several roles. Department scope is fixed in code: system administrator and teacher are unscoped, the others are CSE. CSE is the only department.
- **People & Access** (`src/app/(portal)/access/page.tsx`, `src/lib/auth/admin-actions.ts`). It lets an administrator invite (name, Google email, first role, teacher short code), suspend or reactivate, add a role, and remove a role. Guards stop self-suspension and self-revocation. There are no confirmations, the role selects are unlabelled, and the page uses its own styling instead of the shared components (#31). Nothing protects the last system administrator from another administrator. Errors are thrown rather than shown in the form. Name, email and teacher link cannot be edited.
- **Storage.** `auth_account.password` exists but is unused. `auth_verification` can hold one-time tokens, and Better Auth can store them hashed. All times are instants and show in Asia/Dhaka (BUG-29).
- **First administrator.** `npm run auth:bootstrap` creates a Google invitation for `PORTAL_BOOTSTRAP_ADMIN_EMAIL` (decision D-01 in the institutional register). There is no recovery path if the only administrator loses access.
- **Review sign-in.** `npm run ux:review` writes synthetic sessions straight into a disposable database, with placeholder Google settings, so screens can be reviewed without OAuth.

## Outcome and scope

- **Outcome:** an administrator creates an account and hands the person a one-time link. The person chooses their own password and signs in with email and password, or with Google where that is allowed. The administrator can see and change each person's access, sign-in methods and sessions, with confirmations. Every account event is audited without storing secrets.
- **Included:**
  - Email and password sign-in alongside Google, which stays (owner answer, 30 September 2026). Password sign-in works when Google is not configured.
  - Sign-in methods chosen per account by the administrator (D-2).
  - One-time setup links and reset links, issued by an administrator and copied by hand (D-1, D-5). No email server.
  - Password rules (D-4), throttling and temporary lockout (D-5).
  - Session revocation on suspension, password change or reset, email change, and on request ("Sign out everywhere").
  - My account page: change my password, see my sign-in methods and roles, sign out my other sessions.
  - People & Access rebuilt with shared components. It covers #31: confirmations, labelled controls, results shown after each action (D-6).
  - Editing a person's name, email and linked teacher record.
  - Role start and end dates, and an effective-access summary in plain words.
  - Protection of the last active system administrator.
  - Operator recovery from the command line: the bootstrap command can issue a setup or reset link for an administrator (D-7).
  - A forward-only migration that keeps every existing account and role.
- **Excluded:**
  - Email delivery of links (later, once SMTP is configured). Notifications too.
  - Self sign-up. Accounts exist only when an administrator creates them.
  - Two-factor authentication. Recommended as a follow-up, first for administrators.
  - Custom roles or an editable capability matrix (D-3).
  - A department scope picker. Only CSE exists; scope stays as today and is shown in the summary.
  - Password expiry and forced periodic changes.
  - Real Google OAuth verification, hosted PostgreSQL and the public-contact projection. These stay in AUTH-01 (#1).
- **Dependencies:** BUG-29 (#29) is merged, so role and link times are correct. AUTH-01 (#1) keeps the hosted and OAuth gates. The issue requires a security review before merge.

## Required behavior

### Accounts and sign-in methods

- An account is one `portal_users` row: name, email, optional linked teacher record, status, sign-in methods, and roles. The email is unique and stored in lower case. It is the sign-in name for both methods.
- **Statuses:** *invited* (never signed in), *active* and *suspended*. A separate setup state shows on screen: link not issued, link waiting (with expiry), link used, or link expired.
- **Methods:** Password, Google, or both. At least one is always enabled. To stop all access, the administrator suspends the account instead.
- A password account cannot sign in until its owner sets a password through a setup link. An administrator never sees, types or receives the password.
- Google sign-in is accepted only when Google is enabled for that account, and the Google address matches the account email. Password sign-in is accepted only when Password is enabled and a password has been set.
- On a password account, the email is an identifier the administrator entered. Until email delivery exists, the portal does not prove that the person controls that mailbox. Screens do not claim it is verified.

### Setup and reset links

- Creating an account with Password enabled issues a setup link. The administrator sees the full link once, with a Copy button and its expiry time. They can reissue it later, which voids the old one. They can also revoke it.
- The link opens a page outside the portal frame. It shows the account's name and email, a new-password field and a confirmation field. Saving sets the password, uses up the link, activates the account, and signs the person in. Any older sessions are removed.
- A reset link works the same way for an account that already has a password. Issuing one does not change the current password until the link is used. Using it removes every session.
- **One use only, atomically.** If two submissions race, one succeeds and the other is refused.
- A used, expired, revoked, malformed or unknown link, or a link for a suspended account, all show the same message: "This link can no longer be used. Ask the portal administrator for a new one." The message reveals nothing about the account.
- Links are stored only as hashes. The full link never appears in audit records, logs, URLs of other pages, or page source after the issuing screen.
- If someone else is signed in when a link is opened, the page says so and offers to sign them out first.
- Login page: "Forgot your password?" explains that the portal administrator issues reset links. There is no self-service reset until email delivery exists.

### Passwords, throttling and lockout

- Password rules (D-4): at least 12 characters and at most 128. Every character is allowed, including spaces, and pasting works. Common passwords are refused, and so are passwords that contain the account's email name. There are no composition rules. Passwords are hashed by the auth library and never logged.
- The form shows the rules before typing and explains a refusal next to the field. Fields use `new-password` and `current-password` autocomplete, so password managers work. A show/hide toggle is keyboard-operable.
- Every failed sign-in shows the same message, whether the email is unknown, the password is wrong, the method is disabled, the account is suspended, or it is locked: "Email or password not accepted. After 5 failed tries, wait 15 minutes."
- **Lockout** (D-5): 5 consecutive failed password attempts on one account lock password sign-in for 15 minutes. The lock state is in the database, so it survives a restart. A successful sign-in or a password reset clears the count. The administrator sees the lock and can clear it. Lockouts are audited. Requests are also throttled per client address on the sign-in and link endpoints.
- **Change password** (My account) needs the current password. It signs out every other session and keeps the current one.

### Sessions and effective access

- Roles, status and methods are checked on every request, as today. A role change, suspension or method change applies on the next request without a new sign-in.
- Suspension also deletes all of the person's sessions. So do password reset, email change and "Sign out everywhere". Reactivation does not restore sessions.
- Each account shows an **effective-access summary**: its roles with scope and dates, and what they allow in plain words (for example "Edit the routine", "Take attendance for assigned groups").
- Roles can have a start date and an optional end date. A role with a future start shows as *scheduled*; one past its end shows as *ended*. Removing a role ends it now, and history is kept.

### Administration safeguards

- Only `manage_users` holders (system administrators) can see People & Access or call its actions. Every action is checked on the server, whatever the screen shows.
- Confirmations name the person and the consequence before suspending, removing a role, disabling a method, issuing a reset link (it is a credential), signing someone out everywhere, and changing an email.
- An administrator cannot suspend themselves, remove their own system administrator role, or disable their own last method. Nobody can suspend, demote or remove the last method of the **last active system administrator**. That check runs inside the same transaction as the change.
- Teacher role needs a linked teacher record, as today. Unlinking a teacher record while the account holds the teacher role is refused, with an explanation.
- Each action shows its result in place: who changed and what. Validation errors appear next to their fields. The screen keeps the person in view after a save.

### Audit

Each event commits in the same transaction as its change. It records the actor, the account and before/after values, but never a password, hash, token or link. Events: account created, details edited (name, email, teacher link), method enabled or disabled, setup link issued, reissued or revoked, password set through a link, reset link issued, password reset, password changed, lockout and lockout cleared, sessions revoked (with the reason), status changed, role granted, scheduled or ended, and operator recovery link issued. A successful sign-in updates `last_login_at`; individual failed attempts are counted but not stored as audit events.

### Existing data and operations

- Existing accounts keep their status and roles. They get the Google method only, with Password off, so nobody's access changes on migration. The migration is forward-only. The institutional database is backed up before it is migrated, as in BUG-29 T-08.
- `npm run auth:bootstrap` keeps the Google route. It gains an option to create the first administrator with Password and print a setup link to the operator's terminal. For recovery, it can print a reset link for an existing system administrator. Each use is audited as a system action; the link itself is printed only.
- The development review sign-in (`ux:review`) keeps working and can also review the new password screens on disposable data.

### Screens

Mockups for desktop and phone come before coding, in the paper/ink/pine/gold language, for review with the plan:
- the login page, with both methods and the error states;
- the set-password page from a setup or reset link, including the invalid-link state;
- My account;
- People & Access: the account list, the account detail, create account, the link-issued panel and the confirmations.

All screens work by keyboard, label every control, connect errors to their fields, announce results, and avoid horizontal scrolling on phones. Times show in Asia/Dhaka.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | An administrator creates a Password account. A setup link with an expiry is shown once. Using it sets a password, activates the account and signs the person in. The administrator never sees the password. | Browser flow on disposable data; database check that only a hash is stored |
| AC-02 | A used, expired, revoked, reissued-over, tampered or unknown link, or a link for a suspended account, is refused with the same message. No password changes. | Scripted adversarial checks on a disposable database |
| AC-03 | Two simultaneous submissions of one link: exactly one succeeds. | Concurrency check on a disposable database |
| AC-04 | Password sign-in succeeds with the right password, and fails with the same message for: unknown email, wrong password, Password disabled, password never set, suspended, locked. | Scripted sign-in matrix |
| AC-05 | Google sign-in is refused for an account without the Google method, or an address that is not invited. It is accepted when enabled and matching. | Provider hook checks; real OAuth callback stays PENDING under AUTH-01 unless credentials are available |
| AC-06 | Password sign-in works with Google unconfigured. The login page then shows only the password form. | Disposable-database run without Google settings |
| AC-07 | Passwords shorter than 12, longer than 128, common, or containing the email name are refused with a message at the field. A 12-character passphrase with spaces is accepted. | Pure rule tests and form flow |
| AC-08 | Five consecutive failures lock password sign-in for 15 minutes, across a server restart. An administrator can clear the lock. A successful sign-in or reset clears the count. Lockout events are audited. | Scripted check with a controlled clock |
| AC-09 | Suspension, reset through a link, email change and "Sign out everywhere" delete every session of that account. Changing my own password keeps only my current session. | Session-table checks and a browser check that a removed session is signed out |
| AC-10 | A role grant, end or scheduled start takes effect on the next request without signing in again. A role whose start is in the future grants nothing until then. | Disposable-database checks with a controlled clock |
| AC-11 | Nobody can suspend, demote or remove the last method of the last active system administrator, including two administrators acting at once. Self-suspension and self-demotion stay refused. | Direct server-action calls, with a concurrent case |
| AC-12 | Anonymous users, signed-in users without `manage_users`, and suspended users get a denial for every account action and data is unchanged. | Direct action-call matrix |
| AC-13 | Every listed account event writes one audit row in the same transaction. No audit row, log line or page other than the issuing panel contains a password, hash, token or link. | Audit-row checks and a search of audit rows and server output for planted secrets |
| AC-14 | Confirmations name the person and consequence for each risky action. Controls are labelled. Results and errors are announced. axe reports no critical issues. People & Access matches the shared components (#31). | Browser review at desktop and 375 px; axe |
| AC-15 | The effective-access summary lists each role with scope, dates and plain-word permissions, and matches what the server allows. | Compare the summary with policy checks for each role |
| AC-16 | Migrating a copy of the populated database keeps every account, status and role. Existing accounts get Google only. Recovery from the pre-migration backup works. | Populated PGlite copy and PostgreSQL 17 (`SAFE01_PG_BIN`); recovery drill on a disposable copy |
| AC-17 | The bootstrap command can create a Password first administrator and print a setup link, and can print a reset link for an existing administrator. Both are audited as system actions and refused for non-administrators. | Command runs against a disposable database |
| AC-18 | The login, set-password, My account and People & Access screens work on a phone and by keyboard, without page-wide horizontal scroll. | Browser review at 375 px and keyboard pass |
| AC-19 | Typecheck, lint, domain tests, safety tests and build pass. A security review of the branch has no open high findings. | Command output and review record |

## Decisions

The owner accepted every recommendation on 1 October 2026, in the Claude Code session ("Accept all recommendations, write the plan and mockups"). The plan builds on these answers.

| ID | Question | Decision (as recommended) |
|---|---|---|
| D-1 | How does a new person get their first password? | **One-time setup link** that the administrator copies and sends by hand (for example by WhatsApp or in person). The alternative is a temporary password that must be changed at first sign-in, but then the administrator knows a working password. |
| D-2 | Which sign-in methods does a new account get? Do all teachers have university Google accounts? | The administrator ticks **Password**, **Google** or both. **Password** is the default, because Google accounts are not confirmed for every teacher. |
| D-3 | Should roles be editable (a custom capability matrix)? | **No, keep the seven fixed roles** with scope and dates. Add custom roles only when a real need appears, with the system administrator role locked. |
| D-4 | Password rules? | **12 to 128 characters**, any characters, common passwords and the email name refused, no forced changes. NIST SP 800-63B-4 asks for 15 when a password is the only factor. 12 is easier for staff; choose 15 for the stricter rule. |
| D-5 | Link lifetimes and lockout? | **Setup link 72 hours, reset link 24 hours**, so a link can be passed on by hand. **Lockout after 5 failures for 15 minutes.** |
| D-6 | Should AUTH-02 absorb #31 (People & Access confirmations)? | **Yes.** AUTH-02 rebuilds that page anyway; #31 would close with it. |
| D-7 | Should the operator command be able to issue an administrator's setup or reset link? | **Yes.** Then the owner can start using the portal before Google OAuth is set up, and recover if the only administrator is locked out. It needs terminal access to the server, so it is not a web back door. |

## Sources

- Owner request and answer: [#36](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36) (30 September 2026); triage in the [brainstorm record](../../plans/owner-brainstorm-2026-09-30.md).
- [#31](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/31) People & Access findings; [#1](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/1) AUTH-01 remaining gates.
- [Product requirements §6](../../PRODUCT_REQUIREMENTS.md#6-authentication-and-role-based-authorization); [institutional decisions](../../decisions/INSTITUTIONAL_DECISIONS.md) D-01 (first administrator) and D-07 (operational ownership, deferred to DEP-01).
- [BUG-29 spec](../BUG-29/spec.md) for instants and immediate role effect; [SAFE-01](../SAFE-01/spec.md) for disposable-database checks and recovery.
