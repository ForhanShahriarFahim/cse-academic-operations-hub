# BUG-59: Verification

Issue: [#59](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/59). Records: [spec, plan and approval](spec.md).
Verified: 2 October 2026, Asia/Dhaka, on branch `claude/bug-59` (base `7d2f1ac`), on the owner's machine: Windows 11, Node 22.11.0, PostgreSQL 17.11 tools (`SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`).
Status: **Verified locally; awaiting owner acceptance.**

## What changed

- **[time-zone.check.ts](../../../scripts/safety/time-zone.check.ts)**
  - **`databaseNow(client)`:** reads `clock_timestamp()` in microseconds and rounds up to the next whole millisecond.
  - **`subMillisecond(...)`:** returns the microseconds within the millisecond of a stored instant.
  - **`checkZone`:** asks "granted now is in force, revoked now is not" at the later of the database clock and the app clock. That instant is "now" on both, so the check holds whichever clock reads ahead (D-1).
  - **D-3 regression:** with the app clock 50 ms behind the database, a start written from the app clock is in force and a default-stamped start is not yet.
  - **`checkBootstrap`:** also asserts that the bootstrap role's start has whole-millisecond precision, meaning it was written from the app clock.
  - **`SLACK_MS`:** the note no longer claims one shared clock.
- **[bootstrap-admin.ts](../../../scripts/bootstrap-admin.ts)** writes `activeFrom: now, grantedAt: now` from the app clock (D-2), like the app's own grants.
- No migration, no schema change and no UI change.

## Results

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | `npm run test:safety -- BUG-29` passes on PGlite and PostgreSQL (6 focused runs after the change). In 3 zones, the grant is in force and the revocation is not, asked at a time that is now on both clocks. |
| AC-02 | Pass | `checkBootstrap` in `Etc/GMT-6`: the role is in force at once, its start and audit times are within the run window, and the start has whole-millisecond precision. |
| AC-03 | Pass, on PostgreSQL | The D-3 regression passes on both databases. With T-02 temporarily reverted, the PostgreSQL group fails with "bootstrap role start is written by the app clock", and passes again once T-02 is restored. On PGlite the reverted script still passes. PGlite runs inside Node and its `now()` has only millisecond resolution, so this guard works only on PostgreSQL, the adapter where the offset exists. |
| AC-04 | Pass | 5 consecutive full `npm run test:safety` runs with `SAFE01_PG_BIN`: 16 of 16 groups each (17–21 min per run). These ran on the revision before the final one-line change to the revoke instant; see the note below. A sixth full run on the final code (`4f1653d`) also passed 16 of 16 groups (16.5 min). |
| AC-05 | Pass | `typecheck`, `lint`, `test:domain` and `build` pass. `lint` passes with no exclusions once the stray `.claude/worktrees/cranky-hofstadter-4674b1` checkout is removed; its build output had added 383 lint problems. No migration; the institutional database was never opened. |

**Note on AC-04.** After the five runs, review found that asking with the database clock alone keeps "revoked now is not active" safe only while the database clock reads ahead, because the revocation is written from the app clock. The final change asks at the later of the two clocks. It touches only that assertion. After it, the BUG-29 group passed 3 times on both databases, and a full run passed.

## Probe results (uncommitted diagnostics under `.tmp/bug59`)

| Measure | Inspection | After the fix |
| --- | --- | --- |
| PostgreSQL clock minus Node clock, median (2,000 samples) | +1.9 ms (range +0.8 to +4.3) | +1.0 ms (p5 +0.7, p95 +1.2) |
| Default-stamped grants not yet active at the app's "now", read right after the insert (3,000 tries) | 2,998 | 1,655 |

The offset is a property of the two clocks and is unchanged by this fix. The fix makes the check and the bootstrap role stop depending on it. The negative minimum and the large maximum after the fix are round-trip outliers in the measurement.

## Pending

- **Hosted PostgreSQL:** the server clock must be synchronised (DEP-01). The app's own role writes no longer depend on it, but `created_at` and audit times are still stamped by the database.
- **Institutional database:** no migration and no data change.
