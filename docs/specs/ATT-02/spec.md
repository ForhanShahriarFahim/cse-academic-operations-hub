# ATT-02 — Attendance save and roster import feedback

Issue [#9](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/9) · Approved for implementation · 18 November 2026 (Asia/Dhaka)

## Problem and inspected baseline

A teacher can save marks far below the page's single result message. An administrator can import a file and see “student record(s) imported or updated” without knowing which students joined the roster or which source rows need attention. [AttendanceManager](../../../src/components/attendance-manager.tsx) shares one top-of-page result across six actions and refreshes only when `ok` is true. Its file input is hidden from keyboard navigation and can show a filename before the corresponding read completes. A successful reset clears the native input while retaining the displayed filename and buffered text.

The [CSV parser](../../../src/lib/attendance.ts) drops blanks and duplicate codes, defaults unknown audience values to local, and throws on the first missing ID or name with raw row text. The [import action](../../../src/lib/academic-actions.ts) upserts global students and term/group enrollments, including rewriting existing names, contact details and student status. Its count is the number of parsed inputs, regardless of database effect. [Inspection evidence](verification.md)

## Outcome and boundaries

Keep results beside the attendance action and provide a roster import receipt with committed counts and row-level reasons. Use the existing server capabilities, term context, roster CSV entry point and attendance session rules. The local delivery sequence puts this slice before STU-01A. The [11 November review](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md) proposed moving import work to STU-01A and identified the shared identity risk (F-03). D-3 below addresses that risk on the import path now. STU-01A owns the student directory, identity corrections (including manual roster edits), CSV preview and wider enrollment workflow. ATT-01, ATT-03, attendance calculations, Excel/export and portal-wide notifications are outside this slice.

## Approved decisions

### D-1 — Results beside the action

- Put save and delete-session feedback beside the attendance controls, create-session feedback beside its form, add/edit feedback beside the student form, removal feedback in the roster, and import feedback beside the file picker and import button. Use the portal's notice visual language with explicit status text and a live announcement. Results stay available until retry, correction, dismissal or a change of relevant group/session context. Work in one section does not clear another section's result or draft.
- Show pending text and prevent duplicate or conflicting submissions while the action is running. Keep the selected group and session, and preserve entered values and marks on refusal. A committed save updates the visible marks and summaries and retires the submitted draft when the refreshed persisted values are available.
- Keep focus at the action on success when it remains usable. If the control disappears, use a stable control or result heading in the same section. For a correctable field error, focus and describe the affected field. For row errors, stale/denied results or a general failure, focus the relevant summary if the user is still in that workflow. A late response must not steal focus or attach itself to a newly selected group/session.

### D-2 — File handling and row validation

- Keep the documented column aliases, leading-zero IDs, case-sensitive student codes, UTF-8 BOM, LF/CRLF, quoted commas and escaped double quotes. This import supports one record per physical line. Report line numbers from the original file including the header and intervening blank lines. Ignore whitespace-only lines. A nonblank line with no student data is a failed row.
- Missing or ambiguous required headings, duplicate headings mapped to the same supported field, malformed headings, and a file with no data lines refuse the file before writes. Continue ignoring unrecognized columns. Require ID and name in each data row. Fail a row with malformed quotes, values beyond its column headings, or a nonblank audience type other than local, external or merged (case-insensitive). Missing trailing optional values are allowed. Show field/row reasons without quoting submitted values.
- The first structurally valid occurrence of a trimmed ID is the only candidate for that ID. Later structurally valid occurrences are skipped, even when the first candidate has a roster conflict. A structurally invalid occurrence is a failure and does not reserve the ID.
- Make the picker reachable by keyboard. Enable import only when the currently chosen file has been read successfully. Replacing a file invalidates a previous read, including a late completion. Clear selection and buffered content together after a complete result. On partial or refused import keep the file selection available and tell the user to correct the CSV and submit a new file with the affected rows.

### D-3 — Match the student, change enrollment

- A new student code creates the student and enrolls them in the selected group. With an existing active student, the required name and any supplied nonblank phone or department must match the saved values (trimmed text, exact comparison). Blank optional identity fields leave saved values alone. An identity mismatch or inactive student fails that row with a generic message to check the ID and contact the roster administrator. Return no saved identity details. The import cannot change or reactivate an existing student record.
- A matching existing student can join another group, including a group outside their home department. Enrollment changes apply only to the selected active term and teaching group. An explicit audience changes that enrollment's audience. A blank audience preserves an existing enrollment's audience or defaults a new enrollment to local. Matching rows can restore an inactive enrollment for an active student.

### D-4 — Count what the import did

Count each nonblank data line exactly once. The receipt shows all five counts, including zeroes, and gives a reason and source line for every skipped or failed row.

| Count | Meaning |
|---|---|
| Created | A new enrollment was committed, for either a new or existing student. |
| Updated | An existing enrollment was reactivated or its audience changed. Count both changes on one row once. |
| Unchanged | The active enrollment already matched. This row causes no data change. |
| Skipped | A later structurally valid occurrence of a student ID in this file. |
| Failed | The row failed parsing, validation or the identity/eligibility check. |

`total = created + updated + unchanged + skipped + failed`. Applied means `created + updated`. A receipt with applied rows and skipped or failed rows uses the partial outcome and refreshes the roster. With no skipped or failed rows, report completion even when all were unchanged. With skips or failures and zero applied, report “No roster changes” and retain row details. A file-level refusal, stale or denied request has no row receipt. If the browser loses the result, say that the outcome could not be confirmed and ask the user to check the roster before retrying.

### D-5 — Permissions, consistency and audit

- Keep `manage_rosters` and `take_attendance` checks on the existing resources and retain the active-term guard. Membership, teacher assignments and attendance session capture rules remain authoritative. Importing to a roster does not add students to older sessions or alter marks, other enrollments or public data.
- Commit accepted mutations and the import audit event together, with counts and no raw CSV or student fields in the new receipt/audit data. No-op imports write no mutation audit. Counts reflect database state checked in the write transaction, including concurrent imports. If the data or audit write fails unexpectedly, roll back all mutations from that attempt and never report provisional counts as committed.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | Save, create, delete, manual add/edit and roster removal display their own local result. Failed save preserves draft marks. Success updates stored marks and the displayed summary. | Synthetic compiled browser and existing attendance safety scenarios. |
| AC-02 | A keyboard user can operate the picker and submit, receive a pending/result announcement, reach errors and continue after success or removal. Focus and drafts remain with their workflow through refresh/navigation. | Desktop and narrow browser, keyboard, accessibility scan and live announcement spot check where available. |
| AC-03 | File-level refusal and mixed line validation follow D-2, including physical line numbers, duplicate policy, supported inputs and safe reasons. A replacement or failed file read cannot submit previous text. | DB-free parser checks and browser file selection cases. |
| AC-04 | Mixed CSV returns all five counts and actionable row details. An all-unchanged retry causes zero data changes. All-rejected, unchanged-plus-failed and partial-with-writes outcomes report correctly. | Both database adapters, committed row/audit assertions and compiled browser. |
| AC-05 | Import can enroll the same active student in another group without overwriting identity, reactivate group membership and set an explicit audience. Mismatched/inactive identities and wrong group/term/roles are refused. | Both adapters with restricted roles and before/after data assertions. |
| AC-06 | Concurrent overlapping imports report actual created/updated/unchanged effects. A forced write or audit failure rolls back this attempt. Existing attendance sessions, unrelated groups and historical data are preserved. | Both adapters, independent PostgreSQL race, audit-failure injection and history regression. |

[Product requirements](../../PRODUCT_REQUIREMENTS.md#att-02--reliable-successerror-feedback) · [Local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md) · [BUG-ATT-MARKS](../BUG-ATT-MARKS/spec.md) · [Implementation plan and sketches](plan.md)
