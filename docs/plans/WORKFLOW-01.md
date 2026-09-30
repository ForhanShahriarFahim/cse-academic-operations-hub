# WORKFLOW-01 — Shared spec-driven development workflow

Status: Complete; final owner acceptance recorded, PR #22 merged and #20 closed on 30 September 2026.
Prepared: 30 September 2026 (Asia/Dhaka).
Delivery branch: `codex/workflow-setup` (merged via PR #21). Final review branch: `codex/workflow-review` (merged via PR #22 at `78db43d`).
GitHub issue: [#20 WORKFLOW-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20).

## 1. Outcome and authorization

Give Codex and Claude the same repository-owned requirements, approval gates, task records and verification evidence. Keep the workflow independent of tool-specific memory, commands and plugins.

Approval recorded: on 30 September 2026 (Asia/Dhaka), the owner replied in the current project chat, "Approved proceed to Step 2", to the Step 1 proposal and request to approve its file layout and documentation-only scope. The owner also chose branches instead of additional worktrees. This approval covers the proposed documentation design and Step 2 execution. The owner subsequently instructed "Go for the next step", authorizing Step 3 execution on 30 September 2026. Step 4 final review/acceptance and feature implementation retain their separate gates.

The [agent instructions](../../AGENTS.md) and [project brief](../PROJECT_BRIEF.md) remain the entry points. The [shared workflow](../WORKFLOW.md), [roadmap](../ROADMAP.md), [requirements](../PRODUCT_REQUIREMENTS.md) and [decision register](../decisions/INSTITUTIONAL_DECISIONS.md) now separate delivery rules, work order, behavior and institutional answers.

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

| Migration source (historical paths) | Action and destination |
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

The original paths in this migration table are intentionally retained as historical provenance, not live reading instructions. Update all active tracked references before removing the two superseded source paths. Retain every unique requirement, decision and useful reference in an identified destination. Git retains prior versions; no extra archive copy is needed unless unique content cannot be reconciled.

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
- [x] S3: Migrate requirements, roadmap and institutional decisions; reconcile outdated descriptions and update active local references. Reviewed/checked in the Step 3 delivery commit containing this checkpoint.
- [x] S4: Check both entry paths, link integrity, ownership, handoff format and preservation of source/issue references; present evidence for acceptance. Results are below; live client-loading verification was not exercised.
- [x] S4 gate: Owner accepted the final evidence/status record with "Approved move forward"; PR #22 merged at `78db43d`, then #20 closed.
- [x] S5: Begin separate read-only investigation and detailed planning for SAFE-01. [Its proposed plan](../specs/SAFE-01/plan.md) requires separate approval before implementation.

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

### Step 3 evidence — 30 September 2026

- Owner authorization: "Go for the next step" after Step 2 delivery. The branch remains `codex/workflow-setup`; GitHub #1/#2/#16/#20 are open and #17 is closed as inspected.
- Consolidated product requirements/rationale, a stable issue roadmap and seven institutional decision entries. The brief/README/workflow point to them; the glossary gained the existing curriculum-semester and archive/delete meanings.
- Preserved all original issue/dependency rows, the SAFE-01 proposal, execution-plan domain invariants and release gates, rationale sections 7–17, public-contact approval text and six acceptance journeys. Reviewed RUT/AUTH reconciliations separately: RUT-01 completed contracts remain; AUTH-01 implementation and pending live gates are distinct; all seven role identifiers exist but broader administrative workflows remain incomplete.
- Migrated execution-plan development/UI gates and rationale testing/completion rules into the shared workflow. Planning prompts now use the existing shared templates, rather than a duplicated provider-specific task script.
- Removed the two superseded paths only after preservation checks. Their names in the historical migration table above are intentional provenance; Git retains original versions.
- Checked 72 local Markdown links and five heading anchors, changed-file whitespace, active stale-path removal, generated Next.js block/Claude import preservation and documentation-only scope. Legacy source-file whitespace was left untouched.
- Existing source material, architecture record, application code, dependency files and database contents were not changed. Baseline counts are explicitly dated; no seed, database or runtime integration checks were run.
- GitHub index/current workflow issue use the branch documentation until acceptance/merge. Existing feature issue links to main remain valid on main; rebase their live document pointers after the documentation branch is accepted/merged. Leave completed historical issue records intact.

The statements above describe the Step 2/3 checkpoints before the owner's merge. Step 4 reconciles the actual merged state below.

### Step 4 review and acceptance evidence — 30 September 2026

Authorization: the owner instructed "Go for step 4 one thing I want to address on github I have already merged the PR." GitHub confirms [PR #21](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/pull/21) is merged at `de1c78c`; its document tree matches `c15a758` exactly. Local `main` was fast-forwarded to that merge, then `codex/workflow-review` was created for final evidence/status corrections. No application behavior or institutional rules were added.

The owner's PR #21 merge records acceptance of the delivered layout; it occurred before this final review. Subsequent final acceptance is recorded below, rather than inferred from that earlier merge.

| Criterion | Result | Evidence |
|---|---|---|
| AC-01 | Passed (static) | CLAUDE imports AGENTS; both lead to brief/workflow/selected issue records. Generated Next.js block matches the pre-workflow base. |
| AC-02 | Passed | Document ownership and historical/current/proposed behavior are explicit; brief/roadmap now distinguish the merged layout from this review follow-up. |
| AC-03 | Passed | Source-section comparisons retain domain invariants, release gates, issue/dependency rows, SAFE-01 proposal, rationale §§7–17, contact-approval scope and six acceptance journeys. RUT/AUTH reconciliations were separately reviewed. |
| AC-04 | Passed | Local Markdown links/heading anchors and stale-path checks pass. Open feature issues now link to canonical documents on main; completed historical issues were left intact. |
| AC-05 | Passed (static) | Spec acceptance IDs map to plan tasks and verification results; actual approval and handoff fields are explicit. Eight unique issue-form fields parse; required inputs and PR review gates are present. Small issues may combine records. |
| AC-06 | Passed | Workflow uses one branch/writer, coherent commits, verified milestone pushes, focused reading, one checklist and bounded checks. |
| AC-07 | Passed | Compared revisions contain documentation/templates only; application/dependencies/data/source/architecture remain unchanged. No new credentials, dumps or private student records were introduced. |
| AC-08 | Passed | Owner replied "Approved move forward" after final evidence/PR #22 were presented; PR #22 merged at `78db43d` and #20 closed. |

Review findings and corrections:

- Status records still said merge was pending: recorded actual PR/merge and separated delivered layout from the final review record.
- Open feature issues referenced the two removed paths: updated their live links to canonical main documents and preserved issue IDs, dependencies and acceptance scope. AUTH contact criteria link to the existing decision record instead of repeating publication details. Completed DOC-01 remains historical.
- No unresolved content, ownership, template or migration finding remains. AC-08's final acceptance/merge gate subsequently passed.

Verification: 72 local Markdown links and six heading anchors passed; eight unique YAML fields and required inputs passed. Source comparisons retained 21 original issue-map table rows, rationale §§7–17, domain/release sections, SAFE-01 proposal, the exact owner-approved contact paragraph and six acceptance journeys. Nineteen canonical GitHub document/anchor targets were checked against the merged documents; live pointers on 17 open feature issues were updated without changing their states. Shared entry paths, generated-block preservation, diff/whitespace and documentation-only scope passed. The ad hoc preservation check initially included subsequent decision questions in its contact-paragraph extraction; correcting the extraction to the actual paragraph confirmed exact preservation, with no product-content change.

Static client/import/form checks are not live Claude/Codex loading or GitHub form-rendering certification; those live checks were not exercised and are not required by this issue's agreed static verification scope. No seed, database, build or other runtime commands were run for this documentation issue.

Final acceptance: after the completed Step 4 review and PR #22 were presented, the owner replied "Approved move forward." This accepts the unchanged documentation scope and authorizes merging the record/closing #20. PR #22 merged at `78db43d2e42c74f49228957dcb8d973202d25510`; #20 was then closed as completed. The historical pending statements describe earlier checkpoints. This approval does not approve the newly inspected SAFE-01 implementation scope.

Current checkpoint: WORKFLOW-01 is complete; the shared workflow is on main. [SAFE-01's proposed spec/plan](../specs/SAFE-01/plan.md) is the separate current planning record on `codex/safe-01`; its implementation approval remains pending. No feature implementation or database operation was performed during this transition.
