# TCH-02 — Implementation plan

Issue: [#35 TCH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35)
Specification: [spec.md](spec.md)
Verification: verification.md (created during T-07)
Status: Approved 1 October 2026 (see Approval record); implementation in progress
Branch / base: `codex/tch-02` from main `4237c0d`
Updated: 1 October 2026, Asia/Dhaka

## Inspection and proposed approach

The code seams are recorded in the [spec baseline](spec.md#problem-and-inspected-baseline). There is no schema change, no migration and no server action: this issue only reads data.

**Domain module `src/lib/teacher-routine.ts`** (pure, tested):
- `projectTeacherRoutine({ source, teacherId, allocations, externals })` returns the following:
  - program sections;
  - tables, each with periods, an optional "Other times" column and rows of cells with spans, exact-time lines, co-teachers and audience notes;
  - the no-fixed-time and other-department lists;
  - figures and the credit-hours breakdown;
  - a flat agenda list.
- `teacherRoutineDiff(draft, published)` counts the classes that were changed, added or removed.
- It reuses the RUT-04 `effectivePlan`/`patternById` and the period alignment helpers in `official-routine-sheets.ts`. Shared span and off-grid logic is extracted rather than duplicated, and the official package's output must not change: its existing tests keep passing.
- Credit hours come from `computeWorkloads`.

**Rendering**, one projection feeding three views:
- `TeacherRoutineScreen`: the figures, the week tables, the phone agenda (CSS switch below 640 px) and the lists.
- `IndividualRoutineSheet`: an A4 portrait sheet using the official package's fonts and black-and-white rules. Print CSS uses a named page (`@page teacher-routine { size: A4 portrait }`), so the landscape official package is unaffected.
- A row-height fit step reuses the official sheets' height estimate: 12.5 mm down to 9 mm, then continue on a second page.

**Routes** (server components, `force-dynamic`, behind the portal's existing access check):
- `/my-routine`: resolves `actor.teacherId`; shows the not-linked state when there is none.
- `/teachers/[id]/routine?source=published|draft`: the screen view, with the sheet shown only in print.
- `/teachers/routines?source=`: the bulk selection page, a client form.
- `/teachers/routines/print?ids=…&source=`: sheets for the selected teachers, opening the print dialog from a button. Teacher ids are not personal data.

**Links:**
- "My routine" in navigation, shown only when the actor has a linked teacher. `navGroups` gains a `linkedTeacher` condition.
- A "Routine" action on the teacher detail page.
- "Print teacher routines" on Teachers.

Read the installed Next.js docs on routing, `searchParams` and dynamic rendering before coding.

**Review data.** `ux:review` already seeds a disposable copy. Add a linked teacher account, and an unlinked one if none exists, so `test:ux` can cover AC-06. Confirm that a publication exists in review data, or create one in the disposable copy, so both sources are exercised.

## Approval record

- Owner authorization: Approved.
- Date and evidence: 1 October 2026, in the Claude Code session. After reviewing the spec, plan and mockup renders (commit `8fa5942`), the owner replied "Approve TCH-02 with the recommendations".
- Approved scope: [spec.md](spec.md) as committed in `8fa5942`, with the recommended decisions:
  - D-1: Total Credit Hours is the Workload page total, including other-department units.
  - D-2: print and Save as PDF only; .docx is a possible follow-up.
  - D-3: no logo for now.
  - D-4: every internal user can view any teacher's routine.
  - D-5: one row per batch combination, counted once.
  - D-6: active term only.
- Material amendments: none

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [ ] T-01 — `teacher-routine` projection: sections, pattern tables, cells, lists, figures, credit hours, agenda and diff. Shared span/off-grid helpers extracted with no change to the official package. `scripts/verify-teacher-routine.ts` added to `test:domain` and `test:routine`. Covers AC-01–AC-05 and AC-10.
- [ ] T-02 — `IndividualRoutineSheet` with A4 portrait print styles, fit step, continuation page and draft box. Covers AC-08.
- [ ] T-03 — `TeacherRoutineScreen`: figures, tables, agenda, breakdown, lists, source switch and draft notice. Covers AC-05 and AC-07.
- [ ] T-04 — Routes `/my-routine` and `/teachers/[id]/routine`, plus the navigation item and links. Covers AC-06.
- [ ] T-05 — Bulk page and print route. Covers AC-09.
- [ ] T-06 — Review data (linked and unlinked accounts, publication), `ux:review`/`test:ux` routes and flows, the PDF clipping/page-count check. Covers AC-06–AC-09.
- [ ] T-07 — Verification record, screenshots (desktop, phone, print, bulk), README/brief/roadmap updates and handoff. Covers AC-11.

## Verification and delivery

- **Focused checks:** `test:routine` and `test:domain` while building the projection.
- **Final checks:** `typecheck`, `lint`, `test:domain`, `build`, `test:ux`. `test:safety` is run once to confirm it is unaffected.
- **Data safety:** review screens with `npm run ux:review` on its disposable copy only. Never run `db:*`, `dev` or `test:ui` against institutional data.
- **Commits** carry the issue ID: projection (T-01), views and routes (T-02–T-05), verification and docs (T-06–T-07). Push after each verified milestone. Merge and closure wait for owner acceptance.

## Current checkpoint / handoff

- Approved scope: see Approval record (1 October 2026, recommended D-1–D-6).
- Commits: `8fa5942` (proposal) and the approval record, on `codex/tch-02`.
- Completed tasks: none; inspection and mockups done.
- Next action: T-01, the `teacher-routine` projection and its domain test.
- Verification: mockup renders have 0 px page overflow and no clipped sheets.
- Blockers/capabilities: none for the recommended scope. The logo (D-3) and .docx (D-2) are excluded unless the owner chooses otherwise.
