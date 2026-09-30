# Database backup and recovery runbook

Issue: [SAFE-01 / #2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) · Evidence: [verification](../specs/SAFE-01/verification.md) · Write paths: [mutation inventory](SAFE-01-mutation-inventory.md)
Updated: 30 September 2026 (Asia/Dhaka).

## Status: what is and is not proven

| Capability | Status |
|---|---|
| Cold backup and restore of a **disposable, synthetic** PGlite database | **Exercised** by `npm run test:safety` (T-02). Covers fingerprints, restore into a separate empty directory, cold reopen and rejection of bad backups. |
| Backup of the **institutional** PGlite directory (`.data/pglite-summer-2026`) | **Manual procedure below; not exercised.** The tooling refuses that directory by design. |
| Verifying an institutional backup copy with the tooling | **Not authorized under SAFE-01.** It would open private student data. It needs a separate owner decision. |
| PostgreSQL dump/restore | **Pending (T-06).** Needs an approved disposable source and destination, compatible `pg_dump`/`pg_restore`/`psql`, and encrypted storage. None of these are available yet. |
| Hot (online) backup of a running database | **Not supported.** Never copy a data directory while anything may be writing to it. |

PGlite is local development storage. Production and staging need hosted PostgreSQL with its own tested recovery (T-06, DEP-01).

## Rules that apply to every backup

1. **Stop every writer first.** Writers include `npm run dev`, `npm start` and their automatic `predev`/`prestart` preparation, any `db:*` or `auth:bootstrap` command, Playwright (it starts `npm run dev`) and any ad-hoc script importing `src/db`.
2. **Proving that no writer is active is the operator's job.** Embedded PGlite writes no lock or PID file that another process could check. Two processes can open the same directory and corrupt it. If you cannot confirm that every writer has stopped, **do not take the backup.**
3. **Store backups outside the repository, in protected storage.** A copy of the institutional database contains private student data. Backups must never enter Git, issue or PR text, or unencrypted shared folders.
4. **Never restore over the only copy.** Move the current directory aside under a new name; do not delete it.
5. **`db:reset` is not a recovery tool.** It truncates all academic tables and, through foreign-key cascades, every portal user and role assignment ([F-07](SAFE-01-mutation-inventory.md#findings-for-follow-up-not-safe-01-fixes-unless-stated)). After an accidental reset, restore from a backup. Do not re-seed.

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
- **Owned runs** ([pglite.ts](../../scripts/safety/pglite.ts)). Each run folder carries an ownership marker and a single-writer lock. The tooling refuses to back up or remove a run while its writer is active.
- **Backup** ([pglite-backup.ts](../../scripts/safety/pglite-backup.ts)), format `safe-01-pglite-cold-v1`. The tool holds the lock, fingerprints the database, closes it, then copies it to `pgdata/`. It writes `manifest.json` (every file's size and SHA-256, plus the database fingerprint) and `manifest.sha256`.
- **Verify and restore.** Before copying, the tool checks the manifest's digest, the format and every file, rejecting missing or extra files. It restores only into the empty data directory of a separate owned run, then reopens the database and compares fingerprints. Any mismatch removes the partial restore.
- **Fingerprint** ([fingerprint.ts](../../scripts/safety/fingerprint.ts)). It covers columns, constraints, indexes, sequence positions, the Drizzle migration journal, and an order-independent digest of every table's rows. It holds only counts and hashes.

The tooling copies closed databases only. It cannot establish that some other process was not writing. That is why the manual rules above apply to real data.

## PostgreSQL (pending T-06)

The procedure will use `pg_dump` custom format, encrypted at rest, restored with `pg_restore` into a **separate, empty, disposable** `safe01_*` database. It will be verified with the same fingerprint approach, plus sequences and constraints. It will never drop or reset a production database. The target rules already exist and are tested. The exercise stays pending until the prerequisites in the status table are approved and available.
