# Owner feature brainstorm — 30 September 2026

Status: triaged into GitHub issues; **none approved for implementation**. Each issue still needs its own spec, plan and owner approval per the [workflow](../WORKFLOW.md).
Source: the owner's chat request of 30 September 2026 (Asia/Dhaka), made while UX-01 (#18) awaited owner review, plus the owner's Spring 2026 "Individual Class Routine" Word template (inspected, not committed: it holds a real teacher's routine and the university logo).

## What the owner asked for, and where it went

| Owner request | Decision | Issue |
|---|---|---|
| Period times change between semesters; an HSC batch may get Friday classes; the routine must be highly flexible | **New.** Periods, days and breaks are hard-coded in `src/lib/constants.ts` today | [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34) |
| Each teacher views and prints their individual routine from the Word template | **New.** | [#35 TCH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35) |
| Set email and password, and control access | **New.** Google-only sign-in today | [#36 AUTH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36) |
| Student info for attendance exported as CSV/Excel | **New.** Only a per-group CSV import exists | [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) |
| Leave applications, and checking who is available or on leave | **New;** availability lookup merged into it | [#40 LEAVE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/40) |
| Teacher daily task list, not a basic to-do | **New, later.** Reframed as a day agenda linked to classes, attendance and assigned duties | [#41 TASK-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/41) |
| Customisable certificates, single and bulk, from an existing design | **New, later** | [#42 CERT-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/42) |
| Everything editable: rooms, capacity, labs, teachers, load, dates, semester, year, roles | **Existing issues;** owner input added as comments | #5 ROM-01, #4 TCH-01, #14 SET-01, #6 BAT-01, #36 AUTH-02 |
| Offerings change by one or two courses per semester | **Existing;** "clone previous term, then adjust" noted | #7 CRS-01 |
| Better attendance design; course teacher sees a course's classes semester by semester | **Existing;** design direction and term selector noted | #8 ATT-01, #12 ATT-05 |

## Added by the brainstorm

- **Academic calendar** ([#38 CAL-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/38)): holidays, exam periods and teaching dates. Leave day counts, make-up classes, attendance dates and the agenda all need it.
- **Dated class changes** ([#39 RUT-05](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/39)): cancel, make-up and substitute classes on a date without editing the weekly routine. This connects leave to the routine and attendance.

Considered and not registered yet: email/SMS notifications (needs a mail provider; revisit after AUTH-02), exam invigilation rosters (possible later extension of TASK-01 assigned duties), and custom role definitions (AUTH-02 recommends fixed roles with scopes first).

## Design direction

- **Role-based home.** Teachers land on "My day": today's classes, attendance to take, tasks and leave status. Coordinators keep the operations dashboard.
- **One Setup area.** Institution profile (printed header and logo), terms and calendar, time grids, rooms, teachers, courses and offerings, batches, people and access, and policies, each with clear effective dates.
- **Clone from the previous term** as the standard way to start a semester (grids, calendar, offerings, allocations), followed by a diff of what changed.
- **Term selector** on every term-scoped page; past terms are read-only.
- **One projection per report** feeding screen, print, CSV, Excel and .docx, so they always agree.
- Continue UX-01's paper/ink/pine/gold language, with mockups before building each new screen.

## Recommended order (after UX-01 is accepted and merged)

1. **RUT-04 #34:** needed before the next semester's routine can be built without a code change.
2. **TCH-02 #35:** quick, visible value on existing data. It can go first if printed routines are needed sooner.
3. **#29, then AUTH-02 #36:** fix database timestamps, then sign-in teachers can actually use.
4. Master data from existing issues: TCH-01 #4, ROM-01 #5, BAT-01 #6 and CRS-01 #7, with SET-01 #14 alongside.
5. **STU-01 #37**, then the attendance chain ATT-01 → ATT-05 (#8–#12), after one attendance design pass.
6. **CAL-01 #38 → LEAVE-01 #40 → RUT-05 #39.**
7. Later: **TASK-01 #41** and **CERT-01 #42**.

## Open questions for the owner

Each issue lists its own questions. The ones that shape early work:
- RUT-04: can batches in one stream follow different period sets? Which periods does an HSC Friday class use?
- TCH-02: is "Total Credit Hours" the workload figure (a one-credit sessional counts as two)? Is .docx needed as well as print? May the logo be committed?
- AUTH-02: is Google sign-in kept, and do all teachers have university Google accounts?
