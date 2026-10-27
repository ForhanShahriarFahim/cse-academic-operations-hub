# BUG-24 — Implementation plan

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24).
Specification: [spec.md](spec.md). Verification: [verification.md](verification.md).
Status: Owner accepted delivery on 27 October 2026 after the default-build limitation was disclosed. T-04 complete with that recorded exception; local merge authorized and pending.
Branch/base: `codex/bug-24` from `main` at `0b1e055`.
Updated: 27 October 2026, Asia/Dhaka.

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
- Delivery acceptance: 27 October 2026 (Asia/Dhaka). After the implementation, passing checks and unresolved default Turbopack build were presented, the owner replied: "Looks good move forward". This accepts the bounded delivery and authorizes the agreed local merge with the disclosed build limitation carried forward. It does not turn the failed check into a pass or authorize a bundler change, remote synchronization or implementation of the next feature.

## Primary task checklist

- [x] P-01 — Inspect prior plans, GitHub and current code; reproduce target divergence without opening a database. Record the local-first agreement and delivery sequence.
- [x] P-02 — Prepare detailed specification, implementation breakdown and inspection evidence for owner review.
- [x] G-01 — Owner approved the presented BUG-24 scope on 26 October 2026; approval is recorded in this documentation-only checkpoint before application changes.
- [x] T-01 — Implement the database-free mode/environment/target boundary using the supported Next loader; direct dependency and focused precedence/pinning tests. Covers AC-01–AC-03, AC-05. Depends on G-01.
- [x] T-02 — Refactor the four CLI entry paths to preview/banner before client import; remove conflicting helper imports and preserve imported migration/seed contracts. Covers AC-01, AC-03–AC-06. Depends on T-01.
- [x] T-03 — Add controlled-child regression checks across entry paths and modes; prove no-open preview/refusal, redaction and hostile-file isolation. Retain BUG-26 and auth/bootstrap regressions. Covers AC-01–AC-07. Depends on T-02.
- [x] T-04 — Run required final checks on final code, inspect the diff and update README/runbook/brief where behavior changed. Record acceptance mapping and exact owner review commands. Covers AC-06–AC-08. Depends on T-03. Completed with the disclosed default-build exception accepted on 27 October; AC-08 remains partial, not a clean default-build pass.
- [ ] T-05 — Show the result for owner inspection, address findings, obtain acceptance, commit evidence and merge into local `main`. Suggest ROM-01A for a new session. No GitHub write/sync unless requested. Covers AC-09. Depends on T-04 and actual acceptance.

T-01–T-04 are technical chunks of one bounded delivery; they are not separate branches or independently accepted features. They may continue across sessions on the same branch. One checklist lives here.

T-04 checkpoint: required checks have been run and the diff/operator documentation reviewed. Typecheck, lint, domain, all 17 safety groups (PostgreSQL enabled), UX harness and the Webpack production build pass. The default `npm run build` remains failed at Turbopack CSS-worker IPC startup on both tested Node runtimes. The owner accepted delivery after disclosure on 27 October; retain AC-08 as partial and carry the build failure forward. Do not report a clean default build or silently change the bundler. The safe owner inspection block was exercised successfully.

## Verification and delivery

- Focused: new environment/preview regression checks, T-01 isolation, BUG-26 reset and relevant bootstrap/account safety children. Use synthetic `.env*` files in owned scratch; never edit the real files to reproduce precedence.
- Final: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, and `npm run test:safety` with `SAFE01_PG_BIN` for the PostgreSQL groups. Missing tools mean pending, not pass. Avoid unnecessary repeat full runs after unchanged code.
- Browser: no changed user-facing flow, so no new screenshot suite. Run the existing UX review-harness checks if environment changes affect it; verify synthetic review pinning. Do not launch `dev`, `start`, `test:ui` or `db:*` against the configured institutional database.
- Owner inspection: database-free previews on an explicitly pinned disposable target, the precedence matrix output, reset refusal, and the verification table. Provide exact PowerShell commands after implementation. Never supply an institutional reset command.
- Migration/recovery: no schema change. Existing PGlite/PostgreSQL recovery and history groups must remain green. Institutional storage needs no operation.
- Local checkpoints: commit this proposed package as proposed; after approval, commit the actual approval record before implementation. No routine push/PR/comment. Local merge waits for owner acceptance.

## Current checkpoint / handoff

- Scope: approved as presented at `960d5d3`; approval checkpoint `e0d823e` precedes implementation. Delivery accepted on 27 October with the disclosed default-build exception; behavior unchanged.
- Branch/base: `codex/bug-24` / `0b1e055`. One checkout/writer, no worktree, no schema or institutional data operation.
- Implemented: shared Next environment loader/mode validation and redacted target validation; four CLI banners/previews before database import; lazy callable migration/prepare/seed helpers; bootstrap implementation behind an entry wrapper; direct matching `@next/env` dependency, unused direct dotenv removed; synthetic regression group and operator documentation.
- Checkpoints: implementation `c9b564a`; final evidence/handoff in a local documentation commit titled `docs(BUG-24): record validation and owner inspection handoff (#24)` (inspect `git log` for its hash). Local `main` remains `0b1e055`.
- Evidence: [verification](verification.md). BUG-24 environment (80 matrix/preview cases plus guards), typecheck, lint, domain, UX harness and all 17 safety groups pass, including PostgreSQL 17.11. Institutional PGlite metadata is unchanged and it was never opened. Webpack production build passes. Default Turbopack fails at CSS worker IPC startup on Node 22.11 and bundled Node 24.22.1. No change to the build script or runtime installation.
- Next action: commit the actual acceptance and merge the bounded branch into local `main`, then record the merge and next-session handoff. No repeat application tests are needed for these documentation/Git-only changes. Do not start ROM-01A in this session.
- Blockers/limitations: default Turbopack build failure is unresolved; do not mark it passed. No remote synchronization due. Reuse the dated GitHub snapshot unless new uncertainty or an owner request warrants another read.
- Next suggested feature after accepted merge: ROM-01A inspection/specification and mockups, not automatic room implementation.
