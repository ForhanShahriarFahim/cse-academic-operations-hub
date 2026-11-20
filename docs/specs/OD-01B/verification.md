# OD-01B — Verification

20 November 2026, Asia/Dhaka · [Approved specification](spec.md) · [Plan](plan.md)

## Database and behavior evidence

- **AC-07.** The populated `0022` → `0023` migration passed on disposable PGlite and PostgreSQL 17.11. Existing commitment data and other tables, including publications and workload, retained their fingerprints. Existing records read as whole-term and standalone. Constraint checks refused half ranges, incomplete provenance and cross-term group references. Older migration fixtures can replay `0023` after shortening their migration journal.
- **AC-01–AC-02.** Domain checks compare the dated preview, conflict engine and availability picker for a shared boundary on the correct weekday, disjoint effective dates and an overlapping date interval without the selected weekday. The bounded form and its server action require both dates. A range change is a planning change and sends a Verified record back to Pending.
- **AC-03–AC-04.** The rollover action suites passed on both adapters. They cover selected unresolved and dated records, fresh destination dates, reset verification, source preservation, per-record audit and receipt mapping. Activation remains separate. The authorized manager can verify the carried dated record with a new note after activation. The existing preparation tests cover stale evidence, audit failure rollback, concurrent submissions and one-time receipts.
- **AC-05.** The commitment action suites passed on both adapters. They cover a matching link, suppression, restored booking and publication blocker when meeting dates drift, audited removal, and refusals with no writes. Restrictive foreign keys and the class-group removal action protect linked group references.
- **AC-06.** Snapshot domain checks cover frozen v5 dates, rejecting incomplete ranges, redacting provenance and support notes, and opening old version formats. Existing CSV remains the formal-meeting export. Published routines read frozen values.

All database activity for verification uses disposable data. Institutional migrations `0022` and `0023` require a separate backed-up operation approved by the owner.
