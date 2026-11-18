# CRS-01D — Inspection and verification

18 November 2026 (Asia/Dhaka). [Specification](spec.md) · [Plan](plan.md)

## Inspected baseline

- Clean local `main` at `75f204e`; CRS-01C was accepted and merged at `2cb4ce4`. Last remote reconciliation recorded in the project brief was 11 November.
- Read the existing term-scoped group and offering actions/stores, start-offerings route, role gating, source notes and seed shape. Source cohort status is present-day metadata; the term placement provides the historical matching slot. Some imported groups have outside audiences or a reconciliation flag and need explicit treatment.
- Read the installed Next.js Server Functions guide for direct-action authorization and post-mutation refresh. The project’s class-group form already has the input-retention approach.
- The Courses & offerings completeness report can display “UT” for an unscheduled group with a recorded teacher. The Class groups page already shows the recorded teacher. This report issue remains tracked in [CRS-01C verification](../CRS-01C/verification.md).

## Proposal checks

- Local document links and heading anchors, the decision and criterion IDs, and the sketch's local link and label targets passed.
- Playwright with local Edge opened the static sketch at 1440, 390 and 320 pixels. The layout used two columns on desktop and one at both phone widths, with no horizontal overflow. The two group choices started unchecked and Apply was disabled. Tab reached the source selector and first group, and Space toggled the choice. The browser launched successfully with a temporary profile outside the shell sandbox after the sandboxed launch exited.

## Acceptance and delivery

Implementation `4e6ea72` follows owner approval `e8c25ea`. Delivery acceptance and local merge are pending. Parent #7 remains open.

## Implementation checks

| Check | Evidence |
| --- | --- |
| Typecheck, lint and domain | Passed during implementation. |
| CRS-01D PGlite and PostgreSQL | Passed. Real action calls confirm impossible, cancelled, ambiguous and unavailable matches; selected merged creation, carried and unit-only changed comparisons, reason validation, forged picks, anonymous access, stale/repeated review, rollback and one readable receipt. |
| CRS-01C PGlite and PostgreSQL | Passed single-group regressions on both adapters. The PostgreSQL check also observed lock waiting for two independent CRS-01D transactions. The first applied and the second was stale, with one group saved. |
| Neighboring regressions | CRS-01B offerings, BAT-01B rollover, BUG-LOAD-BASIS eligibility and T-03 two-term history passed on disposable PGlite. T-03 straddled the Webpack incident and reported the unrelated default directory metadata change. |
| Preservation | Both adapters confirm that tables outside the new group, links, requirements, allocations and audit event are identical. The compiled synthetic preview confirms byte-identical archived CSV and identical table fingerprints for the preserved tables. Poppler rendered all 6 archived native A4 pages (4 official and 2 teachers) identically at 120 DPI before and after. |
| Browser | `scripts/review-class-groups.ts --start-check` passed against a compiled Webpack build and disposable PostgreSQL. 18 captures at 1440/390/320 pixels, axe, keyboard selection, validation and retained input, stale and fresh review, saved and updated comparison, audit history, and viewer direct-route denial. Captures and PDFs are local under `.tmp/crs-01d/browser`. |
| Builds | Two default Turbopack attempts were stopped after stalling during optimized compilation. The first direct Webpack attempt emitted routes but logged PGlite initialization errors. The isolated Webpack retry completed compilation, TypeScript, page generation and tracing with exit 0. It pinned `npm_lifecycle_event=build`, `PGLITE_DATA_DIR=memory://` and a loopback-only dummy PostgreSQL URL. |

The injected audit-fault test initially used the wrong execution method for PGlite. Then a fingerprint assertion included sequence counters, which advance even when a transaction rolls back. The corrected test checks every table's rows during audit-fault rollback and checks the full fingerprint for refusals before insertion. Both adapters passed the corrected scenarios.

### Build isolation incident

The first Webpack command called Next directly and omitted `npm_lifecycle_event=build`. During page collection, the workers attempted configured PGlite initialization and logged failures. The institutional directory's `postmaster.pid`, `global` and `pg_logical` entries showed modification times around 07:41 Asia/Dhaka. The command issued no migration, reset or application mutation. There is no pre-attempt row fingerprint, so row parity for this incident is unverified. The owner was notified during the run. The corrected build used an isolated target, and the browser launcher uses its owned PostgreSQL cluster.

### Acceptance evidence

| Criteria | Evidence |
| --- | --- |
| AC-01 | Partial coverage. Real anonymous and viewer denial and authorized draft apply pass. The full new-route role and term matrix was not run. |
| AC-02–AC-04 | Both-adapter projection and copy checks pass for the focused matching, allocation and comparison cases above. |
| AC-05 | Atomic rollback, selected-only writes, refusal results and the independent concurrent apply pass. See race coverage limits below. |
| AC-06 | Both-adapter preservation, neighboring history and eligibility checks, archived CSV and all six native A4 pages pass. |
| AC-07 | Compiled keyboard, axe and responsive flows pass. The loading state has no dedicated capture. |
| AC-08 | Partial. Typecheck, lint, domain, focused safety groups and isolated Webpack pass. Default Turbopack did not complete. |

### Coverage and owner review

- The focused copy scenarios exercised a draft destination, merged matching, blocked rows, and carried/changed allocation comparison. The older single-group regression exercises the active-term scheduling and workload handoff. The compiled copy workflow was tested in a draft term.
- The new independent PostgreSQL lock test covers simultaneous applies. Stale teacher and offering changes were checked with actions and the browser. The adjacent single-group race suite covers offering, teacher and exclusive context lock ordering. A complete race matrix for the new batch operation was not repeated.
- Start the disposable compiled review with `node node_modules/tsx/dist/cli.mjs scripts/review-class-groups.ts --serve`. Open [the local sign-in](http://localhost:3127/sign-in), then select **Start from previous term**. The fixture has one eligible group and a merged group with a missing destination offering. The isolated build and default-build limitation are recorded above.
