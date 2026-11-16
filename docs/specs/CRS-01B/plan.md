# CRS-01B — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md). Design: [mockups/index.html](mockups/index.html).
Status: **Implemented; build and compiled browser review blocked and pending. Not ready for delivery acceptance.**
Branch/base: `codex/crs-01b` / `f0c4d8c` (local `main`).
Updated: 16 November 2026, Asia/Dhaka.

## Inspection and proposed approach

Follow the CRS-01A shape: pure rules in a records module, an injected-reader store that decides inside one transaction, thin guarded server actions, and server-rendered pages. No migration, no change to existing loaders' outputs, no general service rewrite.

| Seam | Bounded change after approval |
| --- | --- |
| `src/lib/auth/policy.ts` | Add `manage_offerings` to system and academic administrators. No other role changes. |
| `src/lib/offering-records.ts` (new) | Pure, database-free: slot basis (stream + semester), proposal with reasons, carried/added/dropped/changed comparison, status vocabulary, input parsing, fingerprints. Covered by `test:domain`. |
| `src/lib/offering-store.ts` (new) | Injected reader/transaction with type-only DB imports. Reads term, placements, cohorts, courses, offerings and group links for one term plus the chosen source term; decides start / add / cancel / restore / remove; writes offerings and audit events atomically. Shared context lock, then term row `for update`. |
| `src/lib/offering-data.ts`, `src/lib/offering-actions.ts` (new) | Authorized page loader (viewer payload vs editor payload), paged history, and server actions that accept each field once as text and map expected database conflicts to plain results. |
| `src/app/(portal)/terms/[id]/offerings/` (new), `src/components/offerings/` (new) | Page, start review, add form, change confirmations, history; loading and not-found states. Reuse existing form, feedback and dirty-form patterns. |
| `src/app/(portal)/terms/[id]/page.tsx`, `src/app/(portal)/courses/page.tsx` | Add links and an offering count. No other behavior change. |
| `scripts/safety/`, `scripts/verify-safety.ts`, `scripts/verify-db-free.ts` | Focused CRS-01B groups on both adapters, real PostgreSQL races, and the injected-import guard for the new store. |
| Guarded synthetic review tooling | Extend the existing review launcher with a prepared draft term fixture; reuse its auth, target guard and capture harness. |

Open point to confirm during T-03, not a scope change: the lock modes used by cohort lifecycle and rollover writers, so that offering writes serialize with them as the specification requires. If they do not already take the context lock exclusively, return to the owner before changing them.

No schema, backfill or recovery operation is proposed. Read the installed Next.js guidance for route handlers, server actions and revalidation before writing code.

## Approval record

- Owner on 16 November said “Go for the next task.” and, asked how to proceed, selected **“Accept, merge, plan CRS-01B”**. This accepted PERF-01 (`836f4fc`, merged `2156fac`, receipt `f0c4d8c`) and authorizes this inspection/specification package only.
- **CRS-01B implementation approved, 16 November 2026 (Asia/Dhaka).** After proposal `935b309` presented the specification, D-1–D-7, AC-01–AC-10, sole checklist and mockups, the owner replied **“Approve and implement”** with no amendments. This authorizes the unchanged implementation and verification scope; delivery acceptance remains separate. This approval checkpoint precedes application/test implementation.
- No remote issue update, push/PR, institutional operation, extra worktree/writer or CRS-01C authorized.

## Tasks — one checklist

- [x] T-01 — Inspect post-PERF-01 base, requirements, issue #7, schema, seed, rollover, catalog and term seams. Write scope, D-1–D-7, acceptance criteria, this plan and static mockups. Planning-document checks are in verification.
- [x] T-02 — Owner “Approve and implement” recorded on 16 November, no amendments; this approved plan is committed before application/test implementation.
- [x] T-03 — `manage_offerings` capability, pure `offering-records` module and domain tests pass. Neighbouring writers confirmed: cohort lifecycle, rollover commit and catalog writes all take the context lock exclusively; none needed changing. AC-03, part of AC-05.
- [x] T-04 — Store, actions and audit events implemented (`8e2c09c`). CRS-01B groups pass on PGlite and PostgreSQL with whole-database preservation fingerprints and real PostgreSQL lock races. AC-01, AC-04, AC-06, AC-07, AC-08 (data).
- [x] T-05 — Pages, forms, history and links implemented. Compiled browser review passes with 48 captures at 1440/390/320, axe and print. Its first run found that a failed validation cleared the start form's ticks; corrected in the forms' submit handling. Limits: one scripted keyboard assertion, loading skeleton not captured. AC-09, AC-05.
- [x] T-06 — Typecheck, lint, domain, the listed safety groups and the default `npm run build` pass. Archived CSV and preserved tables identical after the browser flow. Webpack build not run (not needed with a passing default build). AC-10.
- [x] T-07 — **Owner “Accept and merge” on 16 November after delivery `4b5aa75`; acceptance committed before the local `main` merge.** #7 stays open; CRS-01C is for the owner to start. Original task: Commit bounded verified delivery, provide runnable review and evidence, obtain actual owner acceptance (including any unresolved checks), record it, then merge locally. Update handoff; keep #7 open and leave CRS-01C for the owner to start.

## Verification and delivery

Planning only so far: links, template/one-checklist completeness, mockup rendering and diff/whitespace checks. No database or application suite is needed for these documents.

After approval: prove behavior with persisted results and whole-table before/after fingerprints on PGlite and PostgreSQL, not query-text matching. Use independent PostgreSQL connections for races. Reuse `T-03` history, `CRS-01A`, `BAT-01A`, `BAT-01B`, `BUG-28` and `PERF-01` groups where the touched seams overlap; run broad suites only when a failure or uncertainty warrants it. Use `F:/AI/tools/pgsql-17.11/pgsql/bin` and harness-owned `.tmp/safe-01` storage only; never run institutional `dev`, `start` or `db:*` commands.

Required final commands: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`. The default Turbopack build has failed at CSS-worker startup on recent deliveries; record its actual result and do not repair bundling under this plan. A separate Webpack build may supply the compiled review but is not a default-build pass.

Delivery is local. Last remote reconciliation remains 11 November 2026.

## Current checkpoint / exact handoff

- Branch `codex/crs-01b`, base `f0c4d8c`, one writer/checkout. Approval `e87cbce`; rules/store/actions `8e2c09c`; pages, review tooling and evidence in the commit containing this handoff. No schema, migration, seed or dependency change.
- **Accepted and merged (supersedes everything below):** owner “Accept and merge” on 16 November, acceptance `50b7588`, local `main` merge `e1e0644`, no conflicts, no tests repeated for merge. Branch retained. Next session is the owner's to start; CRS-01C needs its own specification and approval.
- **Resumed session, 16 November:** the old preview had already exited. Default build passes; the browser review found and this session corrected a tick-clearing defect in the start form, then passed with 48 captures. Evidence in [verification.md](verification.md). **Next:** owner inspects (`node node_modules/tsx/dist/cli.mjs scripts/review-offerings.ts --serve`, http://localhost:3127) and accepts or returns corrections; record the actual acceptance, then merge into local `main`. Do not start CRS-01C; keep #7 open.
- Earlier: stop the old PERF-01 preview (end its `next start`, PID 12836 at the time of writing, or close its terminal; its launcher then removes its own disposable cluster). Then on unchanged code run the default `npm run build` and record its real result; run the separate Webpack build; run `node node_modules/tsx/dist/cli.mjs scripts/review-offerings.ts --check --serve` and fix first-run issues in the never-executed browser script; record captures and CSV/A4 parity; only then ask for delivery acceptance. Do not start CRS-01C.
- Blocked detail and exact commands: [verification.md](verification.md#blocked-checks).

Next-session prompt: “Resume CRS-01B on codex/crs-01b, base f0c4d8c. Read the current brief/workflow and docs/specs/CRS-01B/{spec,plan,verification}.md, then inspect actual Git state. Owner approved unchanged D-1–D-7 with ‘Approve and implement’ on 16 November (e87cbce). T-01–T-04 are complete; T-05/T-06 are partly done: typecheck, lint, domain and CRS-01B/CRS-01A/T-03/BAT safety groups pass on both adapters, and the list page is server-render checked. NOT done: default npm run build, Webpack build, compiled browser review (scripts/review-offerings.ts --check --serve; its browser script has never run), keyboard/axe/captures and CSV/A4 parity — they were blocked by the still-running PERF-01 preview on ports 3126/3127. Confirm with the owner that the old preview may be stopped, finish those checks, record honest results including any default-build failure, then request delivery acceptance before a local main merge. No schema change, institutional migration 0017/0018 or database operation, extra writer/worktree, remote sync or automatic CRS-01C. Keep #7 open.”
