# OD-01B — Verification

20 November 2026, Asia/Dhaka · [Approved specification](spec.md) · [Plan](plan.md)

## Database and behavior evidence

- **AC-07.** The populated `0022` → `0023` migration passed on disposable PGlite and PostgreSQL 17.11. Existing commitment data and other tables, including publications and workload, retained their fingerprints. Existing records read as whole-term and standalone. Constraint checks refused half ranges, incomplete provenance and cross-term group references. Older migration fixtures can replay `0023` after shortening their migration journal.
- **AC-01–AC-02.** Domain checks compare the dated preview, conflict engine and availability picker for a shared boundary on the correct weekday, disjoint effective dates and an overlapping date interval without the selected weekday. The bounded form and its server action require both dates. A range change is a planning change and sends a Verified record back to Pending.
- **AC-03–AC-04.** The rollover action suites passed on both adapters. They cover selected unresolved and dated records, fresh destination dates, reset verification, source preservation, per-record audit and receipt mapping. Activation remains separate. The authorized manager can verify the carried dated record with a new note after activation. The existing preparation tests cover stale evidence, audit failure rollback, concurrent submissions and one-time receipts.
- **AC-05.** The commitment action suites passed on both adapters. They cover a matching link, suppression, restored booking and publication blocker when meeting dates drift, audited removal, and refusals with no writes. Restrictive foreign keys and the class-group removal action protect linked group references.
- **AC-06.** Snapshot domain checks cover frozen v5 dates, rejecting incomplete ranges, redacting provenance and support notes, and opening old version formats. Existing CSV remains the formal-meeting export. Published routines read frozen values.

All database activity for verification uses disposable data. Institutional migrations `0022` and `0023` require a separate backed-up operation approved by the owner.

## Corrections found during final verification

- The BUG-29 time-zone catalog check lists the date and time columns that migrations add after BUG-29. It did not yet list the `external_commitments.effective_from/effective_to` dates from `0023`, so the legacy catalog comparison failed. The check now lists them. Only that test file changed.
- The term-preparation Edge flow waited for a "View saved preparation receipt" link. The prepare action revalidates the layout, so the page re-renders straight into the saved receipt, as it did before OD-01B. The test now waits for the receipt heading. The product was not changed.

## Final checks (T-07)

- `npm run typecheck`, `npm run lint` and `npm run test:domain` passed, including the OD-01A/OD-01B commitment rules.
- The full `npm run test:safety` with `SAFE01_PG_BIN` passed all 62 groups on disposable PGlite and PostgreSQL 17.11. That includes OD-01A commitments and the OD-01B migration on both adapters. The default PGlite directory was never opened.
- The default `npm run build` (Turbopack) passed with `DATABASE_URL=''`, `PGLITE_DATA_DIR=memory://` and a synthetic auth secret. The only warnings were Better Auth's notice about that low-entropy synthetic secret. The `next-env.d.ts` rewrite and the regenerated PERF-01 outputs were reverted.

## Browser review (Edge, compiled `next start` on :3100, disposable review database)

- **AC-08, AC-01–AC-05.** All six `tests/ux/commitments.spec.ts` flows passed against the compiled build: the register, the dated guided form with impact preview, the formal-group link, verify/edit/archive/history, note resolution, teacher denial (including the link page) and term preparation carrying a selected commitment as Pending. Each review point passed axe (WCAG 2 A/AA) and had no page-wide horizontal scroll at 1440, 390 and 320 px. Screenshots are kept in `.tmp/ux-review/od-01a/`.
- **AC-06, A4.** The draft official routine printed to A4 shows the dated booking once in its normal Sunday OD cell as `NB-406 (SYN-PREVIEW) · <date>`. The cell wraps within the table (`.tmp/ux-review/od-01a/dated-od-routine.pdf`).
- **AC-06, historical version.** A fresh publishable review database was published, and its snapshot was rewritten into the exact schema-4 shape of the pre-OD-01B builder (`c65e410`), with no dates and with source/notes kept. The compiled server opened it at `/public/routine`, `/public/routine/official` and `/routine/official` with no error. The public A4 shows "Publication v2" and six undated OD cells (`.tmp/ux-review/od-01b-historic/`). The saved pre-OD-01B review copy could not be used, because PGlite aborted on opening it (it was probably copied from a running database). The rewrite therefore stands in for a pre-migration publication. Migration retention of existing publications is covered by AC-07 above.

## Not done here

- `0022` and `0023` are not applied to the institutional database. That needs a separate, backed-up, owner-approved operation.
- GitHub synchronization waits for the agreed delivery boundary.
