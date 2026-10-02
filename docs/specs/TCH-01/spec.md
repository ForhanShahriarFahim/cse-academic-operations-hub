# TCH-01 — Teacher records with a safe lifecycle

Issue: [#4 TCH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4). Requirements: [PRODUCT_REQUIREMENTS §8](../../PRODUCT_REQUIREMENTS.md#8-teacher-management).
Plan: [plan.md](plan.md). Mockups: [mockups/](mockups/).
Status: Approved by the owner on 2 October 2026 (spec, plan and mockups as written; D-1 to D-4 as answered). Implemented and verified on disposable data ([verification](verification.md)); awaiting owner acceptance.
Updated: 2 October 2026, Asia/Dhaka

## Problem and inspected baseline

Inspected on 2 October 2026 at `c2eff15` (main after BUG-26).

- **Read-only today.** `/teachers` lists every row of `teachers` with workload figures, and `/teachers/[id]` shows the schedule and allocations. No screen or server action creates, edits, deactivates or deletes a teacher. Any correction needs a database edit or a reseed.
- **No permission** covers teacher records. Roles and capabilities live in [policy.ts](../../../src/lib/auth/policy.ts).
- **`teachers`** has `short_code` (unique), `full_name`, `designation`, `employment_type`, `home_department_id`, `email`, `phone_private`, `status` and `notes`. There is no `updated_at`, so an edit cannot detect that someone else saved first, unlike Days & periods.
- **Placeholder rows are stored as teachers.** The Summer 2026 import stores `UT` (Upcoming Teacher) with status and employment type `vacancy`. It also stores the four routine codes the source teacher list does not identify (`SI`, `AS`, `MNI`, `HUH`; see [institutional decisions](../../decisions/INSTITUTIONAL_DECISIONS.md)) as "Unresolved teacher (…)" with status and employment type `unresolved`. The Teachers list shows all of them, although its own description says vacant posts are not listed there.
- **Private phone.** It is loaded only for roles with `view_private_contacts` ([data.ts](../../../src/lib/data.ts)). The teacher pages do not show contacts at all.
- **History.** Published routines keep a snapshot of teacher codes, names, designations and contacts from publication time (`publicationMetadata`). Live screens, workload and attendance read the current row.
- **Workload limit.** One advisory limit, `WORKLOAD_ADVISORY_UNITS = 15` in [constants.ts](../../../src/lib/constants.ts), applies to everyone.
- **References to a teacher:** `meeting_teachers`, `workload_allocations`, `extra_load_classes`, `external_commitments`, `attendance_sessions`, `portal_users.teacher_id`, and the short code inside published snapshots.

## Owner decisions (2 October 2026)

- **D-1 Editors:** system administrator, academic administrator and routine coordinator, through a new capability, `manage_teachers`. Everyone else stays view-only.
- **D-2 History:** published snapshots plus a change log. Published routines keep their values. Live screens show current values. Each teacher page lists every change with before and after values, who made it and when. Dated profile versions are not built.
- **D-3 Load limit:** an optional limit per teacher. Blank means the department default of 15 units. It stays an advisory warning, never a block.
- **D-4 Employment and status:** employment types are full-time, part-time and guest/visiting. "On leave" is a status, not an employment type, so LEAVE-01 (#40) can set it later.

## Outcome

Coordinators and administrators keep the teacher list correct from the portal: add, edit, resolve placeholder codes, deactivate, reactivate and delete mistaken records. Nothing that happened before an edit is lost: published routines, attendance, workload and extra-load records stay readable, and every change is recorded.

## Scope

**In scope**
- `manage_teachers`, granted to system administrator, academic administrator and routine coordinator, and enforced in every server action.
- A schema migration: `updated_at`, `advisory_load_units`, nullable `employment_type`, and check constraints on employment type and status (see the plan).
- Add teacher, Edit teacher, Deactivate, Reactivate and Delete (unused records only), each audited.
- A Changes list on the teacher page.
- Teachers list filters: Active, On leave, Inactive, Placeholders. "Add teacher" appears for editors.
- Placeholders: UT stays a vacancy marker. Unresolved codes can be **resolved** into a real teacher.
- The per-teacher advisory limit, used everywhere "above the limit" is shown.
- Inactive teachers are left out of every place a teacher is chosen for new work.

**Out of scope**
- Dated profile versions and past-term views (D-2; the term selector is separate).
- Linking a teacher to a portal account, which stays in People & Access (AUTH-02).
- Leave requests and approval (LEAVE-01 #40). Setting "On leave" by hand does not change the routine.
- Assigning a real teacher to UT classes (Courses, CRS-01 #7).
- Bulk import or export of teachers.
- Republishing: a published routine keeps its snapshot until the coordinator publishes a new version.

## Behaviour

### Fields and validation

| Field | Rule |
| --- | --- |
| Short code | Required. 1–8 characters: letters A–Z and digits, saved in upper case. Unique, comparing upper case. Codes are exact identifiers, so `IM` and `IMN` are different teachers. |
| Full name | Required, 2–120 characters, surrounding spaces trimmed. |
| Designation | Optional, up to 80 characters. Suggestions: Lecturer, Senior Lecturer, Assistant Professor, Associate Professor, Professor, Adjunct Faculty. Free text is allowed. |
| Employment type | Full-time, Part-time or Guest/visiting. Required for a teacher; empty for placeholders. |
| Home department | Required, from the departments list. A department other than CSE shows the **Incoming** badge (derived, never stored; it does not mean newly hired). |
| Email | Optional. Must be a valid address. It does not create or change a portal account. |
| Private phone | Optional, up to 30 characters of digits, spaces, `+` and `-`. It is read and edited only by holders of `view_private_contacts`, and it never appears in the audit log (the log records only that it changed). |
| Workload limit | Optional, 1–40 units in steps of 0.5. Blank means the department default of 15. |
| Notes | Optional, up to 1,000 characters. |

Status (Active, On leave, Inactive, and Vacancy or Unresolved for placeholders) is not a form field. It changes only through the actions below.

### Actions

1. **Add teacher** (`/teachers/new`). The status is Active. Saving opens the new teacher's page with a confirmation.
2. **Edit** (`/teachers/[id]/edit`). The form carries the record's `updated_at`. If someone saved in between, nothing is changed and the page asks to reload.
   - Changing the short code shows a warning before saving: published routines keep the old code until the next publication.
   - Changing the department to or from CSE says the Incoming badge will change.
3. **Set on leave / Back from leave.** Switches Active ⇄ On leave. Classes and allocations are untouched, and the teacher stays assignable with an "On leave" badge.
4. **Deactivate.** Before confirming, the page lists everything that would block it in the **active term**:
   - classes in the working routine;
   - workload allocations;
   - extra-load classes not yet included in a top sheet;
   - external commitments.

   Each item links to where it can be reassigned or removed. While anything is listed, Deactivate is unavailable. With nothing listed, the editor confirms and may add a reason.
   - The teacher's portal account is not changed; the page points to People & Access.
   - Inactive teachers remain on every past record and published routine, appear under the **Inactive** filter, and are left out of teacher pickers.
5. **Reactivate.** Returns an inactive teacher to Active.
6. **Delete.** Offered only when nothing references the teacher in any term, and the short code is in no published snapshot. The editor types the short code to confirm. Otherwise the page explains why and offers Deactivate instead.
7. **Resolve a placeholder code** (Unresolved only). It opens the edit form with the code fixed. Saving a full name, department and employment type makes the row an Active teacher, keeping all its classes. **UT (Vacancy)** cannot be edited into a person, deactivated or deleted while classes use it. Its page explains that UT classes are reassigned in Courses.

Every action:
- is checked on the server (`manage_teachers`, plus `view_private_contacts` for the phone);
- runs in one transaction with an audit event (entity `teacher`) holding the changed fields' before and after values, the phone masked;
- returns the standard action result: success, invalid with field errors, stale, denied or conflict.

### Changes list

The teacher page shows "Changes", newest first. Each entry gives the date and time in Asia/Dhaka, who made the change, the action, and the changed fields as `before → after` (the phone shown only as "changed"). The list is visible to holders of `manage_teachers`. Other roles see the profile without it.

### Teachers list

- Filters with counts: **Active** (includes On leave, with a badge), **On leave**, **Inactive** and **Placeholders** (UT and unresolved codes, with a short explanation of each).
- Search by code or name.
- The existing workload columns stay. The limit note uses the teacher's own limit: "Above their 12-unit limit".
- On a phone the table becomes stacked rows with no page-wide horizontal scroll.
- Print keeps today's layout, for the selected filter.

## Acceptance criteria

- **AC-01** A system administrator, academic administrator or routine coordinator can add a teacher with valid fields. The new teacher appears in the list and on their page, and one `teacher.create` audit event exists.
- **AC-02** Other roles, and requests without a session, are denied every teacher action on the server, with no change and no audit event. The edit controls are hidden from them.
- **AC-03** Validation rejects a duplicate short code (including one differing only in case), a malformed code, a missing name or department, an invalid email or phone, and a limit outside 1–40. Each error appears beside its field, and nothing is saved.
- **AC-04** Editing saves the changed fields and audits only those. An edit made against an out-of-date version is refused as stale, without changing anything.
- **AC-05** The private phone is never sent to a viewer without `view_private_contacts`, in the page, the form or the Changes list, and it never appears in an audit event.
- **AC-06** Deactivate is refused while the teacher has active-term classes, allocations, unsettled extra-load classes or external commitments, and the blocking items are listed. Without them, it succeeds. The teacher then leaves the pickers but stays on published routines, past attendance, workload and extra-load records. Reactivate reverses it.
- **AC-07** Delete succeeds only for an unreferenced teacher whose code is in no published snapshot and when the typed code matches. Otherwise it is refused with the reason.
- **AC-08** An unresolved code can be resolved into an Active teacher, keeping its classes. UT cannot be edited into a person, deactivated or deleted while it has classes.
- **AC-09** The per-teacher limit drives the "above the limit" warnings on Teachers, the teacher page and Workload. Blank uses 15.
- **AC-10** The Changes list shows each change with when, who and before → after, newest first.
- **AC-11** Published routines are unchanged by any edit. The current routine, attendance and workload screens show the new values.
- **AC-12** The migration upgrades a populated copy of the database (PGlite and PostgreSQL) with every existing teacher unchanged, except that placeholders' employment type is moved to their status. The institutional database is migrated only after a verified cold backup, at owner acceptance.
- **AC-13** The screens pass the UI review on desktop, phone and print. Every field is labelled, errors are announced and linked to their fields, focus is visible, contrast is readable, and status is never shown by colour alone.

## Implementation notes (2 October 2026)

These are within the approved outcome and are raised for the owner at acceptance.

- **N-1, extra-load classes do not block deactivation.** The spec listed "extra-load classes not yet included in a top sheet" as a blocker. The portal has no record of inclusion: a top sheet is a printout for a date range. So active-term extra-load classes are shown on the Deactivate page as information ("… stay on their sheets"), not as a blocker. They stay on the teacher's sheet and on top sheets either way. If an inclusion state is wanted, it belongs to the extra-load workflow (GOV-01 #15).
- **N-2, picker rule on the server.** Creating a class, editing a class and recording an external commitment refuse a newly added inactive teacher, as well as hiding them in the pickers. A teacher already on a class can stay on it.
- **N-3, account links.** People & Access offers only active or on-leave teachers when linking an account, and never a placeholder code (UT or an unresolved code). An existing link to a teacher who later became inactive is kept.
- **N-4, migration text.** The workload-limit check is written as a flat AND rather than with BETWEEN. PostgreSQL rewrites a nested condition after dump and restore, which made the SAFE-01 backup check (T-06) report a schema difference. The rule enforced is the same.

## Edge cases

- A teacher with classes only in a past term can be deactivated: past-term references never block. They do block Delete.
- Two editors saving the same teacher: the second gets "changed by someone else, reload".
- Renaming a short code to one that a published snapshot used for a different teacher is allowed, but the warning names that snapshot.
- Deactivating a teacher who has a portal account leaves the account unchanged. The notice links to People & Access.
- A department used by teachers stays (departments are managed elsewhere). Deleting a department is out of scope.
