# CAL-01 — Term academic calendar

[Issue #38](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/38) · Approved by the owner · 19 November 2026, Asia/Dhaka

[Implementation plan](plan.md) · [Inspection evidence](verification.md) · [Desktop, phone and A4 sketches](mockups/index.html)

## Problem and inspected baseline

The portal can identify a term and show its weekly routine. Staff have no term calendar for recording first and last class dates, exam periods or dated closures. The term's administrative date bounds, routine effective date, cohort/stream weekly windows and dated room maintenance answer different questions. The Summer 2026 routine transcription's effective date of 14 August applies to that document. None of those inputs establishes the term's first or last class day. [Summer 2026 routine transcription](../../source/CSE_SUMMER_2026_ROUTINE_V1_6.md)

The official notice index contains separate announcements for closures, class openings and exams. The inspected public sources yielded no complete, current term calendar or confirmed day-swap procedure. A class-opening notice addressed to newly admitted students also does not establish a common class-start date. Confirm the accepted source and the audience of each notice before using institutional dates. [University notices](https://pundrauniversity.ac.bd/notice) · [CSE notices](https://pundrauniversity.ac.bd/departments/computer-science-and-engineering/notice)

## Proposed delivery

- Add **Academic calendar** to each Terms workspace. Staff can record the first and last regular class dates for one term and add dated public holidays, university holidays, class suspensions, midterm periods and final periods with their source references.
- Add a chronological view, a date lookup that explains the applicable calendar facts, and an authenticated A4 print view of the saved calendar. The date lookup is independent of the weekly schedule.
- Defer CSV import, previous-term copying and expected class counts within #38. Defer day swaps pending D-2. ATT-03, RUT-05, LEAVE-01 and TASK-01 own subsequent use of the calendar. Existing dated actions and the teacher's current attendance entry retain their present behavior.

## Required behavior

### Enter and review dates

- Show the selected term, its status and its administrative bounds. Store the first and last regular class dates together as an optional inclusive range, with a source reference. Both may be the same date. Calendar entries can be recorded while the teaching range is unknown. An existing term begins with no recorded calendar; display missing dates explicitly.
- Calendar entries have a type, short display title, inclusive start and end and source reference. A one-day entry uses the same start and end. Use Asia/Dhaka civil dates without time-of-day. Validate real dates, order and containment in the selected administrative term bounds. Exam periods may extend beyond the teaching range while remaining in the term. Overlapping academic terms keep separate calendars.
- A source reference identifies the approved notice or document, for example its issuer, notice number or title, and date. A public HTTP(S) URL may be recorded with it when available. Render references as text or safe links. Use the notice's effective dates and audience, including explicit confirmation that it applies across the term's portal audience. Record no names, grades or other student details in the calendar.
- Require a regular-classes choice for exam periods. **Regular classes may continue** preserves ordinary weekly eligibility. **Regular classes suspended** excludes the period from ordinary weekly teaching. Holiday and suspension types are for notices that close regular classes across the term's audience. A holiday entered from a general holiday list still requires an approved local source for closure. A suspension may be outside the teaching range and can still be displayed as a calendar fact.
- Reject entries with the same type, dates and title after trimming, collapsing whitespace and ignoring case. Change the source or exam effect by editing that entry. Permit distinct overlapping notices. Show all applicable entries in date order with a stable tie-breaker. An applicable closure wins for regular teaching while exam labels remain visible. Neither the presence nor overlap of an exam label asserts that an individual exam occurs or is cancelled.

### Check a date

The lookup returns the status of **regular teaching** and every matching calendar entry. It uses the selected term only. Apply these rules in order.

| Condition | Display |
| --- | --- |
| Date outside the term's administrative bounds | Outside term dates |
| A holiday, class suspension or exam entry with classes suspended applies | Regular classes suspended, with the applicable source entries |
| Teaching range is missing | Teaching dates have not been recorded, with any applicable entries |
| Date falls outside the recorded teaching range | Outside regular teaching dates, with any applicable entries |
| Date falls inside the teaching range and no closure is recorded | Within regular teaching dates, with any applicable entries |

Inside-range dates are candidates for matching a weekly meeting. The calendar has no default weekends or authority over working days, meetings, attendance phase or payments. A term calendar can still be incomplete after its teaching dates are recorded.

### Permissions, corrections and history

- Authenticated internal portal users can view and print a selected term calendar. Editing and audit history require an in-force global `manage_terms` assignment. A department-scoped role cannot write a calendar that applies across the term. Authenticate and authorize on the server for reads and every write, including direct requests.
- Authorized staff can edit draft and active calendars. Completed and legacy-status terms are read-only. Saving a calendar takes effect on its own screen and print view without changing activation or publication. Entries for the wrong term or a term that became read-only are refused. A term-wide calendar can be prepared on a draft before activation.
- Allow corrections to teaching dates and adding, editing or removing an entry. Review the named entry before removal. Require a correction reason for editing or removing saved content or clearing the teaching range. Keep actor, time, term, before/after and reason in the audit history. Repeated submissions and stale editors must preserve a single committed change and its matching audit event. Refuse any allowed draft term-boundary edit that would strand existing calendar dates. Calendar setup alone does not freeze draft identity or starting policy.
- Keep field values and date context on failed saves. Show the affected field or explain that the calendar changed and provide a path to reload the selected term. Announce saved and failed states, disclose read-only status, and give users with no calendar a usable empty view. Use compact chronological rows on desktop and stacked entries at phone widths.
- Print the full saved projection for the selected term, including term name/status, teaching range or missing-date label, every entry with effect and source reference, and the print timestamp in Asia/Dhaka. Use A4 portrait with readable wrapping and continued pages. Omit edit controls and audit history. This is an internal calendar copy. Frozen routine screens, CSV and official package continue to use their own existing data.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | Term A and Term B have distinct calendars, including when dates overlap. An existing term or fresh draft with no calendar shows unknown teaching dates without inferred entries. | Both adapters and compiled term navigation. |
| AC-02 | A manager can enter a sourced teaching range and all five entry types. Bad dates, reversed or out-of-term ranges, missing source, missing exam effect and semantic duplicates get local feedback. | Date/validation cases and compiled create/edit flows. |
| AC-03 | Date lookup applies the table, including shared endpoints, an exam beyond the teaching range, overlapping exam and holiday, a partial calendar, and civil-date boundaries around midnight in Dhaka. | Domain cases and saved-calendar screen checks. |
| AC-04 | Internal read/print, global management, scoped or expired role denial, forged cross-term IDs, completed/legacy read-only behavior and a draft with no active term follow the stated rules. | Direct action/route and browser checks on synthetic roles. |
| AC-05 | Corrections retain audit history. Same-revision saves, audit failure, concurrent term activation and draft date narrowing keep storage, status and audit consistent. | Both adapters, independent PostgreSQL connections for race cases and fault injection. |
| AC-06 | Desktop and 320/390 px views support keyboard use and readable status, fields and errors. Authenticated A4 matches the saved screen projection including a multi-page calendar and no UI clipping. | Compiled browser, axe, keyboard and native print. |
| AC-07 | Forward migration and disposable recovery preserve prior records. Existing attendance/manual dates, weekly routines and frozen public output retain parity. | Populated synthetic PGlite and PostgreSQL, restore/reapply and targeted term/attendance/archived output regressions. |

## Owner decisions (approved as proposed on 19 November 2026)

| ID | Proposed decision |
| --- | --- |
| D-1 | Confirm the authority and source staff should use. Proposed starting path is manual entry from approved university/CSE notices or an owner-confirmed term document. Identify the office or delegated role that resolves conflicting notices. Share the current document or URL if one exists. |
| D-2 | Confirm whether CSE uses whole-day swaps such as Thursday following Sunday's routine, and whether they apply term-wide. Proposed first delivery defers swaps. If swaps are required in this delivery, supply an example and confirm the affected audience so the proposal can specify precedence and review it. |
| D-3 | Use the date and exam-effect rules above. Calendar facts apply across the selected term's portal audience. Group- or stream-only exceptions and individual exam schedules require their own model. |
| D-4 | Use global `manage_terms` to maintain draft and active calendars and to view their audit trail. Internal users can view or print. Completed and legacy-status calendars stay read-only. |
| D-5 | Approve the first delivery with manual entry, lookup and A4. Keep #38 open for deferred import, copying and counts. Subsequent calendar integrations retain their own approvals. |
