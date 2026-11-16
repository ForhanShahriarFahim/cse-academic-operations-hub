# CRS-01B — Term offerings: start from the previous term, compare, adjust

Parent: CRS-01 / #7 (remains partially delivered and open).
Updated: 16 November 2026, Asia/Dhaka.
Status/approval, sole task checklist and exact handoff: [plan.md](plan.md).
Inspection/checks: [verification.md](verification.md). Design: [mockups/index.html](mockups/index.html).

## Problem and inspected baseline

Inspected clean local `main` at `f0c4d8c`, after the accepted PERF-01 merge `2156fac`. Work uses `codex/crs-01b`, one writer/checkout. This is a proposal: **no implementation is approved**. No institutional database was opened, queried or counted. Last remote reconciliation remains 11 November; issue #7 and its one comment were read (no write).

| Evidence | Actual behavior / implication |
| --- | --- |
| [Schema](../../../src/db/schema.ts) | `course_offerings` is `(id, course_id, batch_id, term_id, status)` with a unique `(course, batch, term)` index. Status is free text documented as planned / open / cancelled / completed, default `open`. No revision, reason, timestamps or actor. Teaching groups link to offerings through `teaching_group_offerings`; a group also carries its own `course_id` and `term_id`. |
| [Seed](../../../src/db/seed-summer-2026.ts), safety fixtures | The only writers of offerings are the seed and disposable fixtures. The seed gives every cohort all catalog courses whose curriculum semester equals that cohort's placement semester, all `open`. There is no portal action that creates, changes or removes an offering. |
| [Portal data](../../../src/lib/data.ts), [completeness](../../../src/components/courses/course-completeness.tsx) | Offerings are read only to label a teaching group's audiences. An offering without a teaching group is invisible everywhere: the completeness report lists groups, not offerings. |
| [Rollover](../../../src/lib/rollover-store.ts), [term protection](../../../src/lib/term-protection.ts) | BAT-01B prepares a draft destination's cohort placements (progress / repeat / hold / graduate) and optionally its empty time grid. It creates no offerings and refuses a destination that already has any protected row, `course_offerings` included. A prepared draft therefore has cohorts placed at their new semesters and no offerings. |
| [Catalog rules](../CRS-01A/spec.md), [course store](../../../src/lib/course-store.ts) | Any offering in any term freezes a course's academic fields. An offering that is not cancelled/completed in a term that is not completed blocks deactivating its course, and likewise blocks [cohort](../../../src/lib/batch-store.ts) graduation. CRS-01A requires future offering writers to take the shared term-context lock, verify the course is active and use its stable ID. |
| [Term context](../../../src/lib/term-context.ts), [term pages](../../../src/app/(portal)/terms/[id]/page.tsx) | `activeTermWrite` serves the single active term only. Draft terms are addressed by ID under `/terms/[id]`; rollover and catalog writers use standalone transactions that take the context lock first. Offerings must be editable in a draft (preparing next term) and in the active term. |
| [Capabilities](../../../src/lib/auth/policy.ts), [requirements](../../PRODUCT_REQUIREMENTS.md#11-course-catalog-offerings-and-completeness) | `manage_offerings` is target vocabulary but does not exist. The desired academic-administrator scope names offerings; routine coordinators are not listed for them. |
| Issue #7 owner comment, 30 September | “Each semester usually only one or two courses change; most offerings repeat.” Clone the previous term then adjust is the main flow, with a clear added/dropped/changed comparison. Teacher allocation and load editing belong to the teaching-group step. |

Two consequences shape the design. First, a cohort moves up a semester each term, so “the previous term's offerings” for a cohort are **not** that cohort's own earlier offerings: they are what the previous term offered to whichever cohort then sat at the same stream and curriculum semester. Second, an offering today has no teacher, room or time; those belong to teaching groups (CRS-01C). This slice can therefore compare courses and status, not teachers.

## Outcome and scope

An authorized administrator opens a draft or active term's offerings, starts each cohort from what the previous term offered at the same stream and semester, sees what would be carried, added and dropped before anything is saved, and then adds, cancels, restores or removes individual offerings. Every internal viewer can read the term's offerings and the comparison. Previous terms' offerings are never changed.

Included: a term-addressed offerings page with per-cohort lists and comparison; a reviewed, additive “start from previous term” step; single add / cancel / restore / remove with reasons, stale protection and audit; a new capability; links from `/courses` and the term page; disposable adapter, concurrency and browser checks.

Excluded: teaching groups, merged or external audiences, teachers, workload units, coverage requirements, meetings and rooms (CRS-01C); enrollment and attendance; changing an offering's course or cohort (remove and add instead); changing a cancelled/completed offering in a completed term; automatic status changes at term activation or completion; offerings for held or graduated cohorts; curriculum/programme modelling; bulk import/export; print redesign; schema migration (see D-6); institutional operations, pending migrations `0017`/`0018`, dependency/bundler changes and remote synchronization.

## Decisions for owner approval

None of these is approved yet. Each row is a concrete recommendation; approval or amendment is recorded in [plan.md](plan.md) before implementation.

| ID | Recommendation | Boundary / consequence |
| --- | --- | --- |
| D-1 — Editors | Add `manage_offerings` to system and academic administrators, checked in CSE planning scope like `manage_catalog`. Routine coordinators and every other internal role are view-only. | Matches the requirements' role table. Coordinators keep arranging classes but cannot decide what is offered. Change history is editor-only. |
| D-2 — Which terms | Offerings are editable in **draft** and **active** terms, addressed by term ID. Completed and legacy-status terms are read-only. | Preparing next term happens while the current term is still active, so the page cannot depend on the active-term selection. A cohort needs a placement in that term first (from cohort preparation or manual placement); a draft with no placements shows that step instead of an empty editor. |
| D-3 — Clone basis | Match by **stream and curriculum semester**, not by cohort. For a destination cohort placed at semester *n*, the basis is the set of courses the source term offered (not cancelled) to cohorts of the same stream placed at semester *n*. Default source is the term the destination was prepared from; otherwise the editor picks an earlier active/completed term. | A repeating cohort naturally gets the same list again. If several source cohorts shared the slot and did not all take a course, it is shown as “offered to some cohorts” and left unticked. If the source had no cohort in that slot, nothing is proposed and the page says so; the editor adds courses individually. Inactive catalog courses are never proposed; they appear as dropped with the reason. |
| D-4 — Comparison | Per cohort, against the same basis: **Carried**, **Added**, **Dropped**, and **Changed** where the same course exists but its state differs (for example cancelled this term). Computed from current records each time, never stored. | Teacher and workload changes are not part of this comparison because offerings have none; they arrive with CRS-01C. A dropped course is simply absent from this term: nothing in the previous term is edited. |
| D-5 — Lifecycle | New offerings are `planned` in a draft term and `open` in an active term. An editor may **cancel** (reason required) and **restore**. **Remove** deletes the row and is allowed only in a draft term, for an offering with no teaching group. An offering linked to a teaching group can be neither cancelled nor removed in this slice. | Planned and open behave identically everywhere today; both mean “offered”. Activation does not rewrite statuses. Removal exists so a mistaken start in a draft leaves no clutter; in an active term the record is kept as cancelled. Changing a class's audience is CRS-01C, so linked offerings are explained and left alone. `completed` is not set here. |
| D-6 — No schema change | Keep the table as is. Stale protection uses a server fingerprint of the cohort's current offerings; reasons, actor and before/after go to the existing audit log. | Avoids a migration and any institutional rollout step. The cost is that a reason lives in history, not on the row. If offering notes or per-row revisions are wanted, that is a separate migration decision. |
| D-7 — Out-of-semester courses | Adding a course whose curriculum semester differs from the cohort's is allowed, with a visible note and an explicit tick. | The seed never does this, but retakes and curriculum exceptions are plausible. No rule is invented about which are legitimate. |

## Required behavior

### Offerings page

- Route `/terms/[id]/offerings`. Title **Term offerings — [term name]**, with the term's lifecycle and, when it is not the active term, a plain statement that viewing it does not change the active term. Linked from the term page and from `/courses` (for the active term, and for any draft term being prepared).
- Grouped by stream, then cohort in existing sort order. Each cohort heading shows its semester in this term and its counts: offered, cancelled, without a class group.
- Each row: course code, title, academic credits, type, status (Planned / Open / Cancelled / Completed, or the stored text marked unsupported), a comparison badge, and class-group state: “In 1 class group” linking to the routine filter, or “No class group yet”. Inactive courses that are still offered are flagged.
- A comparison summary per cohort and for the whole term: carried / added / dropped / changed counts, the source term used, and a **Dropped since [source]** list. A source selector (editors and viewers) changes only what is compared, never data.
- Filters: stream, cohort, status, comparison state, and code/title search; kept in the URL. Mobile uses stacked cards per cohort with no page-wide overflow. Printing shows the lists and comparison without controls.
- Empty and blocked states: no placements in this term (link to cohort preparation); cohort with no offerings (editor sees **Start from previous term** and **Add course**); read-only term; no earlier term to compare with; ambiguous or missing term returns not-found.

### Start from the previous term

- Editor chooses the source (default per D-3) and the cohorts to fill; the review lists, per cohort, each proposed course ticked or unticked with its reason: carried, offered to some cohorts, already offered here, course inactive, no basis in the source.
- The step is **additive and repeatable**: it creates only missing offerings. It never cancels, removes, restores or changes an existing offering, in this term or any other. Running it again after a partial start proposes only what is still missing.
- A summary states exactly how many offerings will be created for how many cohorts. Confirmation requires a reason and is bound to a server fingerprint of the source basis, destination placements, existing destination offerings and course status; if any of that changed, the review is shown again with the difference and nothing is saved.
- All creations and one summary audit event commit together or not at all.

### Single changes

- **Add course**: pick the cohort and an active catalog course by code/title search, defaulting to the cohort's curriculum semester; D-7 note and tick when it differs. A reason is optional for an ordinary add and required for an out-of-semester one. Refuse inactive or missing courses, cohorts without a placement in this term, inactive/graduated cohorts and duplicates. A cancelled offering of the same course is restored rather than duplicated, and the form says so.
- **Cancel / Restore**: reason required (1–300 plain-text characters, no student details); bound to the cohort fingerprint; already-in-state is a successful no-op with no event. Restoring re-checks that the course is active.
- **Remove**: draft term, no class group, typed course code as confirmation, reason required.
- Linked offerings show why they cannot be cancelled or removed here and which class group uses them.
- Server validation is authoritative: each field once as text, malformed IDs refused, unrecognized fields ignored, browser-supplied counts/flags never trusted. Expected errors keep the user's input and place. Pending disables repeat submits and announces progress; success keeps the cohort in view. Stale says “These offerings changed since you opened this page. Review the current list before saving.”

### Permissions, transactions and preserved history

- Every action authorizes `manage_offerings` on the server before reading editor data. Viewers receive no editor payload or history. Revoked access returns a permission result with no change.
- Each mutation is a standalone transaction: shared term-context lock first, then the term row locked for update, then re-read of term status, placements, courses and existing offerings before deciding. This serializes with catalog deactivation, cohort lifecycle and rollover, and with other offering editors of the same term. The unique index remains the final duplicate guard; a collision is reported as an ordinary conflict.
- Audit events (`offering.create`, `offering.cancel`, `offering.restore`, `offering.remove`, `term_offerings.start`) record actor, term, cohort, course, before/after status, reason and, for the start step, the source and counts. Audit failure rolls back the change. Removal keeps its audit event; the event names the course and cohort so history stays readable after the row is gone.
- A change history view per term (editor-only, newest first, paged) lists these events.
- Nothing in this slice writes to teaching groups, group links, meetings, allocations, enrollments, attendance, claims, schedule versions, placements, courses or any other term's offerings. Published snapshots and their CSV/print output are unaffected.
- Consequences that follow from existing rules are stated in the UI rather than changed: offering a course freezes its academic fields and prevents deactivating it; an offered cohort cannot be graduated until its offerings are cancelled or the term is completed.

## Acceptance criteria

| ID | Observable condition | Verification |
| --- | --- | --- |
| AC-01 | System and academic administrators in scope can start, add, cancel, restore, remove and read history; anonymous, coordinator, teacher, viewer, revoked and other-department-only actors cannot mutate or load editor data, and viewers can still read the page. | Real server entry-point allow/deny matrix, UI and direct-URL checks. |
| AC-02 | The page works for a draft term while another term is active, for the active term, and read-only for a completed term; it never changes the active-term selection or generation. | Draft/active/completed/legacy/ambiguous term integration and browser flows. |
| AC-03 | The proposed basis follows D-3 exactly: slot matching by stream and semester, repeat cohorts, partial-slot courses unticked, no-basis slots empty, cancelled source offerings and inactive courses excluded. | Pure function cases plus persisted results on both adapters. |
| AC-04 | Starting from the previous term creates only the ticked, missing offerings; rerunning creates nothing new; no other row in any term changes. | Before/after fingerprints of every table on both adapters; idempotence check. |
| AC-05 | Carried / added / dropped / changed counts and lists match the stored records for every cohort after each kind of change, on screen and in print. | Projection tests against fixtures; screen/print parity. |
| AC-06 | Add, cancel, restore and remove obey D-5 and D-7: linked offerings are refused, removal is draft-only, duplicates are refused or restored, inactive courses and unplaced/inactive cohorts are refused, forged inputs change nothing. | Lifecycle matrix with forged and stale action calls on both adapters. |
| AC-07 | Two editors cannot both apply a stale review; simultaneous identical adds yield one offering; offering creation and catalog deactivation / cohort graduation / rollover cannot interleave into an inconsistent state. No-op and failed operations leave no event; audit failure rolls back. | Independent concurrent PostgreSQL connections; event and row assertions. |
| AC-08 | Existing groups, meetings, allocations, attendance, claims, publications and their CSV/A4 output are byte-for-byte unchanged by every operation in this slice. | Focused regressions, T-03 two-term history, archived CSV/A4 comparison. |
| AC-09 | Loading, empty, no-placement, read-only, pending, success, validation, conflict, stale and denied states are readable at 1440/390/320 widths with keyboard access and announced feedback; context survives saves and errors. | Guarded synthetic production browser, keyboard/axe, screenshots, applicable native print. |
| AC-10 | Typecheck, lint, domain, default build and relevant safety checks complete with truthful evidence. | Required commands; a default Turbopack failure stays failed and distinct from a passing Webpack build, and needs its own delivery acceptance. |

## Sources and unresolved authority

[Requirements §11](../../PRODUCT_REQUIREMENTS.md#11-course-catalog-offerings-and-completeness), issue #7 and its 30 September owner comment, the [glossary](../../../CONTEXT.md), [ADR-001](../../architecture/ADR-001-academic-operations-boundaries.md), the [local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md) and accepted [CRS-01A](../CRS-01A/spec.md), [BAT-01B](../BAT-01B/plan.md) and [SET-01A](../SET-01A/spec.md) define the boundaries. Which courses a cohort must take in a given semester is an institutional fact this slice does not assert: the previous term and the catalog semester are suggestions the editor confirms. If the owner wants teacher changes in the comparison, offerings carried automatically at rollover, or cancellation of offerings that already have a class, the scope must be amended before building.
