# ATT-01 — Inspection and verification

[Issue #8](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8) · [Specification](spec.md) · [Plan](plan.md)

Inspected local `main` at `dec448e` on 19 November 2026, Asia/Dhaka. GitHub #8 was read on that date and was open. The owner's 30 September comment described the teacher-first routine and phone roll-call direction as brainstorm input. [Issue and owner comment](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8#issuecomment-5915263547)

## Inspection evidence

- The page parses only `group`. The query adapter chooses the first authorized group on bare entry and returns no selected group for an invalid ID. The manager renders a single group selector and uses local state to select the latest dated session. The current no-group label covers both a bad link and an empty term. [Attendance page](../../../src/app/(portal)/attendance/page.tsx) · [Query and group options](../../../src/lib/academic-operations.ts) · [Attendance manager](../../../src/components/attendance-manager.tsx)
- The page's candidate filter uses course ownership, roster capability, and assigned teacher IDs from allocations and working meeting views. Its empty-access check falls back to CSE-scoped roster authority. The resource gate uses the course's owner or CSE fallback and existing allocation or persisted meeting assignment for teacher access. Session create also calls the query adapter after the action guard and roster locks. Keep both entry points in the implementation review. [Resource authorization](../../../src/lib/auth/index.ts) · [Role policy](../../../src/lib/auth/policy.ts) · [Attendance actions](../../../src/lib/academic-actions.ts)
- The group binds a catalog course to one or more offerings. Batch placements provide the term's curriculum semester, and batches have stream/label fields without a department FK. A group's external label is descriptive. External commitments are separate. The routine source includes HSC and Diploma classes and Other Departments entries. Student enrollment is independent of group audience filtering. [Schema](../../../src/db/schema.ts) · [Class-group reads](../../../src/lib/class-group-store.ts) · [Institutional routine source](../../source/CSE_SUMMER_2026_ROUTINE_V1_6.md) · [Architecture](../../architecture/ADR-001-academic-operations-boundaries.md)
- My routine already chooses a published weekly snapshot or working draft and calculates today's weekday in Dhaka. The active roster helper includes active students with active enrollments. Dated session records retain students captured at creation, and creation currently records them as absent. The printable roster separately checks active term, role and group before reading and auditing current roster output. [Routine selection](../../../src/lib/teacher-routine-data.ts) · [Current roster](../../../src/lib/current-roster.ts) · [Roster output](../../../src/lib/roster-output.ts)
- Consulted the installed Next.js App Router Page, URL search parameters and Link guides. Page-level search parameters are asynchronous and can contain repeated values as arrays.

## Proposal checks

- Verified 41 Markdown links and 22 sketch links, including local fragments and the existing STU-01B print sketch. Checked the decision and criterion IDs, the single checklist and proposal whitespace.
- Opened the static sketch in Edge through a temporary loopback server. No page-wide overflow at 1440, 390 and 320 px. At 320 px, the course finder, group and roll-call links reached their intended sections. These checks exercised the sketch only.

## Implementation checks

- The targeted `BUG-ATT-MARKS` suite passed on disposable PGlite and PostgreSQL 17.11. It verified merged HSC, Diploma and external routes, rejected repeated and incompatible selections, restricted teacher and administrator reads, and matched the correct session at the Dhaka date boundary. It also checked publication preference, ambiguous exact matches and out-of-term slots. Existing attendance, ATT-02 and STU-01B regressions passed, including cross-department enrollment, captured records, stale writes and roster projection parity. The harness reported unchanged institutional PGlite directory metadata.
- The default `npm run build` reached Turbopack compilation, then failed when the CSS worker exited during compilation of `/_not-found/page`. The build used an unused loopback database endpoint and the in-memory PGlite fallback.
- `npm run test:domain` passed. Repository lint and the changed-file lint check passed.
- The first compiled Edge run found that the sticky mobile header overlapped the roll-call heading after navigation. The focused targets now have a larger scroll offset. The course filters now use explicit capitalized text labels. The browser check asserts that the roll-call heading is below the mobile header and that focus reaches the roll-call region.
- The isolated Webpack build passed compilation, TypeScript, page generation and tracing. Standalone `npm run typecheck` passed, and the final `tsc --noEmit` rechecked the final browser markup and additional term-switch assertion.
- `BUG-28` passed on both disposable adapters, including unavailable term states, protected reads and mutation refusals. The browser preview uses disposable PostgreSQL.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| AC-01 | Both adapters checked Dhaka date boundaries, published and draft routine selection, and exact and ambiguous slot matches. Compiled Edge opened the correct roll-call by keyboard and showed the existing blank create form for an unmatched slot. |
| AC-02 | Both adapters resolved merged HSC, Diploma and external branches to one group. Compiled Edge reached the same group through HSC and Diploma, with the complete audience displayed. |
| AC-03 | Compiled Edge covered reload, Back/Forward, repeated group IDs, unavailable and cross-group sessions, and the existing roster and print return links. Both adapters switched the active term in a disposable transaction, refused the former term's link and loaded the new term's group, then rolled back and verified the original term context. |
| AC-04 | Both adapters checked authorized choices, scoped administrators, blocked teacher reads, anonymous and viewer refusals, and stale mutations. Compiled Edge confirmed an assigned teacher could open their groups and received a generic refusal for an unassigned target. |
| AC-05 | Both adapters preserved cross-department enrollment, captured attendance after roster removal, and existing attendance, download and audit behavior. Compiled Edge opened the existing printable roll-call with the visiting student on the roster. |
| AC-06 | Compiled Edge verified keyboard entry, visible roll-call focus below the mobile header at 320 px, and course finder overflow and axe checks at 1440, 390 and 320 px. Captures are in the ignored `.tmp/att-01/browser` directory. |

## Owner review

Open the [synthetic preview](http://localhost:3151/) and choose teacher or administrator. The teacher can open the matched roll-call and a second class with no exact match. The administrator can find the same merged group through HSC and Diploma.

To restart the preview from the isolated build, use `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --att-01 --serve`. Add `--check` to run the compiled Edge checks. The script uses loopback and a disposable PostgreSQL database.

Delivery acceptance and local merge are pending. Issue #8 was open when read on 19 November 2026.
