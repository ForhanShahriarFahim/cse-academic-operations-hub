# BUG-29 — Implementation plan

Issue: [#29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29)
Specification: [spec.md](spec.md)
Verification: [verification.md](verification.md)
Status: Approved 1 October 2026 (see [approval record](#approval-record)); in progress (T-01–T-06 done)
Branch / base: `codex/bug-29` from `d68b2b7` (main after TCH-02)
Updated: 1 October 2026, Asia/Dhaka

## Inspection and proposed approach

The baseline is in the [spec](spec.md#problem-and-inspected-baseline). These additional facts shape the plan:

- **Drizzle parsing.** `PgTimestamp` with `withTimezone: true` reads text with `new Date(value)`. V8 parses PostgreSQL's output (`2026-10-01 13:29:11.355123+06`, `…+05:30`, `…-05`) correctly; this was checked on 1 October 2026. Writes stay `toISOString()`, which carries `Z`, so application writes are exact under any session zone.
- **Migrations are hand-written.** `drizzle/meta` has snapshots only up to 0003, and 0004–0006 were hand-written with journal entries. 0007 follows the same pattern. `migrateDatabase()` (`src/db/migrate.ts`) applies pending migrations, then the RUT-04 grid backfill. On the local database, 0006, 0007 and the backfill therefore run in one `db:migrate`, and the backfilled term-grid rows are stamped after the columns are already `timestamptz`.
- **A plain cast does the D-2 conversion for default-stamped values.** `ALTER COLUMN … TYPE timestamptz` with no `USING` reads the old value in the session's `TimeZone`, which is the zone that stamped it. Application-written columns use `USING col AT TIME ZONE 'UTC'`.
- **Better Auth writes its own times.** `better-auth` sets `createdAt`/`updatedAt`/`expiresAt` from `new Date()` (`dist/db/internal-adapter.mjs`). The local `auth_verification` row confirms this: it is UTC, 18 minutes after a default-stamped Dhaka-time `portal_users` row.
- **Test harness.** SAFE-01 already provides owned disposable PGlite runs (`scripts/safety/pglite.ts`), a PostgreSQL 17 cluster started with `timezone=UTC` (`pg-cluster.ts`), child runs of `auth:bootstrap` (`app-env.ts`), cold backup/restore (`pglite-backup.ts`) and a fingerprint (`fingerprint.ts`).
- **PGlite's zone is fixed when its data directory is created** (checked during T-04). It is taken from the creating process's `TZ` and stored in `pgdata/postgresql.conf` (`source = configuration file`). Neither `TZ` nor `ALTER DATABASE … SET timezone` changes it later. The local database reports `Etc/GMT-6` because it was created on this machine. The checks pin a disposable run's zone by rewriting that line while no writer is open.
- **Displays.** Only `src/app/(portal)/publications/page.tsx:71` and `src/components/routine-document.tsx:72` format an instant without a zone.

### Column classification (D-2)

| Write path | Columns | Conversion |
|---|---|---|
| Database default only (database's zone) | `portal_users.created_at`; `role_assignments.active_from`, `granted_at`; `routine_source_reconciliations.created_at`; `meetings.created_at`; `course_enrollments.created_at`; `attendance_sessions.created_at`; `extra_load_classes.created_at`; `extra_load_manual_summaries.created_at`; `audit_events.at` | plain cast |
| Application only (UTC) | `portal_users.last_login_at`; `role_assignments.active_to`; all 12 `auth_user`/`auth_session`/`auth_account`/`auth_verification` columns; `external_commitments.last_verified_at`; `schedule_versions.published_at` | `AT TIME ZONE 'UTC'` |
| Mixed, with a sibling `created_at` | `portal_users.updated_at` | default zone when equal to `created_at`, otherwise UTC; converted **before** `created_at` |
| Mixed, treated as default-stamped | `academic_policies.updated_at`; `students.updated_at`; `attendance_records.updated_at`; `period_patterns.created_at`/`updated_at`; `day_plans.created_at`/`updated_at` | plain cast |

That is 34 columns. T-01 re-checks every write path with a search before the SQL is written. A column whose path differs from this table is reported back rather than silently reclassified.

Re-check on 1 October 2026 (T-01): every production write path matches the table. One path differs, and only in disposable review copies: `scripts/ux-review.ts` writes `auth_session.expires_at` and `role_assignments.active_from` with SQL `now()`. Such a copy that is upgraded rather than rebuilt may keep a session expiry up to 6 hours off. Rebuilding with `--fresh` avoids it, so the columns keep their production class.

**Guard.** After converting, the migration raises an error, and the migration's transaction rolls back, if:

- the session `TimeZone` is empty, or
- any default-stamped value now lies more than 5 minutes in the future.

The second condition is how a wrong source zone shows up, but only for values stamped within the zone gap of migration time. The rehearsal report (T-05) is the main evidence that the zone was right.

## Approval record

- Owner authorization: Approved.
- Date and evidence: 1 October 2026, in the Claude Code session. After reviewing the proposed spec (commit `ca9e788`), the owner replied "Approved with recommended D-1–D-3, write the plan".
- Approved scope: [spec.md](spec.md) as committed in `ca9e788`, with the recommended decisions:
  - D-1: all 34 instant columns become `timestamp with time zone`.
  - D-2: existing values are converted by write path. Default-stamped values are read in the migrating session's zone, application-written values as UTC, and mixed columns follow the stated rule. The migration fails rather than guessing.
  - D-3: the two zone-less displays name `Asia/Dhaka` in this fix.
- The approved spec includes the rehearsal, backup and restore on a disposable copy of the local database (AC-04, AC-05, AC-07). This is the owner decision that the [recovery runbook](../../operations/DATABASE_RECOVERY.md) requires before the tooling touches a copy of institutional data. That copy holds no student rows today, and the reports record only counts, hashes and per-column time ranges.
- Migrating the institutional database itself (T-08) needs a separate go-ahead from the owner.
- Material amendments: none

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [x] T-01 — **Schema and migration.**
  - Re-verify the column classification. Add `{ withTimezone: true }` to all 34 columns in `src/db/schema.ts`.
  - Write `drizzle/0007_instant-timestamps.sql` and its journal entry: the guard, the mixed columns first, then the default-stamped and application-written groups, then the future-value check.
  - Covers AC-03 and AC-04 (conversion); no dependencies.
- [x] T-02 — **Access query seam.** Move the assignment query in `getOptionalActor()` into an exported `selectActiveAssignments(db, userId, now)` in `src/lib/auth/`, with no behavior change, so the regression check runs the exact production predicate. Covers AC-01.
- [x] T-03 — **Displays.** Pass `timeZone: INSTITUTION.timeZone` in the two zone-less formatters. Search again for other zone-less instant formatting and fix any found. Covers AC-09.
- [x] T-04 — **Regression group.** Add `scripts/safety/time-zone.check.ts` as groups `BUG-29 time zones (PGlite)` and `(PostgreSQL)` in `npm run test:safety`. The PostgreSQL half stays PENDING without `SAFE01_PG_BIN`, as the existing T-06 group does. On disposable PGlite and PostgreSQL 17 it checks:
  - **Round trip:** under session zones `UTC`, `Etc/GMT-6` and `America/New_York`, a default-stamped and an application-written value for the same instant read back as equal `Date`s (AC-02).
  - **Access timing:** a role inserted with the production default, and one written by an `auth:bootstrap` child run, are returned at once by `selectActiveAssignments`. A role revoked with `active_to = now` is excluded at once (AC-01).
  - **Catalog:** after migrating, no `timestamp without time zone` column remains and `date` columns are unchanged (AC-03).
  - **Fresh migration:** from empty, on PGlite and on PostgreSQL databases set to `UTC`, `Etc/GMT-6` (Asia/Dhaka's fixed UTC+06) and `America/New_York` (`ALTER DATABASE … SET timezone`; the cluster's server zone stays UTC) (AC-06).
  - **Upgrade:** migrate to 0006 using a trimmed copy of the migrations folder, stamp rows of every class under `Etc/GMT-6`, apply 0007, and check that each value is its true instant. This covers the `updated_at = created_at` rule and the stale-edit token on `period_patterns`/`day_plans` (AC-04 and AC-08 at database level).
  - **Guard:** default-stamped values written under `Etc/GMT-6` and migrated under `UTC` make 0007 fail and roll back completely.
- [x] T-05 — **Rehearsal on a copy of the local database.**
  - Add `scripts/rehearse-time-zone-migration.ts`. It copies the stopped `.data/pglite-summer-2026` into an owned run under `.tmp/safe-01`, and refuses if the source is in use or the target is outside `.tmp`.
  - It takes a SAFE-01 cold backup, migrates the copy from 0005 through 0007 and the backfill, and writes a report.
  - The report holds the session zone, every column's class, row count, minimum and maximum before and after, and a fingerprint of all non-time columns before and after.
  - It also checks that the bootstrap administrator's role is effective and that a role granted now is effective at once.
  - Finally it restores the backup into a separate run, compares that fingerprint with the pre-migration one, and removes both runs.
  - Covers AC-04, AC-05 and AC-07; depends on T-01, T-02 and T-04.
- [x] T-06 — **Browser check.** Run `npm run ux:review -- --fresh --publishable` with the server under `TZ=UTC`. Confirm that `/publications` and the routine document show Asia/Dhaka wall time, and capture a screenshot. Also confirm that Days & periods still saves an unchanged pattern and rejects a stale edit (AC-08, AC-09). If Node on Windows ignores `TZ`, record that and use another way to force UTC rather than marking AC-09 passed.
- [ ] T-07 — **Final checks and records.**
  - Run `typecheck`, `lint`, `test:domain`, `build` and `test:safety` with `SAFE01_PG_BIN`.
  - Review the diff.
  - Write `verification.md` with results per AC and the T-05 report.
  - Update the README and recovery runbook where they describe time handling or rehearsal status, and the brief and roadmap pointers.
  - Covers AC-10.
- [ ] T-08 — **Migrate the institutional database (owner go-ahead).**
  - Stop every writer and take the cold backup and hash manifest per the runbook.
  - Run `npm run db:migrate`, which applies 0006, 0007 and the backfill.
  - Expect the first open to run PGlite's crash recovery and remove the `postmaster.pid` left on 25 September (seen in T-05). The backup is taken before that open, so it keeps the file.
  - Check `/api/health`, People & Access and `/routine/periods`, and record the result.
  - Gated on T-07 and on the owner's explicit go-ahead; the backup's location stays outside Git.

## Verification and delivery

- **Focused checks while building:** `npm run test:safety -- BUG-29`, `typecheck` and `test:domain`.
- **Required final checks:** the T-07 list. The PostgreSQL group counts as passed only when it has actually run with `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`.
- **Never open the institutional directory except to copy it.** No check opens `.data/pglite-summer-2026` itself before T-08. T-05 copies it only while no writer is running, and `test:safety` still confirms that the directory's metadata is unchanged.
- **Review criteria:**
  - every one of the 34 columns is classified and converted once;
  - no `now()` comparison or zone-less formatting remains;
  - the migration is forward-only and transactional;
  - backups and reports with private data stay outside Git.
- **Delivery:**
  - Commit T-01–T-04 as one checkpoint and push it after the focused checks pass. Commit T-05–T-07 with the evidence.
  - Open a PR without closing keywords. Merge and close #29 after the owner's acceptance; T-08 may run before or after the merge, as the owner prefers.

## Current checkpoint / handoff

- Approved scope: [spec.md](spec.md) at `ca9e788` with D-1–D-3 as recommended.
- Commits and uncommitted changes: spec `ca9e788`, approved plan `2a3cca5` (pushed). T-01–T-04 pushed as checkpoint `df11ed2`; T-05 and T-06 (rehearsal, `verification.md`, screenshots) committed and pushed after it.
- Completed tasks: T-01–T-06.
- Next action: T-07 (final checks, diff review, README/runbook/brief/roadmap updates). Port 3100 is free, and no review server is running.
- Verification: [verification.md](verification.md) holds results per AC, including the T-05 report. The notes below record each task.
- Task notes: T-01 smoke test, run in memory and not committed (T-04 adds the permanent check). Migrated to 0006, stamped rows in `Etc/GMT-6`, then applied 0007. Default-stamped, mixed (`portal_users.updated_at` both ways) and application-written values all read back at the true instant, and all 34 columns became `timestamptz`. The same data migrated under `UTC` failed with the guard's error, and all 34 columns stayed `timestamp`. `typecheck` and `eslint` pass. T-02 moved the query unchanged to `src/lib/auth/assignments.ts`, which has no request or provider imports. An in-memory smoke test migrated to 0007 under `Etc/GMT-6`, then granted a role with the column default and revoked another with `active_to = new Date()`. `selectActiveAssignments` returned only the granted role, immediately (`active_from` 14 ms before now). `typecheck` and `eslint` pass.

T-03 named `Asia/Dhaka` on the two zone-less formatters. The wider search found one more zone-dependent display: the dashboard's "today's classes" took the weekday from the server clock (`new Date().getDay()`). On a UTC server that shows the previous day's classes between 00:00 and 06:00 Dhaka time. It now uses `todayIndex()` (`src/lib/teacher-routine-data.ts`), and the unused `jsDayToAcademic` was removed. Every other instant formatter already names a zone, and `fmtDate` formats date-only strings.

Under `TZ=UTC` (Node on Windows honours it), 02:30 on Saturday 3 October in Dhaka formerly displayed as "2 Oct 2026, 20:30" with Friday's classes. It now displays "3 Oct 2026, 02:30" with Saturday's. `typecheck`, `eslint` and `test:domain` pass.

**Never start the dev server against the institutional database.** It migrates its target, so before T-08 the browser check (T-06) uses a disposable `ux:review` copy only.

T-04 added the two groups and gave the shared harness `setTimeZone` and `migrateFrom` (`scripts/safety/database.ts`, `pglite.ts`), and `factoryFor` is now exported from `postgres.check.ts`. Both groups pass: PGlite in about 1 min 45 s, and PostgreSQL 17.11 in about 38 s with `SAFE01_PG_BIN`. The full `npm run test:safety` with `SAFE01_PG_BIN` then passed every group in 11 min 23 s: SAFE-01 T-01–T-04 and T-06, and both BUG-29 groups. The default PGlite directory was never opened.

The check was also shown to fail on the pre-fix code. With the `d68b2b7` schema and migration list it first fails the catalog assertion. With that assertion disabled it fails on the time value itself: under `Etc/GMT-6` a default-stamped audit time read back at 16:06 UTC, against a true time of 10:06.
- Blockers/capabilities: T-08 needs the owner's go-ahead. The PostgreSQL checks need `SAFE01_PG_BIN`; the tools are installed outside the repo.
