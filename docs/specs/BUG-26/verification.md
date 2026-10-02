# BUG-26: Verification

Issue: [#26](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/26). Records: [spec, plan and approval](spec.md).
Verified: 2 October 2026, Asia/Dhaka, on branch `codex/bug-26`, Windows 11, Node 22.11.0, PostgreSQL 17.11 tools (`SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`).
Status: **Verified. Awaiting owner acceptance.**

## What changed

- **[target.ts](../../../src/db/target.ts)** (new) works out the database target (`DATABASE_URL`, else `PGLITE_DATA_DIR`, else `.data/pglite-summer-2026`). It also loads `.env.local`/`.env` and checks a `--confirm` value and overlap with the default directory, resolving junctions and symlinks. It imports no database module. [index.ts](../../../src/db/index.ts) now opens the database through it, so the command and the connection always agree.
- **[reset-access.ts](../../../src/db/reset-access.ts)** (new):
  - **`clearAcademicData`** runs as one transaction. It records each user's teacher short code in a `database.reset` audit event (or reuses an unfinished one) and removes the academic audit events. It then truncates the academic tables **without `CASCADE`**, clears the teacher links, deletes the teachers and deletes only the departments no role uses.
  - **`restoreTeacherLinks`** runs as one transaction. It re-links users by short code and completes the event with the re-linked count and the users it could not re-link.
- **[seed-summer-2026.ts](../../../src/db/seed-summer-2026.ts)** uses both. Departments are upserted by code, and the output reports re-linked and unlinked accounts.
- **[seed.ts](../../../src/db/seed.ts)** (`db:reset`) prints the target and refuses the default directory. Without a matching `--confirm` it changes nothing. These checks run before any database module is loaded. `db:prepare` keeps calling the seed without the gate.
- **[reset.check.ts](../../../scripts/safety/reset.check.ts)** is the new group "BUG-26 reset keeps access", for PGlite and PostgreSQL, in `npm run test:safety`.
- **Docs:** the [README](../../../README.md) command table, the [recovery runbook](../../operations/DATABASE_RECOVERY.md) (rule 5), and F-07 in the [SAFE-01 inventory](../../operations/SAFE-01-mutation-inventory.md) are marked fixed. The spec records the department implementation note.

## Acceptance criteria

All checks ran the real `src/db/seed.ts` and `src/db/prepare.ts` commands as child processes on harness-owned disposable databases, on both PGlite and PostgreSQL 17.11.

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | After a confirmed reset, every row of `auth_user`, `auth_account` (password hash), `auth_session`, `auth_verification`, `account_links`, `role_assignments` and `portal_users` is identical apart from the teacher link. The linked user is re-linked to the teacher with the same short code, and identities restart at 1. |
| AC-02 | Pass | No `--confirm`, an empty one and a different target each exit 1 with "Nothing was changed". The full database fingerprint (schema, constraints, every row) is unchanged. |
| AC-03 | Pass | In an owned scratch working directory, the default directory is refused even with a matching `--confirm`. Five spellings were tried: unset, absolute, relative, nested inside it, and its parent. No `.data` directory was created, so nothing was opened. |
| AC-04 | Pass | A user linked to teacher `ZZQ`, which is absent after the reload, is left unlinked and named in the output and the event. With the implementation note, roles keep their departments (CSE and a custom `XSYN`), and no role is unscoped after the reset. |
| AC-05 | Pass | The `portal_user` audit event survives. Only the new import's academic event remains. Each reset adds one `database.reset` event, which ends `complete` with `relinked: 1` and the unlinked user. |
| AC-06 | Pass | `clearAcademicData` was run alone to simulate a reload that failed, then a confirmed reset was run. The user is re-linked to the same teacher, access rows are unchanged, and the unfinished event is completed, not duplicated. |
| AC-07 | Pass | `db:prepare` on an empty migrated database with a user and a CSE-scoped role loads one term with no prompt. The user and role are kept, and the department name is refreshed to the seed's. |
| AC-08 | Pass | README, runbook and inventory updated (see the diff). |

## Required checks

- `npm run typecheck`: pass.
- `npx eslint src scripts`: pass, no problems.
- `npm run lint` (whole folder): fails with 34 errors and 8 warnings, **all** inside `.claude/worktrees/brave-driscoll-459392/.next/`. That is the build output of a leftover agent worktree, which is excluded from Git but not ignored by ESLint. None of the problems are in project files, and this change does not cause them. Removing that worktree is a separate decision for the owner.
- `npm run test:domain`: pass (all nine verifiers).
- `npm run build`: pass.
- `npm run test:safety` with `SAFE01_PG_BIN`: pass, exit 0. All 12 groups passed: T-01 to T-04, T-06, BUG-29 (PGlite and PostgreSQL), AUTH-02 (both), BUG-48, and BUG-26 (both). The default PGlite directory's metadata is unchanged; it was never opened.

## Notes

- The PostgreSQL group's stale-cluster sweep logged that it skipped run `1790856162821-t06-postgres-cluster-7dad75`. The owner PID recorded in it (24120) belongs to a live process again, most likely a reused PID. [BUG-48's record](../BUG-48/spec.md) shows that cluster was stopped on 2 October. The sweep correctly refuses to touch a run whose recorded owner appears alive.
- The institutional database was never opened. The safety runner reports the default directory's metadata as unchanged.
- Not covered: `db:reset` against a hosted PostgreSQL database. It is gated by `--confirm host:port/database` like any other target; hosted environments belong to DEP-01 (#19).
