# PERF-01 — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md).
Status: **Accepted by the owner on 16 November 2026; local `main` merge follows this acceptance commit.**
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
- **PERF-01 delivery accepted, 16 November 2026 (Asia/Dhaka).** After delivery `3ff7c68`, the owner said “Go for the next task.” and, asked explicitly how to proceed given that the default Turbopack build still fails while the separate Webpack build passes, selected **“Accept, merge, plan CRS-01B”**. This accepts PERF-01 including the default-build failure (AC-08 partial), authorizes the bounded local `main` merge and authorizes CRS-01B inspection/specification only. The accepted build exception is specific to PERF-01 and does not change build policy. CRS-01B implementation, institutional operations and remote synchronization are not authorized.

## Tasks — one checklist

- [x] T-01 — Inspect post-CRS-01A base, current requirements/review/source seams, installed Next guidance and existing safety harness. Define scope, D-1–D-4, measurable parity/cardinality criteria and this plan. Planning-document checks are in verification.
- [x] T-02 — Owner “Approve and implement” recorded on 16 November; commit this approved plan before application/test implementation.
- [x] T-03 — Both unchanged-base adapter receipts captured at/after baseline checkpoint `8d28335`; deterministic fixture correction recaptured original source before final comparison. Scoped SQL dependant/window reads and manual-create portal/audience reuse implemented; complete outputs and real row counts pass on both adapters. AC-01–02; broader AC-05–06 verification continues in T-05.
- [x] T-04 — All-term enrollment union pushdown and invocation-local snapshot read/digest reuse implemented. Both adapters prove overlap/empty cases, exact cohort/rollover fingerprint parity, fresh same-ID snapshot change and real stale confirmation. Existing both-adapter cohort races pass; remaining affected regressions are T-05.
- [x] T-05 — Typecheck/lint/domain, all 13 selected safety groups, 117 production browser captures and archived CSV/14-page A4 parity pass. Separate Webpack build passes; default Turbopack fails outside sandbox at CSS-worker startup, so AC-08 remains partial. Diff and representative images reviewed; execution corrections/limits are in verification.
- [x] T-06 — Bounded verified delivery committed at `3ff7c68` with runnable review/evidence; actual owner acceptance (including the failed default build) recorded on 16 November in the commit containing this line; local `main` merge and its receipt follow. #7 stays open. The owner's same answer started CRS-01B inspection/specification, not its implementation.

## Verification and delivery

Planning only: links/anchors, template/one-checklist completeness, source-content preservation and diff/whitespace checks. No database or application suites are needed for these documents. UI sketches are not applicable because behavior/layout do not change.

After approval, instrument actual returned rows and scoped helper calls in synthetic tests, not timing thresholds or tests that simply match query text. Preserve a baseline receipt from `d6e3cdb`; do not compare only two versions of the optimized implementation. Use complete projections/evidence plus real action outcomes. Prove preview/confirmation use separate fresh sources, including snapshot payload mutation under the same version ID and changed reference/status/aliases.

Add focused `PERF-01` safety groups for PGlite and PostgreSQL. Reuse `T-03` history (its existing group uses PGlite), `BUG-28`, `BAT-01A`, `BAT-01B`, `CRS-01A` and `ROM-01C` as relevant to touched loaders, evidence and locks. Broad suites only when a failure/change/uncertainty warrants them. Exercise real independent PostgreSQL connections for affected races, not Promise-only simulations. Use `F:/AI/tools/pgsql-17.11/pgsql/bin` where needed and harness-owned `.tmp/safe-01` storage only; never run institutional reset/preparation/start commands.

Required final code commands: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`. Record default Turbopack failures honestly; no bundler/dependency repair is approved. If needed, separate Webpack build uses the existing build-event/memory-only protections and can supply compiled UI review, not a default-build pass. Synthetic review should cover routine creation/conflict/inactive refusal, merged audiences, completeness and rollover preview/stale/confirmation at 1440/390/320, plus relevant CSV and native A4 parity. Reuse unchanged baseline captures only with an explicit applicability rationale.

Last remote reconciliation remains 11 November 2026. No remote synchronization is part of this package. Application delivery is local and requires separate owner acceptance before local `main` merge.

## Current checkpoint / exact handoff

- Branch `codex/perf-01`, base `d6e3cdb`, one writer/checkout. CRS-01A accepted/merged separately. Synthetic owner review is running at [control/sign-in](http://localhost:3127); [routine](http://localhost:3126/routine?stream=HSC&view=day&day=0&batch=all) after sign-in. No institutional target or remote operation.
- T-01–T-05 complete; proposal `f254962`, actual approval `a8cb252` precedes baseline `8d28335` and implementation `e5a0e31`. Final evidence/helper checkpoint is the commit containing this handoff; actual hashes/status come from Git. T-06 owner delivery acceptance remains pending.
- Next: owner inspects this committed delivery and explicitly accepts the remaining default-build failure if acceptable; record/commit actual acceptance before bounded local main merge. Separate Webpack build and compiled review pass. Do not request unchanged implementation approval again, silently accept the build failure or begin CRS-01B.
- Evidence: [verification.md](verification.md), including 2/20-term row/read/digest measurements, exact output/fingerprint parity, actual adapter/race checks and production UI/export/A4 receipts. Counts prove less transferred/repeated work, not a latency guarantee. AC-08 remains partial; no accepted PERF-01 build exception yet.

Next-session prompt: “Resume PERF-01 on codex/perf-01, base d6e3cdb. Read current brief/workflow and docs/specs/PERF-01/{spec,plan,verification}.md, then inspect actual Git state. Owner approved unchanged D-1–D-4 and implementation with ‘Approve and implement’ on 16 November, committed a8cb252 before baseline 8d28335 and code e5a0e31. T-01–T-05 are complete; typecheck/lint/domain, 13 safety groups and 117 browser captures pass, with archived CSV and 14-page A4 parity. Default Turbopack CSS-worker build fails; separate Webpack build passes (AC-08 partial). Support owner inspection/actual delivery acceptance, then record/commit it before a bounded local main merge. Do not repeat passing suites without changed code/failures/uncertainty. No global cache/parser/schema/index/UI changes, institutional migration 0017/0018 or database operation, extra writer/worktree, remote sync or automatic CRS-01B. Keep #7 open.”

Restart owner review if stopped: set `PERF01_REVIEW_PHASE=after`, then `node node_modules/tsx/dist/cli.mjs scripts/review-courses.ts --serve` after the verified Webpack build. Control/sign-in `http://localhost:3127`; application `http://localhost:3126`. The launcher owns a disposable PostgreSQL cluster; restarting creates a fresh synthetic fixture. `--routine-check --serve` adds the focused routine matrix; full `--check --serve` also reruns the catalog matrix. Neither is necessary simply to inspect the already-verified delivery. Do not use institutional `dev`, `start` or `db:*` commands.
