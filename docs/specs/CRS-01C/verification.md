# CRS-01C — Verification record

Specification: [spec.md](spec.md). Checklist/handoff: [plan.md](plan.md).
Updated: 17 November 2026, Asia/Dhaka. Implemented and verified; delivery acceptance requested, not yet given.

## Inspection — 16 November 2026

Read-only inspection of local `main` at `3832d33` on branch `codex/crs-01c`. No database was opened; no `dev`, `start`, `db:*`, safety or browser command was run for this package. Issue #7 and its owner comment were read with `gh` (no write).

| Question | Finding | Where |
| --- | --- | --- |
| Who writes class groups, links, weekly requirements and group allocations? | Only the seed and disposable fixtures. No portal action. | `src/db/seed-summer-2026.ts`; search of `src/lib` and `src/app` for the four tables |
| Can a class be scheduled without an existing group? | No. `createMeetingAction` requires a group ID and the active term. | `src/lib/actions.ts`, `src/lib/term-scope.ts` |
| What constraints protect the tables? | Unique `(group, offering)` only. None on offering-in-one-group, requirement-per-group, allocation-per-teacher-and-group, or course/term agreement between a group and its offerings. | `src/db/schema.ts` |
| How are units and eligibility derived? | Sum of allocation rows in hundredths; eligibility compares it with the term threshold. Policy credit-hour fields are unused legacy metadata. | `src/lib/workload.ts`, `src/lib/academic-actions.ts`, `src/lib/term-records.ts` |
| Does allocation affect access? | Yes: a teacher's access to a group follows an allocation or a scheduled class. | `src/lib/auth/index.ts` |
| What depends on a group's audience? | Conflict analysis, permitted windows, room capacity and auto-schedule, per cohort. | `src/lib/conflicts.ts`, `src/lib/room-transaction.ts`, `src/lib/auto-schedule.ts` |
| Does the seed create merged classes? | No: one group per cohort and course. Readers already handle several audiences per group. | `src/db/seed-summer-2026.ts`, `src/lib/serialize.ts` |

Not inspected, and listed as open points for T-03: the exact lock taken by teacher deactivate/delete writers, and whether any reader assumes one offering per group.

## Planning-document checks

| Check | Result |
| --- | --- |
| Links in spec, plan and this record | Relative targets checked to exist before the commit that adds this package. |
| Template sections (problem, scope, decisions, behavior, criteria, sources; one checklist; handoff) | Present. |
| Static mockups | Six pages (guide plus five sketches) at 1440, 390 and 320 pixels: 18 full-page Edge captures, no page-wide overflow, one `main` and one `h1` per page. [Measurement receipt](../../../output/playwright/CRS-01C/static-review.json); examples: [class groups 1440](../../../output/playwright/CRS-01C/groups-1440.png), [create 390](../../../output/playwright/CRS-01C/new-390.png), [change 320](../../../output/playwright/CRS-01C/group-320.png). Two captures were also read by eye. Terms, cohorts, courses and teachers in the sketches are illustrative. Keyboard and contrast were not checked on the sketches. |

## Implementation verification — 17 November 2026

All database checks ran on harness-owned synthetic targets under `.tmp/safe-01` (PGlite) and disposable PostgreSQL 17.11 clusters. The configured institutional directory was never opened; the runner reported its metadata unchanged on every run.

| Command | Result |
| --- | --- |
| `npm run typecheck` (run as `npx tsc --noEmit`) | Pass. |
| `npm run lint` | Pass, no warnings. |
| `npm run test:domain` | Pass, including the new `verify-class-group-records.ts` and the extended injected-import guard (`class-group-records`, `class-group-store`). |
| `verify-safety.ts "CRS-01C class groups (PGlite)"` | Pass (ten result lines). |
| `verify-safety.ts "CRS-01C class groups (PostgreSQL)"` | Pass (same scenarios plus real lock races). |
| `verify-safety.ts` neighbours: CRS-01B offerings (both adapters), CRS-01A catalog, BUG-LOAD-BASIS eligibility, BAT-01A records, BAT-01B rollover, AUTH-02 accounts, BUG-26 reset keeps access, TCH-01 teacher records (PGlite each), T-03 two-term history, T-04 audit atomicity | Pass, after the test-timing correction below. |
| `npm run build` (default) | Pass on final code; the four class-group routes compiled. |
| `scripts/review-class-groups.ts --check` (compiled preview, disposable PostgreSQL) | **Pass, 45 captures**, after three corrections to the review script only (below). |

The full safety suite and `test:ux`/`test:ui` were not run; the groups above cover the touched seams.

### Two test corrections

- **Permissions list.** The first full `test:domain` run failed in `verify-account-rules.ts`: it lists exactly what a routine coordinator may do, and approved D-2 adds class groups. The expected list was updated. An earlier run of only the new test had hidden this.
- **Role timing on PostgreSQL.** The CRS-01C and the existing CRS-01B PostgreSQL groups failed once with a permission error while their PGlite twins passed. Both scenarios granted a role “from now” on the database clock and used it at once on Node's clock (the BUG-59 clock-skew pattern). Both now grant test roles from a fixed past date, as the BAT-01A and PERF-01 scenarios already do. Test files only; all four groups then pass.

### Browser-run corrections and one finding

Three runs failed before the passing one, each on the review script, not the application: a selector that matched two headings on the Routine builder page; a row lookup that matched the catalog table instead of the completeness table; and a text lookup that matched a hidden filter option. No application code changed after the first browser run.

**Finding, not changed here:** the existing *Scheduling completeness* report on Courses & offerings lists teachers from scheduled classes only. A class group whose teacher is assigned but has no class in the routine yet shows “UT” in that column, while its status correctly reads “Unscheduled” (not “UT vacancy”). Imported groups never showed this because they all have classes. The new Class groups page shows the assigned teacher correctly. Correcting the older report means changing a shared loader outside this slice's approved seams, so it is left for an owner decision.

## Acceptance evidence

| ID | Status | Evidence |
| --- | --- | --- |
| AC-01 | Pass | Real action/loader entry points on both adapters: global and CSE-scoped administrators and routine coordinators create class groups and read history; other-department-only administrator, teacher, viewer, approver, accounts, revoked and anonymous are refused with no write and cannot load history. Browser: a view-only account reads the list with no controls and three editor URLs redirect to the forbidden page. |
| AC-02 | Pass | Draft term edited while another term is active; active term edited; completed and legacy-status terms readable and refused for writes; unknown term not found. Term generation and active selection identical before and after every operation. |
| AC-03 | Pass | Persisted results on both adapters: same course and term, offered offerings only, active cohorts only, one group per offering, merged class keeps each cohort's offering; cancelled, cross-term, cross-course, inactive-course and forged selections write nothing. |
| AC-04 | Pass | Pure cases plus persisted rows: inactive, unknown and duplicate teachers, malformed or out-of-range units and a missing crediting choice refused; vacancy accepted; stored units, method and per-teacher term totals match the entries. |
| AC-05 | Pass | Fixed and teacher-managed delivery; exactly one requirement row after create and after every update, including a delivery switch. |
| AC-06 | Pass | Course never changes; audience change, removal and a delivery change refused once the group is used; a teacher on a scheduled class cannot be removed; removal deletes only the group's rows and its offerings return to the ungrouped list. Stale, cross-term and forged calls write nothing. |
| AC-07 | Pass | Independent PostgreSQL connections observed waiting on real locks: two creates for one offering, two editors on one reviewed edit, different offerings of one term, class-group creation versus offering cancellation in both orders, teacher deactivation versus assignment in both orders, exclusive context-lock holders in both orders. No-op saves add no event; audit failure rolls back create, update and remove. |
| AC-08 | Pass, with the finding above | Counts, badges and the ungrouped list asserted after each change and in the rendered list. A group created in the active term appears in the existing completeness report and workload allocations; the existing Routine action then schedules a class for it and the group reports partial scheduling (both adapters). In the browser the group page links to the Routine builder, which loads; the class itself was scheduled through the server action, not by driving the builder's interface. List printed to [A4 PDF](../../../output/playwright/CRS-01C/runtime/class-groups.pdf). |
| AC-09 | Pass | Across the whole scenario only `teaching_groups`, `teaching_group_offerings`, `teaching_requirements`, `workload_allocations` and `audit_events` differ from the baseline fingerprint. Browser: archived CSV byte-identical and 14 preserved tables hash-identical after the whole flow. Eligibility itself was not re-asserted here; it reads the same allocation sum, which is asserted, and the BUG-LOAD-BASIS group still passes. |
| AC-10 | Pass | Two weekly requirements, duplicate allocations, a link to another course's offering and an offering in two class groups are each reported as needing reconciliation and refuse edit and removal with no write. |
| AC-11 | Pass, with stated limits | Compiled preview, Edge: 15 states × 1440/390/320 = [45 captures](../../../output/playwright/CRS-01C/runtime/) with no page-wide overflow and no axe WCAG 2 A/AA or 2.1 AA violation; validation (entries kept), stale, success, vacancy filter, used group, active-term notice, history and view-only states; no page errors ([receipt](../../../output/playwright/CRS-01C/runtime/review.json)). Examples: [list after create 1440](../../../output/playwright/CRS-01C/runtime/list-created-1440.png), [create validation 390](../../../output/playwright/CRS-01C/runtime/new-validation-390.png), [used group 1440](../../../output/playwright/CRS-01C/runtime/group-used-1440.png). **Limits:** keyboard is three scripted assertions on the create form (tab order and operating a tick), not a full walk; the loading skeleton, the read-only-term page and the needs-reconciliation page are covered by server tests and rendering only, not captured. |
| AC-12 | Pass | Typecheck, lint, domain, the listed safety groups and the default build pass. |

## Deviations and limits

- Cohort student counts are not shown beside each cohort in the form (the sketch showed them); cohort and semester are shown.
- Beyond D-7 as written: the delivery (fixed / teacher-managed) of a group cannot change while it has scheduled classes, for the same reason its audience cannot.
- A teacher who is already assigned and later goes on leave or becomes inactive keeps the assignment; only newly added teachers must be active.
- Teacher-managed groups store one requirement row with no minutes and a count of one, matching the import.
- An account whose only role is scoped to another department cannot open the page at all. That is the existing internal-portal rule.
- No schema, migration, seed, dependency or bundler change.

## Delivery and acceptance

- Owner authorized inspection/specification on 16 November with “plan CRS-01C” and approved implementation with “Approve and implement” (recorded at `fc0f203`).
- Delivery acceptance is **requested, not yet given**. Review with `node node_modules/tsx/dist/cli.mjs scripts/review-class-groups.ts --serve`, then open http://localhost:3127. No merge, remote synchronization or institutional operation. Parent CRS-01 / #7 remains open.
