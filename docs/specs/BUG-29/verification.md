# BUG-29 — Verification

Issue: [#29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md)
Status: In progress. T-04–T-06 evidence is recorded; T-07 (final checks) is pending, and T-08 awaits the owner's go-ahead.
Updated: 1 October 2026, Asia/Dhaka

## Environment

- Branch `codex/bug-29`. Approved plan `2a3cca5`; T-01–T-04 checkpoint `df11ed2` (pushed). The T-05 rehearsal script is added in the T-05 commit.
- **Databases:**
  - Disposable PGlite runs and a disposable PostgreSQL 17.11 cluster under `.tmp/safe-01`. The client tools come from `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`.
  - The institutional `.data/pglite-summer-2026` was only copied, for T-05; it was never opened. Its newest file is still dated 25 September 2026, 20:22.
- **Browser (T-06):** the Claude desktop browser pane, against `npm run ux:review` on port 3100. The review data was built as the worst case for this bug:
  - The review database was rebuilt with `npm run ux:review -- --fresh --publishable --prepare-only` under the normal zone. Its `postgresql.conf` therefore holds `timezone = 'Etc/GMT-6'`, and 0007 was applied when it was created.
  - The server was then started with `TZ=UTC npm run ux:review`, so a UTC+06 database sits behind a UTC server process.
  - The leftover review server from 13:08 was stopped first, at the owner's request, and this one was stopped afterwards.

## Acceptance results

| ID | Result | Evidence |
|---|---|---|
| AC-01 | **Pass** | `test:safety`, BUG-29 groups, PGlite and PostgreSQL: in UTC, `Etc/GMT-6` and `America/New_York`, a role granted with the column default is returned at once by `selectActiveAssignments` (the production predicate), and a role revoked with `active_to = now` is excluded. An `auth:bootstrap` child in `Etc/GMT-6` grants a role that is in force at once, with a true-time audit event. The People & Access action writes the same column default as the in-process insert.<br>**Browser (T-06):**<ul><li>Signed in as the teacher-role review account, `/access` redirected to `/forbidden`.</li><li>The administrator then added "system administrator" to that account in People & Access (10:33:22 UTC).</li><li>Six seconds later the teacher's session opened People & Access, with the header showing "Teacher, System administrator" ([screenshot](screenshots/access-role-in-force-at-once.jpg)).</li></ul> |
| AC-02 | **Pass** | Same groups: in all three zones, on both adapters, a default-stamped audit time falls within the harness's clock window. An application write of the same instant reads back equal to the millisecond. |
| AC-03 | **Pass** | Same groups: after migrating, the catalog's instant and date columns match the schema exactly (34 `timestamptz`, date columns unchanged, no `timestamp without time zone`). T-05 copy: 34 columns, all `timestamptz`. |
| AC-04 | **Pass** | T-05 rehearsal on a copy of the local database, migrated from 0005 to 0007 plus the grid backfill (report below). Every one of the 217 stored values moved by exactly its class's correction. Row counts and every non-time column are unchanged in all 36 pre-existing tables. The test groups cover the same rule for every write-path class, including the mixed `updated_at` rule. |
| AC-05 | **Pass** | T-05: the bootstrap administrator's role is in force on the migrated copy. A role granted now is in force at once (start 15 ms from now). |
| AC-06 | **Pass** | Same groups: fresh migration from empty on PGlite, and on PostgreSQL databases set to UTC, `Etc/GMT-6` and `America/New_York` (the cluster's server zone is UTC). |
| AC-07 | **Pass** | T-05: a SAFE-01 cold backup of the pre-migration copy restored into a separate run with an identical fingerprint (schema, sequences, every table's rows): 6 migrations and 30 legacy time columns. The migrated copy's fingerprint differs from it. |
| AC-08 | **Pass** | Same groups: a token round-trips exactly after the upgrade and changes on save. The existing SAFE-01 T-03 check ("a stale edit refused with no change") passes on PGlite and PostgreSQL with the new column types. **Browser (T-06):** two tabs opened Days & periods.<ul><li>The first saved Diploma Friday unchanged: "Periods saved: Diploma Friday."</li><li>The second, opened before that save, was refused with "Someone else changed these periods since you opened them. Reload the page to see the latest version." ([screenshot](screenshots/days-periods-stale-edit.jpg)).</li></ul> |
| AC-09 | **Pass** | Browser, server under `TZ=UTC` (T-06). The machine clock read 10:29 UTC, which is 16:29 in Dhaka.<ul><li>`/publications` shows v2 published "1 Oct 2026, 16:25" ([screenshot](screenshots/publications-utc-server.jpg)). The version was published at about 10:25 UTC, which the old code would have shown as 10:25.</li><li>The routine page's document reads "Generated 1 Oct 2026, 16:29." That line is in the print-only document, so it was read from the page text.</li><li>No console errors in either tab, and no errors or hydration warnings in the server log.</li></ul> |
| AC-10 | Partial | `test:safety` with PostgreSQL passed all groups (11 min 23 s) on `df11ed2`. `typecheck`, `lint` and `test:domain` passed per task; the final run and `build` are T-07. |

## T-05 rehearsal report

Run on 1 October 2026 with `npx tsx scripts/rehearse-time-zone-migration.ts --writers-stopped`, in 46 s.

**Writers stopped.** Before the run, the only processes for this project were a `ux-review` server, which refuses `.data` and serves its own copy under `.tmp/ux-review`, and no PostgreSQL. No institutional file had changed since 25 September, 20:22. The script also confirmed that no source file changed while it was copied.

The report holds names, counts, time ranges and hashes only.

- **Copy.** 1,204 files were copied into an owned run.
  - **Old `postmaster.pid`.** The source holds a `postmaster.pid` from 25 September 20:22: the last session did not shut down cleanly. Opening the copy ran PGlite's normal recovery and removed it, so the cold backup has 1,203 files. T-08 will see the same recovery on its first open.
- **Before:** session zone `Etc/GMT-6`; 6 migrations applied; 30 time columns, all `timestamp without time zone`; 217 stored values.
- **After:** 8 migrations applied (0006 and 0007); 34 time columns, all `timestamp with time zone`.
- **Conversion.** Default-stamped values were read in `Etc/GMT-6`, a correction of −6 h; application values were unchanged. Each row was checked against its expected instant.

  | Column | Values | Now (UTC) |
  |---|---|---|
  | `academic_policies.updated_at` | 1 default-stamped | 2026-09-23 11:17:48.349 |
  | `audit_events.at` | 1 default-stamped | 2026-09-23 11:17:50.925 |
  | `auth_verification.expires_at` | 1 application | 2026-09-25 14:32:18.358 |
  | `auth_verification.created_at` / `updated_at` | 1 application each | 2026-09-25 14:22:18.361 |
  | `external_commitments.last_verified_at` | 12 application | 2026-08-13 18:00:00 (00:00 on 14 August in Dhaka, as seeded) |
  | `meetings.created_at` | 183 default-stamped | 2026-09-23 11:17:48.599 … 11:17:50.757 |
  | `portal_users.created_at` / `updated_at` | 1 default-stamped each (`updated_at` equals `created_at`) | 2026-09-25 14:04:26.393 |
  | `role_assignments.active_from` / `granted_at` | 1 default-stamped each | 2026-09-25 14:04:26.533 |
  | `routine_source_reconciliations.created_at` | 13 default-stamped | 2026-09-23 11:17:48.408 |

  The other 18 time columns hold no values.
- **Data.** Row counts and every non-time column are unchanged in all 36 pre-existing tables. 0006's new tables hold the grid backfill: `day_plans` 6 rows, `period_patterns` 5 rows.
- **Access.** 1 existing role assignment is in force for 1 user, the bootstrap administrator. A role granted on the copy now is in force at once.
- **Restore.** The backup verified and restored into a separate run with an identical fingerprint.
- **Cleanup.** The copy, the restore and the backup were removed from `.tmp/safe-01`.

The administrator's invitation and role (`portal_users`, `role_assignments`) now read 14:04 UTC, which is 20:04 in Dhaka on 25 September. That matches the application-written `auth_verification` row 18 minutes later (14:22 UTC). Before the fix they read 20:04 UTC, six hours ahead.

## Checks

- **T-01 smoke test (in memory, not committed).** Upgrade from 0006 under `Etc/GMT-6`: every class landed on its true instant. Under UTC the guard fired and nothing changed.
- **T-04 regression groups.**
  - Both groups pass: PGlite in about 1 min 45 s, and PostgreSQL in about 38 s.
  - **Shown to fail on the pre-fix code** (`d68b2b7` schema and migration list). The catalog assertion fails first. With that assertion disabled, the test fails on the value itself: under `Etc/GMT-6` a default-stamped time read back at 16:06 UTC, against a true time of 10:06.
- **Full `npm run test:safety` with `SAFE01_PG_BIN` on `df11ed2`.** Passed: SAFE-01 T-01–T-04 and T-06, and both BUG-29 groups. The default PGlite directory was never opened.

## Review findings

| Finding | Correction / disposition | Reverification |
|---|---|---|
| The dashboard's "today's classes" used the server's weekday | Fixed in T-03 with `todayIndex()` | Under `TZ=UTC`, 02:30 on Saturday in Dhaka shows Saturday |
| `scripts/ux-review.ts` writes `auth_session.expires_at` and `role_assignments.active_from` with SQL `now()` (disposable review copies only) | Accepted. Columns keep their production class; rebuild review copies with `--fresh` | Not applicable |
| PGlite's zone is fixed in `postgresql.conf` when the directory is created | Recorded in the plan; the checks pin disposable runs through that file | BUG-29 groups pass |

## Delivery and acceptance

- Commits: `ca9e788`, `2a3cca5`, `14b665c`, `4f89852`, `e38d7fc`, `a11691a`, `df11ed2` and the T-05 commit.
- Remaining gates: T-07 final checks, the owner's acceptance, and the T-08 institutional migration with the owner's go-ahead.
- Owner acceptance: Pending.
- Merge / closure: Pending.
