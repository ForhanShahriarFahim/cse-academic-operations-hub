# BAT-01A — Implementation plan

Parent: [BAT-01 / #6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6)

Specification: [D-1–D-6 / AC-01–AC-11](spec.md) · [verification](verification.md) · [sketches](mockups/batches.html)

Status: **Approved — implementation in progress**

Branch/base: `codex/bat-01a` / inspected local `main` `7437def`

Updated: 5 November 2026, Asia/Dhaka

## Inspection and proposed approach

SET-01A acceptance/merge remain complete; do not reopen that checklist. The checkout was clean on local main. Last remote reconciliation remains 26 October `0b1e055`; no remote freshness claim or synchronization. No extra writer/worktree or institutional database operation.

Inspected the workflow/delivery sequence, BAT-01 requirements, glossary/ADR and decision gates, current batch page/schema, active loader/serialization, schedule automation/conflicts, room transaction/lifecycle evidence, term/context actions and protected use, auth role policy, source seed/transcription and two-term safety fixtures. No institutional census. Source file is `docs/source/CSE_SUMMER_2026_ROUTINE_V1_6.md`; the older brief's root-relative `source/` wording is not a second source.

Installed Next guides read for planning: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `01-app/03-api-reference/03-file-conventions/page.md`. Route/search params are async; actions are untrusted POST boundaries; sequential client dispatch does not serialize separate requests. Recheck mutation/revalidation/forms/error guidance before implementation.

| Area | Proposed bounded change |
|---|---|
| Schema/migration | Next journal entry expected 0015; cohort revision/retention provenance and per-placement count/confidence/verification/source/revision. Keep global legacy number untouched. No backfilled graduation, verification actor or invented placement. Constraints on new writes must preserve anomalous legacy values. |
| Domain | Identity normalization, command parsing, count state machine, legal lifecycle/placement rules, historical evidence/snapshot parser, shared-audience deduplication and confidence calculations. |
| Data/actions/audit | Dedicated directory/detail loader independent of active-only portal loader, scoped `manage_batches`, revisioned transactions, all-term protected use, fresh impact review and tombstone audit. Reuse action-result conventions. |
| Serialization integration | Explicit term count joins through active data, meeting assembly, schedule adapter, conflict engine, all-term room evidence and publication assembly. Add safe optional frozen confidence, whitelist archive output, keep private verification details in editor projections. |
| Serialization/races | All cohort mutations take exclusive context first, without lock upgrade or generation bump; existing active writers share context. Add shared participation before locks for other reference creators/room writers and protect composed reads against mixed count revisions. Then target term/cohort/placement rows and sorted room locks. Inventory and prove both orderings with real barriers/queues. |
| UI | Directory/search/filters/add; detail identity/status, active placement/count, placement history and editor change history; guarded lifecycle reviews; responsive loading/errors/pending/stale states. No rollover button that suggests B is implemented. |
| Evidence | Focused domain and actual persisted actions, both-adapter populated migration/recovery/races, guarded synthetic production review and public/archive/native A4 regression. |

Migration fixtures must include multiple terms, null/zero/numeric/invalid legacy counts, no-placement values, used/unused cohorts, normalized collisions, unknown statuses/semesters and schema 3/4/unsupported snapshots. Preserve every old field and raw snapshot hash. Repeated preparation must not overwrite new term-specific counts with legacy values. No casual dev/start/db commands; prove an owned disposable target before any preparing runner.

Estimate numbers continue to block demonstrably undersized rooms while confidence warnings prevent unconditional fit claims. This is why confidence must reach the conflict engine and room evidence, rather than only a badge on the batch page. Do not replace all estimated counts with null and accidentally remove an existing capacity blocker.

## Approval record

- Planning authorization: owner said **“Go for the next task.”**, 5 November 2026, following the current BAT-01A inspection/specification handoff.
- Implementation authorization: **Approved**, 5 November 2026. Owner replied **“Approve”** to the explicit D-1–D-6 implementation approval request after proposal `b9958aa`, specification and responsive sketches were presented. This approval record is committed before T-03.
- Approved scope: unchanged D-1–D-6 / AC-01–AC-11 at `b9958aa`. No institutional migration, remote synchronization, rollover or local merge before delivery acceptance.
- Material amendments: none; changed authority, graduation/hold definitions, historical editing, draft-term/rollover scope or count migration needs an owner decision.
- Delivery acceptance/local merge: pending a verified implementation and owner inspection. No institutional operation, remote sync or parent closure authorized.

## Tasks — sole checklist

- [x] T-01 — Inspect actual baseline and define bounded scope, count migration and lifecycle decisions; AC-01–AC-11.
- [x] T-02 — Responsive sketch/document verification complete ([evidence](verification.md)); owner approved unchanged D-1–D-6 (“Approve”, 5 November). Approval committed before implementation.
- [x] T-03 — Inventory count consumers and reference creators; schema/domain/0015 migration implemented. Populated preservation/reapply and verified-zero recovery pass on both disposable adapters; AC-02/03/05/06/07/08.
- [x] T-04 — Scoped loaders/actions, exclusive context/revision/evidence serialization, atomic audits, lifecycle/deletion safeguards implemented. Actual count/assignment and duplicate/count races pass; final regression review remains T-07/T-08.
- [x] T-05 — Per-term count/confidence integrated across portal/meeting/room/occupancy/schedule/publication paths; old snapshot hashes/private metadata tests pass. New inactive-selection guards are under final focused review.
- [x] T-06 — Responsive directory/detail/forms/reviews/history and feedback implemented. Production browser review found and corrected the action selector's accessible name; refreshed build/review underway.
- [ ] T-07 — Verify focused domain, persisted actions, adapter upgrade/recovery/concurrency and negative/permission matrix; fix findings; AC-01–AC-09.
- [ ] T-08 — Run final required checks, production browser/mobile/keyboard/native A4/output checks and diff review; provide isolated runnable owner preview and honest AC results; AC-08/10/11.
- [ ] T-09 — Obtain actual owner acceptance, record it and merge only this bounded delivery into local main; parent #6 remains open. Update exact handoff without starting BAT-01B.

## Verification and delivery

Planning checks only: relative links/anchors, source/requirement preservation, template/status consistency, diff whitespace, static sketch rendering and keyboard/overflow review at 1440/390/320px. Static sketches demonstrate proposed behavior; they are not a functioning cohort-management app. No app/database suites are necessary for documentation-only work.

After approval run `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, relevant `npm run test:safety` groups (including PostgreSQL) and meaningful production browser checks. Preserve the existing all-group safety baseline; record skipped/unavailable groups honestly. Previous accepted default-Turbopack failures are history, not a BAT-01A exemption; a separate passing Webpack review build does not turn a failed default build into a pass.

Owner review path after implementation: synthetic administrator create → place active cohort → estimate → confirm → inspect a different term; viewer read and direct edit denial; used-cohort graduation block; safe inactive/reactivate/graduate/restore; unused-delete refusal/success; stale term/revision/evidence outcomes; old publication remains identical. Supply guarded target/start instructions and private synthetic access. Acceptance precedes local merge; no routine push/PR/GitHub edits.

## Current checkpoint / exact handoff

- Scope: approved unchanged [D-1–D-6](spec.md) at proposal `b9958aa`; owner “Approve”, 5 November.
- Branch/base: `codex/bat-01a` from `7437def`, no worktrees. Inspect actual Git state and local proposal commits when resuming.
- Completed: T-01–T-06; implementation approval `b035ed4` precedes all code. Proposal `b9958aa`. Application/schema/tests and review helper are in this issue checkout; inspect actual Git state/checkpoint commits when resuming.
- Next: finish T-07/T-08. Full safety run reached BUG-29 legacy timestamp catalog; new timestamp added to that test's explicit post-0007 exclusion and remaining groups resumed. Refresh production build after label/import/selection fixes, rerun actual browser/print checks, then final checks/diff and a coherent delivery commit. Do not merge or start B without actual acceptance.
- Verification: [record](verification.md) separates planning from implementation. Both adapters' focused actions/migration/recovery/races pass; full suites/browser review underway. Default Turbopack fails (also elevated); separate Webpack build passed before the latest small fixes and is being refreshed. No BAT-01A build exception approved.
- Safety incident: initial lock integration introduced a transitive configured-DB import in the parent safety harness, initializing the configured PGlite client. No application writes, migrations or reset were issued to it; earlier metadata checks changed. Fixed by database-free `term-lock.ts`, added a blocking import regression and parent-cache guard. Later BUG-29 runs report unchanged default metadata. No pre-incident row fingerprint exists, so byte-for-byte institutional preservation is not asserted. Record this explicitly at delivery.
- Other limits: no individual graduation or historical count-verification facts are invented. No remote action, worktree or runtime policy change. Institutional migration remains a separate operation.

Next-session prompt: “Resume BAT-01A / #6 on codex/bat-01a from the sole plan. Inspect actual Git state; read D-1–D-6 and approval record. If no actual implementation approval exists, present the concrete proposal/sketches and obtain it. If unchanged scope has been approved, record and commit it before T-03, then execute the checklist autonomously. Keep estimates distinct from verification and preserve old publications. One writer, no worktrees, institutional preparation/reset, remote sync, rollover or unrelated backlog work. Report real checks and let the owner inspect before local merge.”
