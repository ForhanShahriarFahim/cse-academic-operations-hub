# BUG-28 — At most one active academic term

Issue: [#28](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/28). Status: **Accepted on 1 November 2026 with the disclosed default-build exception.**
Updated: 1 November 2026, Asia/Dhaka. Implemented at `fd08ee0`; actual acceptance is recorded in the sole plan. AC-08 remains partial for the accepted default-build delivery exception; build policy is unchanged. [Sole plan/checklist](plan.md), [inspection and verification](verification.md), [state sketches](review-states.md).

## Problem and inspected baseline

The [SAFE-01 F-09 finding](../../operations/SAFE-01-mutation-inventory.md) remains reproducible on local main `f09df27`, after ROM-01C acceptance/merge `0dc096c`. `academic_terms.status` is non-null free text with default `active`; only the primary key is unique. There is no database guard against two active terms. [In-memory baseline evidence](inspection.json) uses the original table DDL and two synthetic inserts omitting status: both succeed as active. This reproduces the schema defect, not production loader behavior or an institutional census.

Five production query sites use `status = 'active' LIMIT 1` independently: `getActiveTerm` and `getTermPublicationState` in `src/lib/data.ts`, `getPublicRoutineData` in `src/lib/public-routine.ts`, `isInActiveTerm` in `src/lib/term-scope.ts`, and `getTeacherReferences` in `src/lib/teacher-data.ts`. They can conceal ambiguity in scheduling, attendance, claims, publication, teacher deactivation and public output. Ordering the rows would merely choose one; it would not enforce the invariant.

No production term create/edit/activation action was found. The source seed explicitly inserts one active term. Synthetic fixtures use `draft`/`completed` and an explicit switch helper which updates statuses inside one transaction; that is test infrastructure, not approved institutional lifecycle policy. `prepareDatabase` migrates before checking whether any terms exist; only an entirely empty term table triggers its existing seed. `migrateDatabase` also performs the earlier time-grid backfill after migrations. Portal layout currently catches any summary failure and displays the hard-coded Summer 2026 name/draft status, which can misrepresent missing or ambiguous configuration.

Inspection read code, documentation and installed Next.js guides; it did not open institutional storage or reconcile GitHub. Last remote issue-state snapshot remains 26 October. Source requirements distinguish academic terms from semesters and require preservation of attendance, policies, placements and frozen publications; they do not identify which real term should be active now.

## Outcome and scope

Enforce **at most one active term across the whole database**, make ambiguous selection refuse safely, and provide a read-only operator diagnostic. Preserve every term and its dependants.

Included: forward migration and matching Drizzle index; explicit zero/one/multiple resolution for the five sites; narrow unavailable-state handling at their existing page/action/export boundaries; a target-aware read-only diagnostic and duplicate-resolution runbook; synthetic adapter, history, migration/recovery and real concurrency evidence.

Excluded: term creation/editing/activation UI or mutation CLI; automatic status repair; choosing an institutional active term; changing the existing status default, allowed non-active status strings or dates; term/cohort rollover; historical-term selection; generic writer-versus-term-switch serialization; BUG-25 publication/version races; unrelated error-boundary cleanup; institutional migration/remediation, remote synchronization, runtime/dependency/bundler changes. SET-01A and BAT-01 keep their own approvals. Parent #5 remains open after C.

## Required behavior and proposed decisions

### D-1 — Global invariant and zero-active state

The exact stored value `active` identifies the active term. A partial unique index on status where `status = 'active'` permits zero or one matching row globally, independent of academic year, overlapping dates or department. Many non-active rows remain valid; preserve their status strings verbatim. Do not add a status enum or normalize strings. The existing `active` default remains: an implicit second active insert must refuse rather than change the default silently. No automatic selection by date, latest ID, year, name or published version.

Zero active terms is a valid database state, not permission to seed or activate. Required term-scoped reads/writes cannot proceed. Public loaders return their existing no-publication result; public CSV remains 404 when there is no active term/publication. Auth and term-independent operations retain their current access rules. The existing empty-database preparation behavior is not expanded to populated databases with zero active terms. Remove the runtime instruction to “run the seed” from the missing-active-term error; populated institutional data must never be reset to resolve configuration.

### D-2 — Populated migration and explicit remediation

Add the next forward migration (expected `0013` if the journal is unchanged), with matching schema metadata. Within the migration transaction, lock `academic_terms` against concurrent inserts/status writes, inspect duplicate active rows, then create the partial unique index. If more than one is active, abort with a recognizable configuration error directing the operator to the read-only diagnostic. No term status, date, dependant, audit or publication is rewritten to make the migration pass. The failed BUG-28 migration and its journal entry must not commit. Verify lock/transaction behavior through the actual migrators on both adapters; do not infer it from a SQL sketch.

Provide `npm run db:check-terms -- --show-target` as a database-free target preview, using BUG-24's environment/target contract. Running `npm run db:check-terms` opens only the explicitly resolved target, reads term identity/status metadata, reports zero/one/multiple active terms and exits 0 for zero/one or a documented nonzero code for duplicates. It must work on the pre-0013 table, perform no migrate/prepare/seed/backfill/write, redact credentials and close its connection. Read failures exit nonzero without exposing credentials. It is an operator command, not a new public endpoint or portal permission.

Runbook: stop application and other writers; name/confirm the target and take/verify a cold or encrypted backup using the existing recovery contract; run the read-only diagnostic; present all active IDs/names/dates and the proposed exact status mapping to the owner. **The owner chooses which term, if any, remains active and explicitly approves each other replacement status plus the reason before remediation.** This specification supplies no such mapping. A later separately authorized, audited transaction must re-read/lock the reported rows and abort on changed evidence; preserve all unrelated rows and snapshots. Verify on a disposable restored copy first, then separately authorize any real operation. Re-run the diagnostic and migration, verify history, and retain the original backup. No generic repair command, executable institutional UPDATE recipe, institutional backup/migration or actual status change is part of this delivery.

### D-3 — Shared resolution and truthful consumer behavior

Use one server-only resolution contract, returning none, one row, or ambiguity. Read at most two active rows to detect ambiguity without arbitrary selection. Accept the current transaction/reader in `getTeacherReferences`; do not escape its transaction. Do not cache an active-term choice across requests. Unexpected database errors remain unexpected failures; never translate connection failure into “no active term.”

| Consumer | Zero active | One active | Multiple active on legacy/invalid storage |
| --- | --- | --- | --- |
| Required `getActiveTerm`/portal data | Typed configuration refusal, no seed instruction | Existing row and projections | Typed ambiguity refusal; never return a row |
| Shell summary/layout | Neutral “No active term”; suppress publication/draft claim | Existing name/version | “Academic term unavailable”; suppress any term/version/draft claim |
| Public loader/view/official print | Existing no-publication state | Existing immutable publication rules | Unavailable notice; no routine, term IDs, duplicate names, operational evidence or export/print actions |
| Public CSV | Existing 404 | Existing CSV | 503 JSON with generic unavailable message, no attachment/CSV bytes, no-store |
| Internal CSV, after authorization | 503 configuration response, no attachment | Existing CSV | 503 configuration response, no attachment; preserve 401/403 precedence |
| `isInActiveTerm` | False for an existing term-owned row | Compare owning term to the sole active ID | False for an existing term-owned row; do not compare to either duplicate |
| Teacher references | Keep complete any-term totals/history; empty active-term section labeled “No active term” | Existing references, including under transaction | Refuse the whole reference result; never certify no active work for deactivation |

Term-independent and missing-record behavior of `isInActiveTerm` remains as documented; it is not a new authorization bypass. Existing term-dependent actions in `actions.ts`, `academic-actions.ts`, `time-grid-actions.ts`, and teacher lifecycle actions consuming references must refuse before any business/audit write if required resolution is absent/ambiguous. Map typed configuration failures to an existing unsuccessful ActionResult with useful safe feedback; retain role checks first, form values, existing stale/missing/other-term results and atomic rollback. Do not swallow redirects/permission exceptions or unrelated database failures. Actions without a term dependency keep their current contract. Enumerate and verify these boundaries during implementation, including publication and automatic/bulk writers consuming portal data.

The internal shell remains navigable to account/access and existing global management pages; dependent pages may use the existing error boundary, with the shell's specific configuration notice visible. Account/sign-out must stay usable. Do not expose database paths, SQL, repair steps or raw errors in product notices. Public pages explain temporary unavailability and suggest returning later. No new institution-level activation workflow is implied by the notice. [State sketches](review-states.md) define the small UI delta at desktop/390/320 and print.

### D-4 — Concurrency, history and verification boundaries

A committed second active insert or status update must fail through the database constraint, even for raw SQL and two independent PostgreSQL connections. Test both commit orders for competing draft-to-active updates, explicit active inserts, omitted-status inserts and a mixed insert/update; test rollback releasing the contender. Failed statements leave their transaction with no committed partial changes. Multiple non-active rows, zero-active transitions and a deliberate fixture-only deactivate-then-activate transaction remain possible. No trigger automatically deactivates another term.

Migration serializes with pre-existing status writers: a duplicate writer committed before migration makes it refuse; migration committed first makes the writer refuse. Prove with deterministic barriers/lock observation, not timing-only assertions. PGlite proves constraints, actual migration atomicity and populated recovery; independent-connection races require real PostgreSQL. A failed duplicate upgrade preserves rows and migration position; a valid populated upgrade preserves full term statuses, historical business rows, audit history and frozen snapshot/output fingerprints. Reapply migrations and verify stable data. Exercise pre-upgrade backup/restore to a separate disposable target on both adapters.

Legacy ambiguity behavior must be exercised using a deliberately pre-0013 synthetic fixture, since the new index prevents the invalid state in normal upgraded storage. No production constraint-disabling path is added. Existing two-term history and ROM-01A/B/C safety checks remain valid. No guarantee about an in-flight write racing a future activation workflow is claimed; that protocol belongs to SET-01A. The default build is still required for this issue; C's accepted exception does not carry over.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | Zero/one active allowed, second explicit/default insert or update refused; non-active strings/default/history preserved | Schema/index inspection and actual SQL on PGlite/PostgreSQL |
| AC-02 | Populated clean upgrade/reapply preserves business/status/audit/snapshot rows; duplicate upgrade refuses without BUG-28 journal/data commit | Actual migrators, before/after fingerprints, restored disposable copies on both adapters |
| AC-03 | Five query sites use shared none/one/ambiguous behavior; required/optional/transaction readers follow D-3 | Pure classification plus real production loaders on zero/one/pre-upgrade duplicate fixtures; query-site audit |
| AC-04 | Term-dependent direct actions refuse unavailable context with no data/audit changes; historical/denied/stale and global flows retain their contracts | Production-action matrix for all affected entry points, role precedence, teacher deactivation rollback and two-term history |
| AC-05 | Contending activation/insert and migration/writer cases have D-4 outcomes with no second committed active row | Deterministic real PostgreSQL two-connection checks in both orders and rollback variants |
| AC-06 | Diagnostic preview never opens a DB; live synthetic diagnostics are read-only, close resources and redact credentials; remediation requires an actual mapping | Command/environment spies, pre-migration PGlite/PostgreSQL runs, runbook review |
| AC-07 | Honest shell/public/export unavailable states and unchanged valid published projections; no private/raw diagnostic leakage | Production desktop/390/320 browser, keyboard/axe and CSV/status checks; unavailable print and valid A4/public output parity |
| AC-08 | Final required checks and issue safety groups recorded accurately; owner reviews runnable result before local merge | Typecheck/lint/domain/default build/full safety with PostgreSQL; verification receipt and actual acceptance |

## Decisions and sources

Owner approved D-1–D-4 together on 1 November (“approved.”), directly following the proposal `0d2c9f5`: global at-most-one (zero allowed), no status/default/lifecycle redesign, refuse duplicate migration with owner-selected remediation outside this delivery, shared safe reads/feedback and bounded concurrency/history checks. No amendments were requested. No decision is needed about an actual institutional active ID to implement this package; no institutional census was performed. The sole plan records actual authorization.

Sources: [SAFE-01 finding](../../operations/SAFE-01-mutation-inventory.md), [requirements](../../PRODUCT_REQUIREMENTS.md), [decisions](../../decisions/INSTITUTIONAL_DECISIONS.md), [local delivery sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md), `src/db/schema.ts:226`, `drizzle/0000_pretty_lady_vermin.sql:1`, the five query sites listed above, `src/db/migrate.ts`, `src/db/prepare.ts`, `src/db/command.ts`, `src/db/target.ts`, and `scripts/safety/fixture.ts`. A further material scope/behavior change returns for owner decision.
