# Academic operations — product requirements

Status: requirements and rationale; issue-specific inspection and approval are required before implementation.
Reconciled: 30 September 2026 (Asia/Dhaka). The baseline was recorded on 26 September; targeted source inspection confirms role identifiers and routine projection/print boundaries, not live integration readiness.

Read the [brief](PROJECT_BRIEF.md), [roadmap](ROADMAP.md), [workflow](WORKFLOW.md) and [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for their respective responsibilities. [CONTEXT.md](../CONTEXT.md) owns vocabulary. Archive/deactivate preserves references; deletion is restricted to unused draft mistakes.

This consolidates the former solution roadmap and execution-plan invariants/release gates. Completed contracts, implemented-but-unverified work and future proposals are distinct. Migration is documentation work, not feature implementation.

## Documented baseline (26 September 2026)

| Area | Present now | Important gap |
|---|---|---|
| Routine | Exact-minute draft builder, HSC/Diploma Day/Week views, compact print package, CSV export, conflict validation and source import | 13 source-routine blockers; no approved publication from the imported schedule |
| Attendance | Roster CRUD, CSV import, daily sessions, Present/Absent/Late/Excused, midterm/final phase totals, semester percentage and marks | One long group selector; feedback is easy to miss; no department/batch navigation or full course-session ledger/export |
| Authentication | Invite-only Google sign-in, role assignments, server-side guards, redaction and named transactional audit writes are pushed to `origin/main` | Real OAuth callback, hosted PostgreSQL, adversarial session/role tests and source-bounded public contacts remain unverified; #1 stays open |
| Teachers | Directory, detail and workload views | No create/edit/deactivate/reactivate workflow |
| Rooms | Room inventory, capabilities and occupancy reporting | No create/edit/availability/deactivation workflow |
| Batches | Stable cohort identities and term-scoped semester placements | No management UI, rollover workflow, count verification or lifecycle controls |
| Courses | Catalog, offerings and completeness reports | No catalog CRUD or offering-construction workflow |
| External commitments | Create, verify and delete OD commitments with derived completeness | Terminology is difficult; no edit/archive/expiry/session-review workflow |
| Settings | Term policy editing and permitted-window management | Profile and pending decisions are mostly informational; policy governance and versioning are incomplete |
| Workload | Catalog credits, approved workload units and contact minutes are separated | Depends on trustworthy teacher, offering and external-commitment management |
| Extra load | Eligibility, daily claims, rate configuration, role-protected print sheets | Claim review and payment approval workflow remains |

The documented fresh seed imports 42 teacher records, 78 courses and 183 meetings. The original institutional specification is missing from this checkout. Superseded pre-authentication handover/context documents were retired; use the [current project brief](PROJECT_BRIEF.md), README and roadmap for handoff.

### Documented attendance facts

- `attendance_sessions.phase` already records `midterm` or `final`.
- Semester summaries and theory/session attendance marks already exist.
- Attendance sessions already store class date and optional start/end times.
- CSV import and Save actions already return an `ActionResult`; the component renders it near the top of the page. The practical defect is visibility and persistence, not the total absence of a server response.
- Enrollment is already independent of a student's home department, which supports cross-department and merged groups.

### Documented routine facts

- Exact start and end minutes are authoritative.
- A merged class is one canonical meeting related to multiple offerings/audiences.
- The published routine is an immutable snapshot and provides HSC/Diploma Day/Week views, CSV and compact official print packages.
- Automatic scheduling edits only the working draft and does not publish.

## Domain invariants and hard corner cases

| Area | Invariant and cases to test |
|---|---|
| Calendar | Spring and Summer are separate academic terms. A cohort identity survives semester changes, repeats, holds and graduation; old placements are immutable. Changing an active term cannot rewrite attendance or a published routine. |
| Credits | Catalog credit is distinct from workload credit-hours: theory defaults to 3; a one-credit sessional currently counts as 2 workload credit-hours. The extra-load threshold is strictly **more than** 15 workload credit-hours; the class rate defaults to Tk 200 and can change by approved effective policy. |
| Routine | One merged/shared physical class is one meeting linked to all relevant offerings. Use exact minutes, including custom times, cross-building travel, breaks and overlapping OD commitments. A batch-specific Friday exception must not enable Friday for the whole HSC stream; HSC-25B's imported Friday entries need approved Saturday–Tuesday replacements. |
| Rooms | 406/407/408 are computer labs; 505 supports computer, microprocessor, networking and theory when free. Theory may use a capable lab; sessional delivery requires the correct lab capability. Capacity unknown is not capacity zero. Maintenance and deactivation must respect future meetings. |
| Identity | A teacher record is not a portal user. External-department teachers can be assigned to CSE or other groups without a fake CSE identity. A suspended user or revoked role must lose access on the next request, including direct action/export calls. |
| Students | A student identity is independent of enrollment and home department. A merged group can contain students from other departments. Repeated CSV import must not duplicate students/enrollments; roster changes must preserve captured historical attendance. |
| Attendance | An attendance session is one dated occurrence, not an academic term or recurring meeting. Late counts attended; Excused leaves the denominator. Duplicate group/date/time submissions, stale rosters, double saves and corrections after lock need explicit behavior and audit history. |
| Publication and privacy | Only a validated, approved immutable snapshot is public. The owner has designated the Summer 2026 routine source's teacher, HSC/Diploma CR, and departmental query contact tables as the public contact scope, including listed personal mobiles. Expose only those source-derived fields in that published version; private directory fields and drafts stay hidden. Missing/placeholder contacts remain blank. Parallel publication attempts must not create conflicting active versions. |
| Data loss | A failed audit write must roll back its mutation. Backup/restore must prove that Summer 2026 records, auth roles, attendance, extra load, publications and audit history survive. |

## 5. Routine weekly view and export

### RUT-01 — Weekly HSC/Diploma routine

#### Problem

RUT-01 completed the weekly-view/export gap on 23 September 2026. Preserve the contracts below and compact official package. Source correction and publication approval remain RUT-03 gates. Optional design ideas below are not authorization to reopen this completed feature.

Completed delivery includes shared draft/published projection, Day/Week URL state, CSV export, compact HSC/Diploma official pages, course-offer and directory appendices, and the reviewed Summer 2026 source import. Unresolved imported conflicts still block an official publication.

#### Preserved view contract

Both draft and published routine views retain this selection contract:

```text
Stream: HSC | Diploma
View: Day | Week
Day: Saturday | Sunday | ...       (visible only in Day mode)
Batch: All | one batch             (optional filter)
Export: Print/PDF | CSV
```

For on-screen Week mode, use stacked day sections for the selected stream. A single all-batches, all-days, all-times grid will be too wide and difficult to read. When one batch is selected, an optional compact weekly grid may use days as rows and time bands as columns.

#### Export behavior

- **Print/PDF**: one day per printed page for the selected stream, with term, version, effective date, generated time and disclosure footnotes.
- **CSV**: one record per canonical meeting with term, stream, batch/audience, day, start, end, course, teacher, room, shared status and warning status.
- A published export must use the selected immutable publication snapshot.
- A draft export must be visibly labeled `DRAFT — NOT OFFICIAL` and include current blockers/advisories.
- Suggested filenames: `routine-summer-2026-hsc-week-v1.pdf` and `routine-summer-2026-hsc-week-v1.csv`.

#### Projection boundary

The existing routine-projection boundary keeps screen/print/export behavior aligned. This original interface sketch is illustrative rather than an exact claim about current exports:

```ts
projectRoutine({ source, termId, stream, view, day?, batchId? })
```

The implementation should hide meeting deduplication, shared-audience labels, OD rows, break columns and ordering. Screen rendering, print rendering and CSV export should consume the same projection so they cannot disagree.

#### Acceptance criteria

- HSC and Diploma each support Day and Week views.
- Changing view/filter state is reflected in the URL and survives refresh.
- Shared meetings appear once physically but in every relevant audience view.
- Exact custom times remain visible.
- PDF/print and CSV agree with the selected draft or publication version.
- Existing day view remains unchanged unless Week mode is selected.
- Mobile Week mode remains usable without a horizontally enormous table.

#### Term time grids (RUT-04)

Delivered by [RUT-04 / #34](specs/RUT-04/spec.md). Period columns, teaching days and breaks are term data, not constants:

- A term owns **period patterns** (periods and breaks; a break may block classes) and **day plans**: which pattern each stream uses on each day, plus **batch exceptions** (extra day, own periods, or no classes), each with class hours and a reason.
- A batch exception never becomes a stream-wide rule. A day taught only through exceptions shows only those batches.
- Batches that use different patterns on one day are drawn as separate header groups on screen and in print; the official HSC page keeps each day's main table on the first sheet and continues extra groups on a following sheet.
- Publications store their grid (snapshot schema 4); older publications use the Summer 2026 layout they were drawn with.
- Changing periods shows the effect on existing classes first; classes move only when the coordinator opts in.

#### Likely code seams

- `src/lib/time-grid.ts`, `src/lib/time-grid-actions.ts`, `src/app/(portal)/routine/periods/page.tsx`
- `src/app/(portal)/routine/page.tsx`
- `src/components/routine-builder.tsx`
- `src/app/public/routine/page.tsx`
- `src/components/print-button.tsx`
- existing projection/export modules under `src/lib/`

## 6. Authentication and role-based authorization

### AUTH-01 — Identity, roles and action guards

#### Problem

Invite-only Google sign-in, server guards and named transactional audit writes are implemented in commits `26eb86c` and `c70984f`. AUTH-01 remains open for real OAuth, hosted PostgreSQL, adversarial permission/session tests, approved source-bounded public contacts and browser verification. Master-data workflows must preserve these controls.

Complete these integration/public-contact gates before declaring AUTH-01 complete or exposing substantial new CRUD functionality in production.

#### Role model and desired administrative scope

| Role | Primary permissions |
|---|---|
| System administrator | Users, roles, institution profile and all recovery operations |
| Academic administrator | Terms, batches, courses, offerings and policy drafts |
| Routine coordinator | Teacher/room assignments, meetings, OD commitments and validation |
| Department head/approver | Approve policies, routine publications and exceptional overrides |
| Teacher | View own allocation; take attendance for assigned groups; submit own extra-load records |
| Accounts officer | Review honorarium summaries and payment status without editing academic schedules |
| Read-only viewer | View internal reports without mutation |

All seven role identifiers already exist in [ROLE_CAPABILITIES](../src/lib/auth/policy.ts). The table describes desired scope, including future management/recovery/payment workflows; a role identifier does not prove every workflow is implemented. One person may have multiple roles. Access is scoped by department and, for teachers, assigned teaching groups.

#### Required behavior

- Authentication choice should support the university's actual identity source; keep domain authorization independent of the provider.
- Maintain invited users, role assignments and applicable department scope.
- Keep one server-side authorization boundary for capability, department and ownership checks; inspect the implemented policy/action guards before planning extensions.
- Guard every server action. Hiding a button is convenience, not security.
- Preserve authenticated actor identity and before/after summaries in transactional audit writes.
- Protect private directory fields and drafts; the approved published contact allowlist is governed by [D-02](decisions/INSTITUTIONAL_DECISIONS.md#d-02--public-contact-scope).
- Keep `/public/routine` public only for effective published snapshots.
- Return a clear forbidden result instead of silently failing.

#### Capability examples (target vocabulary)

These are proposed vocabulary, not a claim that every named capability exists; inspect the implemented policy above.

```text
manage_teachers
manage_rooms
manage_batches
manage_catalog
manage_offerings
manage_routine
take_attendance
manage_rosters
manage_external_commitments
submit_extra_load
approve_extra_load
manage_policy
approve_publication
manage_users
```

#### Acceptance criteria

- Anonymous visitors cannot access internal portal routes.
- Teachers cannot edit another teacher's attendance or extra-load claims.
- Coordinators cannot activate a publication unless explicitly granted approval capability.
- Every mutation records actor, action, entity, before/after summary and timestamp.
- Authorization tests cover both permitted and rejected actions.

## 7. Attendance solution

### ATT-01 — Cascading course selection

#### Problem

The current selector contains every teaching group in one long list. It becomes difficult to use as terms, departments and offerings grow.

#### Proposed selector hierarchy

Use four cascading selectors despite the informal “three menu” wording, because department and stream are separate dimensions:

```text
1. Department
2. Stream: HSC | Diploma | External/Other
3. Batch
4. Course: CODE — Course name
```

For merged/shared delivery, the course option should show the complete audience, for example:

```text
CSE-2101 — Data Structures — HSC-27B + DIP-21B
```

Rules:

- Each selector filters the choices to its right.
- Valid selections remain in URL search parameters.
- If only one valid option exists, it may be selected automatically but must remain visible.
- Empty states explain whether a batch has no offerings or the user lacks permission.
- A teacher sees only assigned teaching groups unless granted broader access.

### ATT-02 — Reliable success/error feedback

#### Verified current behavior

Actions already return messages, but the message is rendered near the top of a long page and is easy to miss after Save or CSV import.

#### Proposed solution

- Add a shared notification module used by all mutation screens.
- Show an `aria-live` toast after save/import/create/delete.
- Keep an inline result beside the action that produced it.
- For CSV import, show counts: created, updated, unchanged, skipped and failed.
- Keep validation errors visible until dismissed or corrected.
- Move focus to the first error for failed forms.
- Do not use color as the only indicator.

Example:

```text
Roster import complete: 42 created, 3 updated, 1 skipped.
```

### ATT-03 — Attendance session lifecycle

#### Current model

The database already records term, teaching group, optional teacher/meeting, class date, phase, optional start/end and per-student status.

#### Proposed additions

- Link sessions to a scheduled meeting whenever possible.
- Allow an unscheduled/extra class with an explicit reason.
- Add `draft`, `submitted`, `locked` and `reopened` lifecycle states.
- Record submitted/locked actor and timestamp.
- Prevent accidental duplicate sessions for the same group/date/time unless explicitly confirmed.
- Preserve an audit trail when a locked session is corrected.
- Prefer archive/void with reason over destructive deletion after submission.

### ATT-04 — Midterm, final and semester calculations

#### Current behavior to preserve

- `midterm` and `final` phases already exist.
- Late counts as attended.
- Excused is removed from the denominator.
- Semester percentage and marks already exist.
- Theory and sessional mark maxima are term policy values.

#### Improvements

- Present Midterm, Final and Semester as explicit report tabs.
- Display attended/eligible sessions, percentage and awarded mark.
- Show the calculation rule used and policy version.
- Provide student-level drill-down from the aggregate to dated sessions.
- Define a rounding policy in Settings instead of relying on implicit behavior.
- Lock historical results to the policy version effective for that term.

### ATT-05 — Whole-semester course attendance ledger

#### Required report

For a selected department, stream, batch and course, show every attendance session:

| Date | Day | Time | Phase | Teacher | Scheduled meeting | Present | Absent | Late | Excused | Total | Status |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|

Include:

- class count held during the term;
- chronological date/time history;
- teacher who took each class;
- number and percentage present/absent;
- links to open and correct individual sessions;
- filters for midterm/final, teacher and date range;
- student matrix view with dates as columns;
- CSV export and print/PDF summary.

This report answers both questions:

1. “Which days did the teacher take classes?”
2. “How many students were present or absent on each day?”

#### Department and batch organization

- Department is descriptive for student identity but operational for filtering.
- Enrollment in a teaching group remains independent of home department.
- A CSE group may contain other-department students without duplicating them.
- Department → stream → batch is a navigation hierarchy, not a rule that forbids cross-department enrollment.

#### Attendance acceptance criteria

- A user can reach a course in no more than four predictable selections.
- Save/import always produces visible, accessible confirmation.
- A teacher can create, save and revisit a dated session.
- Midterm, Final and Semester summaries reconcile with the underlying sessions.
- The semester ledger exposes date, time, teacher and status counts.
- Exports use the same report projection as the screen.
- Historical attendance is retained when students leave a roster.

#### Likely code seams

- `src/app/(portal)/attendance/page.tsx`
- `src/components/attendance-manager.tsx`
- `src/lib/academic-operations.ts`
- `src/lib/academic-actions.ts`
- `src/lib/attendance.ts`
- attendance tables in `src/db/schema.ts`

## 8. Teacher management

### TCH-01 — Teacher CRUD with safe lifecycle

- Add Create, Edit, Deactivate, Reactivate and View History.
- Derive `incoming` when the home department is not CSE; it does not mean newly hired.
- Keep UT/Upcoming Teacher as a vacancy marker, never a fake teacher identity or login.
- Permanently delete only an unused mistaken record.
- Block or warn on deactivation while active meetings/allocations exist.
- Preserve historical routine, attendance, workload and extra-load references.
- Teachers receive user accounts separately; a teacher record is not itself an authentication account.

Minimum fields: short code, full name, designation, employment type, home department, email, private phone, status and notes.

### TCH-02 — Individual teacher routine

Implemented on the TCH-02 branch (1 October 2026); see the [spec](specs/TCH-02/spec.md) for the full behaviour.

- One projection drives the screen tables, the phone agenda and the A4 portrait print, so all three always show the same classes.
- The layout follows the department's "Individual Class Routine" template: a section per program, DAY | BATCH | periods, only rows that have classes, and a new table whenever the period pattern changes.
- Total Credit Hours is the Workload total, including other-department units.
- Published is the default view, and draft prints are marked "Draft — not official".
- There is no logo, and no .docx download yet.

## 9. Rooms and occupancy

### ROM-01 — Room CRUD and availability

- Add Create, Edit, Deactivate, Reactivate and View Occupancy.
- Preserve room type separately from capabilities.
- Keep 406/407/408 as computer labs and 505 as computer/microprocessor/networking/theory-capable.
- Permit theory in a free theory-capable lab.
- Require matching lab capability for sessional delivery.
- Add temporary unavailability/maintenance periods with effective dates and reason.
- Block deactivation while future active meetings use the room.
- Permanently delete only unused draft records.

Occupancy should show weekly meetings, occupied minutes, utilization, free periods, capacity/capability alerts and maintenance windows.

## 10. Batches and semester placements

### BAT-01 — Cohort lifecycle and Spring/Summer rollover

- Add Create/Edit batch identity, Deactivate, Reactivate, Graduate and View Placement History.
- Keep batch identity separate from term placement.
- Add a “Start next term” wizard that proposes Semester `n + 1`, allows repeat/hold/graduate overrides, and creates new placement rows without overwriting history.
- Student count should be term-aware or have term-scoped verification metadata; copied counts start unverified in the new term.
- `MERGED/SHARED` is derived from teaching-group membership, not a manual batch status.
- `COUNT UNVERIFIED` means unknown/unconfirmed, never zero.
- Permanently delete only a batch with no placements, offerings, students, meetings or attendance.

## 11. Course catalog, offerings and completeness

### CRS-01 — Offering construction workflow

Split the workflow into deep modules at these seams:

```text
Catalog course
→ term offering
→ teaching group/audience
→ teacher workload allocation
→ coverage requirement
→ canonical meeting and room assignment
```

Required capabilities:

- Catalog: Add, Edit, Deactivate, Reactivate, View History.
- Offering: Create for a term, edit draft, cancel/close, clone from prior term.
- Audience: choose department/stream/batch and separate versus merged delivery.
- Teachers: assign one or more teachers with explicit workload units and role.
- Coverage: define required meetings and expected weekly minutes.
- Schedule: Schedule now, save unscheduled, or send to Auto-schedule gaps.
- Completeness: show missing catalog, audience, count, teacher, workload, coverage, meeting, room, validation and external data.

Room and time belong to meetings, not directly to the permanent course. Merged delivery joins multiple offerings to one teaching group; it must not permanently merge cohorts.

## 12. External commitments

### OD-01 — Make cross-department commitments understandable and maintainable

- Rename the navigation label to **Cross-department commitments**, retaining “OD row” as explanatory institutional terminology.
- Replace the Kind dropdown with guided choices and an impact preview.
- Keep derived completeness A–D separate from Verified/Pending status.
- Add Edit, Archive, Reactivate, Verify, Return to Pending and Resolve Ambiguity.
- Scope every record to an academic term and optional effective date range.
- At rollover, carry records forward only as pending until reconfirmed.
- Allow conversion/linking to a formal offering so one class is not represented twice.
- Preserve the rule: room-only blocks only a room; partial teacher data blocks only the known teacher interval; unresolved notes fabricate nothing.

## 13. Settings and pending decisions

### SET-01 — Separate configuration from governance

Split the current page into:

1. Institution profile
2. Academic terms
3. Scheduling windows and breaks
4. Course/workload policy
5. Attendance policy
6. Extra-load/payment policy
7. Pending decision register
8. Data/import status

Required improvements:

- Fix empty policy notes rendering as literal `null`.
- Version important policy values by term/effective date.
- Add draft → review → approve → activate workflow.
- Show impact before changing a policy, such as affected meetings or recalculated claims.
- End-date/archive used rules instead of deleting history.
- Turn pending decisions into actionable records with owner, status, current assumption, evidence, decision, effective term and affected modules.
- Restore and reconcile the missing institutional specification before declaring the decision register complete.

## 14. Governance and approvals

### GOV-01 — Publication and payment approvals

After AUTH-01:

- Coordinator prepares a routine version.
- Validation runs against current canonical data.
- Department head approves or rejects with a note.
- Publisher activates the approved version.
- Teacher submits extra-load claims.
- Authorized reviewer approves/rejects claims.
- Accounts officer records payment batch/status without changing academic facts.
- Every transition is audit logged.

## 15. Shared implementation modules

Avoid duplicating business rules across pages. Prefer these deep modules:

| Module | Small interface should hide |
|---|---|
| Authorization | Role lookup, department scope, ownership and denial reasons |
| Action feedback | Toast lifecycle, inline errors, accessibility and refresh behavior |
| Routine projection | Shared meetings, day/week grouping, sorting, OD rows and export rows |
| Attendance reporting | Phase/semester aggregation, session ledger and export rows |
| Entity lifecycle | Delete eligibility, archive/deactivate checks and dependency explanations |
| Term rollover | Placement promotion, count verification reset, external review and cloning rules |
| Completeness | Required fields and status reasons for offerings and external records |
| Policy evaluation | Effective policy version, threshold, marks, windows and exceptions |

Tests and callers should cross the same module interfaces. Database and PGlite are adapters behind the existing data-access seams; do not let page components reproduce domain calculations.

## 16. Cross-cutting UX requirements

- All mutation buttons show pending state and prevent accidental double submission.
- Success and failure messages use an accessible global toast plus nearby inline detail.
- Destructive actions name the exact affected entity and consequences.
- Lists support search, filters, active/inactive state and empty-state guidance.
- Form state and report filters survive refresh through URL parameters where practical.
- Unknown values display as `Unknown` or `Not verified`, never zero and never `null`.
- Every status badge has a tooltip or nearby explanation.
- Mobile interfaces favor cards/agenda views over excessively wide tables.
- Printed and exported reports declare term, data status, version and generation time.

## 17. Data migration and deletion rules

- Never use `db:reset` on real data.
- Never cascade-delete published routine, attendance, workload, extra-load or audit history.
- Add `status`, `archivedAt`, `archivedBy` or effective-date fields where lifecycle is needed.
- Draft mistakes with zero dependencies may be permanently deleted after confirmation.
- Published facts are corrected through amendments/new versions, not overwrites.
- Backfill new non-null fields safely before adding constraints.
- Test every migration against both an existing populated PGlite database and PostgreSQL.

## Acceptance journeys across features

1. Create a Spring term from Summer, repeat one cohort and graduate another.
2. Create a merged offering, allocate co-teachers, schedule it once and see it in both streams.
3. Add a room maintenance period and reject an overlapping meeting.
4. Import a roster, display the import summary, take attendance, lock it and view semester ledger totals.
5. Restrict a teacher to their own groups and reject unauthorized edits.
6. Export a published weekly HSC routine and reconcile it with canonical snapshot meetings.

## Release requirements (DEP-01)

**Preview:** Vercel build, separate hosted PostgreSQL database, preview Google OAuth origin, secrets, migrations, first-admin bootstrap, health and anonymous/internal access smoke tests. Never point an unreviewed preview at the production database.

**Production:** tested backup/restore, final HTTPS origin and OAuth callback, least-privilege database access/pooling, session and role tests, migration runbook, monitoring, error handling and rollback procedure. The app may be deployed internally before an official routine exists; **public routine publication** additionally requires all source blockers resolved and the institution's approver decision. Local PGlite files are not deployment storage.
