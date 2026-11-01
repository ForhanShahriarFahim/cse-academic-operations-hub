# Active-term diagnostics and duplicate recovery (BUG-28)

The database permits zero or one row whose status is exactly `active`, globally. Non-active statuses and the existing `active` default are preserved. BUG-28 does not supply an activation/repair command. Term creation and activation remain SET-01A.

## Read-only diagnostic

First preview the configured target without connecting:

```powershell
npm.cmd run db:check-terms -- --show-target
```

In PowerShell use `npm.cmd`, since the installed `npm.ps1` wrapper can drop forwarded flags. Verify the preview's environment, mode and redacted target against the intended operation. BUG-24's shared environment rules apply. The preview imports no database driver and performs no preparation/migration. The live command opens the named existing target and runs a read-only transaction:

```powershell
npm.cmd run db:check-terms
```

Output includes active-term IDs, names, dates, academic year and status. Retain institutional diagnostics privately outside Git. Exit 0 means zero or one active row; exit 2 means duplicates; exit 1 means invalid options/configuration, missing table/store or connection/read failure. Zero active is valid and does not trigger seed or automatic selection. Connection failures print safe generic copy instead of raw driver errors. The embedded diagnostic refuses an absent directory; it never initializes a missing institutional store. Existing PGlite must have no competing process while inspected.

## Migration refusal

Migration 0013 locks the term table against status writers, checks duplicates and creates `academic_terms_one_active_uq` within the migration transaction. A duplicate preflight error aborts that migration/journal entry and changes no term status. Do not drop the guard, edit the migration journal or reset data to bypass this refusal. Older still-pending migrations retain their own transaction/backfill rules; inspect the actual pre-upgrade state before any real operation.

## Separately authorized remediation

1. Stop application and other writers; identify and confirm the exact target. Follow [database recovery](DATABASE_RECOVERY.md) for a verified cold/encrypted backup and a separate disposable restore. Keep secrets, dumps, diagnostic output and private student data outside Git.
2. Run the read-only diagnostic and present every active term's ID/name/dates plus a proposed exact mapping of IDs to replacement statuses and a correction reason. The owner decides which term, if any, stays active. Do not infer it from dates, IDs, names or published versions. No such institutional mapping has been selected by BUG-28 approval.
3. Obtain actual owner authorization for that exact mapping and operation. Rehearse on the separately restored copy, preserving unrelated terms and all dependent/audit/snapshot rows. Use a reviewed transactional operator procedure which locks and re-reads the evidence, refuses changed rows, writes the approved statuses only and records actor/reason/before/after in the audit atomically. BUG-28 intentionally supplies no executable UPDATE recipe or mutating repair tool.
4. Obtain separate authorization before performing the backed-up real operation. Verify the named target and unchanged evidence again. If anything differs, stop for a fresh reviewed mapping. Never run `db:reset` on institutional storage.
5. Re-run diagnostics, then the authorized migration. Check index definition, complete history/publication fingerprints and current output. Keep the original backup and operation record. A failed rehearsal, audit or history check prevents the real operation.

The future activation workflow must define stale and in-flight request behavior separately. BUG-28 proves database uniqueness and its migration/write ordering; it does not certify arbitrary term-switch races or production readiness.
