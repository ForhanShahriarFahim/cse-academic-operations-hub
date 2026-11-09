# BAT-01B — Verification and owner review

Parent [#6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6) · [specification](spec.md) · [sole plan/approval/checklist](plan.md)

Updated: 9 November 2026, Asia/Dhaka. Branch `codex/bat-01b`, base local main `10e3485`. Approval `513113c` (owner “Approve D-1–D-6 and implement”, 8 November) precedes implementation `f753b8d` and correction `7e6c28a`; later verification checkpoints follow. Acceptance/local merge pending.

## Recorded results

| Criterion | Evidence/result |
|---|---|
| AC-01 | Actual anonymous/viewer/wrong-department raw actions refuse; correctly scoped administrators succeed. Loader independently requires both capabilities. Production viewer direct route is denied; its internal term summary omits receipt reasons/actor details. |
| AC-02 | Ready-policy, draft/business-use/status gates, no-active editor and separate SET-01A activation pass. Missing explicit policy refuses without writes; target stays draft after preparation. |
| AC-03–AC-04 | Progress/repeat/hold/safe graduation, all-held receipt without fake placements, excluded/unknown source cases and all-term graduation blockers pass. Competing rollover-created draft references versus graduation pass in both orders. |
| AC-05–AC-06 | Verified zero becomes an estimate without verifier/time/private source; unknown/count opt-out and invalid legacy boundaries pass. Pattern IDs remap, no-class overrides/scopes survive, held exceptions are excluded, existing target setup is retained and foreign source patterns refuse. |
| AC-07 | Eight real orderings per adapter cover target edit, activation, source count and new draft reference/graduation versus rollover, both orders. PostgreSQL uses independent requests, SQL trigger/advisory barriers and observed blocking PIDs; PGlite uses its real queue/open transaction. Fresh target identity is returned after rename; source-placement fingerprints remain identical across commit. Audit-failure rollback and concurrent all-held replay pass. |
| AC-08 | Populated 0015→0016 preservation/reapply and PGlite cold/PostgreSQL encrypted separate-target recovery pass, including receipt/schema/sequences/frozen data. The import regression blocks configured DB imports through injected helpers. Final focused run reports unchanged default PGlite metadata. |
| AC-09 | 39 production captures at 1440/390/320px pass document-overflow and WCAG 2 A/AA + 2.1 AA axe checks; no recorded page errors. Real pending, invalid-grid/policy, review, source/target stale, changed-row highlighting, Back preservation, saved receipt, separate activation, source history, denied viewer and safe-summary paths pass. Feedback receives focus after stale results. |
| AC-10 | Frozen CSV bytes and stored snapshots/attendance/claim rows remain identical. Eight native PDF pages per state (16 before/after total) have identical text and rendered pixels. All distinct rendered pages inspected; inherited no-active print banner noted below. |
| AC-11 | Typecheck/domain/lint and a separately labelled Webpack production build pass. Default Turbopack fails in CSS-worker IPC; no passing default build or accepted BAT-01B exception exists. Full 31-group safety inventory is still running; do not mark it passed yet. |

Focused final adapter evidence is `.tmp/bat-01b/final-rollover.log` with exit 0. Final UI build is `.tmp/bat-01b/review-build.log` with exit 0. Browser log/exit are `.tmp/bat-01b/browser.{log,exit}`; exit 0. Source/target stale identities are checked through real production actions and the production browser. The full safety log/status is `.tmp/bat-01b/full-safety.{log,exit}`; only a matching completed run's exit is authoritative.

## Browser, CSV and native print artifacts

- [Production capture manifest](../../../output/playwright/BAT-01B/runtime/review.json): 13 states × three widths. The runner is versioned at [review-rollover-browser.cjs](../../../scripts/review-rollover-browser.cjs), invoked only by the guarded preview helper. It verifies an owned loopback `safe01_` PostgreSQL target before connecting.
- [Native PDF pixel/text parity](../../../output/playwright/BAT-01B/runtime/print/parity.json): native Chromium PDFs rendered by bundled Poppler; each corresponding PNG's RGB bytes and each PDF page's extracted text match. Four official template sheets plus a pre-existing no-active banner page, and two teacher sheets plus the same banner page, appear in each state. Actual mixed portrait/landscape A4 sizes are retained.
- PDFs/captures live under `output/playwright/BAT-01B/runtime/`. Screen and native-print pages are synthetic; no institutional rows, dumps, secrets or session tokens are versioned.
- Source counts and the target academic year are deliberately changed through owned fixture controls during stale checks. The target-year change is a test-only correction; a fresh owner preview starts with Spring 2027 / academic year 2027. The receipt confirms the reviewed identity, not the initial page's stale value.

Browser setup originally reused legacy source patterns that correctly failed strict clone validation. The final owned review fixture declares bounded valid synthetic patterns; the browser deliberately corrupts/restores its own patterns to prove invalid-grid refusal and successful cloning. This is not an institutional grid correction or application migration/backfill. Failed/partial earlier captures are not acceptance evidence and are removed from the final artifact set.

## Build limitation

Default `npm run build` attempts failed with Turbopack's unchanged `globals.css` CSS-worker IPC error: the Node worker exits before its connection is established. An unsandboxed attempt failed identically. No bundler/configuration/runtime policy change was made, and earlier slices' exceptions do not authorize a BAT-01B exception.

This host's npm PowerShell entry did not forward `npm run build -- --webpack`; that attempt ran Turbopack and is not Webpack evidence. The passing distinct preview command is `$env:npm_lifecycle_event='build'; node node_modules/next/dist/bin/next build --webpack`. Setting the lifecycle flag retains the existing in-memory build-storage guard. A sandboxed alternate attempt hit a generated-directory permission error; the separate approved unsandboxed build passes. UI corrections were included in the final Webpack bundle. AC-11 remains partial for the failed default build even if the full safety suite passes.

## Writer, data and privacy review

- Injected rollover helpers import only the pure schema/domain/evidence modules. `verify-db-free.ts` rejects any configured DB import, including these helpers. No institutional migration, preparation, reset, direct census or recovery operation was performed.
- Term create/edit/activation and cohort identity/count/lifecycle take exclusive context first. Starting-policy setup takes shared context then its term row; routine/grid/reference/room/publication writers participate through existing shared-context guards. Rollover takes exclusive context before sorted term/cohort/placement locks. Review reads take shared context consistently.
- New placements generate ID-based carry provenance and clear verifier/time; private source text is excluded from review/receipt. Public serialization and archive whitelists are unchanged; no ledger details enter publication/CSV/print projections. Internal view-only summaries contain aggregate dispositions only.
- The new receipt FK is explicitly included in `clearAcademicData`'s non-cascading academic truncate. The guarded disposable reset check plants a receipt and verifies its removal while preserving access. Institutional target refusal remains unchanged; full-suite reset-group result pending.

## Existing findings — proposals only

With no active term, the unchanged portal layout's broad warning remains visible on management pages and also prints as a separate leading page in historical official/teacher packages. Before/after rendered pixels and text match, and the layout/templates are unchanged from local main. The actual template pages remain legible, with their original numbering. This is an inherited context/print follow-up, not a BAT-01B template fix or new approved backlog task. Previously disclosed attendance-selector/long-label print findings remain outside this slice.

## Owner review / guarded restart

After the recorded separate Webpack production build, run `node node_modules/tsx/dist/cli.mjs scripts/review-rollover.ts --serve`. It creates a fresh harness-owned disposable PostgreSQL fixture and launches direct Next start with a pinned target; it does not use `npm run dev/start` or institutional preparation. PostgreSQL tools default to `F:/AI/tools/pgsql-17.11/pgsql/bin`; set `SAFE01_PG_BIN` if needed.

Open [synthetic control/sign-in](http://localhost:3121/), then **Sign in as synthetic administrator**. Review Summer 2026 → Spring 2027, progress one cohort, repeat another and explicitly hold/graduate the semester-8 cohort. Optionally copy the empty destination grid, review counts as estimates, type the destination identity and acknowledge. Inspect the saved receipt and unchanged source history, then use the separate activation review. **View-only account** demonstrates denial and the safe term summary. Restarting the owned runner gives a fresh fixture because preparation is one-time.

Acceptance must include the disclosed default-build limitation before local merge. Parent #6 remains open. No institutional operation, worktree, extra writer, remote synchronization or next-feature implementation.
