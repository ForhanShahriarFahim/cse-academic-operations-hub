# BUG-29 — Implementation plan

Issue: [#29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29)
Specification: [spec.md](spec.md)
Verification: [verification.md](verification.md) (created during T-07)
Status: Approved 1 October 2026 (see [approval record](#approval-record)); not started
Branch / base: `codex/bug-29` from `d68b2b7` (main after TCH-02)
Updated: 1 October 2026, Asia/Dhaka

## Inspection and proposed approach

The baseline is in the [spec](spec.md#problem-and-inspected-baseline). These additional facts shape the plan:

- **Drizzle parsing.** `PgTimestamp` with `withTimezone: true` reads text with `new Date(value)`. V8 parses PostgreSQL's output (`2026-10-01 13:29:11.355123+06`, `…+05:30`, `…-05`) correctly; this was checked on 1 October 2026. Writes stay `toISOString()`, which carries `Z`, so application writes are exact under any session zone.
- **Migrations are hand-written.** `drizzle/meta` has snapshots only up to 0003, and 0004–0006 were hand-written with journal entries. 0007 follows the same pattern. `migrateDatabase()` (`src/db/migrate.ts`) applies pending migrations, then the RUT-04 grid backfill. On the local database, 0006, 0007 and the backfill therefore run in one `db:migrate`, and the backfilled term-grid rows are stamped after the columns are already `timestamptz`.
- **A plain cast does the D-2 conversion for default-stamped values.** `ALTER COLUMN … TYPE timestamptz` with no `USING` reads the old value in the session's `TimeZone`, which is the zone that stamped it. Application-written columns use `USING col AT TIME ZONE 'UTC'`.
- **Better Auth writes its own times.** `better-auth` sets `createdAt`/`updatedAt`/`expiresAt` from `new Date()` (`dist/db/internal-adapter.mjs`). The local `auth_verification` row confirms this: it is UTC, 18 minutes after a default-stamped Dhaka-time `portal_users` row.
- **Test harness.** SAFE-01 already provides owned disposable PGlite runs (`scripts/safety/pglite.ts`), a PostgreSQL 17 cluster started with `timezone=UTC` (`pg-cluster.ts`), child runs of `auth:bootstrap` (`app-env.ts`), cold backup/restore (`pglite-backup.ts`) and a fingerprint (`fingerprint.ts`).
- **Displays.** Only `src/app/(portal)/publications/page.tsx:71` and `src/components/routine-document.tsx:72` format an instant without a zone.

### Column classification (D-2)

| Write path | Columns | Conversion |
|---|---|---|
| Database default only (database's zone) | `portal_users.created_at`; `role_assignments.active_from`, `granted_at`; `routine_source_reconciliations.created_at`; `meetings.created_at`; `course_enrollments.created_at`; `attendance_sessions.created_at`; `extra_load_classes.created_at`; `extra_load_manual_summaries.created_at`; `audit_events.at` | plain cast |
| Application only (UTC) | `portal_users.last_login_at`; `role_assignments.active_to`; all 12 `auth_user`/`auth_session`/`auth_account`/`auth_verification` columns; `external_commitments.last_verified_at`; `schedule_versions.published_at` | `AT TIME ZONE 'UTC'` |
| Mixed, with a sibling `created_at` | `portal_users.updated_at` | default zone when equal to `created_at`, otherwise UTC; converted **before** `created_at` |
| Mixed, treated as default-stamped | `academic_policies.updated_at`; `students.updated_at`; `attendance_records.updated_at`; `period_patterns.created_at`/`updated_at`; `day_plans.created_at`/`updated_at` | plain cast |

That is 34 columns. T-01 re-checks every write path with a search before the SQL is written. A column whose path differs from this table is reported back rather than silently reclassified.

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

- [ ] T-01 — **Schema and migration.**
  - Re-verify the column classification. Add `{ withTimezone: true }` to all 34 columns in `src/db/schema.ts`.
  - Write `drizzle/0007_instant-timestamps.sql` and its journal entry: the guard, the mixed columns first, then the default-stamped and application-written groups, then the future-value check.
  - Covers AC-03 and AC-04 (conversion); no dependencies.
- [ ] T-02 — **Access query seam.** Move the assignment query in `getOptionalActor()` into an exported `selectActiveAssignments(db, userId, now)` in `src/lib/auth/`, with no behavior change, so the regression check runs the exact production predicate. Covers AC-01.
- [ ] T-03 — **Displays.** Pass `timeZone: INSTITUTION.timeZone` in the two zone-less formatters. Search again for other zone-less instant formatting and fix any found. Covers AC-09.
- [ ] T-04 — **Regression group.** Add `scripts/safety/time-zone.check.ts` as group `BUG-29 time zones` in `npm run test:safety`. The PostgreSQL half stays PENDING without `SAFE01_PG_BIN`, as the existing T-06 group does. On disposable PGlite and PostgreSQL 17 it checks:
  - **Round trip:** under session zones `UTC`, `Etc/GMT-6` and `America/New_York`, a default-stamped and an application-written value for the same instant read back as equal `Date`s (AC-02).
  - **Access timing:** a role inserted with the production default, and one written by an `auth:bootstrap` child run, are returned at once by `selectActiveAssignments`. A role revoked with `active_to = now` is excluded at once (AC-01).
  - **Catalog:** after migrating, no `timestamp without time zone` column remains and `date` columns are unchanged (AC-03).
  - **Fresh migration:** from empty, on PGlite and on PostgreSQL databases set to `UTC` and to `Asia/Dhaka` (`ALTER DATABASE … SET timezone`) (AC-06).
  - **Upgrade:** migrate to 0006 using a trimmed copy of the migrations folder, stamp rows of every class under `Etc/GMT-6`, apply 0007, and check that each value is its true instant. This covers the `updated_at = created_at` rule and the stale-edit token on `period_patterns`/`day_plans` (AC-04 and AC-08 at database level).
  - **Guard:** default-stamped values written under `Etc/GMT-6` and migrated under `UTC` make 0007 fail and roll back completely.
- [ ] T-05 — **Rehearsal on a copy of the local database.**
  - Add `scripts/rehearse-time-zone-migration.ts`. It copies the stopped `.data/pglite-summer-2026` into an owned run under `.tmp/safe-01`, and refuses if the source is in use or the target is outside `.tmp`.
  - It takes a SAFE-01 cold backup, migrates the copy from 0005 through 0007 and the backfill, and writes a report.
  - The report holds the session zone, every column's class, row count, minimum and maximum before and after, and a fingerprint of all non-time columns before and after.
  - It also checks that the bootstrap administrator's role is effective and that a role granted now is effective at once.
  - Finally it restores the backup into a separate run, compares that fingerprint with the pre-migration one, and removes both runs.
  - Covers AC-04, AC-05 and AC-07; depends on T-01, T-02 and T-04.
- [ ] T-06 — **Browser check.** Run `npm run ux:review -- --fresh --publishable` with the server under `TZ=UTC`. Confirm that `/publications` and the routine document show Asia/Dhaka wall time, and capture a screenshot. Also confirm that Days & periods still saves an unchanged pattern and rejects a stale edit (AC-08, AC-09). If Node on Windows ignores `TZ`, record that and use another way to force UTC rather than marking AC-09 passed.
- [ ] T-07 — **Final checks and records.**
  - Run `typecheck`, `lint`, `test:domain`, `build` and `test:safety` with `SAFE01_PG_BIN`.
  - Review the diff.
  - Write `verification.md` with results per AC and the T-05 report.
  - Update the README and recovery runbook where they describe time handling or rehearsal status, and the brief and roadmap pointers.
  - Covers AC-10.
- [ ] T-08 — **Migrate the institutional database (owner go-ahead).**
  - Stop every writer and take the cold backup and hash manifest per the runbook.
  - Run `npm run db:migrate`, which applies 0006, 0007 and the backfill.
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
- Commits and uncommitted changes: the spec is at `ca9e788` and this plan is committed after it; no code changes.
- Completed tasks: none.
- Next action: T-01.
- Verification: none yet.
- Blockers/capabilities: T-08 needs the owner's go-ahead. The PostgreSQL checks need `SAFE01_PG_BIN`; the tools are installed outside the repo.
