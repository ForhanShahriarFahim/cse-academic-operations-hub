# ROM-01A — Implementation plan and sole checklist

Parent: #5 ROM-01. Specification: [spec.md](spec.md). Evidence: [verification.md](verification.md).
Status: **Implemented locally from approved checkpoint `d130cb1`; verification complete; ready for owner inspection. Default build gate failed; acceptance and local merge pending.**
Branch / base: `codex/rom-01a` from clean local `main` `8c34c0e` (after BUG-24 merge `84964e2`).
Updated: 28 October 2026, Asia/Dhaka.

## Inspection and proposed approach

Extend the accepted teacher-editor patterns with room-specific rules rather than adding room maintenance/lifecycle or redesigning occupancy. Use focused room reads, a pure normalizer/impact assessment, server actions and editor-only audit reads. Keep the general portal/public projections intact. Proposed routes are `/rooms/new`, `/rooms/[id]` and `/rooms/[id]/edit`; enhance existing `/rooms` with entry points only.

Expected seams after approval: `src/db/schema.ts` and one migration/journal; `src/lib/auth/policy.ts`; new room-records/data/actions modules and room form/detail components; portal room routes; the room-specific lock/revalidation seam in existing `src/lib/actions.ts` and `src/lib/academic-actions.ts`; focused domain/safety/browser fixtures. Reinspect every room/reference writer before coding. No package/runtime/build configuration change is planned.

The integer revision avoids timestamp serialization/precision ambiguity. A canonical code index arbitrates races without rewriting legacy labels. Forward migration checks must fail clearly if legacy data needs a human decision. Use synthetic populated PGlite/PostgreSQL and recovery copies; institutional inspection/migration is a separate operation, never implicit approval of this feature plan.

Locking is necessary for the claimed room-edit safety: all room assignment and OD reference writers must participate, not just the new editor. Keep that integration restricted to current room values and edit warning evidence; do not expand it into general schedule concurrency or the ROM-01B picker/lifecycle work. Reuse current audience semantics but treat absent audiences as unknown. Read installed Next.js docs again if APIs/implementation assumptions change. The installed mutation/revalidation guides were inspected while specifying.

## Approval record

- Inspection/design authorization: owner's 27 October 2026 request to “Inspect and specify ROM-01A … prepare a detailed specification, one checklist and desktop/mobile mockups … for my approval before implementation.”
- Implementation authorization: **Granted by the owner on 27 October 2026 (Asia/Dhaka).**
- Approved scope: [spec.md](spec.md), D-1–D-6 and the [mockup package](mockups/index.html), limited to ROM-01A, including its narrowly necessary room-assignment/OD concurrency integration. No amendments requested.
- Actual approval/date/evidence: the owner replied **“approve.”** in this chat on 27 October 2026 to the presented specification, checklist and desktop/mobile mockups and the explicit request to approve D-1–D-6. This approval persists across handoffs; do not ask again for unchanged scope. Check documentation and **commit the approved plan locally before application changes**.
- Boundaries retained: no broader room backlog, institutional data operation, remote synchronization or material build-policy change authorized. BUG-24's default-build failure remains unresolved; its acceptance exception is not transferred to this implementation.
- Implementation acceptance/local merge: pending after verification and personal inspection; do not merge the proposal into `main` as accepted delivery.

## Tasks

- [x] T-01 — Inspect clean local baseline, workflow, room source/rules/schema, permissions, projections and mutation seams; prepare this bounded specification and decision set. Covers AC-01–AC-12 design.
- [x] T-02 — Prepare responsive desktop/mobile static mockups and inspect rendered proposal; record documentation checks and exact handoff. Covers AC-11 design only, not application acceptance.
- [x] T-03 — Obtain actual owner approval of spec/plan/mockups and D-1–D-6; record it and commit approved plan before code. Approved 27 October (“approve.”); local planning/approval checkpoint is this commit. Gate satisfied before application changes.
- [x] T-04 — Implement canonical validation, protected facts, pure impact/diff rules, revision/uniqueness migration and deliberate legacy-conflict preflight. Prove populated adapter upgrade/recovery. Covers AC-03/05/06/10; depends T-03.
- [x] T-05 — Add CSE-scoped capability, guarded room reads/actions, transactional revision/audit and editor-only paged Changes. Cover no-op/stale/unique/permission/error paths. Covers AC-01–AC-04/08; depends T-04.
- [x] T-06 — Integrate sorted room locks and current-room revalidation in manual create/update, auto placement and OD room-reference writes; exercise both race orders and rollback without expanding schedule scope. Covers AC-05–AC-07; depends T-04/05.
- [x] T-07 — Build add/detail/edit UI and directory entry points with responsive impact/warning acknowledgement, standard results and preserved input. Covers AC-01/02/06/08/11; depends T-05/06.
- [x] T-08 — Run meaningful focused permission/domain/adapter/concurrency/history/publication checks and desktop/mobile/print review; correct findings. Covers AC-01–AC-11; depends T-04–T-07.
- [x] T-09 — Run required final checks once on final code, inspect diff and record each AC with evidence/limitations. Present safe runnable owner review and screenshots; no institutional migration. Covers AC-12; depends T-08.
- [ ] T-10 — Obtain actual implementation acceptance, commit coherent local checkpoints with ROM-01A/#5, merge bounded delivery into local `main`, update handoff and leave parent #5 open. Suggest next slice only; owner starts the next session. Depends T-09 and acceptance.

## Verification and delivery

For this documentation-only session: local Markdown/asset links, anchors, required sections, actual approval evidence, single checklist, whitespace, static mockup rendering and overflow/label/focus spot checks; review all changed paths. Record exact evidence in [verification.md](verification.md). No app/database/build/domain/safety suite is needed or run merely for handoff.

After implementation: focused pure rules, direct-action role/scope matrix, uniqueness/stale/audit-failure checks, reference cases in all terms, merged and missing/unknown audiences, all room roles, legacy tokens, OD uncertainty and warning changes; real PostgreSQL two-connection interleavings for edit versus create/update/auto placement/OD insertion, populated upgrade and recovery on both adapters. Verify source notes/references/status and snapshot hashes, publication screen/CSV/print parity, directory print and phone keyboard/error flows. Add tests where they verify these risks, not to mirror UI markup.

Final code checks remain `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, plus relevant room/UI/safety checks (PostgreSQL included for migration/concurrency). Do not rerun successful whole suites without changed code/failure/uncertainty. Carry default Turbopack CSS-worker IPC failure as unresolved; Webpack is prior passing evidence, not a silent default-build substitute. Do not change `build`, bundler settings or dependencies without the required material decision. Record fresh failures and any alternate build evidence separately; do not borrow BUG-24's acceptance exception automatically for ROM-01A.

Owner implementation review must use the existing guarded disposable review harness, a verified synthetic target and private review credentials where needed. Never casually run `dev`, `start`, `test:ui` or `db:*` against configured storage. Show expected create/edit/duplicate/stale/impact/history flows and saved publication parity before acceptance. No pushes, PRs or GitHub updates under the current local-first scope.

## Current checkpoint / handoff

- Scope: approved ROM-01A only, from `d130cb1`; T-04–T-09 complete. **Ready for owner inspection; T-10 pending actual acceptance.** Parent #5 stays open; ROM-01B/01C excluded.
- Branch/base: `codex/rom-01a` / local `main` `8c34c0e`; implementation checkpoint **`e996e39`**, followed by this verification/capture handoff. One checkout/writer, no worktree or remote activity. No institutional database was opened or migrated.
- Implemented: migration 0010/preflight; canonical/protected/legacy rules; CSE-scoped add/edit/history; room revisions and atomic audit; fresh warning fingerprints; sorted room locks and in-transaction revalidation for manual/automatic placement and OD reference writes; responsive directory/form/detail/history.
- Passed: typecheck, lint, domain, all **19 safety groups including PostgreSQL 17.11**, room desktop/mobile/320px/axe/error/stale/warning/denied/print flows, production-bundle empty/loading/pending checks on a separate synthetic fixture, browser history 20+3 paging, saved publication screen/print/CSV parity, existing directory checks, and 11 applicable writer/teacher browser regressions (one fixture-dependent clash test skipped; temporary longer waits, unchanged assertions). Full evidence and diagnostic failures are in [verification.md](verification.md).
- Carried limitation: fresh unchanged default build fails in the Turbopack CSS-worker IPC path. Separately labelled Webpack production build passes with memory-only storage. No package, runtime, bundler configuration or build-script policy changed. No ROM-01A implementation acceptance/build exception is assumed from BUG-24. Owner inspection uses the guarded development harness, not the discarded production-mode PGlite diagnostic.
- Review: disposable development server `http://localhost:3100/rooms`, private synthetic session in ignored `.tmp/ux-review/session.local.json`; [capture index](../../../output/playwright/ROM-01A/implementation/index.html). The chat supplies a private loopback sign-in link. Keep credentials out of Git. Institutional preflight/backup/migration remains separately authorized.
- Next action: owner personally inspects and accepts or requests bounded corrections. **Do not merge before actual acceptance.** If accepted, record the wording/date and disclosed build result, merge only ROM-01A into local `main`, update this handoff and leave #5 open. Do not start another part; the owner starts the next session.
- Exact continuation: “Continue owner inspection/acceptance of ROM-01A on codex/rom-01a, implementation e996e39 from approved d130cb1. Read the brief and sole plan/verification; inspect current Git state. D-1–D-6 remain approved. Preserve passing evidence unless changes/failure justify repeating checks. Default Turbopack build remains failed; alternate Webpack build passed. Do not assume acceptance or a build exception, migrate institutional data, merge main, start ROM-01B/01C, create worktrees or synchronize remotes without the applicable owner instruction.”