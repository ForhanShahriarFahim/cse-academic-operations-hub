# BUG-48: Verification

Issue: [#48](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/48). Records: [spec, plan and approval](spec.md).
Verified: 2 October 2026, Asia/Dhaka, on branch `claude/bug-48`, Windows 11, Node 22.11.0, PostgreSQL 17.11 tools (`SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`).
Status: **Verified; awaiting owner acceptance.**

## What changed

- **[cluster-control.ts](../../../scripts/safety/cluster-control.ts)** (new) holds the cluster-cleanup pieces:
  - a checked `pg_ctl` stop: fast shutdown, then immediate, with an optional settle period;
  - an active-cluster registry, so SIGINT, SIGTERM, SIGHUP, SIGBREAK and `exit` stop every active cluster;
  - `launchWatchdog`, which starts the watchdog through a short-lived intermediate so the watchdog is not in the run's process tree;
  - `sweepStaleClusters`;
  - the cleanup log at `.tmp/safe-01/cluster-cleanup.log`.
- **[cluster-watchdog.ts](../../../scripts/safety/cluster-watchdog.ts)** (new) runs detached. It exits when the run directory disappears. If the owner process ends first, it stops the cluster and removes the run.
- **[pg-cluster.ts](../../../scripts/safety/pg-cluster.ts):**
  - It sweeps stale clusters first.
  - It launches the watchdog and registers the cluster before `pg_ctl start`.
  - A failed start is stopped too, with a 10-second wait in case the server is still starting.
  - It checks every stop. A run whose stop cannot be confirmed is kept, and the error names it and carries the original error as its cause.
  - The tail of `postgres.log` now travels with a start error, because the log is deleted with the run.
  - It has test-only options: `watchdog`, `startWaitSeconds`, `failStop` and `onStarting`.
- **[owned-run.ts](../../../scripts/safety/owned-run.ts)** (new) holds the owned-run helpers, moved out of `pglite.ts` so the watchdog does not load PGlite. `pglite.ts` re-exports them unchanged. Added: `pidAlive`, `runOwnerPids` and `removeStaleRun`.
- **[cluster.check.ts](../../../scripts/safety/cluster.check.ts)** with **[children/cluster-holder.ts](../../../scripts/safety/children/cluster-holder.ts)** form the new group "BUG-48 cluster cleanup (PostgreSQL)" in `npm run test:safety`.
- **Docs:** [DATABASE_RECOVERY.md](../../operations/DATABASE_RECOVERY.md) (the cleanup layers and the manual `pg_ctl` stop) and the README (run the suite in the background or one group at a time).

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 Killed run | Pass | The holder's whole process tree was killed with `taskkill /T /F`, the way `timeout` and tool timeouts kill it. The watchdog stopped the cluster and removed the run in 5.0 s (first run), 5.1 s (full suite) and 3.8 s (final rerun after the last edit), then exited. Log line: "watchdog: owner PID … ended without cleanup; stopped and removed …". |
| AC-02 Sweep | Pass | With the watchdog off, the killed run's cluster was still running 3 s later, which reproduces the incident. The next sweep stopped it and removed the run. A cluster run owned by the live test process was skipped and left in place. |
| AC-03 Thrown error | Pass | With the watchdog off, the cluster was stopped in-process, the run removed and the port free, and the caller received the original error. |
| AC-04 Failed start | Pass | `pg_ctl start -t 0` gave up while the postmaster was still starting. The harness found that server, stopped it ("failed start: stopped the server pg_ctl gave up on in …"), removed the run and reported `pg_ctl start failed`. |
| AC-05 Failed stop | Pass (simulated) | The run directory was kept and the server left running. The error named the data directory, said "kept for inspection" and carried the injected work error as its `cause`. The test then stopped the server with `pg_ctl` and removed the run. |
| AC-06 Interrupt | Pass, with a limit | SIGINT reached the harness's handler through `process.emit`, which is the same path a console Ctrl+C takes, and the process exited with 130. A `process.exit(3)` in the middle of a run exited with 3. In both cases the cluster was already stopped when the process ended, with the watchdog off; the sweep then removed only the directory. Windows cannot send a catchable SIGINT to a child process, so a real Ctrl+C keypress was not exercised. |
| AC-07 Boundaries | Pass | An unmarked directory under `runs/` was ignored. A junction under `runs/` pointing outside the scratch root, with a cluster marker and a dead PID, was refused. Both were left untouched. The default PGlite directory metadata was unchanged in every run. |
| AC-08 Regression | Pass | The full `test:safety` run with `SAFE01_PG_BIN` passed all 10 groups, exit 0, in about 17 minutes. That includes T-06, BUG-29 (PostgreSQL) and AUTH-02 (PostgreSQL). `typecheck`, `lint`, `test:domain` and `build` passed. |

After every run, `tasklist` showed no `postgres.exe`, no watchdog or holder `node.exe` was left, and `.tmp/safe-01/runs` was empty.

## Limits and notes

- The checks ran in the app-created worktree after `npm ci`. No database-preparation command was run, and `.data/` was not opened.
- AC-05 simulates the failed stop. A real stop failure (a postmaster that ignores both fast and immediate shutdown) could not be produced safely.
- A dead owner's PID can be reused by another process. The sweep then treats the run as still owned, skips it and reports it. That is the cautious failure, and the watchdog normally acts long before PID reuse is likely.
- The incident's leftover cluster (in the main checkout) was stopped on 2 October 2026 with `pg_ctl stop -m fast` on its `.tmp` data directory. Its run directory is still in place. Once this branch is merged, the first PostgreSQL group run from the main checkout will sweep it.
