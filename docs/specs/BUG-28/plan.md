# BUG-28 — Implementation plan and sole checklist

Issue: [#28](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/28). [Specification/D-1–D-4](spec.md), [verification](verification.md), [state sketches](review-states.md).
Status: **D-1–D-4 approved for implementation on 1 November 2026; implementation in progress.**
Branch/base: `codex/bug-28` from local main `f09df27` (ROM-01C merge `0dc096c`, acceptance `e99f586`). Updated: 1 November 2026, Asia/Dhaka.

## Inspection and proposed approach

No extra worktree/writer. Five production active-row query sites, original schema/default, real migration/preparation seams, source seed and fixture-only switching were inspected. An explicit `memory://` baseline reproduction confirms duplicate default-active inserts. Institutional counts/statuses were not queried. Read the installed Next.js error-handling and mutating-data guides; recheck relevant guide sections before app edits if seams change. No dependencies or tool-specific skill are needed for this planning package.

Add a partial unique index in the forward migration and Drizzle schema. Serialize migration's duplicate check/index creation with term writes and prove actual runner transaction behavior. Add a small shared server reader and typed configuration refusal without importing the broad portal loader (avoid auth/data cycles). Use a pure none/one/ambiguous classifier only if it meaningfully supports callers/tests. Keep transaction-reader support for teacher checks. Integrate the five sites, specific shell/public/CSV handling and narrow ActionResult conversion for affected required-term/ref-count callers; preserve role precedence and expected missing/stale handling. Do not broaden term-dependent behavior into global APIs.

Add the read-only diagnostic to `package.json` and the existing target/environment contract with a standalone guarded entry point; it must not import or call preparation/migration. Document the operator process under `docs/operations/` and link it from README. Actual remediation mappings/status mutations require a separate owner-approved operation, backup and audit; no repair implementation is included. Test helpers remain pinned to owned disposable targets under the existing safety harness. The [state sketches](review-states.md) are reviewable copy/layout proposals, not production evidence.

Likely files: `src/db/schema.ts`, next SQL migration and `drizzle/meta/_journal.json`; shared term reader; `src/lib/{data,public-routine,term-scope,teacher-data}.ts`; affected action modules, portal layout/shell, public viewer/official and CSV routes; diagnostic command/target contract and README/runbook; focused domain/safety child checks and registration. Avoid regenerating unrelated schema snapshots or rewriting old migrations. Current expected migration number is 0013; verify journal at implementation start.

## Approval record

- Planning authorization: owner said **“accepted and go for the next task.”** on 1 November after the explicit next-task proposal was BUG-28 inspection/specification following C acceptance. This authorizes planning in this chat without another session.
- Prerequisite complete: C acceptance `e99f586`, merge `0dc096c`, receipt `f09df27`; parent #5 remains open. C's failed default build is accepted for C only.
- **Implementation authorization: Approved on 1 November 2026, Asia/Dhaka.** Owner: “approved.” This directly answers the request to approve BUG-28 D-1–D-4 at proposal `0d2c9f5`. The specification, state sketches and checklist are approved without amendment. This approval is committed before feature code.
- Institutional operation/remediation mapping and GitHub synchronization: not authorized. No status/term has been selected.
- Feature acceptance/local merge of BUG-28: pending after implementation and review.

## Tasks

- [x] T-01 — Inspect schema, all production selectors, action/page/export consumers, migrations/preparation and fixture switch; reproduce the schema defect using explicit in-memory synthetic data. AC-01–AC-07 design evidence.
- [x] T-02 — Prepare bounded specification/D-1–D-4, state sketches, migration/remediation boundaries, verification requirements and exact handoff; check links/content/diff and commit the proposal. Planning only.
- [x] T-03 — Obtain actual approval of D-1–D-4, record wording/date/amendments and commit the approved plan before feature code. Owner approved 1 November without amendment. Depends T-02.
- [ ] T-04 — Add matching index/forward guarded migration and prove clean/duplicate upgrades, reapply and backup/restore with preserved populated history on both adapters. AC-01/02; depends T-03.
- [ ] T-05 — Add shared reader; integrate the five sites and affected action/shell/public/CSV boundaries, preserving transaction, authorization and history contracts. AC-03/04/07; depends T-03/04.
- [ ] T-06 — Add read-only target-aware diagnostic and operator runbook; prove preview/read-only/credential/resource behavior without institutional access. AC-06; depends T-03/04.
- [ ] T-07 — Prove PostgreSQL activation/insert/migration races in both orders plus rollback; complete production-action/history/browser/export/print checks, fix findings and run final required suites. AC-01–AC-08; depends T-04–T-06.
- [ ] T-08 — Commit verified delivery; present guarded synthetic runnable owner review and CLI examples with limitations; obtain actual acceptance before local-main merge and update receipt. Suggest SET-01A inspection/specification next; do not automatically start it. Depends T-07 and acceptance.

## Verification and delivery

Planning: verify local links/anchors, sections, source-path references, D-1–D-4/AC-01–AC-08 consistency, one primary checklist, unapproved state and exact handoff; review diff and in-memory reproduction receipt. No product files change, so no code/build/safety/browser run is represented as necessary planning verification. State sketches are Markdown with viewport/print contracts, not executable HTML; implementation browser QA remains pending.

Implementation: run focused new checks through adapter-neutral factories plus the existing two-term history/room/teacher scenarios. Use old-migration synthetic fixtures for duplicates; do not disable live constraints. Compare complete business/status/audit/snapshot fingerprints before/after failed operations and clean migrations, permitting only expected schema/journal metadata. Verify read-only CLI creates no backfill or new rows even on an empty or pre-0013 term table. Cross-check source seed and implicit-status fixtures under the new guard. Prove write rollback, permission precedence and teacher-deactivation blocking using actual production entry points. Test required context on all touched action boundaries; do not count a classifier-only check as integration evidence.

Use owned PostgreSQL two-connection barriers to prove both commit orders and rollback cases for activation/insert contention and migration versus an in-flight writer. `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin` is the recorded harness tool location; validate availability without service/PATH changes. PGlite is required for populated migration/constraint/recovery; PostgreSQL concurrency remains pending if unavailable. Use safe synthetic production review per the existing harness; never casually run configured `dev`, `start`, `test:ui` or `db:*` against institutional storage. Do not run `db:reset` there.

Final code checks: typecheck, lint, domain, **default** build, all relevant full safety groups with PostgreSQL, targeted production browser/axe/keyboard at desktop/390/320, unavailable public/CSV and normal published-byte parity, applicable A4 print. Label alternative build evidence separately; any default-build failure needs its own disclosed decision, without inheriting C's exception. Record exact results in verification and present a runnable safe owner-review path before acceptance/merge. No routine push/PR/issue edits.

## Current checkpoint / handoff

- Approved scope: D-1–D-4 at proposal `0d2c9f5`, approved by the owner on 1 November without amendment.
- Branch/base: `codex/bug-28` / `f09df27`, one writer in this checkout, no worktrees. C acceptance/merge/receipt already preserved on local main. Last remote reconciliation 26 October; no remote query/update this session.
- Completed: T-01–T-03. The sole checklist above owns implementation progress. [Verification](verification.md) separates inspected baseline from pending fix evidence.
- Proposal checkpoint: this spec/plan/state-sketch/inspection/verification package plus brief/local-sequence/roadmap pointers. No app/schema/migration/command feature edits.
- Next action: implement T-04 onward autonomously within approved scope after this approval checkpoint is committed.
- Blockers: none for implementation. Any real duplicate resolution requires actual census and owner-approved exact mapping in a separately authorized operation. No such census/mapping exists here.
- Exact continuation: “On `codex/bug-28`, read the brief and BUG-28 spec/sole plan/verification/state sketches, then inspect Git. D-1–D-4 at `0d2c9f5` were approved on 1 November; do not ask again. Continue T-04 onward: bounded constraint, shared read guards and feedback, read-only diagnostic and safe migration/runbook, then full verification and owner review. Preserve status/history/public snapshots and institutional storage; no automatic active-term choice, activation/repair feature, worktree or remote sync. C's default-build exception does not waive BUG-28's build check. Actual feature acceptance precedes local merge.”
