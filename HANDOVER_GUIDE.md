# Pundra University CSE Academic Operations Portal

## Complete project handover and user guide

Last code and browser verification: 23 September 2026, Asia/Dhaka
Verified application URL: `http://localhost:3000` 
Verified development term: Summer 2026

This document is designed to stand alone. A coordinator, teacher, administrator, developer, or future maintainer should be able to understand what the application does, operate every current feature, run it locally, and identify what still needs institutional approval.

---

## 1. What this project is

This is a web-based academic operations portal for the Department of Computer Science & Engineering at Pundra University of Science & Technology.

It brings several activities into one consistent system:

- Academic-term and batch-semester tracking.
- Manual and assisted class-routine preparation.
- Conflict detection before a routine is published.
- Teacher, room, course, workload, and external-department visibility.
- Student roster management and CSV import.
- Daily attendance with Midterm, Final, and semester summaries.
- Teacher extra-class recording and honorarium calculation.
- Printable teacher extra-load sheets and a departmental top sheet.
- Immutable routine publication and a separate public routine viewer.

The system is currently a coordinator-operated application. It has no login or role-based authorization yet. Until authentication is implemented, it must be used only on a trusted machine or behind an institutional access boundary.

---

## 2. Current verified status

The supplied development database contains a synthetic Summer 2026 academic dataset:

| Item | Verified value |
|---|---:|
| Departments | 7 |
| Teachers | 16 |
| Rooms | 14 |
| Batches | 16 |
| Courses | 28 |
| Course offerings | 56 |
| Teaching groups | 55 |
| Canonical meetings | 85 |
| External commitments | 7 |
| Workload allocations | 56 |
| Published routine | Version 1, effective 14 August 2026 |
| Validation blockers | 0 |
| Validation warnings | 9 intentional advisories |

The nine baseline advisories are expected: two pending cross-stream timing reconciliations, six unverified audience-size warnings, and one approved HSC Friday exception.

Coverage currently includes 48 fully scheduled groups, two unfilled CSE-3205 assignments for HSC-24B and DIP-18B, four teacher-managed thesis groups, and one partially scheduled CSE-4101 group for HSC-23B. The automatic scheduler can suggest one safe additional CSE-4101 placement; it does not invent teachers for the two vacancies.

The seed is development data, not an authoritative university import. It contains no real private student roster.

---

## 3. The simplest mental model

```mermaid
flowchart LR
    T[Spring or Summer term] --> P[Batch semester placements]
    T --> O[Course offerings]
    O --> G[Teaching groups]
    G --> M[Canonical class meetings]
    G --> E[Student enrollments]
    E --> A[Attendance sessions and records]
    G --> X[Extra-load class entries]
    M --> V[Conflict validation]
    V -->|0 blockers| S[Immutable published snapshot]
    S --> R[Public routine viewer]
    OD[External / OD commitments] --> V
    W[Days, windows, breaks, rooms] --> V
```

The most important design principle is that one real physical class is one **meeting**. If one class serves HSC and Diploma batches together, it is still stored once and linked to multiple offerings. This prevents double-counting teachers, rooms, and workload.

---

## 4. Canonical project language

Use these terms consistently when discussing or extending the project.

### Academic structure

**Academic term / session**:  
One Spring or Summer operating period, such as Summer 2026. It has dates, policies, offerings, attendance, and publications.  
Avoid using “semester” for this concept.

**Semester**:  
The curriculum level from 1 through 8 occupied by a batch during a particular academic term.

**Stream**:  
The admission/delivery stream: HSC or Diploma.

**Batch**:  
A stable cohort identified by stream and label, for example HSC-22B. HSC-22B and Diploma-22B are different batches.

**Batch placement**:  
The semester assigned to a batch for one term. A new Spring/Summer term gets new placement records; historical placements are not overwritten.

**Course**:  
A catalog subject identified by its full code. Suffixes matter: CSE-4000(A) and CSE-4000(B) are distinct courses.

**Course offering**:  
A course offered to one batch in one term.

**Teaching group**:  
The actual delivery unit. It can serve one offering or several merged/shared offerings.

**Meeting**:  
One recurring weekly physical class event with exact day, time, teacher, room, and audiences.

**Teacher-managed group**:  
A group such as thesis/project supervision that does not require fixed weekly routine slots.

**UT / Upcoming Teacher**:  
An unfilled teaching assignment. It is a vacancy marker, not a teacher account.

### Governance and validation

**Working draft**:  
The editable current routine. Changes here are not visible in the public routine until publication.

**Published version**:  
An immutable snapshot of the validated routine. A later publication supersedes it but does not rewrite or delete it.

**Blocker**:  
A validation failure that rejects a proposed placement or prevents publication.

**Advisory / warning**:  
A disclosed risk that does not automatically prevent publication under the current policy.

**External commitment / OD**:  
A CSE teacher teaching elsewhere, another department reserving a room, a combined commitment, or an unresolved source note.

### Workload, attendance, and payment

**Catalog credits**:  
Credits attached to assigned academic delivery. Default policy is 3 for theory and 2 for sessional courses.

**Workload units**:  
Explicit approved allocation values. They are not interchangeable with credits or timetable minutes.

**Contact minutes**:  
Weekly scheduled minutes derived from canonical meetings.

**Extra-load class**:  
A dated class claimed by an eligible teacher against a course group assigned to that teacher.

**Attendance session**:  
One dated class-attendance event for a teaching group. It captures the active roster at creation time.

---

## 5. Who can use the website today

### Coordinator or department operator

Can currently access every internal screen and mutation: routine editing, attendance, extra load, external commitments, settings, and publication.

### Teacher

The current build has no individual teacher login. A trusted coordinator can operate attendance or extra-load screens on a teacher's behalf. Teacher self-service will require authentication and authorization.

### Public viewer

Can view only the published routine at `/public/routine`. Draft changes never appear there.

---

## 6. Website navigation and what every page does

### `/` — Dashboard

Use this as the daily overview. It shows:

- Active batches and teaching-group counts.
- Unfilled assignments.
- Percentage of required weekly minutes scheduled.
- Current blocker count and publication state.
- Today's published classes.
- Scheduling gaps.
- A validation summary.
- External/OD data completeness.

Dashboard figures are calculated from database records; they are not decorative totals.

### `/routine` — Routine Builder

This is the main manual scheduling workspace.

Use it to:

- Switch between HSC and Diploma streams.
- Switch between an editable Day view and a read-only Week view.
- Select an academic day in Day view.
- Filter either view to one batch or show all batches in the selected stream.
- Print the selected projection or save it as PDF through the browser.
- Download a CSV built from the same canonical projection; draft files are marked `DRAFT — NOT OFFICIAL`.
- View each batch against the routine grid.
- Search by course code/title, teacher, or room.
- Show or hide the completeness tracker.
- Use compact/dense display.
- Add a class by clicking an empty batch/time area.
- Open an existing class to move, retime, or delete it.
- See shared-class, exception, reconciliation, and source-highlight indicators.

When adding a class, choose the teaching group, exact start/end time, one or more teachers, and one or more rooms. An approved out-of-window exception such as an HSC Friday class must be marked as an exception and should include an approval note.

All additions and moves are validated on the server. A blocker rejects the change and leaves the previous routine intact. A warning allows the draft change but is shown to the operator.

The selection is URL-addressable. For example, `/routine?stream=hsc&view=week&batch=...` can be bookmarked and survives reload. Editing remains in Day view; Week mode is a review, print, and export document so one canonical renderer can be shared with the published viewer.

### `/routine/auto` — Automatic Routine Suggestions

This is a safe initialization assistant for unscheduled or partially scheduled work.

It considers:

- Required weekly meeting count and minutes.
- Assigned teachers.
- Existing internal meetings.
- External teacher and room commitments.
- Batch-specific and stream-wide permitted windows.
- Breaks.
- Teacher, room, and audience overlap.
- Room capacity.
- Lab type and room capabilities.

Theory prefers a normal classroom but may use a free theory-capable lab. Sessional courses require a laboratory and any declared specialist capability.

The page previews suggestions and explains why other groups were skipped. Nothing is written until **Apply safe suggestions** is selected. The plan is recalculated immediately before saving so an outdated browser preview cannot overwrite newer routine changes. Applied meetings remain a working draft and still require human review and publication.

### `/conflicts` — Conflicts & Validation

This is the authoritative validation report.

Current blocker checks include:

- Teacher double-booking.
- Room double-booking.
- Student-audience overlap.
- Duplicate physical events for one teaching group.
- External teacher conflict.
- External room reservation conflict.
- Break overlap.
- Class outside its stream/batch permitted window.
- Sessional class in a non-lab room.
- Missing required room capability.
- Known room-capacity violation.

Warnings include:

- Approved window exceptions in use.
- Unknown audience size.
- Tight back-to-back teacher travel between buildings.
- Pending timing reconciliation.

Time overlap uses half-open intervals: `[start, end)`. Therefore 10:00–11:00 and 11:00–12:00 do not overlap.

### `/attendance` — Attendance

This page manages a separate roster and attendance history for every teaching group.

It supports:

- Selecting any course/teaching group.
- Adding one student.
- Editing student ID, name, phone, home department, and audience type.
- Importing or updating a roster from CSV.
- Deactivating a student from one course roster without deleting past attendance.
- Creating Midterm-phase or Final-phase attendance sessions.
- Optional class start/end time and assigned teacher.
- Present, Absent, Late, and Excused statuses.
- **Mark all present** followed by individual exceptions.
- Midterm, Final, semester percentage, and attendance-mark summaries.

A new session captures all active students in the selected group and initially marks them absent. This makes missed entries visible. Only students captured in that session can be updated through its save action.

Current calculation policy:

- Present and Late count as attended.
- Absent counts in the denominator but not as attended.
- Excused is removed from the denominator.
- Theory maximum: 10 marks by default.
- Sessional/lab maximum: 5 marks by default.
- Marks are proportional and rounded to two decimal places.

Deleting a session deletes that session and its attendance records. Deactivating an enrollment does not delete history.

### `/extra-load` — Extra Class Load

This page records teacher extra classes and calculates the honorarium.

Default policy:

- Theory course: 3 credits.
- Sessional course: 2 credits.
- Eligible when assigned credits are strictly greater than 15.
- Payment: Tk 200 for each recorded class.

The eligible-teacher list is calculated from assigned teaching-group credits plus known external teaching credits. A teacher at exactly 15 credits is not eligible under the current rule.

To record an extra class:

1. Select an eligible teacher.
2. Select a course group already assigned to that teacher.
3. Enter a date inside the active term.
4. Enter exact start and end time.
5. Add an optional note such as “replacement class”.
6. Select **Add extra class**.

The print center offers:

- A date range.
- One detailed teacher sheet per eligible teacher.
- A combined departmental top sheet.
- Automatic class counts and amount calculation.
- Amount in Bangladesh-style words using crore/lakh/thousand.

Print signature cells are deliberately blank so teachers sign after printing.

The manual top-sheet area is for teachers who do not use the application. Enter teacher name, number of classes, and optionally a different rate or total amount. Manual rows appear in the combined top sheet but do not create detailed class records.

### `/extra-load/teacher/[id]/print` — Teacher Extra-load Sheet

Printable A4 detail sheet containing teacher designation/name, distinct claimed courses, date, course, batch/audience, time, and a blank signature column.

### `/extra-load/top-sheet/print` — Department Top Sheet

Printable top sheet containing teacher name, number of classes, amount, blank signature column, total amount, amount in words, and Head of Department signature area. It combines portal-generated teacher totals with manual top-sheet rows.

### `/teachers` — Teachers

Shows the teacher roster, exact short codes, home departments, employment type, and schedule/workload overview. Short codes are exact identifiers; `IM` and `IMN` are different people.

### `/teachers/[id]` — Teacher Detail

Shows one teacher's weekly canonical meetings, approved workload allocations, external commitments, and warnings. Shared meetings count once for that teacher.

### `/workload` — Teacher Workload

Shows three deliberately separate measurements:

1. Catalog credits of assigned courses.
2. Explicit approved workload units.
3. Scheduled weekly contact minutes and meeting count.

Do not add these columns together or treat them as equivalent. External workload may remain a lower bound when OD records are incomplete. The current workload-unit advisory threshold is 15 units; this is distinct from the configurable 15-credit extra-load eligibility rule.

### `/rooms` — Rooms & Occupancy

Shows room type, building, capacity, owning department, active/closed state, capabilities, meeting count, reserved minutes, OD reservations, and weekly utilization.

Current specialist room model:

- 406: computer lab, theory-capable.
- 407: computer lab, theory-capable.
- 408: computer lab, theory-capable.
- 505: computer lab with microprocessor and networking capabilities; also theory-capable.

Theory classes may use a free theory-capable lab. Sessional classes still require a lab and any named course capability.

### `/batches` — Batches & Semester Placements

Shows HSC and Diploma cohorts and their semester in the active term. Batch identity is stable; semester placement changes by adding a record for a new Spring/Summer term, not by renaming the batch.

### `/courses` — Courses, Offerings & Completeness

Contains two views:

- A completeness tracker comparing each teaching group with its required weekly meetings/minutes.
- The active course catalog with credits, type, owner, curriculum semester, group count, and lab capability.

Possible completeness states are scheduled, partial, unscheduled, over-scheduled, vacancy, and teacher-managed.

### `/od` — External Commitments

Records academic commitments that cross departmental boundaries.

Supported kinds:

- Outgoing teaching: a CSE teacher teaches another department.
- Room reservation: another department uses a room.
- Combined: teacher and room are both committed.
- Unresolved note: the source is too incomplete to create a real reservation.

Each record starts pending and can later be marked verified. Completeness is derived from supplied fields:

- Level A: sufficiently complete structured details.
- Level B: teacher is known but other teaching details are incomplete.
- Level C: structured commitment without a known teacher, including room-only reservations.
- Level D: unresolved source note.

A room-only record blocks only the room. It never invents a teacher conflict. Level D stays an advisory/review item rather than fabricating time or resources.

### `/publications` — Publications & Archives

Shows version history and publishes a validated draft.

Publication workflow:

1. Review `/conflicts`.
2. Resolve every blocker.
3. Enter a change summary.
4. Select **Validate & publish new version**.
5. Confirm publication.

The server validates the entire draft again. If clear, it snapshots meetings plus their batch, break, verified external-commitment, validation, and term context; marks the old published version for that term superseded; and creates the next term-scoped published version atomically. Old versions remain in history. Rolling back means publishing another validated revision, not editing an old snapshot.

### `/settings` — Settings & Pending Decisions

Contains:

- Provisional institution profile.
- Active term dates.
- Current breaks and permitted windows.
- Configurable theory/session credits.
- Configurable extra-load threshold and payment rate.
- Configurable theory/session attendance marks.
- Editable stream-wide and batch-specific class windows.
- Pending institutional decisions.

To give one HSC batch a Friday class window without changing every HSC batch:

1. Choose HSC.
2. Choose the specific batch in **Batch override**.
3. Choose Friday.
4. Enter the allowed start/end time.
5. Add an approval/policy note.
6. Save the window.

If a batch-specific window exists for a batch on a day, it replaces that stream's default window for that batch/day.

The current page lists 12 blocking decisions and 9 operational decisions, or 21 visible items. An earlier project note claimed 31 decisions. The referenced specification file is absent, so the remaining ten cannot be reconstructed safely and must not be invented.

### `/public/routine` — Public Routine Viewer

Displays only the current immutable published snapshot. It supports HSC/Diploma, Day/Week switching, URL-persisted day and batch filters, desktop table view, mobile agenda view, browser Print/PDF, and CSV export. Verified OD entries appear in the on-screen and printed OD row; CSV contains canonical meetings only. Draft changes remain invisible until a new version is published.

Publication payload schema v2 is self-contained for repeatable screen, print, and CSV output. An older v1 publication is never rewritten: the page identifies it as legacy and discloses that missing supporting context is supplied from current configuration. The next successful publication naturally produces v2.

### `/api/health` — Health Check

Returns JSON indicating whether the database can answer a query and whether the application is using `pglite` or `postgresql`.

---

## 7. CSV roster import format

Required logical columns:

- Student ID.
- Student Name.

Optional columns:

- Phone Number.
- Department.
- Audience Type.

Accepted audience types are `local`, `external`, and `merged`. Missing or unrecognized audience type defaults to `local`.

Example:

```csv
Student ID,Student Name,Phone Number,Department,Audience Type
0322600000001,Example CSE Student,01700000000,CSE,local
EEE-2026-001,"Example, External Student",01800000000,EEE,merged
```

Common header variations such as `Student's ID`, `Student Code`, `Roll`, `Full Name`, `Mobile`, and `Dept` are recognized. Re-importing an existing Student ID updates the student instead of creating a duplicate. Duplicate Student IDs inside the same CSV are ignored after the first occurrence.

---

## 8. Scheduling policy currently represented

The database is authoritative for permitted windows and breaks. The UI grid constants are display guidance.

### HSC display pattern

- Regular days: Saturday through Tuesday.
- Visible normal slots: 09:30–10:45, 10:45–12:00, 12:00–13:15, and 14:30–15:45.
- Friday normally requires a batch-specific permitted window or an approved exception.

### Diploma display pattern

- Days: Friday and Saturday.
- Friday: hourly classes from 09:00, including 12:00–13:00.
- Friday Jumu'ah break: 13:00–14:00.
- Friday resumes at 14:00.
- Saturday permitted-window details remain provisional pending source confirmation.

### Institution break

- Lunch: 13:15–14:30.

Some policy data is intentionally marked provisional. Confirm it with the institution before relying on it as final policy.

---

## 9. Important data relationships

| Entity | Meaning | Important relationship |
|---|---|---|
| `academic_terms` | Spring/Summer operating period | Parent of term-scoped operations |
| `academic_policies` | Credits, load threshold, rate, marks | One policy row per term |
| `batches` | Stable HSC/Diploma cohort | Identity is stream + label |
| `batch_term_placements` | Batch semester in one term | Preserves progression history |
| `courses` | Catalog subject | Owns credits/type/capability |
| `course_offerings` | Course for batch and term | Unique per course/batch/term |
| `teaching_groups` | Actual delivery group | May represent merged offerings |
| `teaching_group_offerings` | Group-to-offering membership | Many offerings can share one group |
| `teaching_requirements` | Required weekly delivery | Drives coverage tracking |
| `meetings` | Canonical physical classes | Exact minute intervals |
| `meeting_teachers` | Teacher participation | Supports co-teaching/substitution |
| `meeting_rooms` | Room reservation | Supports multiple/segmented rooms |
| `break_rules` | Protected break periods | Institution or stream scoped |
| `permitted_windows` | Allowed day/time periods | Stream default or batch override |
| `students` | Stable student identity | Independent of course enrollment |
| `course_enrollments` | Student in a teaching group | Local/external/merged and term scoped |
| `attendance_sessions` | Dated class roll call | Belongs to one teaching group |
| `attendance_records` | One student's session status | Unique per session/student |
| `extra_load_classes` | Dated teacher claim | Snapshots course/audience labels |
| `extra_load_manual_summaries` | Offline teacher top-sheet total | Separate from detailed claims |
| `external_commitments` | OD teaching/room obligations | Participates in conflict checks |
| `workload_allocations` | Approved workload units | Separate from credits/minutes |
| `schedule_versions` | Draft/published snapshots | Published history is immutable |
| `audit_events` | Mutation trail | Currently records actor as coordinator |

---

## 10. Technical architecture

### Stack

- Next.js 16 App Router.
- React 19.
- TypeScript.
- Tailwind CSS v4.
- Drizzle ORM.
- PostgreSQL through node-postgres for deployed environments.
- PGlite as the zero-configuration local PostgreSQL-compatible database.
- Lucide React icons.

All data pages are dynamically rendered. Mutations use server actions, validate untrusted form data, write audit events, and revalidate affected pages.

### Key code locations

| Area | File or directory |
|---|---|
| Routes | `src/app/` |
| Shared UI | `src/components/` |
| Database schema | `src/db/schema.ts` |
| Database connection | `src/db/index.ts` |
| Migrations | `drizzle/` |
| Development seed | `src/db/seed.ts` |
| Main read model | `src/lib/data.ts` |
| Meeting serialization/snapshots | `src/lib/serialize.ts` |
| Conflict engine | `src/lib/conflicts.ts` |
| Routine/OD/publication actions | `src/lib/actions.ts` |
| Attendance and extra-load actions | `src/lib/academic-actions.ts` |
| Attendance rules/CSV parser | `src/lib/attendance.ts` |
| Extra-load calculations | `src/lib/extra-load.ts` |
| Automatic planner | `src/lib/auto-schedule.ts` |
| Planner database adapter | `src/lib/schedule-automation.ts` |
| Workload calculations | `src/lib/workload.ts` |
| Institution/display defaults | `src/lib/constants.ts` |
| Architecture decision | `docs/architecture/ADR-001-academic-operations-boundaries.md` |
| Print-template analysis | `docs/templates/extra-load-print-templates.md` |

The pure engines are separated from database adapters so they can be tested and extended without rendering pages or opening a database connection.

---

## 11. Run locally

Requirements:

- Node.js compatible with the installed Next.js version.
- npm.

From the project directory:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

On first start without `DATABASE_URL`, the application:

1. Creates `.data/pglite`.
2. Applies checked-in migrations.
3. Seeds the verified synthetic dataset only if no academic term exists.

Later starts preserve edits.

### Important PGlite safety rule

Run only one database-using project process against `.data/pglite` at a time. Do not run `npm run db:prepare`, `npm run db:reset`, or another dev server while the current dev server is using the embedded database. Stop the server first. Concurrent PGlite processes can leave a stale lock or corrupt the local database files.

---

## 12. Run with PostgreSQL

Copy `.env.example` to `.env.local` or otherwise provide:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Then run:

```bash
npm run db:prepare
npm run dev
```

`DATABASE_URL` switches the application from PGlite to node-postgres. Use a dedicated database and proper secret management in production. Do not commit real credentials.

---

## 13. Commands

| Command | Purpose | Data impact |
|---|---|---|
| `npm run dev` | Prepare and run development server | Preserves existing data |
| `npm run build` | Create production build | No intentional persistent-data change |
| `npm start` | Prepare and run production server | Preserves existing data |
| `npm run db:migrate` | Apply migrations only | Schema/data migration changes |
| `npm run db:prepare` | Migrate and seed only if empty | Preserves non-empty data |
| `npm run db:reset` | Replace data with development seed | Destructive to current portal data |
| `npm run typecheck` | TypeScript validation | None |
| `npm run lint` | ESLint validation | None |
| `npm run test:domain` | CSV/attendance/payment rule smoke tests | None |
| `npm run test:routine` | Focused Day/Week projection and routine CSV regression tests | None |
| `npm run test:ui` | Playwright routine screen/export/print acceptance tests | None |

Never run `npm run db:reset` against a database containing real institutional data unless a verified backup exists and the replacement is intentional.

---

## 14. Starting a new Spring or Summer term

The data model supports correct historical rollover, but there is no coordinator rollover screen yet.

The intended future workflow is:

1. Create a new `academic_terms` row.
2. Mark the new term active and the previous one inactive/completed according to approved policy.
3. Create the new term's academic-policy row.
4. Add a `batch_term_placements` row for every participating batch and its new semester.
5. Create term-specific course offerings and teaching groups.
6. Add teaching requirements and teacher/workload assignments.
7. Copy only intentionally recurring configuration or commitments.
8. Build and validate the new working routine.
9. Import fresh student rosters for each course group.
10. Publish the first validated version for the term.

Do not rename batches to simulate progression and do not overwrite old placement, attendance, extra-load, or publication rows.

---

## 15. Backup and recovery

### Local PGlite

Stop the dev/production server before copying `.data/pglite`. Keep the whole directory together. A filesystem copy taken while the database process is stopped is the simplest local backup.

During development recovery on 11 September 2026, a corrupted local directory was preserved as `.data/pglite-recovery-20260911-093758` and the active synthetic database was rebuilt from migrations. This recovery directory is ignored by Git and can be archived or removed later after confirming it is no longer needed.

### PostgreSQL

Use the institution's normal PostgreSQL backup tooling, retention policy, encrypted storage, and restore drills. Backup/recovery objectives are still an unresolved institutional decision.

---

## 16. Verification performed at handover

The following passed on the current source:

```bash
npm run typecheck
npm run lint
npm run test:domain
npm run test:ui
npm run build
```

Browser verification covered Dashboard, Rooms, Attendance, Extra Class Load, automatic scheduling, Conflicts, Settings, and draft/published routine Day/Week views. Routine acceptance tests cover URL persistence, batch filtering, mobile overflow, print visibility, draft/published CSV semantics, and invalid export requests. Tested routes returned HTTP 200 and the browser console showed no errors. The final baseline was 85 meetings, 0 blockers, and 9 advisories.

---

## 17. Troubleshooting

### The site does not open

- Confirm `npm run dev` shows `Ready`.
- Confirm the URL is `http://localhost:3000`.
- Check whether another process already uses port 3000.
- Check the terminal for a database or migration error.

### PGlite reports `Aborted()` or a stale PostgreSQL lock

- Stop every project dev server and database command.
- Preserve `.data/pglite` before attempting recovery if it may contain valuable data.
- Do not run multiple PGlite clients against the same directory.
- For synthetic development data only, the database can be rebuilt from migrations and the seed after preserving the old directory.

### A class cannot be scheduled

- Read the blocker details returned in the add/move dialog.
- Check teacher and room availability.
- Check the batch's permitted window in Settings.
- Check lunch/Jumu'ah breaks.
- Check room type, capability, and capacity.
- Check External/OD commitments.
- Use an exception only when approval genuinely exists and record its note.

### A teacher is missing from Extra Class Load

- The teacher must have assigned credits strictly above the configured threshold.
- The extra class must use a teaching group assigned to that teacher.
- Confirm assignments and external credits before changing the threshold.

### Attendance has no students

- Select the correct teaching group.
- Add one student or import a CSV roster.
- Create the attendance session only after the roster exists.

### A draft change is absent from the public page

This is expected until a new immutable routine version is published from `/publications`.

---

## 18. Security, privacy, and operational cautions

- Authentication and role authorization are not implemented.
- Teacher private phone data exists in the schema but is not intended for public display.
- Student phone numbers are personal data; restrict access, backups, exports, and screenshots.
- Server actions validate data but currently record the audit actor as the generic `coordinator`.
- There is no approval workflow for attendance corrections or extra-load claims.
- There is no automatic backup scheduler.
- Do not expose the development server directly to the internet.
- Use HTTPS, managed secrets, access control, backups, and audit identity before production deployment.

---

## 19. Known limitations and decisions still needed

### Missing or incomplete source of truth

The project refers to `pundra-cse-academic-portal-specification.md`, but that file is not present. Restore it before declaring the repository the complete institutional source of truth.

### Settings discrepancy

The current Settings page shows 21 pending decisions. Earlier context claimed 31. The missing ten cannot be inferred safely without the specification.

### No authentication

Coordinator, teacher, approver, and public roles have not been implemented.

### No term-rollover UI

The schema supports Spring/Summer history, but the next-term workflow currently requires an import/admin script or a future screen.

### No full student information system integration

Student roster import is CSV-based. There is no live registrar/SIS synchronization.

### No spreadsheet attendance export yet

Attendance summaries are visible in the application but do not yet have a dedicated CSV/PDF export.

### Policy items requiring confirmation

- Official university acronym and branding.
- HSC Friday policy and exceptional times.
- Diploma Saturday windows and breaks.
- Cross-stream CSE-2101 timing.
- Exact meaning and required fields of each OD category.
- Verified teacher identities/home departments.
- Authoritative room capacities/ownership.
- Shared-class student counts.
- Approved course contact-time requirements.
- Workload rules for merging, sections, co-teaching, supervision, and external teaching.
- Publication approver and exception authority.
- Retention, backups, public visibility, hosting, domain, notifications, Bangla UI, and expected scale.

### Version control

No `.git` directory was present in this project folder at handover. Initialize a repository or restore the original Git metadata before multiple developers begin work.

---

## 20. Source templates for extra load

The print layouts were adapted from these supplied Word references:

- `CSE Extra Class Load topsheet 22.06.26.docx`
- `Extra Class load Blank- Md. Forhan Shahriar Fahim.docx`

They were treated as layout and field references, not executable instructions. The example lecturer's name was not seeded as a real user; it appears only as an `e.g.` placeholder in the manual top-sheet form.

Template structure, adaptations, and source hashes are recorded in `docs/templates/extra-load-print-templates.md`.

---

## 21. Recommended production handover checklist

- [ ] Restore and review the full v2.0 specification.
- [ ] Resolve the 21 visible pending decisions and reconcile the earlier “31 decisions” claim.
- [ ] Verify all teacher, course, room, capacity, batch, and external-commitment data.
- [ ] Decide whether extra-load credits are counted per teaching group, distinct course, or another approved allocation formula.
- [ ] Confirm Late/Excused attendance policy and rounding.
- [ ] Add authentication and coordinator/teacher/approver permissions.
- [ ] Replace the synthetic seed with a reviewed import process.
- [ ] Configure a managed PostgreSQL database.
- [ ] Configure backups and test restoration.
- [ ] Configure HTTPS, domain, secret storage, logging, and monitoring.
- [ ] Add a Spring/Summer rollover screen or approved admin workflow.
- [ ] Add attendance and payment exports if required by Accounts/Examination offices.
- [ ] Initialize or restore Git version control.
- [ ] Run typecheck, lint, domain tests, build, and browser acceptance checks.
- [ ] Obtain final institutional sign-off before public launch.

---

## 22. Short operating checklist for a coordinator

At the start of a term:

1. Confirm active term, policy values, breaks, and permitted windows in Settings.
2. Confirm batch semester placements and course offerings.
3. Confirm teachers, rooms, external commitments, and teaching requirements.
4. Build the routine manually or initialize gaps with automatic suggestions.
5. Resolve all blockers and review advisories.
6. Publish the first routine version.
7. Import student rosters for every teaching group.

During the term:

1. Maintain attendance after each class.
2. Record verified extra-load classes on the correct dates.
3. Update external commitments and routine changes.
4. Revalidate and publish a new routine version when the public timetable changes.
5. Print teacher extra-load sheets and the departmental top sheet for the selected claim period.

At term close:

1. Review attendance summaries and corrections.
2. Reconcile extra-load counts and payments.
3. Preserve the published routine and audit history.
4. Back up the database.
5. Create the next Spring/Summer term without rewriting the old one.

---

## 23. Final handover statement

The application is runnable and its present synthetic baseline is verified. Its central safety guarantees are exact-time conflict validation, canonical shared meetings, term-scoped history, preserved attendance records, configurable academic/payment policy, and immutable public routine publication.

The largest remaining gap is not routine functionality; it is production governance: authoritative source data, resolved institutional policy, authentication, backup operations, and named approval roles.
