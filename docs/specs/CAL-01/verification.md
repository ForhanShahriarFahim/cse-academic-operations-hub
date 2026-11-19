# CAL-01 — Inspection and verification

[Issue #38](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/38) · [Specification](spec.md) · [Plan](plan.md) · 19 November 2026, Asia/Dhaka

## Inspection evidence

| What was checked | Observed result |
| --- | --- |
| `gh issue view 38 --json number,title,state,body,comments,url` | Open with no comments on 19 November. The proposal includes term dates, holidays, closures, exams, optional day swaps, CSV, previous-term copying and A4. Source and swaps are still open questions. |
| University notice index, public CSE pages and English/Bangla calendar search | The university index showed closure ranges, exam notices and an opening notice addressed to newly admitted Summer 2026 students. The inspected material establishes individual notices. A complete current calendar and day-swap policy remain unverified. [University notices](https://pundrauniversity.ac.bd/notice) · [CSE notices](https://pundrauniversity.ac.bd/departments/computer-science-and-engineering/notice) |
| [Schema](../../../src/db/schema.ts), [Summer seed](../../../src/db/seed-summer-2026.ts) and [routine source](../../source/CSE_SUMMER_2026_ROUTINE_V1_6.md) | The schema stores administrative term bounds and routine effective date separately. Period patterns, day plans and class windows govern recurring scheduling. Room unavailability has dated ranges for rooms. There is no term calendar table or institutional teaching-day inference. |
| [Attendance Today projection](../../../src/lib/attendance-directory.ts), [attendance form](../../../src/components/attendance-manager.tsx) and [published routine](../../../src/lib/public-routine.ts) | Attendance Today uses Dhaka civil date and weekday, filters by term/meeting dates and selects a routine source. The form has a manual date input bounded by the term. Publications come from stored snapshots. |
| [Term data](../../../src/lib/term-data.ts), [term actions](../../../src/lib/term-actions.ts), [lock](../../../src/lib/term-lock.ts) and [access policy](../../../src/lib/auth/policy.ts) | Starting policy and unused draft identity have existing controls. Term writes already coordinate on term context. `manage_terms` is held by system and academic administrators; term-wide access uses a global assignment. |
| [Migration journal](../../../drizzle/meta/_journal.json) and installed Next.js routing/mutation guides | `0018_course-catalog` is the last checked-in migration. Explicit term routing and independently authorized Server Actions fit the installed app conventions. |

## Proposal checks

- Resolved 28 local document references, checked D-1–D-5, AC-01–AC-07 and the single task checklist, and reviewed the changed handoff and Git diff.
- Opened the local HTML in headless Edge with the repository's installed Playwright after the sandboxed Edge launch failed and Playwright CLI was unavailable from the local cache. The 1440, 390 and 320 px layouts had no page-wide overflow. Checked all anchor targets, keyboard focus and navigation, and found no axe violations in the 320 px sketch. Print media showed only the A4 example with matching sample entries and hidden controls. Native multi-page print remains a delivery check.

## Acceptance evidence

AC-01–AC-07 are pending implementation and runtime verification. This checkpoint contains the specification, implementation plan and static workflow sketches. No application, schema or database-preparation command was run. Owner implementation approval and delivery acceptance are pending. Issue #38 was read only.
