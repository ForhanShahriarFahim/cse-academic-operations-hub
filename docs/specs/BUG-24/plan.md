# BUG-24 — Implementation plan

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24).
Specification: [spec.md](spec.md). Verification: [verification.md](verification.md).
Status: Inspected and proposed; no application implementation.
Branch/base: `codex/bug-24` from `main` at `0b1e055`.
Updated: 26 October 2026, Asia/Dhaka.

## Inspection and proposed approach

Use a small database-free environment/target boundary, not a general CLI framework. Keep the existing target/reset helpers. Add `@next/env` directly at the installed Next version; remove early `dotenv/config` imports in production entry paths. Inspect whether the direct dotenv dependency remains needed after that; do not churn unrelated packages.

Make CLI bootstrap ordering explicit. Parse preview/mode and print the target before dynamically importing the database-dependent implementation. In particular, `prepare.ts`, `migrate.ts` and `bootstrap-admin.ts` currently import modules that instantiate the singleton at module evaluation, so merely adding a banner inside `main()` is insufficient. Preserve callable `migrateDatabase`/seed behavior used by safety children; module import is not permission to execute a CLI. Add a wrapper only where it makes that ordering clearer.

Resolve `predev`/`prestart` mode before file loading. Next runtime keeps its own loaded environment; shared database code must not load test/development files over it. Keep process-pinned values and build-worker memory behavior. Test fresh processes to avoid loader caches disguising precedence defects.

Replace T-01's assertion of divergent supported entry paths with assertions of parity. A legacy early-dotenv simulation may remain only as clearly labeled historical characterization, not a passing production contract. Keep parent safety modules free of application DB imports; probes live in controlled children. If loader parity changes a fixture's old assumption about `.env.local` in test mode, update that fixture to declare its intended mode instead of weakening pinning.

## Approval record

- Planning/workflow authorization: the owner's 26 October 2026 request to analyze prior plans/GitHub, create a concrete local-first plan, and prepare detailed small parts.
- BUG-24 implementation authorization: **Pending**. The exact contract above was not available when that message was sent.
- Scope for review: spec AC-01–AC-09, the mode/preview contract and T-01–T-05 below; no institutional database operation.
- Material amendments: none approved. Record actual owner wording/date here, then commit the approved version before implementation.

## Primary task checklist

- [x] P-01 — Inspect prior plans, GitHub and current code; reproduce target divergence without opening a database. Record the local-first agreement and delivery sequence.
- [x] P-02 — Prepare detailed specification, implementation breakdown and inspection evidence for owner review.
- [ ] G-01 — Owner approves the presented BUG-24 scope; record approval and commit the approved plan before application changes.
- [ ] T-01 — Implement the database-free mode/environment/target boundary using the supported Next loader; direct dependency and focused precedence/pinning tests. Covers AC-01–AC-03, AC-05. Depends on G-01.
- [ ] T-02 — Refactor the four CLI entry paths to preview/banner before client import; remove conflicting helper imports and preserve imported migration/seed contracts. Covers AC-01, AC-03–AC-06. Depends on T-01.
- [ ] T-03 — Add controlled-child regression checks across entry paths and modes; prove no-open preview/refusal, redaction and hostile-file isolation. Retain BUG-26 and auth/bootstrap regressions. Covers AC-01–AC-07. Depends on T-02.
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

- Scope: proposed only; G-01 is next. P-01 and P-02 are complete.
- Branch/base: `codex/bug-24` / `0b1e055`. Application code, dependencies and schema unchanged.
- Planning checkpoint: identified by the local commit titled `docs(BUG-24): local-first delivery plan and proposed target contract (#24)`. This record cannot contain its own commit hash; use `git log -1` and `git status` at handoff.
- Evidence: [verification](verification.md). Feature acceptance criteria remain pending; the diagnostic proves the current defect, not the fix.
- Next session: inspect the actual approval record, record any new owner approval, commit it, then start T-01. Reuse the dated GitHub snapshot unless uncertainty or a synchronization request justifies another read.
- Blockers: owner review/approval of the concrete contract; external credentials are not needed for this slice.
- Next suggested feature after accepted merge: ROM-01A inspection/specification and mockups, not automatic room implementation.
