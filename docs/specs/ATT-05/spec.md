# ATT-05 — Course attendance ledger, student matrix and exports

[Issue #12](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/12) · Approved · 19 November 2026, Asia/Dhaka

[Product requirement](../../PRODUCT_REQUIREMENTS.md#att-05--whole-semester-course-attendance-ledger) · [Plan](plan.md) · [Review sketches](mockups/index.html)

## Inspected baseline

- A teaching group is the canonical course unit. The Attendance finder already reaches it through department, stream and batch, and merged or cross-department audiences stay in one group. [Finder](../../../src/lib/attendance-selection.ts) · [Workspace](../../../src/app/(portal)/attendance/page.tsx)
- ATT-04's marks loader already authorizes one group in an active or completed term. Access requires `take_attendance`, `review_attendance` or `manage_rosters` on the group. The loader rejects forged term/group/student combinations and reads within `cohortRead`. [Marks loader](../../../src/lib/attendance-marks.ts)
- Each session stores its date, phase, optional start/end time, lifecycle state and an optional recorded teacher. Each record stores one student's status. `meeting_id` exists in the schema but no current code writes it. [Schema](../../../src/db/schema.ts) · [Session creation](../../../src/lib/academic-actions.ts)
- Records are created for the roster at session creation and survive later roster removal. `attendanceContribution` defines what counts: present and late are attended, absent is eligible only, and excused, uncaptured and voided contribute nothing. [Calculation](../../../src/lib/attendance.ts)
- The roster CSV route uses a formula-safe cell encoder, a UTF-8 byte order mark and private no-store headers. The roll-call print page uses an A4 table with a repeated heading. [Roster output](../../../src/lib/roster-output.ts) · [Roll-call print](../../../src/app/(portal)/attendance/roster/print/page.tsx)

## Proposed decisions

### D-1 — One group-scoped report, reached from existing entries

Add a read-only **Attendance ledger** for one teaching group in one active or completed term at `/attendance/ledger?term=…&group=…`. It has two tabs: **Sessions** (default) and **Students**. Link to it from the selected group in the Attendance workspace, beside “Attendance marks”, and from each group in the completed-term marks group list. The existing finder remains the way to choose department, stream, batch and course. Each page, CSV and print request applies ATT-04's group access and term binding again. An active term must still be the current term context. Anonymous users go to sign-in, signed-in users without access receive the existing forbidden or not-found response, and forged term/group pairs are not found.

### D-2 — Sessions ledger

List every session in the term in date, start-time and ID order. Columns are: **Date · Day · Time · Phase · Teacher · Present · Late · Absent · Excused · Not captured · Attendance % · Status**.

- **Teacher** is the recorded session teacher, or “Not recorded”. The report does not infer a teacher from the routine.
- **Counts** come from the session's own records, including students later removed from the roster, so past attendance remains. “Not captured” counts the current active roster students without a record in that session in an active term. It is blank for completed terms, where no current roster applies.
- **Attendance %** is (present + late) ÷ (present + late + absent), rounded to one decimal using ATT-04's half-up rule. Excused students are excluded, consistent with ATT-04. A session with no eligible records shows “—”.
- **Status** uses the existing lifecycle labels. Draft and reopened rows carry a “Provisional” label. Voided rows remain in date order, are visually de-emphasized, show their void reason, and are excluded from every total.
- **Summary above the table:** classes held (non-voided sessions in the filtered view), the provisional count, the voided count, distinct recorded teachers, and the total present/late/absent/excused with the overall attendance percentage.
- **Correction links:** in an active term, users with `take_attendance` or `review_attendance` see “Open session”, which goes to the existing roll-call (`/attendance?group=…&session=…`). The lifecycle there keeps the existing permissions and reasons. Completed terms are read-only and have no links.
- **No scheduled-meeting column:** because no session links to a routine meeting yet, an empty column would mislead. The link belongs with ATT-03B's routine/calendar suggestions.

### D-3 — Filters

Provide GET filters stored in the URL: **phase** (All, Midterm, Final), **teacher** (All, each teacher recorded on a session in this group and term, or Not recorded), and **date from/to**. Dates must be valid ISO dates within the term, and the start date cannot be after the end date. Invalid values show a status message and fall back to the full term instead of returning an error. Filters apply on the server to both tabs, the summary, CSV and print. Each output states the active filters. Changing tabs, opening a student and printing keep the filters. The filter form works without JavaScript and labels every control.

### D-4 — Student matrix

The **Students** tab lists students with dates as columns. Columns are the filtered non-voided sessions, headed by short date, time and phase. Cells show **P**, **L**, **A**, **E** or “—” for not captured, each with an accessible full label. Row totals show attended ÷ eligible and the percentage, using the D-2 rules. Each student's name opens ATT-04's dated explanation for that group and the closest phase: Midterm or Final when filtered to one phase, otherwise Semester. Marks remain in ATT-04, because a teacher or date-range filter does not define an official mark.

Rows use ATT-04's roster rule. In an active term, the matrix shows the active roster plus anyone with a non-voided captured record in the filtered sessions. Anyone outside the active roster is labelled “Not on current roster”. A completed term shows enrolled students and anyone with captured records. Rows are ordered by student ID. Identity is student ID and name only, with no phone, home department or other directory fields.

On screen, the matrix scrolls horizontally inside its own labelled, focusable region. The student column and date header stay sticky, so the page itself never overflows on narrow screens. On a phone, the Sessions tab uses stacked rows rather than a wide table.

### D-5 — One projection for screen, CSV and print

One server function builds the report projection: group heading, filters, summary, session rows and matrix rows. The screen, CSV and print views all render that same object, so their totals match by construction.

- **CSV:** `/attendance/ledger/export?…&view=sessions|students` downloads one CSV for the active tab. Columns match the screen, with ISO dates and status words, and student cells hold full words. It reuses the formula-safe cell encoder, UTF-8 byte order mark, `private, no-store` and `nosniff`. Filenames include the term, group, view and filtered date range. Excel output is out of scope.
- **Print/PDF:** `/attendance/ledger/print?…&view=…` produces an A4 document with term, course, audience, group, filters, provisional/voided notes, generated date and page-repeated headings. Sessions print in portrait. The matrix prints in landscape and splits columns into blocks of up to 16 sessions, repeating the student ID/name columns for each block. Row totals appear in a final block. “Save as PDF” in the browser dialog is the PDF path.
- **Audit and privacy:** exports and prints are reads, so they are not audited, matching the existing roster exports. They include no phone numbers or contact fields.

### D-6 — Performance and boundaries

Each report uses a fixed number of queries: group and access, roster, sessions with recorded teachers, and records for the filtered sessions. It does not issue one query per session or student. ATT-05 needs no migration and introduces no new permissions.

**Out of scope:** routine-meeting links, schedule-gap detection and expected-class counts (ATT-03B / CAL-01); cross-group or department-wide reports; Excel ledger output; mark release; editing from the ledger.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | The ledger lists every session in order with date, day, time, phase, recorded teacher, the five counts, percentage and lifecycle status. Voided sessions appear but are excluded from totals, and provisional sessions are labelled. The summary's class count and totals reconcile with the rows. | Domain oracle tests on the projection, including late, excused, uncaptured, voided, no-time and no-teacher sessions. |
| AC-02 | Phase, teacher and date-range filters narrow the rows, matrix, summary, CSV and print identically and appear in each output. Invalid filters fall back to the full term with a visible message. | Projection tests and a route test comparing CSV and print totals with the screen for the same query. |
| AC-03 | The matrix shows one accurate cell per student and filtered session, and row totals agree with ATT-04's semester or phase counts when unfiltered. Removed students with captured records stay visible and labelled. | Parity test against `getAttendanceMarks`, plus a fixture removing a student after capture. |
| AC-04 | CSV columns and totals match the screen. Cells are formula-safe, and responses are private and contain no contact fields. A4 print shows headings, filters and the generated date without clipping, and the matrix splits into column blocks. | CSV tests, compiled Edge print-to-PDF review in portrait and landscape. |
| AC-05 | Anonymous users, users without group access, forged term/group pairs and non-current active terms cannot read the ledger, CSV or print. In-scope teachers, reviewers and roster managers can read it. Correction links appear only in active terms for users who can take or review attendance. | Both-adapter role and identity matrix through the page loader and export route. |
| AC-06 | The page works by keyboard at 1440, 390 and 320 px with visible focus, labelled filters, named regions and readable status that does not depend on color. The matrix scrolls only within its region. Entry links from the workspace and completed term work. | Compiled Edge review with axe and keyboard checks. |
| AC-07 | A completed term remains readable after activating another term and after a student is deactivated, using its retained records. | Disposable two-term fixture on both adapters. |
