# ROM-01B — Implementation plan and sole checklist

Parent: #5 ROM-01. Specification: [spec.md](spec.md). Evidence: [verification.md](verification.md). [Workflow sketches](mockups/index.html).
Status: **Inspection/specification only; proposed scope awaiting owner approval.**
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
- Implementation authorization: **Pending.** No approval inferred from “Go for the next task”, ROM-01A acceptance or this proposed checklist.
- Proposed approval package: [spec.md](spec.md), D-1–D-6, this plan and [sketches](mockups/index.html). No material amendments approved.
- Obtain actual wording/date, check the approved package and commit approval locally **before** application/schema/test implementation. Keep parent #5 open and work local.

## Tasks

- [x] T-01 — Inspect accepted local baseline, lifecycle/reference/date/provenance, permissions, all visible picker/writer and occupancy/grid seams; record concrete findings and boundaries. Covers AC-01–AC-10 design.
- [x] T-02 — Prepare bounded specification, D-1–D-6, responsive desktop/mobile/print workflow sketches, documentation verification and exact handoff. Design review only, not feature acceptance.
- [ ] T-03 — Obtain actual approval of this package and decisions, record wording/date/amendments, verify docs and commit approved checkpoint before implementation.
- [ ] T-04 — Implement pure future-occurrence, deletion-eligibility and interval/window/uncertainty rules; add monotonic draft marker with populated upgrade/recovery on both adapters. Covers AC-02/03/05/06/09/10; depends T-03.
- [ ] T-05 — Add guarded lifecycle/deletion reads/actions, stale/reason/confirmation handling and atomic audits; integrate first-use retention and existence/activity rechecks in every reference writer. Prove actual races/rollback. Covers AC-01–AC-08; depends T-04.
- [ ] T-06 — Build lifecycle confirmations/history/status filters; reconcile picker fit/inactive remediation and preserve entered class/OD values on cached-choice refusal. Covers AC-01/04/06/08/11; depends T-05.
- [ ] T-07 — Build shared weekly projection, occupancy agenda/gap filters/alerts and matching A4 print; label common windows, effective-date limits and uncertain bookings. Covers AC-09–AC-11; depends T-04/05.
- [ ] T-08 — Run focused domain/role/adapter/concurrency/UI/print/publication parity checks, correct findings and required final suites on final code; record AC evidence and limitations. Covers AC-01–AC-12; depends T-05–T-07.
- [ ] T-09 — Present coherent local delivery and guarded runnable owner review, obtain actual acceptance, merge locally and update handoff; keep #5 open and suggest ROM-01C for a separate owner-started session. Depends T-08 and acceptance.

## Verification and delivery

Planning: inspect local links/anchors, required sections, pending approval, one checklist, synthetic-only mockups, responsive static renders/overflow/labels/focus/print and diff whitespace. No application server, database preparation or code suites needed for documentation-only changes. Store sketch captures under `output/playwright/ROM-01B`; optional capture helpers stay ignored in `.tmp`.

Implementation: pure date/time-zone/inclusive-bound/weekday cases; interval algebra, stream break/exception cases; all role scopes; malformed/stale/no-op/audit rollback; populated PGlite/PostgreSQL upgrade and exercised recovery; snapshots and old references; all actual room-reference writers with real two-connection PostgreSQL races in both commit orders. Include date-bound changes and first-use draft retention in the race inventory, not just the lifecycle form.

Browser: synthetic active/past/future terms, expired and partial OD, inactive selected rooms, reused codes/new IDs, protected room identities, unknown/merged audiences and enough rows for paging/print continuation. Review desktop, 390 px and 320 px, keyboard/focus/axe, all error/pending states, directory/occupancy print and unchanged publication screen/CSV/print. Use the guarded disposable UX harness or an equivalently proven synthetic target; never casually run `dev`, `start`, `test:ui` or `db:*` against configured institutional storage.

Final checks: typecheck, lint, domain, **default** build and relevant safety/UI suites including PostgreSQL. The inherited Turbopack CSS-worker IPC failure remains unresolved; any alternate Webpack result must be separately labelled. ROM-01A's accepted exception is not an automatic ROM-01B exception. No package/build-policy change without a material decision. Preserve passing evidence; rerun only when changes/failures/uncertainty warrant it.

## Current checkpoint / handoff

- Scope: ROM-01B proposal only. T-01/T-02 complete; T-03 pending actual approval. ROM-01A accepted/merged, parent #5 open; ROM-01C follows separately.
- Branch/base: `codex/rom-01b` / `3c4e7cc`. Planning files and pointer updates only; no application/schema/dependency changes, worktree, extra agent, remote operation or institutional access.
- Planning checkpoint: `docs(ROM-01B): propose safe room lifecycle and weekly occupancy (#5)`; verify its actual hash from Git on resume. Proposal only, approval pending; commit includes the spec, sole checklist, verification, sketches/captures and current-work pointers.
- Verification: [verification.md](verification.md); static design checks do not establish implemented ACs. No repeat ROM-01A suites needed after its documentation-only merge.
- Next action: owner reviews D-1–D-6, spec/plan/sketches. Record actual approval and commit it before T-04. Return material requested changes for decision; routine approved work may then proceed autonomously.
- Exact continuation: “Continue ROM-01B / #5 on codex/rom-01b from local main 3c4e7cc (ROM-01A merge 2b363cb). Read brief, sole plan/spec/verification and actual Git state. The proposal covers lifecycle, conservative never-assigned draft deletion, guarded pickers and weekly occupancy/gaps. Check the actual approval record: if pending, obtain approval of D-1–D-6 and sketches before implementation; if approved, preserve unchanged approval and commit it before code. Default Turbopack build remains failed; no automatic acceptance exception. Keep #5 open; no ROM-01C implementation, institutional database operation, remote sync, worktrees or extra writers.”
