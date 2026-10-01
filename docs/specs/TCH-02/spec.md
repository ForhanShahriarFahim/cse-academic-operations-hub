# TCH-02 — Individual teacher routine: view, print and bulk print

Issue: [#35 TCH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35)
Status: Approved 1 October 2026 with recommended decisions D-1–D-6 (see [plan approval record](plan.md#approval-record))
Updated: 1 October 2026, Asia/Dhaka

## Problem and inspected baseline

Each teacher needs their own weekly routine on screen and on paper. Today the department makes it by hand in Word from the owner's "Individual Class Routine" template. Facts about the template are recorded in #35. It was re-inspected on 1 October 2026 and is not committed, because it holds a real teacher's routine and the university logo.

Inspected on 1 October 2026 at `4237c0d` (main after RUT-04):

- **Teacher detail** (`/teachers/[id]`) lists a teacher's meetings as a plain day/time list, with workload figures from `computeWorkloads` (`src/lib/workload.ts`). It has no routine grid and no print layout.
- **Routine data** for a term comes as a `RoutineSource` (`src/lib/routine-sources.ts`), either the working draft or the published snapshot. Each one carries meetings (teachers, audiences, rooms, exact minutes, delivery mode), batches, the term time grid (RUT-04 `TimeGrid`) and external commitments. Publications made before RUT-04 fall back to the legacy grid. The official package already turns this into A4 tables (`src/lib/official-routine-sheets.ts`). It merges multi-period classes and writes off-grid times on the room line.
- **Total Credit Hours.** The owner answered on 30 September 2026 that this is the workload figure: a theory course counts 3 and a one-credit lab counts 2. That figure is the "Workload units" total from approved allocation records (`allocations.units`, seeded from `workloadCreditHours`). It is not stored in publications.
- **Accounts and teachers.** `portal_users.teacher_id` already links a sign-in to a teacher record (`Actor.teacherId`). Every internal user can already open every teacher's detail page (`view_internal_portal`).
- **Missing pieces:** no .docx library is installed; the logo is not in the repository; the app works on one active term, and term switching belongs to BAT-01 (#6).

## Outcome and scope

- **Outcome:** a teacher opens **My routine** and sees their week, laid out like the department's template. They can print it, or save it as PDF, on one A4 portrait page. A coordinator can do the same for any teacher, or print several teachers in one run.
- **Included:**
  - A shared per-teacher routine projection.
  - The My routine page and a routine page for each teacher.
  - A phone agenda.
  - The A4 portrait print sheet.
  - Bulk print.
  - A choice between the published version and the working draft.
  - A breakdown of credit hours.
  - Links from navigation, Teachers and the teacher detail page.
- **Excluded:**
  - Editable .docx download (see D-2).
  - The university logo (D-3).
  - Past-term selection (D-6; waits for BAT-01 #6).
  - Header text editing (SET-01 #14).
  - Public, signed-out access.
  - Email delivery.
  - Dated one-off changes (RUT-05 #39).
- **Dependencies:** RUT-04 (#34, merged) for term grids. Account linking already exists. Hosted OAuth (AUTH-01 #1) is not needed to build or verify this; local review sign-in covers it.

## Required behavior

**B1 Routine projection.** One pure function produces the teacher routine from a `RoutineSource`, the teacher id and the workload records. Screen, phone agenda and print all render from this result, so they always agree. A class counts once however many batches attend.

**B2 Programs and tables** follow the template:
- **Sections.** There is one section per program ("Program: B.Sc. in CSE (HSC), Summer-2026", then Diploma) that has any of the teacher's classes.
- **Columns.** Each table is DAY (merged down its rows) | BATCH | one column per period.
- **Rows.** Only day × batch rows that have a class are shown.
- **Days** follow the official package's day order.
- **Grouping.** Consecutive days whose rows all use the same period pattern share one table, and a different pattern starts a new table. Example: HSC Saturday, then HSC Sunday–Monday. If one day has batches on different patterns (a batch's own periods), that day is split into one table per pattern.
- **Cells** show the course code over the room, as in the template.

**B3 Cell rules:**
- **Spanning classes.** A class that covers several whole periods spans those columns.
- **Off-grid classes.** A class that does not line up with periods sits in the columns it overlaps, with its exact time on its own line (for example "12:30 – 1:45 PM"). If it overlaps no period, the table gains an "Other times" column, as in the official package. No class is ever dropped.
- **Co-teachers** appear as "with THR" (their short codes).
- **Merged batches** of the same program share one row, labelled "25 B + 26 B". The class is counted once.
- **Other-department audiences** are shown after the room ("NB-603 · CSE + EEE"), as in the official package.
- **HSC + Diploma classes.** A class shared between HSC and Diploma batches appears in both program sections, marked "HSC + Diploma". It is still counted once in the figures.
- **Two classes in one cell** (a data clash) are both shown, stacked. Validation already reports the clash.

**B4 Below the tables:**
- **No fixed time:** teacher-managed thesis or project work, with course and batch.
- **Other departments:** the teacher's external commitments, with department, course, day, time and room where known, and whether each is verified.
- An empty list says "None".

**B5 Header** (template wording):
- "Department of Computer Science & Engineering"
- "Pundra University of Science & Technology, Bogura."
- "Individual Class Routine", underlined
- "Course Teacher: <full name> (<code>)"
- "Total Credit Hours: <n>"

The text comes from today's `INSTITUTION` constants. It moves to the institution profile with SET-01. Numbers drop trailing zeros (13.5, 30).

**B6 Published or draft:**
- **Default.** The view shows the published version when one exists, and otherwise the working draft.
- **Published.** It is marked "Effective from <date> · Publication vN".
- **Draft.** On screen it carries a draft label. In print, a bordered "DRAFT — NOT OFFICIAL" box with the generation time sits in the header, and the footer says the classes may change.
- **No publication.** The Published choice is disabled with "Not published yet".
- **Draft differs.** When viewing the published version and the teacher's draft classes differ, a notice gives the number of changed, added or removed classes and links to the draft. A difference means any change in course, batches, day, time, rooms or co-teachers.

**B7 Credit hours.**
- Total Credit Hours equals the teacher's Workload units total on the Workload page for the active term. That is the sum of approved allocation units, with other-department units included (D-1).
- The screen also shows "How the N credit hours add up": course, batch, type and units per allocation.
- Credit hours always come from the current allocation records, even when the routine shown is a publication. The print footer says how they are counted.

**B8 Screen (desktop).** Page header with the teacher's name, designation and code; the Published / Working draft switch; **Print or save as PDF**. Below that:
- figures: total credit hours, classes a week (and on how many days), teaching time and courses;
- the week tables in portal colours;
- the credit-hours breakdown;
- the No fixed time and Other departments lists.

**B9 Phone (below 640 px).**
- The week tables become a day-by-day agenda. It starts with today (Asia/Dhaka) and runs through the week.
- Each entry gives time, course, program and batch, room, and any co-teacher.
- Other-department commitments appear on their day.
- Today, and any teaching day of the term with nothing for this teacher, says "No classes".
- The page has no horizontal overflow. Print is available on the phone too.

**B10 Print sheet (A4 portrait).**
- Black and white, matching the template's structure, with the type and rules of the accepted official package.
- Rows shrink from about 12.5 mm down to a 9 mm minimum to fit one page.
- If a routine still does not fit, it continues on a second page with the header repeated. A table is split only if it cannot fit a page on its own.
- Footer: "NB = New Building", the credit-hours note, the source (publication or draft), the print date, and "Page x of y" for that teacher.
- Nothing is clipped.

**B11 Bulk print** (Teachers → **Print teacher routines**):
- **List.** Every teacher with classes or assignments in the active term, with classes a week, credit hours and a page status. Each row has a checkbox; there is a select-all for ready teachers and a name/code search.
- **Department filter:** CSE teachers (default), or everyone with CSE classes, which adds incoming teachers.
- **Statuses.** A teacher with no classes and no assignments is skipped. One with only no-fixed-time work prints that list.
- **Source.** The same Published / Working draft switch.
- **Printing.** The print view renders one sheet per selected teacher in the listed order (code order), each starting on a new page. The action reads "Print N routines" and shows the page count.

**B12 Access.**
- **Read-only.** Nothing is written, so no audit entries are needed.
- **Who can open what.** Every internal user can open any teacher's routine and the bulk page (D-4), the same as today's teacher pages. Pages keep the portal's existing access check.
- **My routine** appears in navigation only for accounts linked to a teacher. An unlinked account that opens `/my-routine` is told it is not linked to a teacher record, and that an administrator can link it in People & access.
- **Unknown teacher ids** give the not-found page. Inactive teachers stay viewable, with their status shown.

**B13 States:**
- **No classes:** an empty note, still printable, showing the header and the lists.
- **Phone and keyboard:** at 375 px no table causes page overflow; everything works by keyboard; tables have proper headers.
- **Status:** never shown by colour alone.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | Given a teacher's classes across HSC and Diploma, the projection gives one section per program, tables grouped by period pattern (a pattern change starts a new table), and only day × batch rows that have classes. | Domain test (`verify-teacher-routine`) on fixture data and on the Summer 2026 source dataset. |
| AC-02 | Spanning, off-grid, outside-all-periods ("Other times"), co-taught, merged-batch, other-department-audience and HSC + Diploma classes render as in B3, and no meeting of the teacher is missing or counted twice. | Domain test: every meeting of every Summer 2026 teacher appears exactly once per program section. |
| AC-03 | Teacher-managed work and external commitments are listed below the tables, and "None" shows when empty. | Domain test; screen check. |
| AC-04 | Total Credit Hours equals that teacher's Workload units total for every Summer 2026 teacher, and the breakdown rows sum to it. | Domain test against `computeWorkloads`. |
| AC-05 | Published is the default when a publication exists. The draft view carries the draft label on screen and in print. With no publication, Published is disabled. The draft-differs notice counts changed classes correctly. | Domain test for the difference count; browser check of both sources. |
| AC-06 | `/my-routine` shows the linked teacher's routine; an unlinked account gets the not-linked message; an unknown teacher id gives not found; each teacher's routine opens from Teachers and from the teacher detail page. | Browser flows in `test:ux` with review accounts. |
| AC-07 | At 375 px the page shows the agenda starting today, with no page overflow, full keyboard use and no axe violations; desktop shows the tables. | `test:ux` routes; screenshots. |
| AC-08 | The print of a busy teacher fits one A4 portrait page with no clipping. A routine too long for one page continues with a repeated header and "Page x of y". Draft prints show the draft box. | Playwright PDF of the print view; clipping check; screenshots. |
| AC-09 | Bulk print lists teachers with statuses, select-all and search work, and printing N teachers gives N sheets (more when one overflows), each starting on a new page. | Browser flow; PDF page count. |
| AC-10 | Screen tables, phone agenda and print sheet show the same classes for the same teacher and source. | Domain parity test: the agenda and table cells come from one projection and match meeting by meeting. |
| AC-11 | `typecheck`, `lint`, `test:domain`, `build` and `test:ux` pass. `test:safety` is unchanged, because there is no schema change and no mutation. | Command results in verification. |

## Decisions and sources

Mockups (made-up teachers and classes, as for RUT-04):
- [print sheet](mockups/individual-routine-print.html): [page 1, published](mockups/renders/print-page-1.png), [page 2, draft](mockups/renders/print-page-2.png), [PDF](mockups/renders/print.pdf);
- [My routine](mockups/my-routine.html): [desktop](mockups/renders/my-routine-desktop.png), [phone](mockups/renders/my-routine-phone.png);
- [bulk print](mockups/teacher-routines.html): [desktop](mockups/renders/bulk-print-desktop.png).

All have 0 px page overflow and no clipped sheets.

Owner decisions requested (recommendation first):

- **D-1 Credit hours:** the Workload page total, including other-department units (the mockup's 30 includes 3 from EEE). Alternative: CSE units only.
- **D-2 Output:** print and Save as PDF only in this issue. The owner said Word or PDF are both fine, and PDF needs no new library. A .docx download can be a follow-up issue. Alternative: add .docx now, built from the same projection with the `docx` package, plus a ZIP for bulk. That adds a dependency and about a day of work.
- **D-3 Logo:** none for now; the header is centred and leaves room on the left. If the owner sends the logo file and allows it in the repository, it is placed top left as in the template. That is a small follow-up.
- **D-4 Who can view:** every internal user can open any teacher's routine, matching today's teacher pages. Alternative: teachers see only their own, while coordinators and administrators see all.
- **D-5 Merged classes:** one row per batch combination ("25 B + 26 B"), counted once. Alternative: repeat the class in each batch's row.
- **D-6 Terms:** the active term only, published or draft. Past-term selection comes when BAT-01 (#6) adds terms.

Related: [owner brainstorm](../../plans/owner-brainstorm-2026-09-30.md), [RUT-04 spec](../RUT-04/spec.md) (grids and official package), [product requirements](../../PRODUCT_REQUIREMENTS.md). The individual routine shows no contact details.
