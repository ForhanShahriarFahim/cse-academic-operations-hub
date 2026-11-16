# PERF-01 — Bound term reads and reuse operation-local evidence

Local package from F-11 in the [11 November review](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md#5-proposed-work-packages-ready-to-pick-up); before CRS-01B / #7. No new GitHub issue or synchronization requested.
Status: Approved for implementation on 16 November; actual owner authorization is in [plan.md](plan.md).
Updated: 16 November 2026, Asia/Dhaka.
Sole checklist/approval/handoff: [plan.md](plan.md). Inspection and check limits: [verification.md](verification.md).

## Problem and inspected baseline

Inspected local `main` at `d6e3cdb`, after CRS-01A acceptance `6dfad40` and merge `246d9fa`. One branch/writer/checkout: `codex/perf-01`. These are source observations, not an institutional census or measured latency regression.

| Evidence | Actual behavior |
| --- | --- |
| [Portal loader](../../../src/lib/data.ts) `loadPortalDataSnapshot` | Offerings/groups/placements are term-filtered, but all teaching-group links, requirements, meetings, meeting teachers/rooms and permitted windows are fetched. Assembly later drops unrelated rows. Historical terms therefore increase transferred/assembled input even for one active term. |
| [Meeting actions](../../../src/lib/actions.ts) `createMeetingActionInTerm` / `buildCandidateView` | Successful create validation loads the full portal once, then the candidate helper loads it again. Candidate audiences also issue one offering read per link. Other inspected actions already have one full load; this is not evidence that every action loads it repeatedly. |
| [Cohort evidence](../../../src/lib/batch-store.ts) `batchEvidence` | Loads every enrollment, then keeps the union of group references and home-student references in JavaScript. Reads all saved versions for each cohort. It hashes **referenced** snapshots, not every snapshot unconditionally; F-11's original wording overstates that part. |
| [Rollover](../../../src/lib/rollover-store.ts) `rolloverEvidence` | Calls cohort evidence separately for each graduation choice. Repeated version reads/digests occur inside the same review/commit operation; evidence is rebuilt for a new operation. |
| [Transaction/context](../../../src/db/index.ts), [term context](../../../src/lib/term-context.ts) | Ambient request-local transaction proxy, shared/exclusive context locks, nested savepoints and serial lazy reads on a transaction connection already exist. Replacing them with parallel queries or a global data cache would change safety semantics. |
| [Serialization](../../../src/lib/serialize.ts), [cohort snapshot parser](../../../src/lib/batch-records.ts) | Merged audiences, inactive retained records, captured labels, exact minutes, legacy schemas and uncertain snapshots have established behavior. Global dictionaries and all-term lifecycle evidence have different scopes from the active routine. |

## Outcome and scope

Term-dependent routine queries return only the chosen term's relational rows. Manual meeting creation reuses its one authorized portal read. Cohort evidence queries select only relevant enrollments, while rollover reads shared historical snapshots once per evidence operation. Visible results, permissions, conflicts, stale decisions and historical protection remain equivalent.

Included: those loader predicates, the private manual-candidate helper, cohort enrollment pushdown, rollover-local snapshot read/digest reuse, focused adapter measurements/parity tests and synthetic UI/export verification. New helper modules are allowed only for these seams and must preserve database-free import boundaries.

Excluded: new offerings/groups or CRS-01B/C features, route/component redesign, page-wide request memoization, persistent caches, framework cache configuration, general query-service refactoring, global dictionary trimming, room-maintenance or saved-version payload optimization, changes to catalog/room/teacher evidence rules, parser/schema changes, indexes/migrations, dependencies, PGlite bootstrap, bundler repair, production tuning/monitoring and institutional/remote operations. Further profiling findings are follow-ups, not authority to widen this package.

There is no material visual workflow change, so new UI mockups are not applicable. Existing desktop/mobile and applicable A4 projections remain the inspection baseline. No institutional policy decisions are needed for unchanged behavior.

## Required behavior

### Term-scoped reads

Capture and validate the existing active-term identity/generation under the existing cohort read lock. Scope links and requirements by their owning teaching group's term; meetings by the same owner; meeting teachers/rooms by their meeting's owning group. Use SQL joins/subqueries or equivalent predicates **before** transferring rows, without duplicating selected rows. Do not merely filter a full-table result in memory.

Preserve selected row shapes and membership, including inactive/cancelled rows before the existing projection filters. Do not add new active-course, teacher, group-status or meeting-status rules. A link to an inconsistent other-term offering remains selected by its owning group; existing offering-map behavior decides its projection. This slice does not repair inconsistent data or silently add a same-term-offering requirement. Empty groups/meetings must return empty dependants, never omit a predicate and fetch everything.

Select permitted windows with `term_id = captured term OR term_id IS NULL`; retain legacy global overrides, batch specificity and unknown-count behavior. Global departments/teachers/rooms/catalog/cohorts and global maintenance rows retain existing scope. Existing term-bound versions, publication normalization, privacy projection and seed-only entry restrictions remain intact. No-active/ambiguous/stale context still fails or explains exactly through the existing entry points; catalog access without an active term remains supported by its independent loader.

### One manual-create portal load

After existing authorization/input/term checks, load portal data once for manual create validation. Pass that typed object explicitly to the private candidate builder. Retrieve its linked offering records in one bounded query rather than one read per link, preserving audience membership, roles, counts and current-term placement semantics. Do not expose the object/helper as a new server action or accept browser-supplied trusted data.

Expected invalid/denied/stale outcomes must still avoid writes. Keep authoritative active-course/room/maintenance checks inside their existing write transaction, audit rollback, conflict calculation, locks, revalidation and response messages. No reuse after mutation, across requests, actors or term generations. Other actions are not required to load data they previously avoided, nor to remove a refresh that has a different consistency purpose.

### All-term cohort safety with bounded enrollment reads

Enrollment evidence remains the union of enrollments for any referenced group **or** any home student of the cohort, across every term/status, including external and merged students. Push exactly that union into SQL; overlapping branches return one enrollment. If both ID sets are empty, return no enrollments without an unrestricted query. Preserve enrollment ID order, reference keys/counts, aliases, lifecycle blockers and unknown snapshot refusal. Do not term-filter this safety query.

For a rollover evidence operation with graduation choices, load all saved versions once within that operation's existing transaction/lock. Pass an internal operation-local snapshot source to each cohort check. Lazily memoize a snapshot's existing SHA-256 payload digest by version identity only within that source, so one referenced version is hashed at most once per operation. A nonreferenced version need not be hashed. Retain the current parser and exact reference/fingerprint payload shape; no count-only/max-ID surrogate and no narrowing to source/destination terms. Snapshot parsing still examines each relevant cohort; this is bounded read/digest reuse, not a claim to eliminate all cohort-by-snapshot CPU work.

Create a fresh source for each preview or confirmation, after that operation's existing locks; never carry it across requests/transactions, preview into commit, or past any snapshot mutation. No graduation choices means no new snapshot read is needed. A direct single-cohort action/detail must continue working with freshly loaded evidence and without a required caller cache. Reuse must not add history/audit/private student fields to viewer payloads.

### Measurement and preservation

Use synthetic fixtures with one active term and historical noise at 2 and 20 total terms, plus multiple graduation candidates sharing a snapshot. Capture the unmodified approved base's outputs and read/digest counts before changing queries. Measure returned row counts for the six targeted reads (five relational families plus windows), portal load count, linked-offering query count and shared version-read/digest counts. Record adapter/query-plan or timing observations as diagnostic evidence; no machine-dependent latency threshold is a correctness gate, and fewer returned rows do not prove an index-only database plan.

Compare before/after complete portal projections for editor and view-only actors; preserve meaningful array order and byte-identical archived CSV/snapshot payloads. A stable comparison may normalize explicitly unordered fixture sets only; it must not hide missing/duplicate membership, privacy differences or exported ordering changes. Include active-empty terms, merged groups, external audiences, unscheduled/teacher-managed groups, multiple room/teacher roles, cancelled history, null global windows, active context changes, referenced inactive courses, unsupported snapshots, alias history and cross-term home-student enrollments.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | Targeted routine queries return only rows owned by captured-term groups/meetings; windows retain null/current terms. Selected row counts stay constant as unrelated historical rows grow from 2 to 20 terms. Global dictionaries are intentionally outside that bound. | Instrument real PGlite and PostgreSQL reader results; inspect SQL predicates/plans and empty cases. |
| AC-02 | Manual create validation invokes the full portal loader at most once; linked offerings use at most one bounded query. Allowed/denied/conflict/stale/inactive outcomes and audits agree with baseline. | Real action tests and call counters, including merged audiences and authoritative transaction checks. |
| AC-03 | Cohort enrollment query returns exactly the all-term group/home-student union, once per enrollment; unrelated enrollment rows are not transferred. | Both adapters; cross-department/other-term student and overlapping/empty ID sets. |
| AC-04 | Each rollover evidence invocation reads saved versions at most once, hashes each referenced payload at most once, and performs no added snapshot load without graduation choices. Fresh confirmation detects changes since preview; blockers/uncertainty/fingerprints remain equivalent. | Multi-cohort operation counters, old/new evidence equality, changed snapshot/reference tests and existing race scenarios on both adapters. |
| AC-05 | Portal, conflicts, automatic scheduling suggestions, workload, completeness, privacy and publication projections agree with baseline; historical rows/snapshots/claims/attendance are preserved. | Synthetic before/after fingerprints, T-03 history, projection/auto-schedule tests, exact archived CSV and A4 text/render parity. |
| AC-06 | Existing permission checks, active context generation, shared/exclusive lock order, savepoints, audit rollback and adapter serialization remain effective. | Focused BUG-28, BAT-01A/B, CRS-01A and room-maintenance safety groups; independent PostgreSQL race cases where affected. |
| AC-07 | Existing desktop/mobile routine creation, catalog completeness and rollover review/confirmation states remain usable, including keyboard/error/stale/denied paths. | Guarded production synthetic browser captures at 1440/390/320; relevant accessibility checks. No new UI design. |
| AC-08 | Typecheck/lint/domain/default build and focused checks have honest results linked to this revision. Any unresolved default-build failure remains a distinct delivery acceptance decision. | Required commands plus criterion evidence; separate Webpack preview does not count as default build passing. |

## Decisions and sources

Proposed decisions: **D-1** scope routine dependants by owning group/meeting and keep global dictionaries; **D-2** keep all-term safety and exact evidence while reusing snapshots only inside one operation; **D-3** use explicit helper inputs, no framework/persistent cache or transaction parallelization; **D-4** no schema/index/UI changes or latency promises, use returned-row/count and output-parity gates. These technical boundaries were approved together on 16 November (“Approve and implement”), recorded at `a8cb252` before application code; see the actual authorization and separate delivery gate in the plan.

Sources: [requirements invariants](../../PRODUCT_REQUIREMENTS.md#domain-invariants-and-hard-corner-cases), [ADR-001](../../architecture/ADR-001-academic-operations-boundaries.md), [local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md), [BAT-01A](../BAT-01A/spec.md), [BAT-01B](../BAT-01B/spec.md), [CRS-01A](../CRS-01A/spec.md). Historical F-11 is the proposal source, not approval or benchmark evidence. Institutional migration `0017`/`0018` and default-build investigation remain separate.
