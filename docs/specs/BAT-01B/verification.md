# BAT-01B — Verification

Parent [#6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6) · [specification](spec.md) · [sole plan/approval/checklist](plan.md)

Date: 8 November 2026, Asia/Dhaka. Branch `codex/bat-01b`, inspected base `10e3485`.

## Planning evidence

Inspected requirements and actual cohort lifecycle/count actions, term setup/activation/protected-use logic, schema/grid scopes, capability checks and existing handoffs. Source evidence is linked in the specification. No BAT-01B plan existed at the implementation request; D-1–D-6 were subsequently approved explicitly (“Approve D-1–D-6 and implement”).

Important findings: placements freeze draft identity/policy setup; unresolved-use guards can block global graduation even when a cohort is omitted from the target; null-term windows cannot be treated as a source-owned grid; no academic calendar model exists. Preserve these boundaries in implementation.

Installed Next server-actions/page guides were read for planning. No configured DB import, application start/prepare/migration/reset, institutional census, remote synchronization, extra writer or worktree. This planning paragraph describes the pre-code inspection; application evidence is recorded separately below. Synthetic sketches demonstrate proposed workflow only; the operation/receipt shown is not persisted data.

Static local file links and diff whitespace pass. Proposal screens rendered at 1440/390/320px without document overflow, keyboard skip and simulated-feedback focus pass. Captures/receipt: `output/playwright/BAT-01B/planning/`. Playwright CLI was unavailable in offline cache; installed Playwright library with headless Edge used, without adding a test framework. Sandbox browser startup was refused; approved unsandboxed launch passed. These are proposal checks, not application behavior.

## Application evidence

Approval `513113c` precedes application changes. First focused PGlite/PostgreSQL runs pass populated migration/reapply preservation, production raw-action permissions/scopes, malformed/forged/duplicate decisions, policy/used-draft/grid gates, all-term graduation refusal, source-count/context stale checks, atomic audit rollback, all dispositions, verified-zero count reset/private-source exclusion, clone remapping and held-exception exclusion, replay protection and separate SET-01A activation. Both backups/restore paths preserve full fingerprints, including the new receipt. First five actual lock/queue orderings pass on both adapters; expanded eight-order race checks and full safety inventory remain pending. The final focused run reports unchanged default PGlite metadata and no configured client import.

Full domain suite and the earlier lint/typecheck pass; final checks after later test/UI additions are running. Default `npm run build` fails in `globals.css` CSS-worker IPC (worker exits before connection), including an unsandboxed retry. An attempted `npm run build -- --webpack` did not forward the flag through this host's npm PowerShell entry and ran Turbopack again; it is not Webpack evidence. Direct `npm_lifecycle_event=build` + Next `build --webpack` is the distinct alternate build, in progress. The sandboxed alternate attempt hit a generated-directory permission error; unsandboxed retry compiled, with remaining build stages pending. No inherited build exception or production-readiness claim. Required final checks and application browser/A4 evidence remain in the sole plan.
