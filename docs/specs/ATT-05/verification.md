# ATT-05 — Verification

19 November 2026, Asia/Dhaka · [Specification](spec.md) · [Plan](plan.md) · Branch `codex/att-05` from `7179605`

## Inspection

- Inspected local `main` at `7179605`. Reviewed the attendance workspace, the ATT-04 marks loader, the session/record schema, the ATT-03A lifecycle, and the roster CSV and roll-call outputs. Issue #12 was read once on 19 November, and its state was open.
- Sessions record an optional teacher. No code writes `meeting_id`, so D-2 omits a scheduled-meeting column. No migration was needed, and the institutional database was never opened.

## Application evidence

| Criterion | Result |
|---|---|
| AC-01 | **Passed.** `scripts/verify-attendance-ledger.ts` checks the projection against hand-written expectations. It covers ordering, counts, not captured, percentage, voided exclusion, provisional labels, the summary and teachers not recorded. The ATT-05 safety group shows the same rows from the loader on PGlite and PostgreSQL 17.11. |
| AC-02 | **Passed.** Domain and both-adapter checks cover phase, teacher, “Not recorded” and date filters. Invalid, unknown, repeated and out-of-term values fall back to the whole term. The CSV route returned the same filtered rows and totals as the loader. In compiled Edge, the screen total matched the CSV total row, and filters were kept when changing tabs. |
| AC-03 | **Passed.** Matrix totals equal ATT-04 Semester, Midterm and Final results for every roster student on both adapters. A student removed after capture keeps their session counts and matrix row, labelled “Not on current roster” on screen and in CSV. |
| AC-04 | **Passed.** The CSV has a byte order mark, quoted formula-safe cells (the shared `csv-safe` encoder now also serves roster CSV), `private, no-store` and `nosniff` headers, and no contact fields. Edge print-to-PDF produced the sessions ledger in A4 portrait and the matrix in A4 landscape. Both carry heading, filters, generated date, notes and page numbers, and both were inspected visually. Splitting the matrix into 16-session blocks is covered by domain assertions; the browser fixture had three sessions. |
| AC-05 | **Passed.** Anonymous users, read-only viewers and out-of-department administrators are refused. So are forged active/archived term–group pairs and unknown groups, through both the loader and the CSV route, and refusals reveal no student data. The assigned teacher and in-department administrator can read. “Open session” appears only for an active term. |
| AC-06 | **Passed.** Compiled Edge ran axe (WCAG 2.1 AA) and page-width checks at 1440, 390 and 320 px on the sessions, students and completed-term views. Entry from the workspace by keyboard, the completed-term “Ledger” link, a student's ATT-04 explanation and return all worked. |
| AC-07 | **Passed.** The completed Summer ledger stayed identical after the student was removed and deactivated. It is read-only, with no correction links. |

## Checks and findings

- `npm run typecheck`, `npm run lint` and `npm run test:domain` passed. The default `npm run build` (Turbopack) passed and listed `/attendance/ledger`, `/export` and `/print`. The earlier CSS-worker failure did not recur in these runs.
- Safety groups ATT-05, ATT-04, ATT-03A, SET-01B and BUG-ATT-MARKS passed on both adapters. The full-suite result is recorded below.
- Found and fixed during verification:
  - The synthetic fixtures were missing actors required by the lifecycle constraints.
  - The review fixture SQL needed integer casts.
  - The review's tab selectors collided with the main navigation.
  - The Phase select kept a stale value after “Clear filters”; the form is now keyed to the applied filters, and the review asserts the reset.
  - On phones, student names broke mid-word in the matrix column.
  - Absolutely positioned screen-reader labels escaped the matrix scroll region and widened the page at 320 px.
- I updated the ATT-04 review selector for the completed-term group list, which now offers separate Marks and Ledger links.

## Owner review

With the production bundle built (`npm run build`), run `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --att-05 --serve` and open the [local review launcher](http://localhost:3191/).

- **“Open Attendance as administrator”** opens the working Spring group. Follow **Attendance ledger** to try the tabs, filters, **Print** and **Download CSV**.
- **“Open completed term as administrator”** opens Summer. Follow **Attendance marks**, then **Ledger**.

The launcher uses disposable PostgreSQL with synthetic data. Use `--check` instead of `--serve` to repeat the assertions. Screenshots and the two PDFs are saved to `.tmp/att-05/browser`.
