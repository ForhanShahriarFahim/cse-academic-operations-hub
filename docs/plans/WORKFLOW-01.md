# WORKFLOW-01 — Shared spec-driven development workflow

Status: Step 2 delivered; Step 3 document migration remains pending.
Prepared: 30 September 2026 (Asia/Dhaka).
Branch: `codex/workflow-setup`.
GitHub issue: [#20 WORKFLOW-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20).

## 1. Outcome and authorization

Give Codex and Claude the same repository-owned requirements, approval gates, task records and verification evidence. Keep the workflow independent of tool-specific memory, commands and plugins.

Approval recorded: on 30 September 2026 (Asia/Dhaka), the owner replied in the current project chat, "Approved proceed to Step 2", to the Step 1 proposal and request to approve its file layout and documentation-only scope. The owner also chose branches instead of additional worktrees. This approval covers the proposed documentation design and Step 2 execution. Steps 3 and 4 remain the following delivery slices; feature implementation and final merge/closure need their stated gates.

The [agent instructions](../../AGENTS.md) and [project brief](../PROJECT_BRIEF.md) remain the entry points. Step 2 adds the shared workflow; the [execution plan](PROJECT_EXECUTION_PLAN_2026-09-26.md) retains feature order and institutional decisions until Step 3 migrates them.

## 2. Scope

- Establish a shared reading order and issue lifecycle.
- Assign one primary home to workflow rules, product requirements, priorities, institutional decisions and issue evidence.
- Reconcile outdated descriptions while preserving useful requirements, source references and existing issue IDs.
- Supply lightweight feature-planning, verification, GitHub issue and PR templates.
- Record branch, commit, push, handoff and token-efficiency practices.

Application code, dependencies, database operations, academic policies, feature implementation, production deployment and GitHub merge/closure are outside this documentation issue. SAFE-01 remains the next feature proposal; its detailed plan needs separate approval.

## 3. Target layout

Paths below are relative to the repository root. Existing documents are retained unless the migration table explicitly moves their contents.

```text
AGENTS.md
CLAUDE.md
README.md
CONTEXT.md
docs/
  PROJECT_BRIEF.md
  WORKFLOW.md
  PRODUCT_REQUIREMENTS.md
  ROADMAP.md
  plans/
    WORKFLOW-01.md
  decisions/
    INSTITUTIONAL_DECISIONS.md
  templates/
    feature-spec.md
    implementation-plan.md
    verification.md
    extra-load-print-templates.md
  architecture/                   existing ADRs
  source/                         existing institutional sources
  screenshots/                    existing images
.github/
  ISSUE_TEMPLATE/
    work-item.yml
  pull_request_template.md
```

Create `docs/specs/<ISSUE-ID>/` when an issue reaches detailed planning. Substantial issues use `spec.md`, `plan.md` and `verification.md`; small bugs may combine these sections in one concise issue document. Do not generate detailed plans for all future issues upfront.

## 4. File-by-file migration

| Current file or source | Action and destination |
|---|---|
| `AGENTS.md` | Refine the shared reading order and essential rules; preserve the generated Next.js block verbatim. |
| `CLAUDE.md` | Retain `@AGENTS.md`; avoid duplicating shared instructions. |
| `README.md` | Update links and the documentation tree; retain setup and operator instructions. |
| `CONTEXT.md` | Retain as the domain glossary. |
| `docs/PROJECT_BRIEF.md` | Keep a short baseline, open verification gates and current-work pointers. |
| `docs/plans/PROJECT_EXECUTION_PLAN_2026-09-26.md` §§1, 4 | Migrate the execution baseline, priority order and dependencies into `docs/ROADMAP.md`. |
| Same execution plan §§2, 6, 7 | Migrate development/review gates into `docs/WORKFLOW.md`; preserve operational release requirements as requirements with roadmap links. |
| Same execution plan §§3, 8 | Migrate domain requirements and decision gates into the requirements document and institutional decision register, as appropriate. Preserve approval scope, unresolved facts and source evidence. |
| Same execution plan §5 | Preserve the SAFE-01 proposal in the roadmap until its separately reviewed issue specification and plan replace the detailed section with links. |
| `docs/IMPLEMENTATION_SOLUTION_ROADMAP.md` | Reconcile and migrate product behavior and rationale into `docs/PRODUCT_REQUIREMENTS.md`; replace duplicate workflow, glossary and priority details with links. |
| Existing architecture, source, screenshots and print-template material | Preserve; update internal links only where migration requires it. |
| New workflow, decision register, three planning templates and two GitHub templates | Add at the paths shown above. |

Update all tracked references before removing the two superseded source paths. Retain every unique requirement, decision and useful reference in an identified destination. Git retains prior versions; no extra archive copy is needed unless unique content cannot be reconciled.

Historical problem descriptions must be labeled as historical or rewritten to describe the current gap. For example, an older authentication section says sign-in is absent even though the current baseline describes implemented code with integration verification pending. Do not turn this reconciliation into new feature authorization.

## 5. Ownership and reading order

| Information | Primary home |
|---|---|
| Essential agent instructions | `AGENTS.md` |
| Development lifecycle and Git practices | `docs/WORKFLOW.md` |
| Domain vocabulary | `CONTEXT.md` |
| Product expectations and rationale | `docs/PRODUCT_REQUIREMENTS.md` |
| Priority order, dependencies and issue index | `docs/ROADMAP.md` |
| Approved institutional choices and unanswered questions | Institutional decision register |
| Issue behavior and acceptance criteria | Issue specification |
| Technical approach, tasks, actual approval and resumable progress | Issue implementation plan |
| Checks, review findings and acceptance evidence | Issue verification record |
| Assignment, discussion and open/closed state | GitHub issue |
| Implemented behavior | Code and tests; discrepancies with requirements need reconciliation |

Codex reads `AGENTS.md`; Claude reaches the same instructions through `CLAUDE.md`. Both then read the brief and workflow, the selected issue records and relevant domain/source/code sections. Read the full requirements or roadmap only when the task needs a broader review.

Brief and roadmap status summaries identify their reconciliation date. They link to authoritative records rather than duplicate detailed task lists. This Step 1 inspection used local documents, not a fresh GitHub status audit.

## 6. Branch, commit and push policy

1. One active implementation issue and one writer per checkout. Use branches in the existing folder; do not create extra worktrees under the current agreement.
2. Start an issue branch from updated `main` after inspecting the working tree; preserve unrelated local changes. Use the current repository prefix, for example `codex/safe-01`.
3. Keep specification, plan, implementation, tests and review corrections for that issue on the same branch. Switching agents does not require a new branch.
4. After actual owner approval, record its scope and evidence and commit the plan before feature implementation. Never infer approval from elapsed time or an agent's own recommendation.
5. Commit coherent changes at meaningful checkpoints, not after every edit or file save. Relevant code and tests may belong in one commit.
6. Push the approved plan after documentation checks, then verified implementation milestones and verified review corrections to the issue branch. Keep unfinished checkpoints explicitly labeled and local until appropriately verified under the current project rules.
7. Run required final checks and review before presenting completion. Pending external verification keeps the relevant acceptance criterion and issue open.
8. Merge after the required review and owner acceptance. Prefer preserving meaningful plan and implementation commits. Clean up only a finished merged branch after checking that needed work is preserved.
9. Git snapshots and work folders do not back up institutional databases. Never commit secrets, private student data or database dumps.

## 7. Token-efficient execution and handoffs

- Keep shared entry instructions and the current brief concise; link to details.
- Search before reading large files, reuse context already read during the session, and reinspect when changes or uncertainty justify it.
- Read the selected issue and relevant code instead of repeatedly loading the entire project documentation.
- Maintain one primary task checklist. Update it on task completion, changed decisions, blockers or handoff rather than every edit.
- Use compact tool output and concise progress reports; preserve useful evidence without raw log dumps or copied chat transcripts.
- Run focused checks during development and required complete checks at the final gate; repeat when new changes, failures or unresolved concerns justify it.
- Scale documentation to risk. Do not create empty future feature folders or unnecessary process documents.
- Start an independent review from the approved criteria and focused diff; add extra agents only when explicitly authorized and useful.
- At handoff record approved scope, branch/base, commits and uncommitted changes, completed tasks, next task, verification and blockers. The next agent inspects actual Git/code state before continuing.

## 8. Delivery steps and proposed tasks

- [x] S1: Inspect current entry points and document structure; create the planning branch and this proposal.
- [x] S1 gate: Owner agrees on the proposed layout, migration scope and operating policy (30 September 2026; approval quoted above).
- [x] S2: Inspect existing GitHub issues; register or reuse the bounded workflow documentation issue and record its actual URL/number. Registered #20 after inspecting existing issues and index #16; DOC-01 remains its separate completed issue.
- [x] S2: Record actual approval and issue reference; check and commit the approved proposal before restructuring. Plan commit `9463fb5` pushed to the issue branch.
- [x] S2: Add workflow and planning/GitHub templates; refine shared entry instructions. Documentation checks and review completed; delivered in the Step 2 commit containing this checkpoint.
- [ ] S3: Migrate requirements, roadmap and institutional decisions; reconcile outdated descriptions and update all references. Review, check and commit this documentation slice.
- [ ] S4: Check both entry paths, link integrity, ownership, handoff format and preservation of source/issue references; present evidence for acceptance. Live tool-loading verification is recorded only if actually exercised.
- [ ] S4 gate: Obtain acceptance of the documentation issue before merging or closing it.
- [ ] S5: Begin separate read-only investigation and detailed planning for SAFE-01; obtain its own approval before implementation.

GitHub edits and branch pushes occur at their stated milestones. The approved plan is committed before restructuring; partial delivery does not establish completion of the whole issue.

## 9. Acceptance criteria for WORKFLOW-01

- AC-01: Both entry paths direct agents to the same shared workflow and current issue records; the Next.js generated block is preserved.
- AC-02: Every document has an explicit purpose and obsolete status/behavior descriptions are reconciled without inventing institutional facts.
- AC-03: Unique requirements, institutional decisions, source references, existing issue IDs and open verification gates survive migration. SAFE-01 remains the next proposed feature.
- AC-04: Tracked links resolve, old path references are removed or intentionally marked historical, and the README/brief reflect the new layout.
- AC-05: Templates support traceable acceptance criteria, actual approval, bounded tasks, review results and pending checks without mandatory duplication for small bugs.
- AC-06: Branch-only work, milestone commits/pushes and token-efficient reading/reporting are explicitly documented.
- AC-07: The diff is documentation/templates only; no application behavior, dependencies, secrets or institutional database contents change.
- AC-08: Review findings are resolved, documentation evidence is recorded and the owner accepts the completed issue before merge/closure.

## 10. Verification approach and current checkpoint

For this documentation issue, inspect the diff, validate local Markdown links and renamed-path references, check the issue/PR template structure, compare the content migration against source sections, and verify both agent reading paths. Code typecheck, lint, domain tests and build remain mandatory for later code changes; do not launch database-preparation scripts to verify this proposal.

### Step 2 evidence — 30 September 2026

- Approved plan committed as `9463fb5` and pushed before establishing the workflow/templates.
- Added shared workflow, three planning templates, GitHub issue form and PR template; updated AGENTS, brief and README entry links. CLAUDE remains `@AGENTS.md`.
- Checked 53 local Markdown links, whitespace, eight unique issue-form fields and required inputs using the existing `js-yaml` parser; verified the generated Next.js block is unchanged and the diff is documentation/templates only.
- Static reading-path review passed: CLAUDE → AGENTS → brief/workflow → selected issue plan. Live Claude/Codex loading and GitHub form rendering were not exercised; do not treat the static checks as live certification.
- Review corrections: rendered template placeholders as code so Markdown does not hide them as HTML; removed the active issue number from AGENTS so the brief/plan own that changing state.
- Code checks and database commands were not run because the slice changes documentation/templates only.

Current checkpoint: Step 2 established on `codex/workflow-setup`; issue #20 remains open. Commit history identifies the Step 2 delivery revision. Next action: Step 3 requirements/roadmap/decision migration when the owner proceeds to that delivery step. Existing source/architecture documents and feature plans retain their current paths. No feature implementation, merge or closure has occurred.
