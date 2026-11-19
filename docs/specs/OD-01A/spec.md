# OD-01A — Understandable, editable and archivable cross-department commitments

[Issue #13](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/13) · Proposed · 19 November 2026, Asia/Dhaka

[Product requirement](../../PRODUCT_REQUIREMENTS.md#od-01--make-cross-department-commitments-understandable-and-maintainable) · [Plan](plan.md) · [Review sketches](mockups/index.html)

## Inspected baseline

- **One table, one term.** `external_commitments` belongs to one term. It stores a kind (`teaching`, `room_reservation`, `combined`, `unresolved_note`), a stored completeness level A–D, the counterpart department, an optional teacher and room, day and time, course and audience labels, credits, `pending`/`verified`, source, `last_verified_at` and notes. It has no lifecycle state, revision counter, effective dates or link to a teaching group. [Schema](../../../src/db/schema.ts)
- **Create, verify, delete only.** The `/od` page lists every record of the current term in one table. A modal **Record commitment** form uses a raw Kind dropdown. Rows offer only **Mark verified** (one click, no note) and **Remove**, which hard-deletes the row. BUG-27 refuses removal when a workload allocation counts the record. Writes require `manage_external_commitments` (system administrator and routine coordinator) and the record's term must be the current active term. Each write is audited with before and after images. [Page](../../../src/app/(portal)/od/page.tsx) · [Form](../../../src/components/od-manager.tsx) · [Actions](../../../src/lib/actions.ts)
- **Completeness is set once.** The level is derived from the submitted fields when the record is created and is never recalculated. The rule has gaps. A `teaching` record without a teacher is accepted, is level C and blocks nothing. A `room_reservation` record without a room is accepted and blocks nothing. A `room_reservation` record with a teacher becomes level A, but the teacher is never checked for clashes. A `teaching` record needs a room to reach A, although it describes teaching in another department.
- **Planning effects.** The conflict engine treats `teaching` and `combined` records with a teacher as teacher blockers. It treats `room_reservation` and `combined` records with a room as room blockers. Unresolved notes block nothing. Records with a room also feed room maintenance and room deactivation checks. Every record with a day and time appears in the OD row of the working routine and the official routine package. A teacher's records appear under **Other departments** and in that teacher's agenda. A publication freezes the term's records in its snapshot. The snapshot validator accepts exactly the existing fields. [Conflicts](../../../src/lib/conflicts.ts) · [Routine projection](../../../src/lib/routine-projection.ts) · [Teacher routine](../../../src/lib/teacher-routine.ts) · [Publication validator](../../../src/lib/term-publication.ts) · [Room lifecycle](../../../src/lib/room-lifecycle-transaction.ts)
- **Institutional data shape.** The Summer 2026 source import creates only `room_reservation` records at level C. They are marked verified against the source routine, and the source cell is kept in `notes`. Manual records start as pending. Workload allocations that point to a commitment come only from imports and fixtures. No screen creates or edits them.
- **Not present today.** Nothing carries commitments into a later term (BAT-01B rollover handles cohorts only). Nothing links a commitment to a formal teaching group, so one class can appear both as a CSE meeting and as an OD row.

## Proposed slicing

Issue #13 is large. This record specifies **OD-01A**, which makes the current term's records understandable, correctable and safely retired. **OD-01B** is a separate later slice. It would add optional effective date ranges, carry records into a later term as pending, and link or convert a record to a formal teaching group so one class is not represented twice. OD-01B touches the publication snapshot format and term continuity, so it needs its own specification. #13 stays open until both slices are accepted.

## Proposed decisions

### D-1 — Name and register

- Rename the navigation item and page title to **Cross-department commitments**. The page description explains that these records make up the **OD row** (“Other Departments”) on the printed routine. The `/od` URL and the printed “OD” label stay unchanged.
- The register shows **Active** records by default. Filters, kept in the URL, cover state (Active, Archived, All), verification (Pending, Verified), what is committed (D-2 choice) and a text search on department, course or audience. Counts appear above the table: active, pending, verified, unresolved, archived.
- Columns: **What is committed · Department · Teacher · Room · Day and time · Course / audience · Blocks · Completeness · Verification · Actions**. **Blocks** states the planning effect in words, for example “Room 301 only” or “Nothing — unresolved note”. **Completeness** and **Verification** are separate columns with separate badges, each labelled with text as well as color.
- Below 40rem each record becomes a stacked row with the same facts and one actions menu. The page does not scroll horizontally.

### D-2 — Guided form with an impact preview

Replace the modal with full pages: `/od/new` (create) and `/od/[id]/edit` (edit). Both use one form. Saving returns to the register at the same filters and highlights the changed row.

The first question is **What is committed?** It offers four described choices that map to the existing kinds, so stored data does not change meaning:

| Choice | Kind | Required facts | Blocks |
|---|---|---|---|
| Our teacher teaches for another department | `teaching` | Department, teacher, day, start, end | That teacher at that time |
| Another department uses one of our rooms | `room_reservation` | Department, room, day, start, end | That room at that time |
| Our teacher teaches another department in our room | `combined` | Department, teacher, room, day, start, end | Both |
| Only a note — the details are not known yet | `unresolved_note` | Department, note | Nothing |

The form shows only the fields that apply to the choice. Course, audience and credits stay optional for teaching choices. An unresolved note keeps only its text, an optional course and audience label, and the department. It stores no day, time, teacher or room, so nothing can be fabricated from it.

An **Impact preview** beside the form updates as facts are entered. It shows:

1. What the record will block, in words.
2. The completeness level it will receive, and which facts would raise it (D-3).
3. Which classes in the current working draft would clash with it. It uses the same overlap rule as the conflict engine, which the change moves into one shared pure function.

Clashes do not stop a save. The record is a fact about another department, and the clash then appears in the routine's conflict list as it does today. Saving still refuses an inactive teacher, an inactive room or a room-maintenance overlap, using the existing checks. Validation errors appear next to their fields and in a summary, and entered values are kept.

### D-3 — Completeness is derived from the facts on every save

Completeness describes how much of the class picture is known. It does not say whether anyone has confirmed it. One pure function sets the level on every create and edit:

- **D** — unresolved note.
- **C** — a room and a time are known, with no teacher (“Another department uses one of our rooms”).
- **B** — a teacher and a time are known, but the course, the credits, or the room for the combined choice is missing.
- **A** — a teacher, a time, the course and the credits are known, plus the room for the combined choice.

Compared with today, a `teaching` record no longer needs a room to reach A, and a room-only record is always C. Existing rows keep their stored level until they are next saved. A domain check lists stored levels that differ from the rule, so the difference is visible without changing institutional data.

Existing rows that the new form would refuse are left unchanged until edited. These are teaching records with no teacher, room records with no room, and room records that carry a teacher. Editing such a row requires choosing a valid D-2 choice. The register labels these rows **Needs review**, with the reason.

### D-4 — Lifecycle actions

Records have two independent states: **Active / Archived** and **Pending / Verified**.

| Action | Available when | Needs | Effect |
|---|---|---|---|
| Edit | Active | Valid D-2 facts | Facts and level updated. If a verified record's planning facts change, it returns to Pending and the save message says so. Planning facts are the choice, teacher, room, day and time. |
| Verify | Active, Pending, not an unresolved note | “How was this confirmed?” (1–300 characters) | Verified, with the time, the actor and the confirmation note recorded |
| Return to pending | Active, Verified | Reason (1–300) | Pending |
| Resolve note | Active unresolved note | A D-2 structured choice and its facts | Becomes a structured record, Pending. The original note text is kept in the record's notes and in history. |
| Archive | Active | Reason (1–300) | Leaves planning (D-5). Stays in the register under Archived. |
| Reactivate | Archived | Reason (1–300) | Active and Pending. Teacher, room and maintenance checks run again, and the request is refused with the reason if one fails. |
| Delete mistaken entry | Active or archived | Confirmation | Hard delete, as today, with the BUG-27 refusal when workload counts the record. It is moved into the actions menu, and the confirmation recommends Archive for a commitment that has ended. |

An unresolved note cannot be verified. Verification confirms structured facts, so the note must be resolved first. Every action is one audited transaction under `manage_external_commitments`, in the current active term only, as today. Each edit carries the revision the user opened. A record changed in the meantime is refused with “This commitment changed since you opened it”, and the form keeps the user's input.

### D-5 — Planning effect of archived records

An archived record leaves everything that plans the current term: the conflict engine, the working-draft OD row and official routine package, teacher **Other departments** lists and agenda, room maintenance checks, room deactivation blocking, and publications made after the archive. Existing publications keep their frozen snapshots unchanged. Room permanent-deletion checks still count an archived record, because it still references the room.

Archiving does not change workload. If an allocation counts the record, the confirmation lists it (“SYN-T1's workload counts this commitment, 3.00 units”), and the allocation keeps counting. Changing it belongs to workload management, which OD-01A does not add.

The publication snapshot format and schema version stay unchanged. New publications simply omit archived records.

### D-6 — History

Each record gets a **History** page at `/od/[id]/history`. It lists events newest first: created, edited (with each changed field shown as before → after), verified (with the confirmation note), returned to pending, resolved, archived, reactivated and deleted. Each event shows its actor, time and reason. It reads the existing audit events, which the new actions write with clear event names. Notes and sources stay internal, as today. The page uses the same permission as the register.

### D-7 — Storage

Add forward-only migration `0022`. It adds these columns to `external_commitments`:

- `lifecycle_status` — `active` or `archived`. Not null, default `active`, with a check constraint.
- `archived_at` and `archive_reason`.
- `verification_note`.
- `revision` — integer, not null, default 1.
- `updated_at`.

Existing rows become active at revision 1 with their verification unchanged. The migration does not touch existing values or rewrite stored levels. It is verified on a populated PGlite copy and on PostgreSQL before any institutional migration. The institutional database is migrated only in a separate, backed-up, owner-approved operation.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | The navigation and page read “Cross-department commitments” and explain the OD row. The register defaults to Active and filters by state, verification, choice and text. It shows Blocks, Completeness and Verification as separate labelled columns, and its counts reconcile with the rows. | Projection tests; compiled Edge review. |
| AC-02 | Each D-2 choice shows only its fields and refuses missing required facts with messages next to the fields, keeping input. An unresolved note stores no day, time, teacher or room. | Server-action tests per choice; browser form flow. |
| AC-03 | The impact preview states what will be blocked, the resulting level and the working-draft clashes. Its clashes match the conflict engine's for the same record. | Domain parity test of the shared overlap function against `detectConflicts`. |
| AC-04 | The level follows D-3 on every create and edit. Unedited legacy rows keep their stored level, and mismatches are reported. | Domain tests on the level function; legacy-row fixture. |
| AC-05 | Edit, Verify, Return to pending, Resolve note, Archive, Reactivate and Delete behave as D-4 describes. This covers required notes and reasons, the automatic return to Pending, unresolved notes that cannot be verified, revalidation on reactivation, and refusal of stale revisions. | Both-adapter action tests, including a concurrent stale edit. |
| AC-06 | An archived record produces no conflict, OD-row cell, teacher agenda item, maintenance block, room-deactivation block or entry in a new publication. Earlier publications are unchanged, and workload allocations are unchanged and disclosed. | Fixture across conflicts, routine projection, teacher routine, room checks and publish. |
| AC-07 | History lists every event with actor, time, reason and field changes. Every action writes exactly one audit event, and a refused action writes none. | Both-adapter audit assertions; history page review. |
| AC-08 | Anonymous users, users without `manage_external_commitments`, and writes outside the current active term are refused on every new page and action. The SAFE-01 mutation inventory lists the new actions. | Role matrix on both adapters; inventory test. |
| AC-09 | Migration `0022` applies to a populated PGlite copy and to PostgreSQL, keeps every existing value, and leaves existing publications readable. | Disposable migration fixtures on both adapters. |
| AC-10 | The register, form and history work by keyboard at 1440, 390 and 320 px with visible focus, labelled controls, announced results and no page-wide horizontal scroll. | Compiled Edge review with axe. |

## Decisions for the owner

- **D-1–D-7 as written.** In particular: the OD-01A / OD-01B split (see Proposed slicing); verification needs a confirmation note; editing planning facts returns a verified record to Pending; and Archive keeps workload unchanged but discloses it (D-5). The alternative to the last point is to refuse archiving while workload counts the record. That would leave such records unremovable, because no screen edits those allocations.
- No institutional fact is needed for OD-01A. OD-01B will need the owner's rule for how long a carried record stays pending and who reconfirms it.
