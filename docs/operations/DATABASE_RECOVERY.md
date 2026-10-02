# Database backup and recovery runbook

Issue: [SAFE-01 / #2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) · Evidence: [verification](../specs/SAFE-01/verification.md) · Write paths: [mutation inventory](SAFE-01-mutation-inventory.md)
Updated: 30 September 2026 (Asia/Dhaka).

## Status: what is and is not proven

| Capability | Status |
|---|---|
| Cold backup and restore of a **disposable, synthetic** PGlite database | **Exercised** by `npm run test:safety` (T-02). Covers fingerprints, restore into a separate empty directory, cold reopen and rejection of bad backups. |
| Backup of the **institutional** PGlite directory (`.data/pglite-summer-2026`) | **Manual procedure below; not exercised.** The tooling refuses that directory by design. |
| Verifying an institutional backup copy with the tooling | **Not authorized under SAFE-01.** It would open private student data. It needs a separate owner decision. One decision so far: for BUG-29 (#29), on 1 October 2026, the owner approved a rehearsal on a copy. `scripts/rehearse-time-zone-migration.ts` copied the stopped directory into `.tmp/safe-01`, then cold-backed-up, migrated and restored the copy and removed it ([verification](../specs/BUG-29/verification.md#t-05-rehearsal-report)). Any other use still needs an owner decision. |
| Encrypted PostgreSQL dump/restore of a **disposable, synthetic** database | **Exercised** by `npm run test:safety` with `SAFE01_PG_BIN` set (T-06), on PostgreSQL 17.11 in a harness-owned local cluster. Covers AES-256-GCM encryption, restore into a separate empty database, full fingerprint and loader/export parity, and rejection of bad keys, altered backups and unsafe destinations. |
| Backup and restore of the **hosted** production or staging PostgreSQL | **Not exercised.** No hosted database exists yet. The procedure below applies, and DEP-01 must run it against staging with the provider's own backups. |
| Hot (online) backup of a running database | **Not supported.** Never copy a data directory while anything may be writing to it. |

PGlite is local development storage. Production and staging need hosted PostgreSQL. The dump/restore procedure is proven on a local disposable cluster (T-06); hosted recovery evidence belongs to DEP-01.

## Rules that apply to every backup

1. **Stop every writer first.** Writers include `npm run dev`, `npm start` and their automatic `predev`/`prestart` preparation, any `db:*` or `auth:bootstrap` command, Playwright (it starts `npm run dev`) and any ad-hoc script importing `src/db`.
2. **Proving that no writer is active is the operator's job.** Embedded PGlite writes no lock or PID file that another process could check. Two processes can open the same directory and corrupt it. If you cannot confirm that every writer has stopped, **do not take the backup.**
3. **Store backups outside the repository, in protected storage.** A copy of the institutional database contains private student data. Backups must never enter Git, issue or PR text, or unencrypted shared folders.
4. **Never restore over the only copy.** Move the current directory aside under a new name; do not delete it.
5. **`db:reset` is not a recovery tool.** It replaces every academic table with the Summer 2026 development seed. Since [BUG-26](../specs/BUG-26/spec.md) it keeps portal users, passwords, sessions, roles, setup links and the access audit history, and it refuses the default institutional directory. It runs only with `--confirm` naming its target. After an accidental reset of real academic data, restore from a backup. Do not re-seed.

## Institutional PGlite: cold backup (manual, not yet exercised)

Run these from the repository folder in PowerShell, after following the rules above.

1. Stop the dev server and every other writer. List Node processes and confirm that none belongs to this project:

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine
   ```

2. Copy the whole directory to a new, dated folder in protected storage (replace `<protected-folder>`):

   ```powershell
   $stamp = Get-Date -Format "yyyyMMdd-HHmm"
   Copy-Item -Recurse ".data\pglite-summer-2026" "<protected-folder>\pglite-summer-2026-$stamp"
   ```

3. Record a file-hash manifest next to the copy. A later restore can then detect a damaged or incomplete copy:

   ```powershell
   Get-ChildItem -Recurse -File "<protected-folder>\pglite-summer-2026-$stamp" | Get-FileHash -Algorithm SHA256 | Export-Csv "<protected-folder>\pglite-summer-2026-$stamp.sha256.csv" -NoTypeInformation
   ```

4. Restart the application only after the copy and the manifest are complete.

## Institutional PGlite: restore (manual, not yet exercised)

1. Stop every writer, as for a backup.
2. Recompute the backup's hashes and compare them with its manifest. Stop if any file is missing, extra or different.
3. Rename the current directory, for example to `.data\pglite-summer-2026-replaced-<stamp>`. Keep it until the restore has been accepted.
4. Copy the backup to `.data\pglite-summer-2026`. The destination must not already exist.
5. Start the application. Check `/api/health`, then check the active term, routine, attendance, extra-load and access pages against what is expected.
6. If access control was lost (for example after a reset), run `npm run auth:bootstrap` with the first administrator's email. The bootstrap writes the invitation, the role and a system-attributed audit event in one transaction.

## Disposable-data tooling (`scripts/safety/`)

`npm run test:safety` runs the whole exercise on synthetic data under the ignored folder `.tmp/safe-01/`:

- **Targets** ([targets.ts](../../scripts/safety/targets.ts)). Paths are accepted only inside `.tmp/safe-01`. The default directory, `.data`, any configured `PGLITE_DATA_DIR`, relative paths and link escapes are refused. PostgreSQL targets must be explicit `safe01_*` databases confirmed by name.
- **Owned runs** ([owned-run.ts](../../scripts/safety/owned-run.ts)), used by [pglite.ts](../../scripts/safety/pglite.ts). Each run folder carries an ownership marker and a single-writer lock. The tooling refuses to back up or remove a run while its writer is active.
- **Backup** ([pglite-backup.ts](../../scripts/safety/pglite-backup.ts)), format `safe-01-pglite-cold-v1`. The tool holds the lock, fingerprints the database, closes it, then copies it to `pgdata/`. It writes `manifest.json` (every file's size and SHA-256, plus the database fingerprint) and `manifest.sha256`.
- **Verify and restore.** Before copying, the tool checks the manifest's digest, the format and every file, rejecting missing or extra files. It restores only into the empty data directory of a separate owned run, then reopens the database and compares fingerprints. Any mismatch removes the partial restore.
- **Fingerprint** ([fingerprint.ts](../../scripts/safety/fingerprint.ts)). It covers columns, constraints, indexes, sequence positions, the Drizzle migration journal, and an order-independent digest of every table's rows. It holds only counts and hashes.

The tooling copies closed databases only. It cannot establish that some other process was not writing. That is why the manual rules above apply to real data.

## PostgreSQL: encrypted backup and restore

**Tested setup (T-06).**
- PostgreSQL 17.11 portable binaries from EDB (`postgresql-17.11-1-windows-x64-binaries.zip`, SHA-256 `6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3`), extracted to `F:\AI\tools\pgsql-17.11` outside the repository.
- No Windows service and no PATH change. The core executables are unsigned in EDB's zip distribution; the bundled `stackbuilder.exe` carries a valid EnterpriseDB signature, and a Defender scan was clean.
- Run the checks with:

  ```powershell
  $env:SAFE01_PG_BIN = 'F:\AI\tools\pgsql-17.11\pgsql\bin'; npm run test:safety -- T-06
  ```

- The harness creates its own cluster under `.tmp/safe-01`. It listens on 127.0.0.1 only, with a random SCRAM password, creates only `safe01_*` databases, and stops and deletes the cluster afterwards.
- **Stopping the cluster ([BUG-48](../specs/BUG-48/spec.md), [cluster-control.ts](../../scripts/safety/cluster-control.ts)).** On Windows, `pg_ctl start` hands the server to `cmd.exe` and exits, so the server is not a child of the test run. A run that is killed (by `timeout`, `taskkill /F`, a closed terminal or an agent's tool timeout) runs no cleanup code. Three layers stop the cluster anyway, always with `pg_ctl stop` on the owned data directory:
  - The run stops it on success, on errors, on a failed start, on Ctrl+C and on early exit. If the stop cannot be confirmed, the run directory is kept and the error names it.
  - A detached watchdog notices within about a second that a killed run has ended, stops its cluster and removes the run.
  - Before each new cluster, a sweep stops and removes cluster runs whose owning process is gone. It skips any run whose owner is still running.

  Watchdog and sweep actions are logged in `.tmp/safe-01/cluster-cleanup.log`. The whole suite takes more than ten minutes, so run it in the background, or one group at a time (`npm run test:safety -- T-06`), rather than under a short `timeout`.
- **If a cluster is still running anyway:** find its data directory in the `postgres.exe -D` command line (it must be under `.tmp/safe-01/runs/`). Then run `& "$env:SAFE01_PG_BIN\pg_ctl.exe" stop -D <that pgdata> -m fast`. Never stop a server by process ID, and never point `pg_ctl` at `.data/`.
- `pg_dump` and `pg_restore` must match the server's major version (checked).

**Backup format `safe-01-pg-dump-aes256gcm-v1`** ([pg-backup.ts](../../scripts/safety/pg-backup.ts)):
- `pg_dump --format=custom` is streamed straight through AES-256-GCM into `dump.enc`, so no plaintext dump touches the disk.
- `manifest.json` records the IV, the authentication tag, plaintext and ciphertext SHA-256, the tool and server versions, and the source fingerprint. `manifest.sha256` protects the manifest itself.
- The key is a separate file of 32 random bytes (64 hex characters). The tooling refuses a key stored in the repository (only the ignored scratch area is allowed, for tests).
- Keep real keys in protected storage **apart from** the backups. Losing the key makes the backup unrecoverable.
- The password reaches client tools through `PGPASSWORD`, never on the command line.

**Restore:**
1. Verify the manifest digest and the ciphertext digest.
2. Decrypt to a temporary file. The GCM tag rejects a wrong key or any altered byte *before* anything is restored.
3. Verify the plaintext digest.
4. Refuse the destination unless it is an **empty**, separate database.
5. Run `pg_restore --single-transaction --exit-on-error`, so a failure leaves the destination empty.
6. Compare the full fingerprint: schema, constraints, indexes, sequence positions, the migration journal and every row.

The temporary plaintext file is deleted in all cases. For real data, keep that temporary location on protected storage too.

**For hosted databases (DEP-01, not yet exercised):**
- Never restore over a live database, and never `DROP` or `db:reset` production.
- Restore into a new, empty database or branch, verify it, then switch the application's `DATABASE_URL` deliberately.
- `pg_dump` takes a consistent snapshot, so unlike PGlite it does not need writers stopped. Record the dump time, because later writes are not included.
- Provider snapshots and point-in-time recovery complement this procedure; they do not replace a tested restore.
- The tooling's target rules (`safe01_*`, confirmation by name, scratch-only locations) deliberately stop it from touching production. An approved production procedure needs its own owner decision and operational owner (D-07).
