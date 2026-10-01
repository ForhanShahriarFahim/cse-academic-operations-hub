# RUT-04 — Implementation plan

Issue: [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34)
Specification: [spec.md](spec.md)
Verification: [verification.md](verification.md)
Status: Implemented and verified 1 October 2026; owner review returned a print redesign request (see checkpoint). Acceptance pending.
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

- Owner authorization: Approved.
- Date and evidence: 30 September 2026, in the Claude Code session. After reviewing the spec, plan and mockup renders, the owner replied "Approve RUT-04 with the recommendations".
- Approved scope: [spec.md](spec.md) as committed in `8e675df`, with the recommended decisions: D-1 editing by `manage_routine` or `manage_policy`; D-2 include the opt-in same-position move; D-3 no lunch break added by the migration; D-4 a class on a batch's no-classes day is a blocker.
- Material amendments: **Amendment B (official print redesign), approved.** 1 October 2026, in the Claude Code session: after reviewing the mockup renders in [mockups/renders](mockups/renders/) (commits `5f654c1`, `f647cef`, `dfb913d`), the owner replied "Yes perfect go ahead". Scope: rebuild `/routine/official` and `/public/routine/official` to match [official-package.html](mockups/official-package.html) as described in the checkpoint below. That means black and white only; HSC on as many sheets as needed (two for Summer 2026) and Diploma on one; sheets filled by height without splitting a day table unless one table cannot fit a sheet; a batch on its own periods shown as one row with each time above its classes and a thin rule under the time; multi-period classes merged; no signature line; no source-review note in print; serif/condensed-sans fonts. Data, validation, CSV and the screen Routine views are unchanged.

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [x] T-01 — Schema, migration `0006`, legacy grid module and backfill; covers AC-01. Domain test: backfilled Summer 2026 reproduces `slotsFor`/`daysForStream` exactly.
- [x] T-02 — `time-grid` domain module: resolution, groups, validation, impact analysis, clone; covers AC-03–AC-08 logic.
- [x] T-03 — Validation inputs (per-batch breaks, closed days) and the Summer 2026 issue-ID regression; covers AC-01, AC-03, AC-05.
- [x] T-04 — Projection groups, grid-driven days, snapshot v4 with legacy fallback; update `verify-routine-projection`; covers AC-01, AC-04, AC-09.
- [x] T-05 — Consumers: builder (grid, day tabs with batch counts, class panel, fits), Routine Day/Week, official package, public view, auto-schedule; covers AC-02–AC-04.
- [x] T-06 — Server actions with guards, audit, active-term and stale checks, impact-option moves in one transaction; SAFE-01 mutation inventory update; covers AC-06, AC-08, AC-10.
- [x] T-07 — Days & periods page, pattern editor, exception form, copy dialog, navigation item, Settings link; covers AC-06, AC-07, AC-11.
- [x] T-08 — Safety fixture: second term with its own grid; history check that editing one term leaves the other unchanged; covers AC-02, AC-08.
- [x] T-09 — Verification: before/after migration comparison on a populated PGlite copy, PostgreSQL via `test:safety`, `test:ux` routes and flows, desktop/phone/print screenshots, all required checks; covers AC-01, AC-11, AC-12.
- [x] T-10 — Docs: README, requirements §5, brief, roadmap and index #16; handoff checkpoint.
- [ ] T-11 — Amendment B: pure sheet layout module (table cells with merged spans, own-period rows, height estimate, sheet filling) with domain tests.
- [ ] T-12 — Amendment B: official package component, styles, fonts and A4 named page; remove validation colour.
- [ ] T-13 — Amendment B: verification (fit check on screen and print, `test:ux`, AC-01 parity, required checks), screenshots and handoff.

## Verification and delivery

Focused checks per task (`test:domain`, `test:routine`). Final checks: `typecheck`, `lint`, `test:domain`, `build`, `test:safety` with `SAFE01_PG_BIN`, and `test:ux`. Review screens with `npm run ux:review` (disposable copy only; never `db:*`, `dev` or `test:ui` against institutional data). Read the installed Next.js docs for any routing, server-action or caching changes before coding. Commit checkpoints with the issue ID: data/domain (T-01–T-04), UI/actions (T-05–T-08), verification/docs (T-09–T-10). Push after each verified milestone. Merge and closure wait for owner acceptance.

## Current checkpoint / handoff

- Approved scope: see Approval record (30 September 2026, recommended D-1–D-4).
- Commits: `8e675df` (proposal), `49d8e58` (approval), `c11940e` (T-01–T-05 data, validation, projections), `a11f4f8` (T-05–T-08 page, actions, checks), plus the verification/docs commit. All pushed to `codex/rut-04`.
- Completed tasks: T-01–T-10.
- Implementation notes beyond the plan text: the backfill is a one-time conversion (it runs only while no term has patterns), so a future term starts empty and is set up or copied; the official HSC print page continues extra groups and extra days on a following sheet; the old class-window editor and its two actions were removed from Settings.
- Verification: all AC pass; see [verification](verification.md). AC-01 byte parity used the Summer 2026 source dataset (not the institutional database); AC-09 is verified at domain level.
- **Owner review, 1 October 2026: not accepted yet.** The owner is "not happy" with the official routine package (`/routine/official`, `src/components/official-routine-package.tsx`, `.official-*` styles in `src/app/globals.css`) and asked for a redesign before accepting RUT-04:
  1. **Red marks here and there:** blocker cells are tinted pink (`official-cell-blocker`) and booking rows are orange. An official printout should not carry validation colour; keep status out of print, or at most a subtle marker on drafts only.
  2. **Pages 1–2 look poor:** the top of the HSC sheet (header block, very small 5–6 px type, crowded tables) and the new "(continued)" sheet need a better, more readable design. See [official-package.pdf](screenshots/official-package.pdf) and [official-hsc-page.png](screenshots/official-hsc-page.png) for the version the owner rejected.
  3. **Content overlaps the border:** tables run into or past the page border and footer (fixed A4 height with `overflow: hidden` and proportional rows).
- **Next action (agreed workflow):** design mockups first (as in UX-01: static HTML under `docs/specs/RUT-04/mockups/`, rendered desktop and A4 print to PNG/PDF, 0 overflow, no clipping), show them to the owner and get approval; then implement, keeping screen, print and CSV agreeing and Summer 2026 data unchanged; re-run `test:ux`, the print checks and the AC-01 parity; then ask for acceptance. Treat this as amendment B of RUT-04 (print redesign), recorded here when approved. Useful reference: the owner's A4 portrait individual-routine template (black-and-white, clear bold headers, grey header cells, day cells merged down, course and room per cell), as summarised in #35.
- **Amendment B mockups, 1 October 2026 (awaiting owner approval):** [official-package.html](mockups/official-package.html) with made-up data (owner's choice; no institutional names or contacts), renders in [mockups/renders](mockups/renders/) (`official-page-1..5.png`, `draft-page-1.png`, `official-package.pdf`). The owner set the frame: one weekly routine for HSC and one for Diploma, and HSC may run onto a second sheet. Proposed design:
  - A4 landscape, black and white only (black rules, grey header and day cells); no validation colour anywhere. Drafts say "DRAFT: NOT OFFICIAL" in the header box and footer, plus a faint grey watermark.
  - Readable type: 7.4 pt cells and 8 pt batch/day labels, up from about 4–5 pt. Two days per sheet: HSC = 2 sheets (Sat–Sun, Mon–Tue), Diploma = 1 sheet; each says "Sheet x of y" and whether it continues.
  - Sheets are filled by measured height; a day table is never split. A batch on its own periods for a day (the lab-block case) gets one row in that day's table with each time written in, instead of a separate "(continued)" sheet.
  - Multi-period classes are merged cells; breaks are a grey column; OD bookings are a plain italic row; the minutes caption row is removed.
  - Courses: four year columns (1st/2nd semester stacked). Contacts: teachers in two tables with separate Mobile and Email columns, class representatives per program, three query boxes. No source-review note in print.
  - A fit check (body overflow, cells outside the frame, clipped text) passes on all 5 pages on screen and in print.
  - Owner feedback, 1 October 2026: the lab-block row now shows each time above its classes (not beside them), with a thin rule under the time; the "Head, Department of CSE" signature line is dropped; the serif/condensed-sans type pairing is accepted. Overall design approval is still pending.
- Blockers/capabilities: none.
