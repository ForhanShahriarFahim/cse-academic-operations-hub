# Local delivery plan — 26 October 2026

Status: owner-authorized local-first workflow; BUG-24 accepted and merged locally on 27 October 2026 with the disclosed default-build exception. ROM-01A accepted on 28 October with its disclosed default-build exception; merged locally at `2b363cb`. ROM-01B specification approved on 28 October; ROM-01B accepted and merged locally at `850f42a` on 29 October; ROM-01C inspection/specification authorized; remaining scopes are proposals.
Updated: 29 October 2026, Asia/Dhaka.
Entry point: [project brief](../PROJECT_BRIEF.md). Execution rules: [workflow](../WORKFLOW.md).

## Owner working agreement

The owner requested a concrete plan, small parts, a detailed specification for the selected part, implementation and validation, personal inspection, and a branch merge into local `main`. After that, suggest the next task; the owner starts a new session. Keep GitHub activity infrequent. Use high reasoning effort for planning when the session supports it.

The initial message authorized the inspection/planning package and local-first workflow amendment. After the concrete package at `960d5d3` was presented, the owner instructed: "commit and then I will start a session and implement  BUG-24". BUG-24 is therefore approved for implementation in the next session; exact scope/evidence is in its plan. Later feature scopes and final implementation acceptance retain their own gates. Previously approved unchanged scopes remain valid.

The agent cannot change its own active model/effort through the available tools. The owner selects a supported high-reasoning setting for planning sessions. Do not claim that a model switch occurred. No additional agents, sessions or external API billing are authorized by this plan.

## Reconciled baseline and evidence

Inspected GitHub's issue list/states, all 26 open issue bodies and comments, recent merged PRs, open PRs, and remote `main` on 26 October. GitHub reads only; no remote writes. Remote `main` and local `main` were `0b1e055e80463a86012093c57bc7329fb12c62f5`; the last merge was BUG-59 / PR #60 on 2 October. No open PR. There was no active implementation issue and no local change at inspection start.

Accepted deliveries: WORKFLOW-01, DOC-01, RUT-01, SAFE-01, UX-01, RUT-04, TCH-02, AUTH-02 and TCH-01, plus BUG-26/27/29/32/48/49/54/59. Issues #30 and #31 were resolved by UX-01 and AUTH-02. Use their `docs/specs/` acceptance records; do not reopen them because older summaries say pending. TCH-02 deliberately deferred .docx, the logo and past-term selection despite the original issue title.

Open GitHub snapshot: #1, #3, #5–#16, #19, #24, #25, #28, #33, #37–#42. #16 is an index, not an implementation task. Local acceptance does not alter this remote snapshot automatically.

The documented institutional database is PGlite through migration 0009, after the recorded cold backup. Source baseline: 42 teacher records, 78 courses, 183 scheduled meetings and 13 publication blockers. These are prior evidence, not a fresh database census. This planning session did not open institutional storage, run the app, migrate, reset or certify production.

Records inspected: [requirements](../PRODUCT_REQUIREMENTS.md), [previous roadmap](../ROADMAP.md), [brainstorm triage](owner-brainstorm-2026-09-30.md), [decisions](../decisions/INSTITUTIONAL_DECISIONS.md), [architecture](../architecture/ADR-001-academic-operations-boundaries.md), issue verification records, and relevant database/room/auth/safety code. Older roadmap/index/decision prose contains historical pending statuses; accepted issue records and this dated reconciliation take precedence for progress, without changing institutional requirements.

## Approach selected after reviewing the earlier plan

Keep the earlier master-data direction and existing architecture. Extend the accepted teacher-management patterns rather than redesign the application or replace the stack. Retain separate teacher/user identities, term boundaries, canonical merged meetings, pure calculations, transactional audits and immutable publication projections.

Make four adjustments:

1. **Fix BUG-24 before further local mutation work.** A database-free reproduction on 26 October confirms that an early `dotenv/config` import selects `.env` while the direct database loader selects `.env.local`. This can make `predev` prepare a different database from the app. BUG-26 already protects reset and preserves access; reuse it instead of rebuilding it.
2. **Ship usable slices of broad issues.** A room directory edit flow can be accepted before maintenance; a catalog editor can be accepted before the whole offering wizard. One slice still includes rules, permissions, UI, migration if needed, tests and review. A schema-only or half-connected UI is a technical checkpoint, not a delivered feature.
3. **Place prerequisites where they are needed.** Enforce one active term before term activation/rollover; establish policy history before historical marks; fix publication concurrency before approval/publishing enhancements. Keep external OAuth/hosting gates explicit without blocking synthetic local development.
4. **Resolve the calendar/leave dependency cycle.** Plan calendar, then dated effective schedule, then leave integration, then the agenda. The older brainstorm put leave before dated changes even though integrated availability and affected-class handling need those changes.

Do not write detailed specifications for the whole backlog now. Keep this sequence thin; inspect and specify the next bounded slice against the then-current code. Institutional decisions remain questions until answered.

## Proposed sequence of small deliveries

Local suffixes below are planning labels under existing GitHub issues. No new GitHub issue is needed for each part. Each part needs a concrete approved specification before implementation; later parts may change after review of earlier ones.

| Order | Part / parent | Reviewable outcome | Gate before building |
| --- | --- | --- | --- |
| Done locally | BUG-24 / #24 | One environment/target contract for app and CLI; safe target preview and regression evidence | Accepted/merged 27 October at `84964e2`; default-build exception retained in [verification](../specs/BUG-24/verification.md); GitHub sync deferred |
| Done locally | ROM-01A / #5 | Add/edit room identity, capacity/type/capabilities, stale protection and change history; publications preserved | [Accepted specification](../specs/ROM-01A/spec.md), [sole checklist/approval](../specs/ROM-01A/plan.md); accepted/merged 28 October at `2b363cb` with disclosed default-build exception |
| Done locally | ROM-01B / #5 | Deactivate/reactivate, unused-record deletion, guarded pickers and useful weekly occupancy/free-window view | [Accepted plan/receipt](../specs/ROM-01B/plan.md), [verification](../specs/ROM-01B/verification.md); accepted/merged 29 October at `850f42a`; final default build passes |
| 4 | ROM-01C / #5 | Dated maintenance and conflict/placement enforcement | [Proposed specification/D-1–D-6](../specs/ROM-01C/spec.md), [sole plan](../specs/ROM-01C/plan.md), [sketches](../specs/ROM-01C/mockups/index.html); actual implementation approval pending |
| 5 | BUG-28 / #28 | At most one active term, with safe populated migration and concurrency evidence | Inspect existing statuses; owner-approved lifecycle and duplicate remediation; no automatic choice of an active term |
| 6 | SET-01A / #14 | Term identity/dates and a safe term-selection/activation foundation | Separate view selection from activation; explicit rules for historical access/editing |
| 7 | BAT-01A / #6 | Cohort identity/lifecycle and placement history with term-specific count verification | Count/history migration and graduation/hold definitions |
| 8 | BAT-01B / #6 | Preview and confirm next-term rollover, repeat/hold/graduate overrides and time-grid cloning | #28/SET-01A/BAT-01A; earlier term unchanged; calendar clone offered only if calendar exists |
| 9 | CRS-01A / #7 | Catalog create/edit/lifecycle/history | Academic credits versus workload; historical labels and existing offering impact |
| 10 | CRS-01B / #7 | Clone/edit term offerings with an added/dropped/changed comparison | Term and cohort foundation; no silent changes to previous offerings |
| 11 | CRS-01C / #7 | Separate/merged teaching groups, teacher allocations, coverage and schedule handoff | One canonical delivery for merged audiences; room and workload rules |
| 12 | ATT-02 / #9 | Local save/import feedback and truthful partial-import counts | Reuse current feedback patterns; specify row-count semantics before changing imports |
| 13 | STU-01A / #37 | Student directory, CSV preview and enrollment workflow | Cohort/term foundation; identity versus enrollment and privacy/history decisions |
| 14 | STU-01B / #37 | Excel import/export and roster/roll-call exports | Same validated data/projection as CSV; explicit file/row errors and permission checks |
| 15 | ATT-01 / #8 | Coherent course-selection and teacher roll-call entry flow | One attendance design pass across #8–#12; reconcile teacher-first entry with the original cascading-selector proposal |
| 16 | CAL-01 / #38 | Term teaching dates, holidays and exam periods | Official source and day-swap decision; manual dates elsewhere stay supported |
| 17 | ATT-03 / #10 | Dated session draft/submit/lock/reopen/void lifecycle | Duplicate/correction authority; calendar suggestions only after CAL-01 |
| 18 | SET-01B / #14 | Effective policy history and reviewed changes for marks/workload/payments | Named authority, rounding and policy-version behavior; do not silently recompute history |
| 19 | ATT-04, then ATT-05 / #11, #12 | First explainable marks, then dated ledger/student matrix and matching exports | Policy history and attendance lifecycle; separate specifications/branches |
| 20 | OD-01 / #13 | Edit/archive/verify known external commitments without duplicating offerings | Course workflow; effective ranges and completeness/verification stay distinct |
| 21 | BUG-25 / #25 | Unique, serialized publication versions and truthful concurrent outcomes | Populated migration and real adapter concurrency checks; inspect AUTH-02 fixes before expanding access-action scope |
| 22 | GOV-01 / #15 | Routine review/approval first; claim review/payment lifecycle as a separate slice | #25; approved authority/separation of duties; source sign-off before official publication |
| 23 | RUT-05 / #39 | Cancel/make-up/substitute occurrences and an effective date schedule | CAL-01; no edits to weekly publications |
| 24 | LEAVE-01 / #40 | Private leave decisions, balances and availability/affected classes | CAL-01/RUT-05; leave policies, approvers and attachment decision |
| 25 | TASK-01 / #41 | Teacher agenda linked to effective classes and outstanding actions | Effective schedule, attendance lifecycle and duties authority |
| 26 | CERT-01 / #42 | Template preview/issue register, then bulk output | Template format, fields, fonts, signatures and regeneration rules |
| As selected | RB-02 / #33 | Individually scoped room/teacher rows, compare, bulk move or keyboard/concurrency improvements | Choose one outcome; do not bundle the whole builder backlog |
| External gates | AUTH-01 / #1; RUT-03 / #3; DEP-01 / #19 | Remaining authorization/public-contact evidence, source reconciliation, then hosted staging/production | Credentials, institutional facts/owners, verified recovery and separate release authorization |

This is a dependency-informed order, not a promise that every item takes one session or permission to implement all rows. Source answers can be gathered whenever available. Every feature slice must enforce its own server permissions; leaving the broad AUTH-01 integration issue open does not waive that requirement. DEP-01 remains deferred while development is local; PostgreSQL adapter tests remain required for schema changes.

## Repeatable delivery and review contract

1. Read the brief/current pointer and selected part only; inspect changed Git/code state. Reuse evidence already established in the handoff.
2. Show a bounded spec: outcome, exclusions, permissions, validation, errors/stale behavior, history, acceptance criteria and decisions. Include desktop/mobile/print sketches where relevant. Record actual approval and commit it locally before feature code.
3. Work through one primary checklist on one branch. Focused tests during development; coherent local checkpoints. Do not push routine progress.
4. Run the required final checks on final code and relevant issue checks. Use owned synthetic databases/review copies. Record unavailable checks as pending. Do not rerun already-passing full suites without a change or unresolved concern.
5. Give the owner exact review steps, safe local URL/target when applicable, synthetic credentials supplied privately if needed, expected results, screenshots/evidence and known limitations. A UI slice must be runnable for owner inspection; a CLI slice must have a database-free preview and reproducible examples.
6. Fix findings and recheck affected behavior. After actual acceptance merge into local `main`. No remote push/PR/issue closure unless requested or agreed. Migration of institutional storage remains a separate explicit, backed-up operation.
7. Record the local merge and suggested next bounded task. Give a pasteable handoff; stop for the owner to start another session.

## Current handoff

- ROM-01A / #5 accepted on 28 October 2026: owner selected “Accept ROM-01A and merge locally” with the default Turbopack failure disclosed. [Acceptance/sole checklist](../specs/ROM-01A/plan.md), [verification](../specs/ROM-01A/verification.md). Merged locally at `2b363cb`, acceptance `44753cb`, completed merge handoff `3c4e7cc`. Parent #5 remains open; no remote synchronization.
- ROM-01B / #5 accepted on 29 October: owner said “accept and merge. And go for the next task.” Acceptance `57471b3`, merge `850f42a`, receipt `cbdbce9`. [Completed sole plan](../specs/ROM-01B/plan.md), [verification](../specs/ROM-01B/verification.md). Implementation approval `b713996` preceded B code; that approval does not authorize C implementation.
- Current part: **ROM-01C proposal; implementation approval pending**, on `codex/rom-01c` from `cbdbce9`. [Specification/D-1–D-6](../specs/ROM-01C/spec.md), [sole checklist/exact continuation](../specs/ROM-01C/plan.md), [verification](../specs/ROM-01C/verification.md), [responsive sketches](../specs/ROM-01C/mockups/index.html). The owner's explicit next-task instruction authorizes C planning in this chat.
- C review decisions: existing authority/history/retention; finite Dhaka dates/weekday recurrence; fresh all-term impact confirmation while retaining bookings; any overlapping occurrence blocks recurring placement; fresh writer/publication checks including uncertain OD; weekly/date occupancy distinction and unchanged public snapshots.
- Final ROM-01B default Turbopack builds pass. Earlier intermittent CSS-worker failures remain recorded; no root-cause repair or bundler policy change is claimed, and no inherited acceptance exception is needed for the passing final result.
- Next action: present the verified ROM-01C planning package for actual approval of D-1–D-6. Record/commit approval before feature code, then follow its sole checklist. No institutional operation, remote activity, additional worktree or extra writer.
