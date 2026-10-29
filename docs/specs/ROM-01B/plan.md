# ROM-01B — Implementation plan and sole checklist

Parent: #5 ROM-01. Specification: [spec.md](spec.md). Evidence: [verification.md](verification.md). [Workflow sketches](mockups/index.html).
Status: **Approved for implementation on 28 October 2026; approval checkpoint precedes feature code.**
Branch / base: `codex/rom-01b` from local `main` `3c4e7cc`, after accepted ROM-01A merge `2b363cb`.
Updated: 28 October 2026, Asia/Dhaka.

## Inspection and proposed approach

Extend ROM-01A rather than replace its directory/editor contracts. Keep separate reference projections for edit fit, lifecycle occurrence checks and deletion provenance. Use pure date/interval calculations shared by data/UI/print; extend existing room action/read modules and narrowly connect reference writers to draft retention and active checks. Keep institutional data closed.

Expected seams: one forward room draft-marker migration/schema change; room-records/transaction/data/actions; rooms directory/detail and new occupancy route/components; room-history event labels; existing manual/OD/automatic writer integration; drag/keyboard/undo move action and time-grid bulk moves; workbench option helpers/page props; focused safety/domain/browser fixtures. No runtime/dependency/bundler changes. Reinspect all assignment and term/meeting-effective-date writers before coding; if an exposed date writer can resurrect future use of an inactive room, it must join the same guard or be returned as a material amendment. Existing code has no exposed term-date/meeting-effective-date editor in the inspected paths; seed/migration paths are not casually run. The discovered weekday-move path is explicitly included in this proposal, including sorted all-meeting-before-all-room locks for bulk moves.

The proposed monotonic `isDraft` marker is needed because deleted prior assignments cannot be reconstructed reliably from today's FKs. Default retained avoids claiming provenance for existing institutional rows. First use changes marker/revision and an audit atomically under the established sorted room locks. This is a bounded lifecycle concurrency guarantee, not general scheduling or publication concurrency repair. Maintain distinct event/reference totals versus occupied interval unions.

Installed Next.js 16.3.4 mutation and `revalidatePath` guides were inspected for authorization and refresh semantics. Read relevant installed page/search-param guides before implementing new routes/filters. No Next.js application code is changed in this planning checkpoint.

## Approval record

- Inspection/design authorization: owner's 28 October 2026 request to proceed in order through ROM-01A acceptance/local merge, then **ROM-01B inspection and specification**, with approval before implementation.
- Prerequisite acceptance: owner selected **“Accept ROM-01A and merge locally”**, explicitly including the disclosed default Turbopack failure; recorded at `44753cb`, merged `2b363cb`, local handoff `3c4e7cc`.
- Implementation authorization: **Granted on 28 October 2026 (Asia/Dhaka).** The owner replied **“approved.”** to the presented specification, sole checklist and desktop/mobile/print sketches and the explicit request to approve D-1–D-6 before implementation. No amendments.
- Approved package: [spec.md](spec.md), D-1–D-6, this plan and [sketches](mockups/index.html). No material amendments approved.
- This record captures actual wording/date and unchanged scope. Commit this approval checkpoint locally **before** application/schema/test implementation. Keep parent #5 open and work local.

## Tasks

- [x] T-01 — Inspect accepted local baseline, lifecycle/reference/date/provenance, permissions, all visible picker/writer and occupancy/grid seams; record concrete findings and boundaries. Covers AC-01–AC-10 design.
- [x] T-02 — Prepare bounded specification, D-1–D-6, responsive desktop/mobile/print workflow sketches, documentation verification and exact handoff. Design review only, not feature acceptance.
- [x] T-03 — Obtain actual approval of this package and decisions, record wording/date/amendments, verify docs and commit approved checkpoint before implementation.
- [x] T-04 — Implement pure future-occurrence, deletion-eligibility and interval/window/uncertainty rules; add monotonic draft marker with populated upgrade/recovery on both adapters. Covers AC-02/03/05/06/09/10; depends T-03.
- [x] T-05 — Add guarded lifecycle/deletion reads/actions, stale/reason/confirmation handling and atomic audits; integrate first-use retention and existence/activity rechecks in every reference writer. Prove actual races/rollback. Covers AC-01–AC-08; depends T-04.
- [x] T-06 — Build lifecycle confirmations/history/status filters; reconcile picker fit/inactive remediation and preserve entered class/OD values on cached-choice refusal. Covers AC-01/04/06/08/11; depends T-05.
- [x] T-07 — Build shared weekly projection, occupancy agenda/gap filters/alerts and matching A4 print; label common windows, effective-date limits and uncertain bookings. Covers AC-09–AC-11; depends T-04/05.
- [x] T-08 — Run focused domain/role/adapter/concurrency/UI/print/publication parity checks, correct findings and required final suites on final code; record AC evidence and limitations. Covers AC-01–AC-12; depends T-05–T-07.
- [x] T-09 — Present coherent local delivery and guarded runnable owner review, obtain actual acceptance, merge locally and update handoff; keep #5 open and suggest ROM-01C for a separate owner-started session. Depends T-08 and acceptance.

## Verification and delivery

Planning: inspect local links/anchors, required sections, actual approval evidence, one checklist, synthetic-only mockups, responsive static renders/overflow/labels/focus/print and diff whitespace. No application server, database preparation or code suites needed for documentation-only changes. Store sketch captures under `output/playwright/ROM-01B`; optional capture helpers stay ignored in `.tmp`.

Implementation: pure date/time-zone/inclusive-bound/weekday cases; interval algebra, stream break/exception cases; all role scopes; malformed/stale/no-op/audit rollback; populated PGlite/PostgreSQL upgrade and exercised recovery; snapshots and old references; all actual room-reference writers with real two-connection PostgreSQL races in both commit orders. Include date-bound changes and first-use draft retention in the race inventory, not just the lifecycle form.

Browser: synthetic active/past/future terms, expired and partial OD, inactive selected rooms, reused codes/new IDs, protected room identities, unknown/merged audiences and enough rows for paging/print continuation. Review desktop, 390 px and 320 px, keyboard/focus/axe, all error/pending states, directory/occupancy print and unchanged publication screen/CSV/print. Use the guarded disposable UX harness or an equivalently proven synthetic target; never casually run `dev`, `start`, `test:ui` or `db:*` against configured institutional storage.

Final checks: typecheck, lint, domain, **default** build and relevant safety/UI suites including PostgreSQL. The inherited Turbopack CSS-worker IPC failure remains unresolved; any alternate Webpack result must be separately labelled. ROM-01A's accepted exception is not an automatic ROM-01B exception. No package/build-policy change without a material decision. Preserve passing evidence; rerun only when changes/failures/uncertainty warrant it.

## Current checkpoint / handoff

- Approved scope: [spec.md](spec.md), D-1–D-6; owner replied “approved.” on 28 October, no amendments. Approval `b713996` preceded application code. T-01–T-08 complete; T-09 complete: owner accepted and local merge `850f42a` is recorded.
- Branch/base: `codex/rom-01b` / local `main` `3c4e7cc`; ROM-01A merge `2b363cb`. Implementation checkpoint `3002bb2`; verified corrections, captures and evidence **`25e75d0`**. One writer/checkout; no worktree or remote sync. Parent #5 remains open.
- Final verification: typecheck/lint/domain/default Turbopack build, all 21 safety groups including PostgreSQL, 17 production-browser observations and seven-page native A4 QA pass. Published screen/official/print text and CSV remain unchanged. See [verification.md](verification.md) and the [capture gallery](../../../output/playwright/ROM-01B/implementation/index.html). Earlier intermittent default-build failures remain historical evidence; no bundler policy change or exception is needed for the passing final default result.
- Review: fresh synthetic PostgreSQL server on localhost:3102; private loopback review/capture link lives only in ignored `.tmp/rom01b-owner-review.json`. Local helper restart commands and boundaries are in verification.md. Institutional storage was never opened or migrated.
- Next action: the owner has explicitly authorized ROM-01C inspection/specification after acceptance/merge. Start that bounded design work on its own branch; implementation still requires approval. No institutional operation, remote synchronization or parent-issue closure.
- Exact continuation: “Review implemented ROM-01B / #5 on codex/rom-01b. Approval b713996 precedes implementation 3002bb2 and verified correction/evidence commit 25e75d0. T-01–T-08 pass; read verification.md and the implemented capture gallery, preserve the unchanged approved scope and all institutional data. Await/record actual owner acceptance before local-main merge. Parent #5 stays open; no ROM-01C implementation, worktree or remote sync. After acceptance, suggest a separate owner-started ROM-01C inspection/specification session.”

## Owner acceptance — 29 October 2026

The owner replied **“accept and merge. And go for the next task.”** after the verified delivery and review instructions. This accepts ROM-01B and authorizes its bounded merge into local `main`. The next-task instruction authorizes ROM-01C inspection/specification (the stated next step), not implementation before approval. No build exception is needed: final default builds pass. Parent #5 stays open; no institutional operation or remote synchronization is authorized. Merge receipt follows after Git completes.

## Completed local merge receipt

ROM-01B was accepted in the owner’s 29 October request above, recorded at `57471b3`, and merged with preserved history into local `main` at **`850f42a`**. Implementation `3002bb2`, correction/evidence `25e75d0` and review handoff `410faf5` remain in the merge. No conflict or application change was introduced by the merge, so unchanged passing checks are reused. T-09 is complete; #5 remains open. The owner explicitly requested the next task in this chat, authorizing ROM-01C inspection/specification now. This supersedes the earlier suggestion to wait for another owner-started session; it does not approve implementation.
