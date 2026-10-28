# ROM-01A — Planning and implementation verification

Updated: 28 October 2026, Asia/Dhaka. Sole checklist: [plan.md](plan.md).
Status: specification/plan/mockups approved at `d130cb1`; implementation verification below. Owner inspection, acceptance and local merge pending.

## Inspected baseline

- Clean local `main` was `8c34c0e`, after accepted BUG-24 merge `84964e2`. Created local `codex/rom-01a` in this checkout. No extra worktree or agent.
- Read AGENTS.md, project brief, workflow, local delivery plan, relevant requirements/architecture/institutional decisions, Summer room placements, seed and migration defaults, room schema/page/loaders/conflict/workbench/manual/automatic mutation seams, role guard and teacher editor/audit/result patterns. Findings and links are in [spec.md](spec.md#problem-and-inspected-baseline).
- Installed Next.js mutation and `revalidatePath` guides inspected. Their server authorization and post-commit refresh guidance informs the proposal; no Next.js application code changed.
- Room facts are source/code observations, not a census or verification of the institutional database. No app server or database command was run. No secrets/dumps/private student data are in the proposal; mockup records and counts are illustrative.

## Planning checks

- Passed: 14 changed/new planning text files checked; 205 local Markdown/HTML/stylesheet/capture references and 14 heading/fragment anchors resolve. Required spec/plan sections, pending approval and exactly one task checklist are present. `git diff --check` and explicit new-file trailing-whitespace checks pass.
- Passed: eight static HTML mockups rendered in headless Edge at 1440×1000, 390×844 and 320×800 (24 page/viewport combinations). No horizontal overflow, unlabelled form input/select/textarea, or page script error. Edit impact precedes Save in DOM order. First keyboard focus on the add screen is Skip to content at each width. These are static design checks, not full application accessibility or mutation tests.
- Captured: 14 full-page desktop/phone PNGs in [output/playwright/ROM-01A](../../../output/playwright/ROM-01A/). Machine observations: [render-review.json](../../../output/playwright/ROM-01A/render-review.json). The [review index](mockups/index.html) links each workflow and its captures. Visually inspected directory, add, edit/blocked impact, protected edit, detail/history and feedback layouts; mobile content wraps and assigned-use checks precede Save.
- Capture tooling: Playwright skill used. The optional CLI package was absent from offline cache; used the already-installed Playwright library and Edge for one-off static capture, without adding test specs/dependencies. Initial sandboxed browser launch failed; permitted unsandboxed static capture succeeded. This is unrelated to the inherited Next.js build defect. No app or database modules are imported by the capture/review scripts.
- Local review: a static, loopback-only preview at `http://127.0.0.1:3175/` serves only this proposal and its captures; it is not a Next.js/dev/database server. Verified HTTP 200 for the index, edit mockup, specification and phone capture from the desktop environment. Browser/spec tabs were queued through the app. If the temporary preview stops, open [mockups/index.html](mockups/index.html) directly in a browser; all files and CSS are local and network-independent.
- Diff review: changes are limited to the ROM-01A documentation/static mockups/captures and brief/delivery-plan pointers. AGENTS.md, application/source/schema/migrations, package files, Next.js configuration and historical issue verification are unchanged. No database was opened, no institutional migration/reset, no remote synchronization and no application suites run.

These checks do not establish passing feature criteria. The separate actual owner approval below satisfies T-03; T-04 remains the next task. Original proposal PNGs retain their review-time “Design proposal” banner as historical design evidence; application functionality is not implied by approval.

## Carried build evidence

[BUG-24 verification](../BUG-24/verification.md) records passed typecheck/lint/domain/UX harness, all 17 safety groups including PostgreSQL, and Webpack production build. The default Turbopack production build failed with the CSS-worker IPC failure. Its acceptance exception was disclosed and accepted; the defect remains unresolved. No successful suite was rerun for this planning handoff, and no bundler/runtime/build policy changed.

## Approval handoff at d130cb1 (historical)

AC-01–AC-12: pending implementation, verification and owner inspection. No migration or application functionality delivered. The owner replied **“approve.”** on 27 October 2026 after the specification, checklist and desktop/mobile mockups (including D-1–D-6) were presented. Approval is recorded in [plan.md](plan.md#approval-record) and the local checkpoint `docs(ROM-01A): approve room-directory specification and mockups (#5)` before application changes. No amendments; no repeated code/build/safety/browser suites for the approval-only update. Parent #5 remains open; no GitHub activity or local merge performed for this planning delivery.

Approval checkpoint checks: 14 planning text files, 206 local links and 15 anchors pass; actual owner wording and approved boundaries are present, one checklist remains, and `git diff --check` passes. Application/source/schema/dependency/build files remain unchanged. Prior static render evidence is reused because the mockup files did not change during approval recording.

## Implementation verification — 27–28 October 2026

Implemented from approved `d130cb1` on the existing `codex/rom-01a` branch. D-1–D-6 are unchanged. No agent/worktree, remote activity, institutional inspection/migration/reset, publication rewrite or ROM-01B/01C implementation. The institutional directory was never opened; the completed safety run reports its metadata unchanged.

The implementation adds migration 0010, pure room rules, scoped server reads/actions, integer revisions, atomic ID-linked audit events, fresh warning evidence, paged editor history and add/detail/edit screens. Manual create/update, automatic placement and room-reference deletion/OD writes use the shared room lock contract. Meeting updates first lock their meeting and then the ascending union of stored/new room IDs. Editors lock the room before reading references across every term. Automatic placement validates all current rooms before inserting any suggestion; all suggestions/audits remain one transaction. No broader scheduling/publication concurrency claim is made.

### Checks and results

| Check | Result / evidence |
| --- | --- |
| `npm run typecheck` | Passed on final application code. |
| `npm run lint` | Passed on final application code. |
| `npm run test:domain` | Passed, including new room rules and the updated approved capability/access-summary expectation. |
| `npm run test:safety` with `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin` | **All 19 groups passed**, PostgreSQL included. No pending/skipped adapter group; institutional metadata unchanged. |
| Focused room adapters | Passed PGlite and PostgreSQL 17.11: populated preservation, deliberate legacy preflight, constraints, role/scope/time-bound denials, stale/no-op/unique results, audit rollback, all-term alternative/segment references, partial capacity improvements, unknown/empty/merged audiences and partial OD evidence. |
| Real PostgreSQL interleavings | Passed both commit orders for actual manual create/update, actual auto-plan/apply and OD insert actions versus room edit, using audit-trigger/row-lock barriers. Also two-editor stale race, concurrent create/rename uniqueness, OD acknowledgement refresh and batch rollback. Only provider/request dependencies are controlled in the pinned action child; application authorization/actions/transactions are real. |
| Migration and recovery | Passed both adapters. A populated synthetic 0009 schema (only 0010 additions removed) preserves all prior room/business/reference/snapshot/audit values through forward migration; revision starts at 1. Invalid legacy data fails without migration/schema/data/journal changes. Pre-0010 cold PGlite backup and encrypted PostgreSQL dump restore to distinct owned targets with identical full schema/sequence/table fingerprints. No institutional rollout performed. |
| Room browser review | Passed default development review harness in headless Edge: 23 captures, 1440/390/320px, maximum-length code, error-summary focus, create/duplicate/stale/reload, protected facts, assigned-use blocker, warning acknowledgement/history, viewer denied/missing, no page errors, no page-wide overflow and WCAG 2 A/AA axe checks on narrow screens. [Machine record](../../../output/playwright/ROM-01A/implementation/ui-review.json). |
| Existing directory browser tests | Both `/rooms` overflow and desktop/phone axe regressions passed. |
| Empty/loading/pending | Passed against a separate guarded synthetic roomless fixture: delayed route response displays loading; delayed POST disables Save and announces Saving, then retains field errors. [Record](../../../output/playwright/ROM-01A/implementation/empty-loading-pending.json). These read/invalid-write state checks used the separately labelled Webpack bundle; they are not evidence for production PGlite write consistency. |
| Print review | A4 landscape directory PDF rendered with Poppler and visually inspected on all four pages: recorded labels/occupancy/notes remain, edit/add controls are absent, no horizontal clipping or lost content. Cards continue across page boundaries as in the existing print; no pagination redesign was introduced. [PDF](../../../output/playwright/ROM-01A/implementation/rooms-print.pdf). |
| `npm run build` (unchanged default) | **Failed**: Turbopack `globals.css` worker process exits before IPC connection, while writing `/_not-found/page`. This repeats the carried BUG-24 limitation. It is not a passing default build. |
| Alternate Webpack build | **Passed** separately on final code: `next build --webpack`, explicitly setting `DATABASE_URL=''`, `PGLITE_DATA_DIR='memory://'`, `npm_lifecycle_event='build'`. No script/dependency/runtime/bundler configuration changed. |
| Publication parity | Passed in the approved development harness: rename `NB-506 → QA-506 → NB-506` changes live labels while published viewer text, official screen/print text and CSV bytes stay exactly identical. Both adapter suites also compare every saved published/superseded version row and JSON. [Hashes/comparisons](../../../output/playwright/ROM-01A/implementation/publication-parity.json). |
| Browser history paging | Passed: 20 initial events; Load older appends three including creation, with no duplicate or remaining button. [Record](../../../output/playwright/ROM-01A/implementation/history-paging.json). |
| Affected existing browser regressions | **11 passed, one conditionally skipped** on the publishable fixture, using a temporary 60-second expectation timeout for the same assertions. Covers room save/undo, rejected clashes, delete/undo, drag/undo, keyboard move alternative, phone agenda, and teacher lifecycle/permission flows. The default 10-second-wait run had seven passes/two timeouts; its teacher capture still showed Saving. The skipped clash-marking test needs blockers, which this publishable fixture deliberately clears. Repository test/build configuration is unchanged. |

Browser findings corrected: React 19 action-form reset discarded selected values on refused saves; remounting the submitted form preserves the complete controlled draft. A 30-character room code displaced its owner badge at 320px; the card now permits its identity column to shrink and wrap. A warning-fingerprint test found that a changed audience component could leave the aggregate unknown; the fingerprint now includes individual audience counts and OD evidence, not only the aggregate.

Tooling/environment observations: the optional Playwright CLI was absent from the offline cache, so the installed Playwright library and Edge drove the one-off review without new packages/test specs. Sandboxed Edge and PostgreSQL localhost access failed; the same owned-target checks passed outside that sandbox. Development route compilation required longer cold-navigation waits. A diagnostic production-mode PGlite preview showed inconsistent post-save reads in room, routine and existing teacher flows; it was discarded and a fresh approved development-harness copy prepared. Production PGlite is not used as passing write evidence or recommended for owner inspection. The existing storage/runtime policy is unchanged; deployment PostgreSQL and broader runtime work are outside ROM-01A.

### Acceptance mapping

| Criterion | Evidence / state |
| --- | --- |
| AC-01 | Scoped actions and browser create/edit; stable ID/references/status, live directory and visible success. |
| AC-02 | Real server role/scope matrix, ended grants, no-session denials, guarded history reads and browser direct edit denial; existing AUTH-02 session revocation groups pass. |
| AC-03 | Pure validation, adapter field/unique errors, numeric/NB protected identities, controlled vocabulary and verbatim legacy extras; concurrent create/rename unique arbitration. |
| AC-04 | PostgreSQL two-connection save/stale race, PGlite sequential stale/no-op and injected audit failure rollback. |
| AC-05 | Differential suitability tests across terms/roles, known equal seats/partial improvements, cancelled references ignored, existing unrelated blockers permit corrections. |
| AC-06 | Empty/local/external audience evidence and OD-only/partial references; evidence-loss blocker; fresh acknowledgement and no blocker bypass; browser warning flow. |
| AC-07 | Actual production action lock barriers plus batch rollback; explicitly limited to room suitability/reference races. |
| AC-08 | Exactly one atomic ID-linked before/after event per save; no events for failure/no-op, stored actor names, rename continuity, server and browser 20-event paging. |
| AC-09 | All published/superseded database rows and JSON identical in adapter checks; representative viewer/official screen/print text and CSV bytes identical across a live rename. |
| AC-10 | Populated forward upgrade/preflight and full-fingerprint pre-upgrade restoration on both synthetic adapters; institutional migration separately pending by design. |
| AC-11 | Responsive/axe/focus/denied/stale/error/impact/empty/loading/pending/print checks above. Owner visual inspection remains pending. |
| AC-12 | Required checks attempted and recorded honestly. **Partial** because the unchanged default build fails; no ROM-01A acceptance exception or local merge assumed. Local-only source/diff review passes; presentation is ready for owner inspection. |

### Owner inspection and delivery boundary

Use the guarded development review harness at `http://localhost:3100/rooms`, with its private synthetic reviewer session in ignored `.tmp/ux-review/session.local.json`. It is a disposable copy, not institutional storage. If restarting, use `node node_modules/tsx/dist/cli.mjs scripts/ux-review.ts --fresh --publishable`; retrieve private review sign-in through the harness, never commit the session file or paste cookies into these records.

Implementation checkpoint: **`e996e39`** (`feat(ROM-01A): add guarded room directory and assignment safety (#5)`). Source/credential-pattern and staged-path review found no secrets, session files, dumps or private student data. `git diff --check` passes. Package files, dependency versions, Next.js configuration, database target/runtime policy and build scripts remain unchanged. The verification/capture checkpoint follows on the same branch; local `main` remains `8c34c0e`.

Final documentation review: seven handoff/review text files and 181 local links resolve; the sole ten-task checklist has T-01–T-09 complete and T-10 awaiting acceptance. The retained development regression log contains one PGlite `RuntimeError: Aborted()` line during the diagnostic load; subsequent requests and all 11 applicable assertions passed, but the disposable copy failed to reopen after stopping the server. No runtime repair is bundled. Only that review copy was rebuilt with the harness's documented `--fresh --publishable --prepare-only` path. The final loopback-only development preview's private sign-in link was checked in Edge: HTTP 200, Rooms & occupancy heading and Add room visible. Institutional storage was never targeted. If the disposable preview later becomes unreadable, rebuild it through the guarded harness rather than opening or resetting institutional storage.

Inspect adding a room with blank seats/owner, duplicate validation, corrections and Changes, two-tab stale handling, protected room facts and assigned-use warnings. The [implementation captures](../../../output/playwright/ROM-01A/implementation/) preserve the reviewed states. No institutional migration is part of this delivery. Parent #5 remains open; ROM-01B/01C are excluded. Actual implementation acceptance, any decision on the disclosed default-build gate, and merging into local `main` remain with the owner.
