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

## Implementation checks

- Storage is the forward-only migration `0019_term-calendar` with `term_calendars` and `term_calendar_entries`. It adds SQL dates, a foreign key to the term, paired teaching bounds with a source, a type-specific exam-effect check, length and HTTP(S) source checks and a term-scoped duplicate key on type, dates and case-folded title. Range checks use explicit `>=`/`<=` because PostgreSQL restore rewrote `BETWEEN`, which made the restored schema text differ.
- `npm run test:domain` passed, including the new pure calendar tests in `scripts/verify-calendar-records.ts`. `npm run lint` and `npm run typecheck` passed.
- The new SAFE-01 groups `CAL-01 term calendar (PGlite)` and `(PostgreSQL)` passed. They cover migration from a populated database with unchanged prior-table fingerprints, de-migration and reapply, the full action scenario, audit-insert fault rollback, cold PGlite and encrypted PostgreSQL backup/restore/reapply, and independent PostgreSQL races. The races cover twin writers, same-revision saves, activation, reverse lock order, completion and draft narrowing in both orders.
- The compiled review found that `ux:review --fresh` could not truncate terms because of the new foreign key. The dev reset now clears the calendar tables first. The time-zone guard now lists the new date and timestamp columns.
- The final full `npm run test:safety` passed all 50 groups, using disposable PGlite and PostgreSQL 17.11. Earlier full runs hit two failures that went away on rerun. One was a PostgreSQL connection terminated by an administrator command (57P01) while race databases were dropped, in CRS-01A and CRS-01B. The other was a rollover child that exited with 0xC0000142 while the review server was compiling. Neither group touches calendar code.
- The default `npm run build` passed on Turbopack in this run. It compiled in 2.3 minutes and listed all six calendar routes. Its one warning, about tracing caused by dynamic filesystem access, comes from the unchanged `src/db/target.ts`. The CSS worker failure seen in ATT-01 did not occur.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| AC-01 | Both adapters kept the active and draft terms' calendars separate with overlapping dates. A term with no calendar and a fresh draft both read as unknown teaching dates with no entries. Compiled Edge showed the empty state from the term workspace link. |
| AC-02 | Domain cases and both adapters refused bad, reversed and out-of-term dates, missing sources, missing exam effects and case/whitespace duplicates. Compiled Edge entered a sourced teaching range and all five types. Failed saves kept every value and focused the announced summary. |
| AC-03 | Domain cases covered shared endpoints, exams beyond the teaching range, overlapping exam and holiday, a partial calendar and the Dhaka midnight boundary. Compiled Edge checked the saved calendar for suspended, teaching and outside-teaching results. |
| AC-04 | Both adapters allowed internal reads and global managers. They refused scoped and expired managers, anonymous users and forged cross-term entry IDs. Completed and legacy terms were read-only, and a draft with no active term was editable. Compiled Edge showed a teacher the read-only calendar and refused the add page. |
| AC-05 | Both adapters kept the audit chain through correction, clearing and removal with reasons. No-op saves wrote no audit row and did not advance the revision. An audit fault rolled the change back. PostgreSQL races kept the revision, term status and audit consistent. Compiled Edge sent a second editor's old form back as stale with its values and a reload link. |
| AC-06 | Compiled Edge reported no axe violations and no page-wide overflow at 1440, 390 and 320 px on seven screens, and it checked keyboard order. Native A4 print of a 20-entry calendar used three pages, matched the screen list and hid controls. |
| AC-07 | Both adapters migrated populated synthetic databases with unchanged prior-table fingerprints, then restored and reapplied. Existing term, attendance, routine, rollover and archived-output regressions passed in the full suite. |

## Owner review

Start the disposable review server with `npm run ux:review -- --fresh`. To sign in as the synthetic reviewer, run `npm run ux:review -- --print-cookie` and paste the printed snippet into the browser console. Then open `/terms/1/calendar`. The fresh calendar is empty. With the server running, `node scripts/review-calendar-browser.cjs` fills it with synthetic entries and repeats the compiled Edge checks. It writes screenshots and the A4 PDF to the ignored `.tmp/cal-01` directory. The server uses loopback and disposable data and does not touch the institutional database.

## Pending

- The institutional database has not been migrated. Migration `0019` requires an operations decision and a cold backup first.
- Owner acceptance and the local merge (T-06) are pending. Issue #38 was read only, and no GitHub synchronization was done.
- Day swaps (D-2), CSV and previous-term copying remain deferred #38 work.
