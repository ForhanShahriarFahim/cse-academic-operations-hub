# CSE Academic Operations Hub — Solution and Implementation Roadmap

Status: feature rationale; current execution status and order are in the [26 September execution plan](plans/PROJECT_EXECUTION_PLAN_2026-09-26.md)

Prepared: 23 September 2026; status reconciled 26 September 2026

Purpose: a feature-by-feature handoff document for planning and implementing the remaining portal work without losing historical academic data.

## 1. How to use this document

Choose one issue ID, inspect its listed code seams, refine its acceptance criteria, and implement only that slice. Do not attempt the entire roadmap in one change.

Every implementation should:

1. preserve existing Summer 2026 data;
2. add a forward-only Drizzle migration when the schema changes;
3. support PostgreSQL and the local PGlite development database;
4. enforce authorization in server actions, not only by hiding buttons;
5. retain historical records through archive/deactivate/versioning instead of unsafe deletion;
6. add focused domain tests before updating screenshots or documentation; and
7. pass `npm run typecheck`, `npm run lint`, `npm run test:domain`, and `npm run build`.

## 2. Verified current baseline

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

The current fresh seed imports 42 teacher records, 78 courses and 183 meetings. The original institutional specification is missing from this checkout. `HANDOVER_GUIDE.md` and `PROJECT_CONTEXT.md` still describe an older no-authentication synthetic baseline; treat them as historical until `DOC-01` reconciles them.

### Important verified attendance facts

- `attendance_sessions.phase` already records `midterm` or `final`.
- Semester summaries and theory/session attendance marks already exist.
- Attendance sessions already store class date and optional start/end times.
- CSV import and Save actions already return an `ActionResult`; the component renders it near the top of the page. The practical defect is visibility and persistence, not the total absence of a server response.
- Enrollment is already independent of a student's home department, which supports cross-department and merged groups.

### Important verified routine facts

- Exact start and end minutes are authoritative.
- A merged class is one canonical meeting related to multiple offerings/audiences.
- The published routine is an immutable snapshot and currently provides day-by-day HSC/Diploma views plus browser print.
- Automatic scheduling edits only the working draft and does not publish.

## 3. Domain vocabulary that must remain stable

- **Academic term**: one Spring or Summer operational period.
- **Semester**: a cohort's curriculum position, such as Semester 3, within a term.
- **Batch/cohort**: a stable `(programme, stream, label)` identity that survives semester progression.
- **Course**: permanent catalog definition.
- **Course offering**: a course made available to one batch in one term.
- **Teaching group**: one delivery group containing one or more offerings; this is the seam for merged/shared delivery.
- **Meeting**: one recurring physical class event with exact day/time, teachers and rooms.
- **Attendance session**: one dated occurrence where attendance was recorded; it may link to a recurring meeting.
- **External commitment**: a known cross-department teacher or room constraint outside the normal CSE-owned routine.
- **Archive/deactivate**: stop future use while preserving history.
- **Delete**: permanent removal, allowed only for unused draft data.

Do not use “session” ambiguously in new interfaces. Use **academic term** for Spring/Summer and **attendance session** for one dated class occurrence.

## 4. Recommended implementation order

### Phase 0 — Safety baseline (`SAFE-01`) — next proposed implementation

- Add database backup/restore instructions for real PostgreSQL deployment.
- Add integration fixtures for a second academic term.
- Confirm all mutations write audit events.
- Establish a shared action-result and notification pattern.

### Phase 1 — Weekly routine view and export (`RUT-01`) — completed 23 September 2026

This is the recommended first feature. It is mostly read-only, delivers immediate value, and has low migration risk.

Implemented with shared draft/published projection, Day/Week URL state, CSV export, compact HSC and Diploma official pages, course-offer and directory appendices, and the reviewed Summer 2026 source import. The supplied routine's unresolved conflicts remain visible and block a new official publication until reviewed.

### Phase 2 — Authentication and role authorization (`AUTH-01`) — code pushed, verification pending

The implementation is in pushed commits `26eb86c` and `c70984f`. Complete real-provider, PostgreSQL, ownership and session verification, plus the owner-approved Summer 2026 teacher/CR/query contact projection, before closing #1 or exposing substantial new CRUD functionality in production. Listed personal mobiles are within the approved source scope; unrelated directory data is not.

### Phase 3 — Academic master-data management

1. Teachers (`TCH-01`)
2. Rooms and availability (`ROM-01`)
3. Batches and term placements (`BAT-01`)
4. Course catalog and offerings (`CRS-01`)

The course-offering workflow depends on manageable teachers, rooms, batches and terms.

### Phase 4 — Attendance navigation, feedback and reporting (`ATT-01` to `ATT-05`)

Build on stable departments, batches, offerings and authorization.

### Phase 5 — Governance and cross-department completeness

1. External commitments (`OD-01`)
2. Settings and decision register (`SET-01`)
3. Publication approvals and extra-load approval gates (`GOV-01`)

## 5. Routine weekly view and export

### RUT-01 — Weekly HSC/Diploma routine

#### Problem

The draft and public routine are navigated by stream and individual day. Users also need a weekly view for both HSC and Diploma and must be able to export it.

#### Proposed interface

Add a view switch to both the draft routine and public published routine:

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

#### Proposed deep module

Create one routine-projection module with a small interface such as:

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

#### Likely code seams

- `src/app/(portal)/routine/page.tsx`
- `src/components/routine-builder.tsx`
- `src/app/public/routine/page.tsx`
- `src/components/print-button.tsx`
- new projection/export modules under `src/lib/`

## 6. Authentication and role-based authorization

### AUTH-01 — Identity, roles and action guards

#### Problem

The portal has mutating administrative screens but no sign-in. Audit events currently record a placeholder coordinator actor. Adding CRUD without authorization would make the deployment unsafe.

#### Recommended roles

| Role | Primary permissions |
|---|---|
| System administrator | Users, roles, institution profile and all recovery operations |
| Academic administrator | Terms, batches, courses, offerings and policy drafts |
| Routine coordinator | Teacher/room assignments, meetings, OD commitments and validation |
| Department head/approver | Approve policies, routine publications and exceptional overrides |
| Teacher | View own allocation; take attendance for assigned groups; submit own extra-load records |
| Accounts officer | Review honorarium summaries and payment status without editing academic schedules |
| Read-only viewer | View internal reports without mutation |

One person may have multiple roles. Access must also be scoped by department and, for teachers, by assigned teaching groups.

#### Required behavior

- Authentication choice should support the university's actual identity source; keep domain authorization independent of the provider.
- Add users, role assignments and optional department scope.
- Add a single server-side authorization interface, for example `authorize(actor, capability, resource)`.
- Guard every server action. Hiding a button is convenience, not security.
- Replace the hard-coded audit actor with the authenticated user ID and display name.
- Protect private phone numbers and draft academic records.
- Keep `/public/routine` public only for effective published snapshots.
- Return a clear forbidden result instead of silently failing.

#### Capability examples

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

## 18. Test strategy

Each feature plan should include:

- pure domain tests for calculations and lifecycle decisions;
- server-action authorization tests;
- database integration tests for constraints and history preservation;
- UI tests for main successful workflow and one failure path;
- export parity tests ensuring the report matches the screen projection;
- regression tests for merged classes, cross-department students, unknown counts and exact-minute overlaps.

High-value end-to-end scenarios:

1. Create a Spring term from Summer, repeat one cohort and graduate another.
2. Create a merged offering, allocate co-teachers, schedule it once and see it in both streams.
3. Add a room maintenance period and reject an overlapping meeting.
4. Import a roster, display the import summary, take attendance, lock it and view semester ledger totals.
5. Restrict a teacher to their own groups and reject unauthorized edits.
6. Export a published weekly HSC routine and reconcile it with canonical snapshot meetings.

## 19. Definition of done for one roadmap item

An issue is complete only when:

- the domain rule and user workflow are documented;
- migration and backward compatibility are handled;
- server-side authorization is enforced where applicable;
- success, error, empty and loading states are visible;
- audit events contain the real actor;
- automated tests cover core rules;
- the current source-routine development seed still loads without overwriting existing data;
- verification commands pass;
- README/HANDOVER documentation and relevant screenshots are updated; and
- the change is delivered as a focused commit or pull request.

## 20. Feature-planning prompt template

Use the following when handing one item to another model or a new task:

```text
Plan issue <ISSUE-ID> from docs/IMPLEMENTATION_SOLUTION_ROADMAP.md.

First inspect the current implementation, database schema, migrations, relevant
Next.js 16 documentation under node_modules/next/dist/docs, existing tests and
ADR-001. Do not implement yet. Produce:

1. verified current behavior;
2. user journeys and permissions;
3. domain invariants and edge cases;
4. schema/migration plan;
5. module interfaces and file-level change map;
6. UI states and accessibility behavior;
7. test plan;
8. rollout/backfill risks;
9. acceptance criteria;
10. unresolved decisions requiring user confirmation.

Preserve historical data, canonical meetings, term scoping, merged audiences,
external participants and PostgreSQL/PGlite compatibility.
```

## 21. Recommended next action

`RUT-01` is complete. Review the [current execution plan](plans/PROJECT_EXECUTION_PLAN_2026-09-26.md) and propose `SAFE-01` next: backup/restore, second-term preservation, and mutation/audit baseline. Finish the remaining `AUTH-01` verification when real OAuth and PostgreSQL test resources are available. Do not close either issue on code presence alone.
