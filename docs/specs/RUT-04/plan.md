# RUT-04 — Implementation plan

Issue: [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34)
Specification: [spec.md](spec.md)
Verification: `verification.md` (created during implementation)
Status: Proposed, awaiting owner approval
Branch / base: `codex/rut-04` from main `39a39b3`
Updated: 30 September 2026, Asia/Dhaka

## Inspection and proposed approach

Code seams are recorded in the [spec baseline](spec.md#problem-and-inspected-baseline). Approach:

**Data (migration `0006`, forward-only).**
- `period_patterns`: `term_id`, `name` (unique per term), `periods` JSONB `[{start,end}]`, `breaks` JSONB `[{start,end,name,blocksClasses}]`, `updated_at`.
- `day_plans`: `term_id`, `stream`, nullable `batch_id`, `day_of_week`, nullable `pattern_id` (null = no classes; allowed only with a batch), `reason`, `updated_at`. Partial unique indexes enforce one row per term/stream/day for stream plans and one per term/batch/day for exceptions.
- Class hours stay in `permitted_windows`, so `analyzeSchedule`'s window rules are unchanged. Each plan save rewrites the matching window rows in the same transaction.

**Backfill.** A TypeScript step, `src/db/backfill-time-grids.ts`, runs from `migrateDatabase` after the SQL migrations. For every term with no patterns, it builds patterns and stream day plans from the legacy layout (the current constants, moved to `src/lib/time-grid/legacy.ts`) and the existing `break_rules`. It is idempotent and runs in one transaction per term, identically on PGlite and PostgreSQL. A pattern shared across days is split only if break rules differ by day. Summer 2026 gets:
- HSC Saturday, HSC Sunday–Monday, HSC Tuesday;
- Diploma Friday (with the blocking Jumu'ah break);
- Diploma Saturday.

**Domain module `src/lib/time-grid/`** (pure, tested):
- types;
- `effectivePlan(batch, day)`, `streamDays`, and `dayGroups(stream, day, batches)`;
- pattern validation;
- `breaksForValidation`;
- `analyzeGridChange` (misaligned, outside-hours and no-class-day classes, plus the same-position move plan);
- `cloneGrid`.

**Validation.** `analyzeSchedule` gains two inputs:
- breaks resolved per audience batch, replacing the term-less `break_rules`;
- `closedDays` for "No classes" exceptions.

Window checks are untouched. A regression test asserts that Summer 2026 issue IDs are identical before and after.

**Projection.** `RoutineSource` gains `timeGrid`: from the database for drafts; `snapshot.timeGrid` for v4 publications; the legacy grid for v3 and earlier. `RoutineDayProjection` changes from single `slots/breaks/rows` to `groups[]`, each with a pattern, slots, breaks and rows. `parseRoutineSelection` takes valid days from the grid. Consumers updated:
- builder grid, workbench, class panel and "Where does it fit?";
- `routine-document` (Routine and public view);
- the official package;
- auto-schedule candidates.

CSV serialization is unchanged. `buildSnapshot` writes schema v4 with `timeGrid`.

**UI.**
- New route `/routine/periods`, "Days & periods", placed under Routine in the navigation, per the [mockup](mockups/days-and-periods.html): stream tabs, the week table with timelines, batch exceptions, a pattern editor with fill-evenly, the impact preview and a grouped day preview.
- A copy-from-term dialog.
- The Settings window editor is replaced by a link.

Existing UX-01 patterns are reused: `ActionResult` feedback, confirmation dialogs and focus handling.

**Actions** (server, guarded, audited, active-term and stale checks):
- save pattern (with impact options);
- delete unused pattern;
- set stream day;
- create, update and delete exceptions;
- copy grid from term.

**Recovery.** Migration and backfill are verified on a disposable copy of the populated PGlite data and on PostgreSQL through the SAFE-01 harness. Nothing is dropped. `break_rules` and `permitted_windows` rows are kept.

## Approval record

- Owner authorization: Pending
- Date and evidence: —
- Approved scope: —
- Material amendments: —

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [ ] T-01 — Schema, migration `0006`, legacy grid module and backfill; covers AC-01. Domain test: backfilled Summer 2026 reproduces `slotsFor`/`daysForStream` exactly.
- [ ] T-02 — `time-grid` domain module: resolution, groups, validation, impact analysis, clone; covers AC-03–AC-08 logic.
- [ ] T-03 — Validation inputs (per-batch breaks, closed days) and the Summer 2026 issue-ID regression; covers AC-01, AC-03, AC-05.
- [ ] T-04 — Projection groups, grid-driven days, snapshot v4 with legacy fallback; update `verify-routine-projection`; covers AC-01, AC-04, AC-09.
- [ ] T-05 — Consumers: builder (grid, day tabs with batch counts, class panel, fits), Routine Day/Week, official package, public view, auto-schedule; covers AC-02–AC-04.
- [ ] T-06 — Server actions with guards, audit, active-term and stale checks, impact-option moves in one transaction; SAFE-01 mutation inventory update; covers AC-06, AC-08, AC-10.
- [ ] T-07 — Days & periods page, pattern editor, exception form, copy dialog, navigation item, Settings link; covers AC-06, AC-07, AC-11.
- [ ] T-08 — Safety fixture: second term with its own grid; history check that editing one term leaves the other unchanged; covers AC-02, AC-08.
- [ ] T-09 — Verification: before/after migration comparison on a populated PGlite copy, PostgreSQL via `test:safety`, `test:ux` routes and flows, desktop/phone/print screenshots, all required checks; covers AC-01, AC-11, AC-12.
- [ ] T-10 — Docs: README, requirements §5, brief, roadmap and index #16; handoff checkpoint.

## Verification and delivery

Focused checks per task (`test:domain`, `test:routine`). Final checks: `typecheck`, `lint`, `test:domain`, `build`, `test:safety` with `SAFE01_PG_BIN`, and `test:ux`. Review screens with `npm run ux:review` (disposable copy only; never `db:*`, `dev` or `test:ui` against institutional data). Read the installed Next.js docs for any routing, server-action or caching changes before coding. Commit checkpoints with the issue ID: data/domain (T-01–T-04), UI/actions (T-05–T-08), verification/docs (T-09–T-10). Push after each verified milestone. Merge and closure wait for owner acceptance.

## Current checkpoint / handoff

- Approved scope: pending owner approval of this plan and decisions D-1–D-4 in the spec.
- Commits and uncommitted changes: spec, plan and mockups on `codex/rut-04` (this commit).
- Completed tasks: none.
- Next action: owner reviews the spec, plan and mockup, and answers D-1–D-4; then record approval and start T-01.
- Verification: mockup renders at 1440 px and 390 px with 0 px page overflow.
- Blockers/capabilities: none known. PostgreSQL client tools at `F:\AI\tools\pgsql-17.11` for AC-01/AC-12.
