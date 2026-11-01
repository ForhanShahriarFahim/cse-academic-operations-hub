# BUG-28 — Inspection and verification

[Specification](spec.md), [sole plan](plan.md), [state sketches](review-states.md). Updated: 1 November 2026, Asia/Dhaka.
Status: **Implemented; final regression/browser verification in progress. Default build fails; feature acceptance pending.** Approval `d20c9b6` precedes feature code.

## Implementation verification

Migration 0013 and the Drizzle partial unique index preserve the existing status default/strings and all term rows. The actual migrator locks before preflight/index creation, refuses duplicate active rows with SQLSTATE 23514 and leaves its schema/data/journal transaction unchanged. The shared reader fetches at most two rows and keeps transaction-reader support. Five production sites use it; expected typed failures map at affected action/export/public UI boundaries, while unexpected failures and permissions retain their contracts. No activation or repair writer was added.

The read-only `db:check-terms` command names its target before driver import, supports a database-free preview, performs a read-only transaction and closes its client. Missing embedded stores are not initialized; raw connection/driver errors are masked. [Operator runbook](../../operations/ACTIVE_TERM_RECOVERY.md) requires a separately approved exact remediation mapping, verified backup/rehearsal and atomic audit before any real operation. No institutional term has been chosen or inspected.

| Criteria | Result so far | Evidence / remaining work |
| --- | --- | --- |
| AC-01/02 | Focused checks pass on PGlite/PostgreSQL | Populated two-term 0012→0013, unchanged full business/status/audit/snapshot fingerprints, idempotent reapply, explicit/default/update uniqueness, zero/custom non-active labels, exact duplicate-migration schema/sequence/journal rollback; pre-upgrade cold/encrypted backup and exact separate-target restore |
| AC-03/04 | Focused production checks pass on both adapters | Five sites on zero/one/legacy duplicates; 27 ambiguous and 25 zero-context direct action refusals per adapter, anonymous permission precedence, no table/audit/sequence changes, missing-record contract and transactional teacher references seeing uncommitted state |
| AC-05 | Focused PostgreSQL checks pass | Sixteen independent-connection update/explicit/default/mixed races in both orders with holder rollback and observed blocking PIDs. Actual migrator versus earlier writer refuses after writer commit; actual migrator held at test-only journal barrier commits before later writer, which fails uniqueness; final runner reapply passes |
| AC-06 | Populated diagnostic checks pass; extra edge/preview checks running | Actual pre-migration zero/one/duplicate CLI results and unchanged complete fingerprints pass on both adapters. Missing-store/table, empty-table/unsupported-flag and extended BUG-24 import/secret/preview checks pending in final run |
| AC-07 | Production browser/native-print review running | Desktop/390/320, stale-page policy refusal/value retention, keyboard/axe, public/CSV/print privacy and restored-one output/hash parity remain pending |
| AC-08 | **Partial: default build fails** | Typecheck/lint/domain pass at the core checkpoint. Default `next build` (the build script, with its build lifecycle flag and pinned memory target) fails inside/outside the sandbox in `globals.css → creating new process → node process exited before we could connect`. Separate `next build --webpack` passes outside the sandbox; initial sandbox Webpack run hit a generated-directory EPERM. Full 25-group safety run and final browser evidence are in progress; no build exception/acceptance inferred |

PostgreSQL's sandboxed loopback connection was denied with EACCES; the same owned-cluster focused run passes outside the sandbox. No runtime, bundler, dependency or build-script policy changed. The separate Webpack artifact exists only as labeled production review evidence. Final checks will replace pending entries here; no pending check is called passed.

## Inspected evidence

- Baseline: local main `f09df27`, after C acceptance `e99f586` / merge `0dc096c`. Work branch `codex/bug-28`; one checkout/writer. The authorized C merge required no conflict resolution and preserves reviewed code as ancestors of local main.
- `academic_terms` original DDL and current schema retain non-null status/default `active` without any unique active index. Scanned all production `academicTerms.status` predicates: five first-row selectors in four modules, listed in the specification. Scanned production term inserts/updates: only source seed inserts a term; no activation/editor API found. Synthetic switching and draft insertions are not product authority.
- Read real migration/preparation/target command code, shell fallback, dependent actions, teacher reference transaction, public viewer/official/CSV and internal CSV. Existing zero-active behaviors differ by consumer; the proposal makes ambiguity explicit while preserving optional public absence and term-independent scope semantics.
- Installed Next.js guides read: `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` and `07-mutating-data.md`. Expected failures should be explicit results/conditional UI; Server Functions must retain authorization even when directly invoked. No product code was written in this checkpoint.
- [Reproduction receipt](inspection.json): explicit in-memory PGlite, original table DDL only; two synthetic inserts omit status and both become active. Original primary key is the sole index; matching LIMIT 1 returns one row and conceals ambiguity. The observed ID is not evidence of guaranteed ordering. No environment loader, application database import, institutional target or production loader was used.

## Historical planning checks (proposal `0d2c9f5`)

Local links/anchors, source paths, required document sections, sole-checklist ownership, D-1–D-4 and AC-01–AC-08 references, pending approval and Git diff are checked for the planning checkpoint; exact counts/results are recorded in [document review](document-review.json). The Markdown state sketches provide desktop/390/320 and print behavior for approval; no browser capture, axe scan or print rendering is claimed for them. No institutional census, backup, migration, preparation, reset, application server or GitHub read/write occurred.

## Original implementation verification requirements (retained from planning)

| Criteria | Current result | Required evidence |
| --- | --- | --- |
| AC-01 | Defect reproduced; fix pending | Actual constraint/index/default/status cases on both adapters |
| AC-02 | Pending | Real pre-upgrade populated migration, duplicate refusal, journal/data preservation, reapply and separate-target restored backups on both adapters |
| AC-03/04 | Source inspection only | Shared resolver and all production read/action boundaries on zero/one/pre-0013 duplicate fixtures, permission precedence, transaction use and unchanged fingerprints |
| AC-05 | Pending | Deterministic independent PostgreSQL connections for both commit orders, rollback and migration/write barriers |
| AC-06 | Design only | Diagnostic preview/read-only/resource/secret contract and remediation runbook; no real mapping selected |
| AC-07 | Markdown sketches only | Production browser/keyboard/axe desktop/390/320, unavailable public/print and route status/privacy checks, normal frozen-output parity |
| AC-08 | Pending | Final typecheck/lint/domain/default build/full applicable safety with PostgreSQL, runnable owner review and actual acceptance |

ROM-01C's historical 23-group/browser/A4 results are evidence for C, not BUG-28. Its accepted default-build exception does not turn BUG-28's future default build into a passed or waived check. No production-readiness or institutional roll-out claim is made.

## Delivery and handoff

Planning authorization is the owner's 1 November “accepted and go for the next task.” The owner subsequently approved D-1–D-4 without amendment (“approved.”), recorded before code at `d20c9b6`. Resume remaining verification through the [sole plan's exact handoff](plan.md#current-checkpoint--handoff); do not ask for that implementation approval again. Feature acceptance/local merge remain pending. GitHub issue #28 status remains the dated remote snapshot until an agreed synchronization boundary.
