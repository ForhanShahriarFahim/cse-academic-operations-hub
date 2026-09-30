# Shared development workflow

Approved design: 30 September 2026. Established in [WORKFLOW-01 / #20](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20); delivery progress is in [its plan](plans/WORKFLOW-01.md).

## Start and document ownership

Read the [project brief](PROJECT_BRIEF.md), this workflow, the selected issue records and relevant code/source sections. [AGENTS.md](../AGENTS.md) provides shared entry instructions; [CLAUDE.md](../CLAUDE.md) imports them. Use the [glossary](../CONTEXT.md) for domain language and [architecture records](architecture/ADR-001-academic-operations-boundaries.md) for accepted boundaries.

During Step 2, the [existing execution plan](plans/PROJECT_EXECUTION_PLAN_2026-09-26.md) retains feature order, domain requirements and institutional decisions; the [solution roadmap](IMPLEMENTATION_SOLUTION_ROADMAP.md) retains feature rationale. Their migration is Step 3. Existing feature proposals still need issue-specific approval.

After migration, requirements belong in the product requirements document, priorities/dependencies in the roadmap and institutional answers in the decision register. Link to primary records instead of duplicating them. GitHub owns issue discussion and open/closed state; the repository owns versioned specifications, task plans and evidence. Date status summaries when reconciled.

## Issue lifecycle

1. **Inspect:** establish actual code/data behavior, reproduction for bugs, relevant source facts, dependencies and unresolved decisions. Never infer institutional answers from old summaries.
2. **Specify:** define outcome, scope/exclusions, behavior, permissions, edge cases and testable acceptance criteria. Use identifiers such as AC-01.
3. **Plan:** identify relevant changes, tasks, dependencies, verification and migration/recovery needs. Inspect/register or reuse the issue; avoid duplicate issues and preserve existing IDs.
4. **Approve:** present concrete specification and plan. Record the owner's actual authorization, date and scope; template status or elapsed time is not approval. Commit the approved plan before feature implementation.
5. **Implement:** carry out approved tasks autonomously; record unrelated discoveries as separate backlog items. Obtain a decision on material scope/behavior changes or missing institutional facts before dependent work.
6. **Verify and review:** map results to acceptance criteria, inspect the diff, exercise relevant user flows and fix findings. Record unavailable environments/checks as pending rather than passed.
7. **Deliver and accept:** commit/push verified work, present evidence and limitations, and obtain required owner acceptance before merge/closure. Partial delivery can be pushed and reviewed while the issue remains open.
8. **Resume or advance:** update the brief/current issue pointer at a meaningful boundary. After acceptance select the next ready issue from updated main; blocked work does not authorize an unrelated feature automatically.

Use the [specification](templates/feature-spec.md), [implementation plan](templates/implementation-plan.md) and [verification](templates/verification.md) templates. Create substantial issue records under `docs/specs/<ISSUE-ID>/` as `spec.md`, `plan.md` and `verification.md`. A small bug can combine their essential sections in one document or a versioned issue-linked record. Avoid empty future folders and mandatory paperwork unrelated to risk.

## Git and agent handoffs

- One active implementation issue and one writer per checkout. Use branches in the existing folder; no additional worktrees under the current agreement.
- Inspect local changes, fetch/reconcile main safely before starting an issue branch, and preserve unrelated work. Use the repository prefix, for example `codex/safe-01`; no branch per task or per agent switch.
- Keep issue specification, plan, implementation, tests and corrections together on its branch. Commit approved plans and coherent checkpoints with the issue ID; related code and tests may share a commit.
- Check documentation before pushing its approved plan; push implementation milestones after relevant verification and final delivery after required checks. Explicitly label unfinished local checkpoints; never describe them as verified.
- Push to the issue branch. A draft PR can expose pending work. Prefer preserving meaningful plan/implementation commits when merging after acceptance. Do not use automatic issue-closing keywords until full acceptance is satisfied.
- Remove finished merged branches only after checking that needed work is preserved. Branches and Git commits do not back up institutional databases.
- Approval of unchanged scope persists when switching agents. Record scope/approval references, branch/base, commits/uncommitted changes, completed tasks, next action, checks and blockers in the primary plan. The receiving agent inspects actual Git/code state before resuming.
- Tool-specific memory, plugins and slash commands may help execution but are not required project records. Report missing capabilities and their affected checks. File instructions guide behavior; they do not replace permissions, tests or human acceptance.

## Verification and data rules

For code changes, run `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build`, plus relevant integration, permission, database, browser, mobile, print or export checks. During development use focused checks; repeat final checks when subsequent changes or unresolved failures justify it.

For documentation-only changes, check links, references, whitespace, source-content preservation and template structure; review the diff. Do not launch database-preparation commands for documentation verification. Record static instruction-path checks separately from live client-loading tests.

Preserve populated data with forward-only migrations and exercised recovery on disposable copies. Never use `db:reset` on institutional data. Keep secrets, dumps and private student data out of commits and issue/PR text. Enforce permissions on server entry points and record required audits atomically. Preserve term history and immutable publications; source material is evidence, not permission to expose arbitrary directory fields.

For UI work, review desktop/mobile and applicable print states, keyboard access, labels/focus and readable contrast. Cover loading, empty, pending, success, validation/conflict, stale and denied states as applicable. Screen/export/print projections must agree. Consult installed Next.js documentation before relevant code changes.

Production requires separate staging/production infrastructure, OAuth/permissions verification, hosted PostgreSQL migration/recovery evidence, monitoring and rollback. The existing execution plan and DEP-01 retain the detailed release gates until migration. Documentation or local checks do not certify production readiness.

## Token-efficient execution

- Keep entry instructions and the brief concise; read selected issue/relevant code instead of the whole project on every turn.
- Search before broad reads. Reuse context already inspected; reinspect changed or uncertain sections and current Git state at handoff.
- Maintain one task checklist and link evidence. Update on task completion, decisions, blockers or handoff rather than each edit.
- Use compact tool output and progress summaries. Preserve meaningful evidence without copying full logs or transcripts.
- Scale specs/tests/review to risk while retaining required checks. Additional agents need explicit authorization and a useful independent task.
- Do not reread docs, rerun passing checks or seek approval merely to repeat completed process steps.
