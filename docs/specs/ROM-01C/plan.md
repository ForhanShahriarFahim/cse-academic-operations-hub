# ROM-01C — Implementation plan and sole checklist

Parent: ROM-01 / #5. [Specification](spec.md), [verification](verification.md), [sketches](mockups/index.html).
Status: **Accepted on 1 November 2026 with the disclosed default-build exception; local merge authorized and pending.**
Branch/base: `codex/rom-01c` from local `main` `cbdbce9`, following ROM-01B merge `850f42a`.
Updated: 1 November 2026, Asia/Dhaka. Implementation approval remains the owner's 29 October decision.

## Inspection and proposed approach

Extend the accepted room modules and sorted parent-room locks. Add a narrow `room_unavailability` relation with FK to room (no cascade): inclusive DATE bounds, nonempty unique academic-weekday array constrained to 0–6, minute bounds constrained to `0 <= start < end <= 1440`, plain reason, cancellation state, positive revision and timestamp-with-time-zone creation/update fields. New table starts empty; no invented backfill. Parent room history/audit stores actor, before/after and correction reason under existing rules. Use indexes on room/date bounds; re-evaluate query shape during implementation without changing the approved contract.

Normalize all-day to minutes 0/1440 and every-day to the complete weekday set. Runtime input guards reject duplicate scalar values/File values and forged enums/IDs, check real dates/weekday occurrence and mirror DB invariants on both adapters. Check expected parent revision on create/edit/cancel and entry revision on edit/cancel. Lock parent before entry. Increment parent once per successful mutation, including initial retention, and entry once for edit/cancel; atomic audit plus retention event as needed. Server re-reads evidence after the parent lock, checks the confirmation fingerprint and commits everything or nothing. Keep cancelled history forever in the application contract; existing deletion totals gain maintenance history.

Pure modules supply civil-date intersection/first occurrence, typed maintenance conflicts and interval projections. Carry a separate internal date-context map from the same raw meeting rows used to assemble PortalData. Shared public MeetingView and snapshot schema stay unchanged. Do not reconstruct nullable bounds from formatted UI labels. Existing candidates use their stored bounds; new auto/manual candidates explicitly use whole-term bounds. Reconcile preview and server publication context instead of making a fake weekly maintenance meeting.

Integrate the existing seams in `room-transaction.ts`, `room-lifecycle-transaction.ts`, `actions.ts`, `academic-actions.ts`, `time-grid-actions.ts`, `conflicts.ts`, `routine-workbench.ts`, `auto-schedule.ts`, `data.ts` and `room-occupancy.ts`. Extend room action/data/history modules and room detail/occupancy components. Publication gets the narrow parent-lock/recheck contract in D-5; do not expand into BUG-25. Reinspect all visible assignment/date writers before coding. A newly discovered exposed date writer that can bypass closure validity must join the bounded guard or be returned as a material amendment.

Read relevant installed Next.js guides before app changes, including server actions, refresh/revalidation and async route/search params. No dependency, runtime or bundler policy change is proposed. No app/schema/test implementation belongs in the planning checkpoint.

## Approval record

- Planning authorization: owner said **“accept and merge. And go for the next task.”** on 29 October 2026, following the explicit proposal to accept ROM-01B then inspect/specify ROM-01C before implementation. This authorizes starting C planning in this chat, superseding the default wait-for-new-session suggestion.
- Prerequisite: B acceptance `57471b3`, local merge `850f42a`, merge/handoff `cbdbce9`. Parent #5 remains open.
- Implementation authorization: **Approved on 29 October 2026, Asia/Dhaka.** Owner: “Approve D-1–D-6 to begin implementation. Approved”. The complete D-1–D-6 package, this plan and its verification requirements are authorized without amendment. Approval is recorded in this checkpoint before feature code.
- Acceptance: **1 November 2026, Asia/Dhaka.** Owner: “accepted and go for the next task.” This directly follows disclosure that the default Turbopack build fails, the separate Webpack review build passes, and acceptance must cover that limitation before local merge. Accepted with that delivery exception; AC-11 remains partial and no build-policy change is inferred. Local merge is authorized. No remote activity or institutional operation is authorized.
- Next-task authorization: the same message authorizes BUG-28 inspection/specification in this chat. Its concrete specification still requires approval before implementation.

## Tasks

- [x] T-01 — Inspect accepted baseline, date/OD/publication/lock/occupancy seams and record the bounded proposal. Covers AC-01–AC-10 design.
- [x] T-02 — Prepare and verify specification, decisions, responsive/print sketches and exact handoff; commit review package. Design evidence only.
- [x] T-03 — Obtain actual implementation approval, record wording/date/amendments and commit approved plan before code. Owner approved D-1–D-6 on 29 October 2026 without amendment. Depends T-02.
- [x] T-04 — Build pure date/typed-conflict/projection rules, schema/constraints and empty forward migration; verify populated upgrade and recovery on both adapters. Focused PGlite/PostgreSQL upgrade, constraint and exact restore checks pass. Covers AC-02/06/08/10; depends T-03.
- [x] T-05 — Add guarded reads/create/edit/cancel/history, impact fingerprint/reconfirmation, retention/revisions/audits and permissions. Focused production action/role, stale/no-op/uncertainty and audit rollback checks pass. Covers AC-01/03/04; depends T-04.
- [x] T-06 — Connect all placement, automatic/bulk/move and publication checks under shared room locks; prove actual commit-order races/rollback. PostgreSQL production-action barriers pass in both orders for all six placement writers, publication/create/edit/cancel and draft-delete/first-maintenance. Covers AC-05/06/07; depends T-04/05.
- [x] T-07 — Build responsive maintenance/impact states, conflict remediation and weekly/date occupancy with matching A4 print. Seventeen production browser/axe captures, keyboard confirmation, stale/denied/history flows and six-page native A4 checks pass. Covers AC-03/08/09; depends T-05/06.
- [x] T-08 — Verification executed; **AC-11 remains partial because the default Turbopack build fails**. Typecheck/lint/domain, all 23 safety groups, real adapter/race/browser/publication-parity and native-print checks pass; the separate final Webpack production build passes. Owner accepted the disclosed delivery exception on 1 November. [Exact evidence/limitations](verification.md). Covers AC-01–AC-11; depends T-04–T-07.
- [ ] T-09 — Present local runnable synthetic review, obtain actual owner acceptance, merge bounded C delivery into local main and update handoff. Keep #5 open until remaining requirements review. Depends T-08 and acceptance.

## Verification and delivery

Planning verification: local links/anchors, template structure, one checklist, synthetic-only static sketches, desktop/390/320 overflow/labels/focus/axe, A4 PDF render/visual inspection and diff review. Store captures under `output/playwright/ROM-01C`; disposable helpers under ignored `.tmp`. No database preparation or application build is needed for documentation/sketches.

Implementation verification: date/weekday/leap/large-range and minute algebra, all room roles, merged audience/unknown fit, complete/pending/partial OD, past/future/cross-term/effective bounds, overlapping/cancelled maintenance, zero usable time and break fragmentation. Exercise stale/no-op/forged/duplicate/File requests, all server roles and audit failure rollback. Populated PGlite/PostgreSQL migration/recovery and unchanged row/snapshot fingerprints are required. Never run institutional `db:reset` or casually launch configured `dev`, `start`, `test:ui` or `db:*`.

Concurrency: real two-connection PostgreSQL production-action races in both commit orders for placement versus maintenance create/edit/cancel, publication versus create/edit/cancel and draft retention/deletion versus first maintenance. Assert lock ordering, fresh evidence/reconfirmation, no partial auto/grid writes and unchanged cancelled/past history. Include date/context mutation paths if discovered; do not claim generic publication serialization.

Browser: synthetic populated/empty/denied/pending/error/stale and paged-impact/history states at desktop/390/320, keyboard/focus/axe WCAG A/AA; weekly/date parity, long room/reason text, print continuation with context/counters; unchanged public screen/CSV/official print hashes after maintenance mutations. Use a guarded disposable production app. Run typecheck, lint, domain, **default build** and relevant full safety groups including PostgreSQL on final code. Historical B build failures do not waive C's required build. Document pending checks honestly.

## Current checkpoint / handoff

- Scope: D-1–D-6 approved by the owner on 29 October 2026 without amendment. One writer/branch; no worktrees.
- Inspection receipt: reviewed code `49a50f2`, implementation `c33e6ad`, verification/capture checkpoint `a61e732`. Final local main remains `cbdbce9`; no acceptance, merge, institutional operation or remote sync has occurred. The synthetic preview sign-in/date/dialog/public-privacy smoke passes on the final Webpack artifact.
- Base: `cbdbce9`; B is accepted/merged at `850f42a`. Last remote reconciliation 26 October; no sync this session.
- Work: approval `3d4361a` preceded implementation `c33e6ad`, corrections `49a50f2`; corrections complete cancellation focus/success revalidation, a dump/restore-stable reason constraint and explicit disposable-reset/legacy-test integration. T-04–T-07 and 23 safety groups pass. [Verification/capture gallery](verification.md) owns exact evidence. The default Turbopack CSS-worker process/IPC failure remains unresolved; the separately labeled final Webpack build powers the synthetic review. This is not an accepted build exception.
- Review on this host: `node node_modules/tsx/dist/cli.mjs .tmp/rom01c-pg-review.ts --serve` starts a guarded owned PostgreSQL production preview on `http://localhost:3104`; `node .tmp/rom01c-owner-preview.cjs` supplies a loopback gallery and synthetic sign-in link in ignored `.tmp/rom01c-owner-review.json`. These host-local helpers retain no institutional target and are not application/deployment entry points. Captures and evidence are versioned under `output/playwright/ROM-01C/implementation`.
- Acceptance boundary: owner accepted on 1 November with the disclosed default-build exception. The inspection receipt above describes the pre-acceptance state; no code or verification result changed during acceptance.
- Next action: commit this acceptance, merge C into local main, record the merge receipt, then inspect/specify BUG-28 as explicitly requested. No BUG-28 implementation before approval of its concrete plan.
- Exact continuation: “Read the brief and selected sole plan; inspect Git. ROM-01C is accepted on 1 November with AC-11 partial under the disclosed default-build exception. Complete its authorized local merge/receipt if still pending, then inspect/specify BUG-28. Preserve institutional storage and frozen publications; no remote sync/worktree or unapproved next-task implementation.”
