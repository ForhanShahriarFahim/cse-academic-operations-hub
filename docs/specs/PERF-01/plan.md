# PERF-01 — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md).
Status: **Proposed; owner authorized planning only.**
Branch/base: `codex/perf-01` / `d6e3cdb9d86bcce37ac583313c67f1de7d672c9d` (local `main`).
Updated: 16 November 2026, Asia/Dhaka.

## Inspection and proposed approach

Keep the existing loaders' output contracts and lock boundaries. Apply SQL predicates to dependent routine reads, pass one portal object into the private create helper, push down the cohort enrollment union, and share version reads/lazy digests only inside a single rollover evidence invocation. Retain all-term snapshot parsing and existing fingerprints. No general caching/service rewrite or new migration.

| Seam | Bounded change after approval |
| --- | --- |
| `src/lib/data.ts` | Scope links/requirements/meetings/teacher-room dependants by captured-term owner; null/current windows. Preserve dictionary/version/maintenance scope, returned shapes, `cohortRead` and final generation assertion. |
| `src/lib/actions.ts` | Give private `buildCandidateView` the already authorized portal object; replace linked-offering N+1 read with one bounded query. Keep authoritative transactional checks and all public signatures. |
| `src/lib/batch-store.ts` | SQL group/home-student enrollment union with empty guard; optional internal snapshot evidence source, defaulting to fresh reads for independent callers. Preserve exact fingerprint/reference order and parser behavior. |
| `src/lib/rollover-store.ts` | Create the snapshot source once only when graduation decisions need it, within the current evidence invocation/lock. Discard after that call; preview and confirmation create separate sources. |
| `scripts/safety/`, `scripts/verify-safety.ts` | Focused PERF-01 real-reader/action/counter/parity fixtures on both adapters; reuse existing owned-target, fingerprint and race helpers. Extend `verify-db-free.ts` if injected helpers are added. |
| Guarded synthetic review tooling | Reuse existing fixture/auth/production launch patterns for unchanged routine/rollover/catalog flows. Add only missing criterion evidence; do not import the configured database before target guards. |

Queries on a transaction connection remain serial through the existing adapter helper. Dependent group/meeting sets can use SQL subqueries/joins rather than unbounded ID lists; the actual implementation must prove cardinality and output equivalence. Any need for indexes, parser changes, different fingerprint semantics, global caching or policy/visual changes returns to the owner as scope, not routine cleanup.

No database schema/backfill/recovery operation is proposed: this is a read/helper optimization. Disposable populated-fixture preservation fingerprints and existing migration-capable harness setup still apply. No institutional store or environment is opened. Migration/restore suites need not be repeated solely for unchanged schema; adapter/transaction/history checks remain required.

## Approval record

- Owner on 16 November selected **“Accept, merge locally, and plan PERF-01”** after the explicit CRS-01A delivery question. This authorizes CRS-01A acceptance/local merge and this inspection/specification package.
- CRS-01A is accepted at `6dfad40`, merged at `246d9fa`; merge receipt/base `d6e3cdb`. Accepted default-build exception is specific to CRS-01A, not future delivery acceptance.
- **PERF-01 implementation approval: pending.** Present the concrete spec, D-1–D-4 and this checklist. Record actual approval and commit it before any application/test implementation. A proposed-doc checkpoint does not establish approval.
- No remote issue, push/PR, institutional operation, extra worktree/writer or CRS-01B authorized. Unchanged approval, once obtained, persists across handoffs.

## Tasks — one checklist

- [x] T-01 — Inspect post-CRS-01A base, current requirements/review/source seams, installed Next guidance and existing safety harness. Define scope, D-1–D-4, measurable parity/cardinality criteria and this plan. Planning-document checks are in verification.
- [ ] T-02 — Obtain actual scope/D-1–D-4 approval, record it and commit approved plan before implementation.
- [ ] T-03 — On the approved unchanged base, capture synthetic 2/20-term outputs/read counts and multi-cohort snapshot/evidence baseline using owned targets; then implement scoped routine reads and manual-create helper reuse. AC-01–02, AC-05–06.
- [ ] T-04 — Implement enrollment union pushdown and rollover-local snapshot read/digest reuse. Keep independent callers fresh and all-term evidence exact. Prove counters, empty/overlap cases, unchanged fingerprints and freshness/races. AC-03–06.
- [ ] T-05 — Run required typecheck/lint/domain/default build, focused both-adapter checks/history, guarded compiled desktop/mobile/keyboard/accessibility flows and relevant archived CSV/A4 parity. Review diff, correct findings and record exact evidence/limitations. AC-01–08.
- [ ] T-06 — Commit bounded verified delivery, provide runnable review/evidence, obtain actual owner acceptance (including unresolved checks), record it, then merge locally. Update handoff; keep #7 open and leave CRS-01B for the owner to start.

## Verification and delivery

Planning only: links/anchors, template/one-checklist completeness, source-content preservation and diff/whitespace checks. No database or application suites are needed for these documents. UI sketches are not applicable because behavior/layout do not change.

After approval, instrument actual returned rows and scoped helper calls in synthetic tests, not timing thresholds or tests that simply match query text. Preserve a baseline receipt from `d6e3cdb`; do not compare only two versions of the optimized implementation. Use complete projections/evidence plus real action outcomes. Prove preview/confirmation use separate fresh sources, including snapshot payload mutation under the same version ID and changed reference/status/aliases.

Add focused `PERF-01` safety groups for PGlite and PostgreSQL. Reuse `T-03` history (its existing group uses PGlite), `BUG-28`, `BAT-01A`, `BAT-01B`, `CRS-01A` and `ROM-01C` as relevant to touched loaders, evidence and locks. Broad suites only when a failure/change/uncertainty warrants them. Exercise real independent PostgreSQL connections for affected races, not Promise-only simulations. Use `F:/AI/tools/pgsql-17.11/pgsql/bin` where needed and harness-owned `.tmp/safe-01` storage only; never run institutional reset/preparation/start commands.

Required final code commands: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`. Record default Turbopack failures honestly; no bundler/dependency repair is approved. If needed, separate Webpack build uses the existing build-event/memory-only protections and can supply compiled UI review, not a default-build pass. Synthetic review should cover routine creation/conflict/inactive refusal, merged audiences, completeness and rollover preview/stale/confirmation at 1440/390/320, plus relevant CSV and native A4 parity. Reuse unchanged baseline captures only with an explicit applicability rationale.

Last remote reconciliation remains 11 November 2026. No remote synchronization is part of this package. Application delivery is local and requires separate owner acceptance before local `main` merge.

## Current checkpoint / exact handoff

- Planning branch `codex/perf-01`, base `d6e3cdb`, one writer/checkout. CRS-01A acceptance/merge complete; review remains synthetic at `http://localhost:3127` while its launcher is running.
- T-01 complete; T-02 is the next gate. No application/test/schema/seed/dependency changes or PERF-01 performance runs. The planning checkpoint is the commit containing this package; obtain actual hash/status from Git.
- Present D-1–D-4 and request implementation approval. No repeated approval of CRS-01A is needed. If approved, record/commit approval, capture base measurements before changing queries, then proceed autonomously through the approved tasks.
- Limitations: static inspection is not profiling; 2/20-term metrics, parity, adapter/race checks and UI checks are pending implementation. Default build has a known inherited failure, not an accepted PERF-01 exception.

Next-session prompt: “Resume PERF-01 on codex/perf-01, base d6e3cdb. Read current brief/workflow and docs/specs/PERF-01/{spec,plan,verification}.md. Inspect actual Git state and approval record. Owner authorized planning on 16 November; implementation remains pending unless actual later approval is recorded. Keep routine reads term-scoped but cohort safety all-term; use one manual-create portal load and one rollover-local fresh snapshot source with unchanged evidence/fingerprints. Capture unmodified-base synthetic measurements before optimization. No global/framework cache, parser/schema/index/UI changes, institutional operation, extra writer/worktree, remote sync or CRS-01B. Keep #7 open and report default-build failures separately.”
