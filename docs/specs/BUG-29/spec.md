# BUG-29 — Database-stamped times are stored and read as real instants

Issue: [#29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29) (UX-01 finding B1)
Status: Proposed — awaiting owner decisions D-1–D-3 and approval
Updated: 1 October 2026, Asia/Dhaka

## Problem and inspected baseline

Inspected on 1 October 2026 at `d68b2b7` (main after TCH-02). The data inventory used a disposable copy of `.data/pglite-summer-2026` in `.tmp/`, deleted afterwards.

- **Column type.** `src/db/schema.ts` declares 34 instant columns with `timestamp(...)`. All are `timestamp without time zone`, and 26 default to `now()`. The local database is at migration 0005; 0006 (term time grids) adds the other four (`period_patterns`, `day_plans`) when it is next migrated. Date-only columns (`date`, such as term dates and class dates) and minute-of-day fields are not affected.
- **Session zone.** PGlite takes its session `TimeZone` from the host. On the owner's machine it is `Etc/GMT-6` (UTC+06). node-postgres does not set a zone, so a hosted server uses its own default.
- **Two write paths disagree.** An in-memory PGlite probe confirmed both:
  - A database default (`now()`) stores **Dhaka wall time**, for example `13:29`.
  - An application write (`new Date()`) is sent by Drizzle as an ISO string ending in `Z`. PostgreSQL drops the zone for this type, so it stores **UTC wall time**, `07:29`, for the same moment.
  - Drizzle reads every value back as UTC (`value + "+0000"`). Default-stamped times therefore come back **6 hours in the future**; application-written times are correct.
- **Role grants take effect 6 hours late.** `role_assignments.active_from` comes from the default, in People & Access (`src/lib/auth/admin-actions.ts`) and `npm run auth:bootstrap` (`scripts/bootstrap-admin.ts:30`). `getOptionalActor()` (`src/lib/auth/index.ts:36-41`) requires `active_from <= now`, so the new user is sent to `/forbidden` for 6 hours. Revocation (`active_to = new Date()`) is correct, because it is application-written.
- **Other effects.** Audit times (`audit_events.at`), creation times, People & Access ordering and grant times read 6 hours ahead. Some columns mix both paths in one column: `updated_at` is defaulted on insert but set by the application on edit. The Days & periods editor uses `updated_at` as its stale-edit token (`src/lib/time-grid-actions.ts:120,176,237,290`). This works today only because it compares a value with itself.
- **Display zone.** Two screens format instants without naming a zone: the publication time on `/publications` (`src/app/(portal)/publications/page.tsx:71`) and "Generated …" in the routine document (`src/components/routine-document.tsx:72`). They show Dhaka time only when the server runs in Dhaka. A hosted server on UTC would show UTC. Print headers, the official package and teacher sheets already pass `Asia/Dhaka`.
- **Existing data in the local database.** 217 stamped values in 12 columns: one admin user and role grant, one audit event, 183 meeting creation times, 13 source reconciliations, 12 external-commitment verification times, one academic policy, and one auth verification row. Each value can be traced to its write path; none is ambiguous today. No hosted database holds data yet (AUTH-01/DEP-01 pending).

Reproduction (disposable copy only): copy the data folder into `.tmp/`, grant a role, then run `select now()::text, active_from::text from role_assignments order by id desc limit 1`. `now()` ends in `+06` and `active_from` holds Dhaka wall time.

## Outcome and scope

- **Outcome:** every stored time is one unambiguous instant. A role granted now works on the next request, and audit, creation, publication and update times show the correct Dhaka time, whatever the server or session time zone.
- **Included:**
  - The storage rule (D-1) applied to all 34 instant columns, in the schema and in a forward-only migration.
  - Conversion of existing values according to their write path (D-2), with a before/after report.
  - Explicit `Asia/Dhaka` formatting for the two zone-less displays (D-3).
  - A regression check for both adapters (PGlite and PostgreSQL 17) under several session zones.
  - The recovery rehearsal on a populated copy; updates to the README and brief where they describe time handling.
- **Excluded:**
  - Date-only columns and minute-of-day fields.
  - Hosted PostgreSQL deployment and OAuth (AUTH-01 #1, DEP-01 #19).
  - People & Access confirmations (#31) and other auth changes.
  - New audit or history screens.
- **Dependencies:** none blocking. AUTH-01 and AUTH-02 (#36) should follow this fix. The migration runs after 0006 on the local database, so it must convert the term-grid tables as well.

## Required behavior

- **Storage.** Every instant column holds an absolute instant. A database default and an application write for the same moment are read back as equal JavaScript `Date` values. This holds under session zones UTC, `Etc/GMT-6`/`Asia/Dhaka` and one zone west of UTC, on both adapters.
- **Access timing.** A role granted through People & Access or `auth:bootstrap` is effective on the next request. A revoked role stops on the next request, as it does today.
- **Existing data.** The migration changes no value's instant except to correct the 6-hour error. Row counts and all non-time data stay identical. Values written by the application keep their instant. Values stamped by a database default are read in the zone the database used when it stamped them (D-2). The migration fails rather than guesses if it cannot establish that zone.
- **Stale-edit tokens.** The Days & periods editor still detects a concurrent edit and still accepts an unchanged one. The token round-trips exactly at millisecond precision.
- **Display.** Every instant shown on screen, in print or in an export is formatted in `Asia/Dhaka`, independent of the server's zone. Date-only values keep their current UTC-safe formatting.
- **History.** Published snapshots are immutable and keep their stored JSON. Their `publishedAt` column is corrected like any other instant; the snapshot payload is not rewritten.
- **Recovery.** Before migrating the institutional database the operator takes a backup with the SAFE-01 tooling ([runbook](../../operations/DATABASE_RECOVERY.md)). The migration and a restore are rehearsed on a populated disposable copy first. The institutional database itself is migrated only with the owner's go-ahead.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | Given a database whose session zone is UTC+06, when a role is granted through the People & Access action or `auth:bootstrap`, then `getOptionalActor`'s assignment query returns it immediately, and a revoked role is excluded immediately. | Regression script on disposable PGlite and on PostgreSQL 17 |
| AC-02 | Given session zones UTC, `Etc/GMT-6` and `America/New_York`, when one instant is stored once by a database default and once by an application write, then both read back as the same `Date` (to the millisecond) on PGlite and on PostgreSQL 17. | Regression script, both adapters |
| AC-03 | After all migrations, no column in the `public` schema has type `timestamp without time zone`. Date columns keep type `date`. | Catalog query on a fresh database and on the migrated copy |
| AC-04 | Given a populated copy of the local database migrated from 0005, every pre-existing stamped value represents the corrected instant per D-2. Row counts and a checksum of non-time columns are unchanged. The before/after report lists every converted column. | Migration rehearsal on a disposable copy; report recorded in verification |
| AC-05 | Given that copy, the existing bootstrap administrator's role is still effective, and a newly granted role is effective immediately. | Regression script on the migrated copy |
| AC-06 | A fresh database migrates cleanly from empty on PGlite and on PostgreSQL 17, under a UTC server zone and under a UTC+06 server zone. | `test:safety`-style disposable runs with `SAFE01_PG_BIN` |
| AC-07 | A backup taken before the migration restores to the pre-migration state on a disposable copy. | SAFE-01 recovery tooling, disposable copy |
| AC-08 | Days & periods: an unchanged pattern or day plan saves successfully, and an edit made from a stale copy is rejected as "changed". | Existing time-grid checks plus a stale-edit case on the migrated copy |
| AC-09 | With the server process running under `TZ=UTC`, the publication time on `/publications` and "Generated …" on the routine document show Asia/Dhaka wall time. | Browser check on a disposable review copy |
| AC-10 | `npm run typecheck`, `lint`, `test:domain`, `build` and `test:safety` (with the PostgreSQL group) pass. | Command results recorded in verification |

## Decisions and sources

Recommended answers are marked; the owner chooses.

- **D-1 Storage rule.**
  - **Recommended:** convert all 34 columns to `timestamp with time zone` (`timestamp(..., { withTimezone: true })`). Defaults and application writes then agree under any session zone, including manual tools and future hosted servers.
  - Alternative: keep the type and force every connection to `TimeZone=UTC`. This is smaller, but any connection that misses the setting (psql, Drizzle Studio, a restore tool, a new adapter) brings the bug back silently.
- **D-2 Converting existing values.** Classify each column by its write path, as found in the code:
  - **Database default only:** read the value in the zone the database used when it stamped it. Recommended: take that zone from the migrating session's `TimeZone` (`Etc/GMT-6` locally, the server default when hosted) and record it in the report.
  - **Application only:** read the value as UTC.
  - **Mixed columns** (`updated_at` defaulted on insert, set on edit): a value equal to the row's `created_at` came from the default. Where no `created_at` exists, or in the term-grid tables (the backfill uses defaults, the editor writes both fields), treat the value as default-stamped. Any error is at most 6 hours, on "last updated" metadata that gates nothing except the stale-edit token, which stays self-consistent. Today's local data has no such ambiguous rows.
  - Alternative: hand-classify each row. The data volume allows it today, but it does not carry to other copies.
- **D-3 Display.** Recommended: name `Asia/Dhaka` (`INSTITUTION.timeZone`) on the two zone-less displays as part of this fix. Alternative: defer them to DEP-01.
- **Not needed from the owner:** any new institutional fact. The institution's zone is already recorded as `Asia/Dhaka` (`src/lib/constants.ts:15`).
- **Sources:** [project brief](../../PROJECT_BRIEF.md); [workflow data rules](../../WORKFLOW.md#verification-and-data-rules); [SAFE-01 recovery runbook](../../operations/DATABASE_RECOVERY.md); related #1 (AUTH-01), #19 (DEP-01), #2 (SAFE-01), #36 (AUTH-02).
