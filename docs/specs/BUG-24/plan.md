# BUG-24 — Implementation plan

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24).
Specification: [spec.md](spec.md). Verification: [verification.md](verification.md).
Status: T-01–T-03 implemented; T-04 validation in progress. Owner inspection/acceptance and local merge pending.
Branch/base: `codex/bug-24` from `main` at `0b1e055`.
Updated: 26 October 2026, Asia/Dhaka.

## Inspection and proposed approach

Use a small database-free environment/target boundary, not a general CLI framework. Keep the existing target/reset helpers. Add `@next/env` directly at the installed Next version; remove early `dotenv/config` imports in production entry paths. Inspect whether the direct dotenv dependency remains needed after that; do not churn unrelated packages.

Make CLI bootstrap ordering explicit. Parse preview/mode and print the target before dynamically importing the database-dependent implementation. In particular, `prepare.ts`, `migrate.ts` and `bootstrap-admin.ts` currently import modules that instantiate the singleton at module evaluation, so merely adding a banner inside `main()` is insufficient. Preserve callable `migrateDatabase`/seed behavior used by safety children; module import is not permission to execute a CLI. Add a wrapper only where it makes that ordering clearer.

Resolve `predev`/`prestart` mode before file loading. Next runtime keeps its own loaded environment; shared database code must not load test/development files over it. Keep process-pinned values and build-worker memory behavior. Test fresh processes to avoid loader caches disguising precedence defects.

Replace T-01's assertion of divergent supported entry paths with assertions of parity. A legacy early-dotenv simulation may remain only as clearly labeled historical characterization, not a passing production contract. Keep parent safety modules free of application DB imports; probes live in controlled children. If loader parity changes a fixture's old assumption about `.env.local` in test mode, update that fixture to declare its intended mode instead of weakening pinning.

## Approval record

- Planning/workflow authorization: the owner's 26 October 2026 request to analyze prior plans/GitHub, create a concrete local-first plan, and prepare detailed small parts.
- BUG-24 implementation authorization: **Approved for the next session**, 26 October 2026 (Asia/Dhaka). After the concrete spec/plan at `960d5d3` were presented for approval, the owner instructed: "commit and then I will start a session and implement  BUG-24". This authorizes committing the presented contract and proceeding with BUG-24 in the next session; it does not request implementation in this session.
- Approved scope: spec AC-01–AC-09, the mode/preview contract and T-01–T-05 below, as presented at `960d5d3`; no institutional database operation. Final implementation acceptance and local merge remain separate gates.
- Material amendments: none. Approval of this unchanged scope persists into the next session; do not ask for it again.

## Primary task checklist

- [x] P-01 — Inspect prior plans, GitHub and current code; reproduce target divergence without opening a database. Record the local-first agreement and delivery sequence.
- [x] P-02 — Prepare detailed specification, implementation breakdown and inspection evidence for owner review.
- [x] G-01 — Owner approved the presented BUG-24 scope on 26 October 2026; approval is recorded in this documentation-only checkpoint before application changes.
- [x] T-01 — Implement the database-free mode/environment/target boundary using the supported Next loader; direct dependency and focused precedence/pinning tests. Covers AC-01–AC-03, AC-05. Depends on G-01.
- [x] T-02 — Refactor the four CLI entry paths to preview/banner before client import; remove conflicting helper imports and preserve imported migration/seed contracts. Covers AC-01, AC-03–AC-06. Depends on T-01.
- [x] T-03 — Add controlled-child regression checks across entry paths and modes; prove no-open preview/refusal, redaction and hostile-file isolation. Retain BUG-26 and auth/bootstrap regressions. Covers AC-01–AC-07. Depends on T-02.
- [ ] T-04 — Run required final checks on final code, inspect the diff and update README/runbook/brief where behavior changed. Record acceptance mapping and exact owner review commands. Covers AC-06–AC-08. Depends on T-03.
- [ ] T-05 — Show the result for owner inspection, address findings, obtain acceptance, commit evidence and merge into local `main`. Suggest ROM-01A for a new session. No GitHub write/sync unless requested. Covers AC-09. Depends on T-04 and actual acceptance.

T-01–T-04 are technical chunks of one bounded delivery; they are not separate branches or independently accepted features. They may continue across sessions on the same branch. One checklist lives here.

## Verification and delivery

- Focused: new environment/preview regression checks, T-01 isolation, BUG-26 reset and relevant bootstrap/account safety children. Use synthetic `.env*` files in owned scratch; never edit the real files to reproduce precedence.
- Final: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, and `npm run test:safety` with `SAFE01_PG_BIN` for the PostgreSQL groups. Missing tools mean pending, not pass. Avoid unnecessary repeat full runs after unchanged code.
- Browser: no changed user-facing flow, so no new screenshot suite. Run the existing UX review-harness checks if environment changes affect it; verify synthetic review pinning. Do not launch `dev`, `start`, `test:ui` or `db:*` against the configured institutional database.
- Owner inspection: database-free previews on an explicitly pinned disposable target, the precedence matrix output, reset refusal, and the verification table. Provide exact PowerShell commands after implementation. Never supply an institutional reset command.
- Migration/recovery: no schema change. Existing PGlite/PostgreSQL recovery and history groups must remain green. Institutional storage needs no operation.
- Local checkpoints: commit this proposed package as proposed; after approval, commit the actual approval record before implementation. No routine push/PR/comment. Local merge waits for owner acceptance.

## Current checkpoint / handoff

- Scope: approved as presented at `960d5d3`; approval checkpoint `e0d823e` precedes implementation. No material amendment.
- Branch/base: `codex/bug-24` / `0b1e055`. One checkout/writer, no worktree, no schema or institutional data operation.
- Implemented: shared Next environment loader/mode validation and redacted target validation; four CLI banners/previews before database import; lazy callable migration/prepare/seed helpers; bootstrap implementation behind an entry wrapper; direct matching `@next/env` dependency, unused direct dotenv removed; synthetic regression group and operator documentation.
- Evidence: [verification](verification.md). BUG-24 environment (80 matrix/preview cases plus guards), SAFE-01 isolation/recovery, typecheck, lint, domain and UX harness checks pass. Full PGlite/PostgreSQL suite continues. Default Turbopack build fails at CSS worker IPC startup on both Node 22.11 and bundled Node 24.22.1; documented Webpack check is in progress. No change to the build script or runtime installation.
- Next action: finish T-04, inspect the final diff, commit remaining verification/handoff evidence, and present the safe preview block for owner inspection. T-05 merge waits for actual acceptance; do not infer it from implementation authorization.
- Blockers/limitations: default Turbopack build failure is unresolved; do not mark it passed. No remote synchronization due. Reuse the dated GitHub snapshot unless new uncertainty or an owner request warrants another read.
- Next suggested feature after accepted merge: ROM-01A inspection/specification and mockups, not automatic room implementation.
