# BUG-26 (SAFE-01 F-07): `db:reset` keeps portal users and roles, and names its target before it runs

Issue: [#26](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/26), "SAFE-01 follow-up (F-07): db:reset silently erases portal users and roles"
Status: Approved 2 October 2026 with D-1 to D-3 as recommended (see [approval record](#approval-record)). Implemented, verified ([verification](verification.md)) and accepted by the owner on 2 October 2026.
Branch / base: `codex/bug-26` from `281718f` (main after BUG-49)
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)).

## Problem and inspected baseline

Inspected on 2 October 2026 at `281718f`. Derived from the code, the schema and PostgreSQL semantics; the reset was not executed.

- `npm run db:reset` runs [seed.ts](../../../src/db/seed.ts), which calls `seedSummer2026Database` ([seed-summer-2026.ts:50](../../../src/db/seed-summer-2026.ts)). That runs `TRUNCATE … teachers, departments RESTART IDENTITY CASCADE` and reloads the Summer 2026 source routine.
- Through the cascade, `portal_users` (`teacher_id → teachers`) and `role_assignments` (`department_id → departments`) are emptied. From `portal_users` the cascade continues to `account_links` and `role_assignments`. `audit_events` is in the list itself, so the access history from AUTH-02 (entity `portal_user`) is erased too.
- `auth_user`, `auth_account` (password hashes) and `auth_session` have no foreign key to `portal_users`, so they **survive** as orphans. Nobody can sign in, because sign-in requires a portal user. `npm run auth:bootstrap` is needed again.
- **No confirmation and no target shown.** The command reads `DATABASE_URL`, then `PGLITE_DATA_DIR`, then the default directory `.data/pglite-summer-2026` ([index.ts](../../../src/db/index.ts)). That default **is the institutional database**. Running `npm run db:reset` with no environment set would wipe it immediately. Today only documentation stands in the way ([README](../../../README.md), [DATABASE_RECOVERY.md](../../operations/DATABASE_RECOVERY.md)).
- `db:prepare` (also run by `predev`/`prestart`) calls the same seed only when no academic term exists. That path stays non-interactive. In an empty database there is nothing to lose. Access rows can exist there, though (for example after `auth:bootstrap` on a fresh database), and the cascade would erase them as well.

## Outcome and scope

**Outcome.** A development reset replaces the academic data and nothing else. Accounts, passwords, sign-in methods, roles, setup links and the access audit history stay. Every teacher and department link is restored to the same teacher (by short code) and department (by code). A reset never starts without naming its target, and it refuses the institutional database.

**In scope:** the reset routine used by `db:reset` and `db:prepare`, a confirmation gate on the `db:reset` command, a disposable-database test in `npm run test:safety`, and README/recovery runbook updates.

**Out of scope:** a consistent target choice between the CLI and the dev server (#24); any change to `db:prepare` beyond sharing the safe reset; restoring from backups; production deployment (DEP-01).

## Decisions for the owner

- **D-1 — keep access on reset.** *Recommended:* keep `portal_users`, `role_assignments`, `account_links` and every `auth_*` table, and re-link them after the reload. *Alternative:* keep the wipe but warn and confirm. That leaves every reset needing `auth:bootstrap` and new password links.
- **D-2 — the institutional database.** *Recommended:* `db:reset` refuses the default directory `.data/pglite-summer-2026` outright. A development reset needs `PGLITE_DATA_DIR` pointing elsewhere (or a `DATABASE_URL`), plus `--confirm <target>`. *Alternative:* allow it with `--confirm` alone.
- **D-3 — audit history.** *Recommended:* keep audit events about access (entity `portal_user`) and drop the academic ones. Their entity ids would point at different rows after the reload. Add one `database.reset` event recording what was preserved and re-linked. *Alternative:* keep every audit event.

## Behaviour (with the recommended decisions)

1. `npm run db:reset` with no `--confirm` prints the target (mode plus the resolved PGlite directory, or PostgreSQL host, port and database without credentials). It also prints what will be replaced and what will be kept. It changes nothing and exits non-zero.
2. `npm run db:reset -- --confirm <target>` runs only if `<target>` matches the printed target exactly. For PGlite that is the resolved directory path; for PostgreSQL it is `host:port/database`.
3. If the target resolves to the default institutional directory, the command refuses even with `--confirm` and says how to point at a disposable copy.
4. **Before deleting anything** (one transaction): record each portal user's teacher short code and each role's department code in a `database.reset` audit event. Clear `portal_users.teacher_id` and `role_assignments.department_id`, delete the academic rows, and restart their identities. Academic audit events are removed. Access audit events and the new event stay. Plain `DELETE` is used for `teachers` and `departments` because PostgreSQL refuses `TRUNCATE` on a table still referenced by the access tables.
5. The Summer 2026 source is loaded as today.
6. **After the reload** (one transaction): re-link users to teachers and roles to departments from the recorded event.
   - A teacher code that no longer exists leaves the user unlinked.
   - A department that no longer exists **ends** the role (`active_to = now`) rather than leaving it unscoped, because an unscoped role would widen access.
   - Each such case is listed in the command output and in the event, and the event is marked complete.
7. If the reload fails part-way, running the reset again finds the unfinished event and re-links from it, so the links are not lost.
8. `db:prepare` on an empty database uses the same routine without the confirmation gate. It has no academic data to lose, and any access rows are kept as above.

## Acceptance criteria

- **AC-01** On a disposable database with a password user linked to a teacher, a department-scoped role, a revoked role, an open setup link and a live session, a confirmed reset reloads the academic data. Each user keeps their account, password, sign-in methods, setup link and session. The user is linked to the teacher with the same short code, and the role is scoped to the department with the same code.
- **AC-02** Without `--confirm`, or with a different target, the command exits non-zero and leaves the database byte-for-byte unchanged (fingerprint).
- **AC-03** The default institutional directory is refused even with a matching `--confirm`. The check runs before any database connection opens.
- **AC-04** A user linked to a teacher code that is missing after the reload ends up unlinked. A role whose department is missing ends up ended, never unscoped. Both are reported.
- **AC-05** Access audit events survive. Academic audit events are removed. One complete `database.reset` event exists.
- **AC-06** A reset interrupted after the delete step and then run again restores the same links as AC-01.
- **AC-07** `db:prepare` on an empty disposable database still loads the dataset with no prompt, keeping any existing access rows.
- **AC-08** The README command table and the recovery runbook describe the new behaviour. The "erases portal users" warnings are replaced.

## Tasks

- [ ] T-01: Target description and confirmation gate in `seed.ts`, including refusal of the default directory, checked before the database module is imported. Covers AC-02 and AC-03.
- [ ] T-02: Access-preserving reset (record, unlink, delete, reload, re-link, resume) in the seed routine, shared by `db:prepare`. Covers AC-01 and AC-04 to AC-07.
- [ ] T-03: A `test:safety` group that runs the real commands as child processes on an owned disposable PGlite run, and on disposable PostgreSQL when `SAFE01_PG_BIN` is set. Covers AC-01 to AC-07.
- [ ] T-04: README, DATABASE_RECOVERY and SAFE-01 inventory F-07 status. Covers AC-08.
- [ ] T-05: `typecheck`, `lint`, `test:domain`, `build`, `test:safety` (with `SAFE01_PG_BIN`), diff review and a verification record.

No schema migration is needed. The institutional database is never opened by these checks; `db:reset` and `db:prepare` are run only against disposable targets owned by the safety harness.

## Approval record

- Owner authorization: Approved
- Date and evidence: 2 October 2026 (Asia/Dhaka), owner's chat reply "approve as recommended"
- Approved scope: this record as written, with D-1, D-2 and D-3 as recommended
- Implementation note (2 October 2026, within the approved outcome): departments are **kept and refreshed by code** instead of deleted and re-linked (behaviour steps 4 and 6, AC-04). A role without a department covers every department, so clearing role departments during the reset would have widened access had the reload failed. Roles therefore never lose their department, and a non-seed department that a role uses survives the reset. Teacher links are recorded and restored as specified.
