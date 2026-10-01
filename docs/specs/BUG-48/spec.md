# BUG-48 (SAFE-01 F-10): The disposable PostgreSQL cluster is stopped even when a safety run is killed

Issue: [#48](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/48), "SAFE-01 follow-up (F-10): disposable PostgreSQL cluster survives a killed safety run"
Status: Approved 2 October 2026 with D-1 and D-2 as recommended (see [approval record](#approval-record)). Implemented and verified ([verification](verification.md)); awaiting owner acceptance.
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)).

## Problem and inspected baseline

Inspected on 2 October 2026 at `cb51925` (main after AUTH-02).

**What happened.** A disposable cluster from `npm run test:safety` kept running from 1 October 18:03 until 2 October 01:54. It was `postgres.exe` PID 29324 on port 55432, with data directory `.tmp/safe-01/runs/1790856162821-t06-postgres-cluster-7dad75/pgdata`. A later run on port 55433 did stop its own cluster. The leftover was stopped on 2 October with `pg_ctl stop -m fast` on that data directory only. `.data/` was not touched.

**How the run ended.** The run directory still had its `writer.lock`. That file is removed in a `finally` block (`withWriterLock`, [pglite.ts:58](../../../scripts/safety/pglite.ts)). So the Node process (PID 24120) never reached any `finally` block: it was killed, it did not throw. The session record agrees. The command was `timeout 590 npm run -s test:safety`, started at 11:55:29 UTC. 590 seconds later, at 18:05:19 Dhaka time, `timeout` killed it. That was in the middle of the T-06 backup/restore step: the PostgreSQL log ends at 18:05:21 with "connection to client lost". The full suite now takes longer than 10 minutes.

**Why the cluster outlived Node.** [pg-cluster.ts](../../../scripts/safety/pg-cluster.ts) starts the server with `pg_ctl start -w`. On Windows, `pg_ctl` launches `cmd.exe /C "postgres.exe …"` and then exits. That `cmd.exe` is the wrapper seen in the process list; it is normal `pg_ctl` behaviour. Once `pg_ctl` has exited, the postmaster is no longer a descendant of Node. The only thing that stops the server is `pg_ctl stop` in `withDisposableCluster`'s `finally` (line 112). A killed process runs no `finally`, no `exit` handler and no signal handler. GNU `timeout`, `taskkill /F`, a closed terminal and agent tool timeouts all kill this way on Windows. Nothing ever looks for the orphan afterwards.

**Weaknesses on the normal (not killed) path** that the same fix should close:

1. If `pg_ctl start -w -t 60` fails or times out after the postmaster was spawned, the code throws before the `try`/`finally` that stops the server. The server keeps running.
2. The result of `pg_ctl stop` is ignored. If the stop fails, `withWriterLock` releases the lock and `removeOwnedRun` runs `rmSync` on a live data directory. On Windows that can partly delete it and throw `EBUSY`, which also hides the original error.
3. If `admin.end()` throws, the stop is skipped.
4. Ctrl+C (SIGINT) and Ctrl+Break are catchable, but the harness has no handler for them. They exit without stopping the cluster.

Killing the process tree from inside Node (the suggestion in the report) would not help. The killed process cannot run code. And by the time it is killed, the postmaster is no longer in its tree.

## Outcome and scope

**Outcome.** The harness owns every cluster it starts until the cluster is stopped. A run that throws, fails to start the server, is interrupted with Ctrl+C or is killed outright leaves no server running. In the killed case it is stopped within seconds; otherwise at the latest when the next PostgreSQL group starts.

**In scope:** `scripts/safety/pg-cluster.ts`, a new watchdog script (D-1), a stale-cluster sweep, the `test:safety` group that proves these, and a short note in [DATABASE_RECOVERY.md](../../operations/DATABASE_RECOVERY.md).

**Out of scope:** application code and migrations; `.data/` and any non-owned directory; stale PGlite-only run directories (D-2); making the suite faster. Separately, the README/recovery note will say not to wrap the whole suite in a short `timeout`, and to run groups with the filter, for example `npm run test:safety -- T-06`.

## Required behavior

- **R-1. Stop on every in-process exit.** Once `pg_ctl start` has been called, the cluster is stopped on success, on a thrown error, and when `pg_ctl start` itself fails or times out. A stop is `pg_ctl stop -D <owned pgdata> -m fast -w`, and if the server is still running afterwards, `-m immediate`. The result is checked. If the server is still running, the run directory is not deleted. The error then names the data directory and keeps the original error as its cause. `admin.end()` failure does not skip the stop.
- **R-2. Interrupts.** While a cluster is active, SIGINT, SIGTERM, SIGHUP and (on Windows) SIGBREAK stop it synchronously, then exit with a non-zero code. So does a `process.exit` call made in the middle of a run. Handlers are removed when no cluster is active.
- **R-3. Watchdog (D-1).** Right after the server starts, the harness launches a detached watchdog with no inherited pipes. It is given the owner PID, the owned run root and `SAFE01_PG_BIN`. The watchdog checks every second. When the owner process no longer exists and `postmaster.pid` is still present, it stops the cluster as in R-1 and removes the run. It exits by itself once the run directory is gone, which is what happens after a normal cleanup. It acts only on a run that passes `assertOwnedRun` under `.tmp/safe-01/runs`.
- **R-4. Stale sweep.** Before each disposable cluster starts, the harness checks the owned runs under `.tmp/safe-01/runs`. A run is a stale cluster when its SAFE-01 marker says `t06 postgres cluster` and the PID in the marker (and in `writer.lock`) is no longer running. For a stale cluster the harness runs `pg_ctl status` and then a stop (R-1) on that run's `pgdata` with the configured `SAFE01_PG_BIN`. Then it removes the run, including its stale `writer.lock`. If the owner PID is still running, the run is left alone and reported. That PID could be another run in progress, or a reused PID. The group output lists each run that was stopped, removed or skipped.
- **R-5. Boundaries.** Every stop, sweep and removal resolves its path through the existing owned-target checks (`resolvePgliteTarget`, `assertOwnedRun`). Clusters are stopped only with `pg_ctl` on an owned data directory. Nothing kills `postgres.exe` by PID or image name, and nothing reads or writes `.data/`.

## Acceptance criteria

All of these run in `npm run test:safety` with `SAFE01_PG_BIN` set. Without it they report PENDING, like the other PostgreSQL groups.

- **AC-01 Killed run (reproduces the incident).** A child process starts a disposable cluster and then waits. The parent kills it the way `timeout` does (`child.kill()`, which is TerminateProcess on Windows). Within 15 seconds, `pg_ctl status` on that data directory reports no server, nothing is listening on its port, and the run directory is gone.
- **AC-02 Sweep.** The same kill, with the watchdog disabled for the test, leaves the server running. The next sweep stops it and removes the run. A fake cluster run whose marker carries a live PID is skipped and reported, and the sweep leaves it in place.
- **AC-03 Thrown error.** If the work throws, the server is stopped, the run is removed, and the caller receives the original error.
- **AC-04 Failed start.** If `pg_ctl start` fails (made to fail in an owned test run, for example with a port already in use or a very short wait), no server is left running and the start error is reported.
- **AC-05 Failed stop.** If a stop cannot be confirmed (simulated), the run directory is kept, and the error names the data directory and keeps the original cause.
- **AC-06 Interrupt.** A child sent SIGINT while a cluster is active exits non-zero, and no server is left running. This is checked where the platform can send SIGINT to a child; elsewhere it is reported as not applicable rather than passed.
- **AC-07 Boundaries.** A sweep never reads or writes the default PGlite directory: the existing before/after metadata check still holds. Runs without a SAFE-01 marker, runs outside `.tmp/safe-01/runs` and junction escapes are refused.
- **AC-08 Regression.** The existing T-06, BUG-29 (PostgreSQL) and AUTH-02 (PostgreSQL) groups still pass. `npm run typecheck`, `lint`, `test:domain` and `build` pass.

## Decisions for the owner

- **D-1. Watchdog.** *Recommended: include it.* Without it, a killed run leaves the server running until the next PostgreSQL group starts. In this incident that was 8 hours. The cost is a small detached Node process per cluster, which exits on its own.
- **D-2. Sweep scope.** *Recommended: PostgreSQL cluster runs only.* Killed PGlite runs leave only files, no process. Cleaning those up is a separate, low-risk follow-up if you want it.

## Approval record

- **2 October 2026, owner (in chat):** "yes, create the issue; approve with D-1 and D-2". This approves the spec and plan above. D-1: include the watchdog. D-2: the sweep covers PostgreSQL cluster runs only. The owner also authorized creating issue #48.

## Plan

Branch: `claude/bug-48` from `main` (`cb51925`), in the app-created worktree `brave-driscoll-459392`. It is the only writer for this issue.

- **T-01.** Commit this record and the approval.
- **T-02.** `pg-cluster.ts`: a stop helper with status checks and the immediate fallback; the cleanup registered before `pg_ctl start`; keep-on-failed-stop and error causes; an active-cluster registry with signal and `exit` hooks (R-1, R-2, R-5).
- **T-03.** `scripts/safety/cluster-watchdog.ts`: a detached launch with `windowsHide`, stdio ignored and `unref` (R-3).
- **T-04.** `sweepStaleClusters(bin)`, called at the start of `withDisposableCluster`, and its output lines (R-4).
- **T-05.** The new group "SAFE-01 F-10 cluster cleanup (PostgreSQL)", with a child script under `scripts/safety/children/` for AC-01, AC-02 and AC-06, and in-process cases for AC-03 to AC-05 and AC-07.
- **T-06.** DATABASE_RECOVERY.md and README notes; the verification record; a brief update.

**Verification:** the full `test:safety` with `SAFE01_PG_BIN`, run in the background without a short `timeout`, plus typecheck, lint, test:domain and build. Afterwards, `tasklist` must show no `postgres.exe` and `.tmp/safe-01/runs` must have no cluster runs left. No database-preparation commands are run.

## Current checkpoint / handoff

- [x] T-01 spec, plan and approval committed
- [x] T-02 stop on every in-process exit
- [x] T-03 watchdog
- [x] T-04 stale sweep
- [x] T-05 safety group
- [x] T-06 documentation and verification record

Next: owner acceptance, then merge and close #48. Pending checks: none. A real console Ctrl+C keypress could not be sent to a child process on Windows (see AC-06 in the [verification record](verification.md)).
