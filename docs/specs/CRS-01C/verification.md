# CRS-01C — Verification record

Specification: [spec.md](spec.md). Checklist/handoff: [plan.md](plan.md).
Updated: 16 November 2026, Asia/Dhaka. **Planning stage: nothing is implemented, so no acceptance criterion has evidence yet.**

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

## Acceptance evidence

None yet. AC-01–AC-12 are all **not started**.

## Delivery and acceptance

- Owner authorized inspection/specification on 16 November with “plan CRS-01C”.
- Implementation approval and delivery acceptance: **not given**. Parent CRS-01 / #7 remains open.
