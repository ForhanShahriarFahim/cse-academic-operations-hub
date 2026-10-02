# TCH-01 — Implementation plan

Issue: [#4 TCH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4)
Specification: [spec.md](spec.md)
Verification: verification.md (created during delivery)
Status: Accepted by the owner 2 October 2026; institutional database migrated to 0009
Branch / base: `codex/tch-01` from main `c2eff15`
Updated: 2 October 2026, Asia/Dhaka

## Inspection and proposed approach

The code seams are in the [spec baseline](spec.md#problem-and-inspected-baseline).

**Schema, migration `0009_teacher-records`** (forward-only):
- add `updated_at timestamptz not null default now()`;
- add `advisory_load_units numeric(3,1)` (null means the default);
- `employment_type` becomes nullable. Rows whose employment type is `vacancy` or `unresolved` get null; their status already says what they are;
- check constraints: employment type in (`full_time`, `part_time`, `guest`) or null; status in (`active`, `on_leave`, `inactive`, `vacancy`, `unresolved`); a placeholder has no employment type, and every other row has one;
- a unique index on `upper(short_code)`.

The Summer 2026 seed is updated to match. The migration is rehearsed on a populated disposable copy (PGlite and PostgreSQL) in `test:safety`. The institutional database gets a cold backup and the migration only at acceptance, as AUTH-02 did.

**Domain module `src/lib/teacher-records.ts`** (pure, tested in `test:domain`):
- normalising and validating the fields;
- the change diff, with the phone masked;
- the status transitions allowed from each state;
- placeholder rules;
- the effective limit;
- `lifecycleBlockers(teacherId, references)`, which turns reference rows into the listed blockers.

**Server actions `src/lib/teacher-actions.ts`:**
- create, update, set on leave / back, deactivate, reactivate, delete and resolve;
- each one: `guardAnyAction(["manage_teachers"])`, re-validation, the stale check on `updated_at`, and `auditedChange("teacher.*", "teacher", …)` in one transaction;
- delete and deactivate query the references inside the transaction, so a class added a moment earlier still blocks;
- the snapshot check searches published `schedule_versions.snapshot` for the code;
- revalidates `/teachers`, the teacher page, Workload and the routine pages.

**Reading:** `getTeacherReferences(id)` and `getTeacherChanges(id)` in `data.ts`. The audit query reads only entity `teacher` for that id, and only for `manage_teachers` holders.

**Pickers:** every place a teacher is chosen for new work leaves out inactive teachers: the routine workbench class panel, Courses/teaching groups, Extra load and OD. A teacher already on a record still displays.

**Limit:** `computeWorkloads` callers pass each teacher's effective limit instead of the constant.

**UI**, following the [mockups](mockups/) and the paper/ink/pine/gold language:
- `/teachers`: filters, search, the Add button, the mobile stacked rows and print.
- `/teachers/new` and `/teachers/[id]/edit`: one shared form component with labelled fields, inline errors and an error summary.
- `/teachers/[id]`: the profile panel, the action menu (Edit, Set on leave, Deactivate or Reactivate, Delete), the Changes panel and the placeholder notice.
- `/teachers/[id]/deactivate` and `/teachers/[id]/delete`: confirmation pages that list blockers. They are full pages rather than dialogs, so they work without JavaScript and on a phone.

## Approval record

- Owner authorization: Approved
- Date and evidence: 2 October 2026 (Asia/Dhaka), the owner's chat reply "approve" after reviewing the spec, plan and mockup renders. D-1 to D-4 were answered earlier the same day in the decision questions.
- Approved scope: [spec.md](spec.md), this plan and [mockups/](mockups/) as committed with this record

## Tasks

- [x] T-01: Migration 0009, schema, seed update, and the `manage_teachers` capability with its role grants. Covers AC-02, AC-08 and AC-12.
- [x] T-02: `teacher-records.ts` domain rules and their `test:domain` verifier. Covers AC-03, AC-05, AC-06 to AC-09.
- [x] T-03: Server actions with guards, stale checks, reference checks and audits. Covers AC-01 to AC-08 and AC-10.
- [x] T-04: Teachers list, form pages, teacher page, Changes list and confirmation pages, built to the mockups. Covers AC-01, AC-06 to AC-11 and AC-13.
- [x] T-05: Inactive teachers left out of pickers; per-teacher limit in Teachers, the teacher page and Workload. Covers AC-06 and AC-09.
- [x] T-06: `test:safety` group "TCH-01 teacher records" for PGlite and PostgreSQL: the migration on a populated copy, permission denials, stale edits, blockers, delete and snapshot checks, the phone never in audit or denied output. Covers AC-02 to AC-08 and AC-11 to AC-12.
- [x] T-07: UI review on desktop, phone and print (`ux:review`, `test:ux`) with screenshots; README and brief. Covers AC-13.
- [x] T-08: `typecheck`, `lint`, `test:domain`, `build`, full `test:safety` with PostgreSQL, the verification record and owner acceptance. Then the institutional cold backup and migration.

## Verification and delivery

- Focused checks during development. The final checks are the workflow set, with `test:safety` including the PostgreSQL groups.
- The UI is reviewed only on disposable data (`npm run ux:review`).
- `dev`, `start`, `test:ui` and `db:*` are never run against the institutional database.
- The migration reaches the institutional database only after acceptance and a cold backup with a SHA-256 manifest.

## Current checkpoint / handoff

- Done: accepted 2 October 2026. The institutional database was backed up (`pre-TCH-01-20261002-1437`) and migrated to 0009. Merged through PR #53.
- Follow-up suggested: the official package teacher list fits tightly with long names (see verification Notes).
