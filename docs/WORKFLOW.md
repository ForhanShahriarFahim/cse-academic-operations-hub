# Shared development workflow

Approved design: 30 September 2026. Established in [WORKFLOW-01 / #20](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20); delivery progress is in [its plan](plans/WORKFLOW-01.md).

Owner amendment: **26 October 2026 (Asia/Dhaka), local-first delivery.** The owner asked to keep development local, reduce GitHub activity, prepare a concrete sequence of small parts, specify each part in detail before building, validate it, show it for personal inspection, and merge its branch into local `main` after acceptance. The owner then opens another session for the suggested next task. This changes synchronization cadence, not the specification, data-safety or acceptance gates. The [local delivery plan](plans/LOCAL_DELIVERY_2026-10-26.md) records the inspected sequence and next-session handoff.

## Start and document ownership

Read the [project brief](PROJECT_BRIEF.md), this workflow, the selected issue records and relevant code/source sections. [AGENTS.md](../AGENTS.md) provides shared entry instructions; [CLAUDE.md](../CLAUDE.md) imports them. Use the [glossary](../CONTEXT.md) for domain language and [architecture records](architecture/ADR-001-academic-operations-boundaries.md) for accepted boundaries.

Read [product requirements](PRODUCT_REQUIREMENTS.md) for behavior/rationale, the [roadmap](ROADMAP.md) for priorities/dependencies and [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for approved answers/open gates. Existing feature proposals still need issue-specific approval. Link to primary records instead of duplicating them. GitHub retains issue discussion and remote open/closed state; the repository owns specifications, task plans, local progress and evidence. During local-first work, record remote status as a dated snapshot; local acceptance/merge does not mean GitHub has been updated. Do not repeat GitHub reads/edits unless new uncertainty, changed dependencies or a synchronization boundary warrants them.

## Issue lifecycle

1. **Inspect:** establish actual code/data behavior, reproduction for bugs, relevant source facts, dependencies and unresolved decisions. Never infer institutional answers from old summaries.
2. **Specify:** define outcome, scope/exclusions, behavior, permissions, edge cases and testable acceptance criteria. Use identifiers such as AC-01.
3. **Plan:** identify relevant changes, tasks, dependencies, verification and migration/recovery needs. Inspect/register or reuse the issue; avoid duplicate issues and preserve existing IDs.
4. **Approve:** present concrete specification and plan. Record the owner's actual authorization, date and scope; template status or elapsed time is not approval. Commit the approved plan before feature implementation.
5. **Implement:** carry out approved tasks autonomously; record unrelated discoveries as separate backlog items. Obtain a decision on material scope/behavior changes or missing institutional facts before dependent work.
6. **Verify and review:** map results to acceptance criteria, inspect the diff, exercise relevant user flows and fix findings. Record unavailable environments/checks as pending rather than passed.
7. **Deliver and accept:** commit verified work locally, present a runnable review path or applicable CLI evidence, acceptance results and limitations, then let the owner inspect it. Obtain actual acceptance before merging into local `main`. A PR/push is not required for a local merge under the current agreement. Synchronize GitHub only when requested or agreed; partial slices keep their parent issue open.
8. **Resume or advance:** update the brief/current issue pointer and the selected plan's handoff at a meaningful boundary. After acceptance suggest the next ready part from updated local `main`; the owner opens the next session. Do not silently start it. Blocked work does not authorize an unrelated feature automatically.

Use the [specification](templates/feature-spec.md), [implementation plan](templates/implementation-plan.md) and [verification](templates/verification.md) templates. Create substantial issue records under `docs/specs/<ISSUE-ID>/` as `spec.md`, `plan.md` and `verification.md`. A small bug can combine their essential sections in one document or a versioned issue-linked record. Avoid empty future folders and mandatory paperwork unrelated to risk.

## Git and agent handoffs

- One active implementation issue and one writer per checkout. Use branches in the existing folder; no additional worktrees under the current agreement.
- Inspect local changes and local `main` before starting an issue branch; preserve unrelated work. Refresh/reconcile the remote when synchronizing or when remote changes could affect the selected scope. Record the last remote check rather than claim unqueried remote freshness. Use the repository prefix, for example `codex/safe-01`; no branch per technical task or per agent switch.
- Keep issue specification, plan, implementation, tests and corrections together on its branch. Commit approved plans and coherent checkpoints with the issue ID; related code and tests may share a commit.
- Check documentation and commit the approved plan locally before implementation. Commit coherent implementation checkpoints after relevant checks; keep unfinished checkpoints explicit. No routine milestone pushes, PRs or issue comments under the local-first agreement.
- After owner acceptance, merge the bounded delivery into local `main`, retaining meaningful plan/implementation commits. At an agreed remote synchronization boundary, push/reconcile preserved history and update the actual issue status concisely. Do not use automatic issue-closing keywords until the whole issue is accepted.
- Remove finished merged branches only after checking that needed work is preserved. Branches and Git commits do not back up institutional databases.
- Approval of unchanged scope persists when switching agents. Record scope/approval references, branch/base, commits/uncommitted changes, completed tasks, next action, checks and blockers in the primary plan. The receiving agent inspects actual Git/code state before resuming.
- A large issue may have separately approved, usable slices. Give each slice a stable local suffix (for example ROM-01A under #5), its own criteria and acceptance; merge one accepted slice at a time and keep the parent open until all required slices pass. Technical subtasks of one approved slice stay on its branch. Do not invent GitHub issues just to mirror local subtasks.
- Tool-specific memory, plugins and slash commands may help execution but are not required project records. Report missing capabilities and their affected checks. File instructions guide behavior; they do not replace permissions, tests or human acceptance.

## Verification and data rules

For code changes, run `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build`, plus relevant integration, permission, database, browser, mobile, print or export checks. During development use focused checks; repeat final checks when subsequent changes or unresolved failures justify it.

For documentation-only changes, check links, references, whitespace, source-content preservation and template structure; review the diff. Do not launch database-preparation commands for documentation verification. Record static instruction-path checks separately from live client-loading tests.

Preserve populated data with forward-only migrations and exercised recovery on disposable copies. Never use `db:reset` on institutional data. Keep secrets, dumps and private student data out of commits and issue/PR text. Enforce permissions on server entry points and record required audits atomically. Preserve term history and immutable publications; source material is evidence, not permission to expose arbitrary directory fields.

For UI work, review desktop/mobile and applicable print states, keyboard access, labels/focus and readable contrast. Cover loading, empty, pending, success, validation/conflict, stale and denied states as applicable. Screen/export/print projections must agree. Consult installed Next.js documentation before relevant code changes.

Reuse the paper/ink/pine/gold design language. Sketch changed desktop, narrow/mobile and applicable print workflows before coding; obtain review for material workflow changes. Keep consistent hierarchy/action placement and preserve context after saves. Dense routines/ledgers need compact readable rows, stable time headings, useful sticky headers and no page-wide mobile overflow. Check A4 print headings/date/version and clipping; associate errors with labels, announce feedback and use more than color for status. Capture relevant desktop/mobile/print screenshots and correct regressions before final delivery.

Choose meaningful checks for changed rules: pure calculations/lifecycle, server-action permissions, database constraints/history, successful and failed user flows, export parity, merged classes, cross-department students, unknown counts and exact-minute overlaps. For schema changes verify a populated PGlite copy and PostgreSQL; backfill safely before non-null constraints, exercise recovery before irreversible changes and keep unavailable adapter verification pending. Check clean source-fixture preparation on disposable data when appropriate; update relevant README/brief/screenshots after domain checks.

Production requires separate staging/production infrastructure, OAuth/permissions verification, hosted PostgreSQL migration/recovery evidence, monitoring and rollback. [Release requirements](PRODUCT_REQUIREMENTS.md#release-requirements-dep-01) and DEP-01 retain the detailed gates. Documentation or local checks do not certify production readiness.

## Token-efficient execution

- Keep entry instructions and the brief concise; read selected issue/relevant code instead of the whole project on every turn.
- Search before broad reads. Reuse context already inspected; reinspect changed or uncertain sections and current Git state at handoff.
- Maintain one task checklist and link evidence. Update on task completion, decisions, blockers or handoff rather than each edit.
- Use compact tool output and progress summaries. Preserve meaningful evidence without copying full logs or transcripts.
- Scale specs/tests/review to risk while retaining required checks. Additional agents need explicit authorization and a useful independent task.
- Use high reasoning effort for planning, specification and material design changes when supported by the selected session. Model/effort selection is controlled by the session; do not claim a switch that did not occur or create extra agents/API calls merely to simulate it.
- Do not reread docs, rerun passing checks or seek approval merely to repeat completed process steps.
