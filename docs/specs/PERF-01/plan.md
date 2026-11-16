# PERF-01 — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md).
Status: **Approved; implementation in progress.**
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
- **PERF-01 implementation approved, 16 November 2026 (Asia/Dhaka).** Owner replied **“Approve and implement”** after proposal `f254962` presented this specification, D-1–D-4 and sole checklist. This authorizes unchanged implementation and verification scope; delivery acceptance remains separate. This approval checkpoint precedes application/test implementation.
- No remote issue, push/PR, institutional operation, extra worktree/writer or CRS-01B authorized. Unchanged approval, once obtained, persists across handoffs.

## Tasks — one checklist

- [x] T-01 — Inspect post-CRS-01A base, current requirements/review/source seams, installed Next guidance and existing safety harness. Define scope, D-1–D-4, measurable parity/cardinality criteria and this plan. Planning-document checks are in verification.
- [x] T-02 — Owner “Approve and implement” recorded on 16 November; commit this approved plan before application/test implementation.
- [x] T-03 — Both unchanged-base adapter receipts captured at/after baseline checkpoint `8d28335`; deterministic fixture correction recaptured original source before final comparison. Scoped SQL dependant/window reads and manual-create portal/audience reuse implemented; complete outputs and real row counts pass on both adapters. AC-01–02; broader AC-05–06 verification continues in T-05.
- [x] T-04 — All-term enrollment union pushdown and invocation-local snapshot read/digest reuse implemented. Both adapters prove overlap/empty cases, exact cohort/rollover fingerprint parity, fresh same-ID snapshot change and real stale confirmation. Existing both-adapter cohort races pass; remaining affected regressions are T-05.
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
- T-01–T-04 complete; proposal `f254962`, actual approval `a8cb252` precedes baseline `8d28335` and application code. Implementation checkpoint is the commit containing this progress record. T-05 verification in progress; actual hashes/status come from Git.
- Do not request unchanged implementation approval again. Complete T-05 (affected regressions, compiled browser/CSV/A4 and final review), then present delivery for T-06 acceptance. Default Turbopack build fails at CSS-worker startup outside the sandbox; separate Webpack preview is being built, not a default-build pass.
- Limitations: static inspection is not profiling; 2/20-term metrics, parity, adapter/race checks and UI checks are pending implementation. Default build has a known inherited failure, not an accepted PERF-01 exception.

Next-session prompt: “Resume PERF-01 on codex/perf-01, base d6e3cdb. Read current brief/workflow and docs/specs/PERF-01/{spec,plan,verification}.md. Inspect actual Git state and approval record. Owner approved unchanged D-1–D-4 and implementation on 16 November with “Approve and implement”, after proposal f254962; approval checkpoint precedes application changes. Do not ask to repeat approval. Keep routine reads term-scoped but cohort safety all-term; use one manual-create portal load and one rollover-local fresh snapshot source with unchanged evidence/fingerprints. Capture unmodified-base synthetic measurements before optimization. No global/framework cache, parser/schema/index/UI changes, institutional operation, extra writer/worktree, remote sync or CRS-01B. Keep #7 open and report default-build failures separately.”
