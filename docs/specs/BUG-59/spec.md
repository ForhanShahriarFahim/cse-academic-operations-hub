# BUG-59: the BUG-29 time-zone safety check fails intermittently on PostgreSQL

Issue: [#59](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/59), "BUG-29 follow-up: time-zone safety check fails intermittently (role granted now not yet active)"
Status: **Approved 2 October 2026 with D-1 to D-3 as recommended** (see [approval record](#approval-record)). Implemented and verified locally ([verification](verification.md)); awaiting owner acceptance.
Branch / base: `claude/bug-59` from `7d2f1ac` (main)
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)).

## Problem and inspected baseline

Inspected on 2 October 2026 at `7d2f1ac`, on the owner's machine: Windows 11, Node 22.11.0, PostgreSQL 17.11 (`SAFE01_PG_BIN`). Only disposable clusters under `.tmp/safe-01` were used, with uncommitted probes under `.tmp/bug59`. The institutional database was not opened.

- **What fails.** In `checkZone` ([time-zone.check.ts:130–136](../../../scripts/safety/time-zone.check.ts)), a role inserted with the column default (`active_from = now()`, set by the database) is then read with `selectActiveAssignments(db, user.id, new Date())` ([assignments.ts:12](../../../src/lib/auth/assignments.ts)), using the app's clock. It fails only in the PostgreSQL group. Two full runs failed, in `UTC` and in `America/New_York`; three focused runs passed.
- **The cause is clock offset, not only precision.** The PostgreSQL server is a separate process. On this machine its clock reads later than Node's `Date.now()`: median **+1.9 ms**, lowest +0.8 ms, highest +4.3 ms over 2,000 samples (`clock_timestamp()` against the midpoint of each round trip). Right after a default-stamped insert, the app's "now" was still earlier than `active_from` in **2,998 of 3,000** tries. The check usually passes only because it does two more statements (another insert and an update) before reading, and those often take longer than the gap. PGlite runs inside Node and shares its clock, so its group never fails.
- **A wrong assumption in the check.** `SLACK_MS` ([time-zone.check.ts:26](../../../scripts/safety/time-zone.check.ts)) says "database and harness share one clock". That is true for PGlite but not for PostgreSQL.
- **Where the product relies on this.**
  - `scripts/bootstrap-admin.ts:58` inserts the first administrator's role with the column default, so the role starts on the database clock.
  - The app's own grants already set `activeFrom` and `activeTo` explicitly from the app clock ([admin-actions.ts:141, 341, 372](../../../src/lib/auth/admin-actions.ts)), and so does `roleWindow` ([account-rules.ts:76](../../../src/lib/auth/account-rules.ts)).
  - In practice a bootstrapped administrator signs in seconds later, so nobody is locked out today. On a hosted database on another machine, the offset could be much larger than 2 ms (see DEP-01).
- **Not affected.** Columns that are only displayed or audited (`created_at`, `granted_at`, audit `at`) are not compared with the app clock to grant or deny anything.

## Outcome and scope

**Outcome.**
- `npm run test:safety` with `SAFE01_PG_BIN` is reliably green on the owner's machine.
- Every role-start time that the access check compares against comes from the same clock as that check.

**In scope:**
- the BUG-29 time-zone check (`checkZone`, `checkBootstrap` and the `SLACK_MS` note)
- the bootstrap script's role insert
- a regression check that reproduces the offset deterministically

**Out of scope:**
- moving every time comparison to the database clock
- removing `defaultNow()` from any column (no migration)
- clock synchronisation on a hosted database, which stays a DEP-01 operational requirement
- the cosmetic `[cleanup] Skipped … owner PID … is still running` line, caused by a stale run directory whose PID was reused

## Decisions for the owner

- **D-1 (recommended): fix the check by reading "now" from the database where the database stamped the value.**
  - In `checkZone`, the "granted now is in force at once" assertion is about the database default in each zone, so it should ask with the database's `clock_timestamp()`. The revoke half keeps working: the revoked `active_to` is written from the app clock, which is earlier, so the role is correctly no longer active.
  - Alternative: add a few milliseconds of slack. Rejected, because it hides the offset instead of stating which clock the check means.
- **D-2 (recommended): `auth:bootstrap` sets the role start explicitly from the app clock** (`activeFrom: now`), like the app's own grants. The administrator role then starts on the same clock that `getOptionalActor` checks it against.
  - Alternative: leave the bootstrap script unchanged. That keeps the gap, which is harmless today but grows with a remote database.
- **D-3 (recommended): add a deterministic regression.**
  - Simulate an app clock that is behind the database: query with `now` set 50 ms earlier than the database's `clock_timestamp()`.
  - Assert that a bootstrap-style role written by the app clock is in force.
  - Show, as a characterisation, that a default-stamped role at that same instant is not. This documents why D-2 matters without depending on real timing.
  - `checkBootstrap` also checks that the stored start was written by the app: it has whole-millisecond precision (`extract(microseconds …) % 1000 = 0`), whereas a database `now()` carries microseconds. A database value that happens to land on a whole millisecond passes the check by chance about once in 1,000 runs; it can never fail falsely.

## Acceptance criteria

- **AC-01** In the PostgreSQL group, `checkZone` asserts "a role granted now is in force at once" against the database clock, and "a role revoked now is not" still holds. The `SLACK_MS` note no longer claims one shared clock.
- **AC-02** `auth:bootstrap` writes `active_from` from the app clock. `checkBootstrap` still shows the role in force at once and its start and audit times within the run window, in `Etc/GMT-6`.
- **AC-03** The D-3 regression passes on PGlite and PostgreSQL. The precision check in `checkBootstrap` fails if the bootstrap script goes back to the column default (confirmed by temporarily reverting T-02).
- **AC-04** `npm run test:safety` with `SAFE01_PG_BIN` passes in 5 consecutive full runs on the owner's machine. The time-zone probe from the inspection is rerun and its result recorded.
- **AC-05** `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build` pass. There is no migration, and the institutional database is not opened.

## Plan

| Task | Change | Check |
| --- | --- | --- |
| T-01 | `time-zone.check.ts`: add a small `databaseNow(client)` (`select clock_timestamp()`). Use it in `checkZone` for the grant/revoke read and in `checkBootstrap` for the active-role read. Correct the `SLACK_MS` comment. | `npm run test:safety -- BUG-29` on PGlite and PostgreSQL |
| T-02 | `bootstrap-admin.ts`: `activeFrom: now` on the role insert. | `checkBootstrap`; `test:domain` |
| T-03 | Add the D-3 regression and the bootstrap precision check to the BUG-29 group (both databases). Confirm the precision check fails with T-02 reverted. | Focused group, then the revert check |
| T-04 | Verification: 5 full `test:safety` runs with `SAFE01_PG_BIN`, the static checks, and `verification.md`. Update the brief. | AC-01 to AC-05 |

No UI changes, so no browser checks. There is no migration or data change, and the institutional database needs nothing.

## Approval record

- 2 October 2026, Asia/Dhaka: the owner chose "Approve D-1 to D-3 (Recommended)" in the Claude Code session. Scope: T-01 to T-04 as planned, with no migration.
