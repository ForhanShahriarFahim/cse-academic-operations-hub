# RUT-04 — Term time grids, teaching days and batch day exceptions

Issue: [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34)
Status: Approved 30 September 2026 (see [plan approval record](plan.md#approval-record))
Updated: 30 September 2026, Asia/Dhaka

## Problem and inspected baseline

The owner builds a new routine every semester. Period times change between semesters, and a batch can get a different day, such as an HSC batch with Friday classes. Today none of that can be changed in the portal.

Inspected on 30 September 2026 at `39a39b3` (main after UX-01):

- **Periods, teaching days and the lunch break are hard-coded** in `src/lib/constants.ts`: `HSC_SATURDAY_SLOTS`, `HSC_WEEKDAY_SLOTS`, `HSC_TUESDAY_SLOTS`, `DIPLOMA_FRIDAY_SLOTS`, `DIPLOMA_SATURDAY_SLOTS`, `LUNCH_BREAK`, `HSC_REGULAR_DAYS`, `DIPLOMA_DAYS`. `slotsFor()` and `daysForStream()` feed `projectRoutine` (`src/lib/routine-projection.ts`). That projection drives the Routine builder, the Day/Week Routine, the official print package, the public view and CSV. The builder's class panel and "Where does it fit?" also call them directly.
- **Allowed class hours already live in the database.** `permitted_windows` rows (term, stream, optional batch, day, start/end) are checked by `analyzeSchedule` in `src/lib/conflicts.ts`. A batch-specific window replaces the stream window for that batch and day, and a class on a day with no window is a blocker unless it is marked as an exception. They are edited on Decisions & settings with the `manage_policy` capability.
- **Breaks** come from `break_rules`, which is not term-scoped. Only one row exists (Diploma Friday Jumu'ah, 13:00–14:00), and it is a blocker in validation. `LUNCH_BREAK` is declared but never used.
- **Published versions** (`schedule_versions.snapshot`, schema v3) store meetings, batches and breaks, but not periods. Their grids are drawn from today's constants.
- The app works on one active term. There is no screen to create a term yet (BAT-01 #6).
- Evidence that grids change: the owner's Spring 2026 individual routine uses 75-minute HSC periods Saturday–Tuesday (09:30–15:45) and a five-period Diploma Saturday (12:00–17:00). Summer 2026 uses 60-minute HSC periods Sunday–Tuesday and a four-period Diploma Saturday.

Owner answers (30 September 2026): period sets are "not fixed, it can be any period according to the need". Any stream, day or batch may use its own periods.

## Outcome and scope

- **Outcome:** a coordinator sets, for the active term, which days each stream teaches, the periods and breaks used on each day, and any batch's own days or periods. Every routine screen, print and export follows those settings with no code change. Other terms and published versions do not change.
- **Included:**
  - Term-scoped period patterns and day plans.
  - Batch exceptions: extra day, own periods, or no classes.
  - Class hours edited alongside them.
  - Change-impact preview, with an opt-in move of classes to the matching new period.
  - Copy from another term.
  - Grouped period headers when batches on one day differ.
  - Published versions that store their grid.
  - A migration that reproduces Summer 2026 exactly.
- **Excluded:**
  - Holidays and dated calendars (CAL-01 #38).
  - One-off dated changes (RUT-05 #39).
  - Exceptions limited to a date range (use RUT-05).
  - Creating terms (BAT-01 #6).
  - Policy versioning and approval workflow (SET-01 #14).
  - Teacher/room rows in the builder (#33).
- **Dependencies:** UX-01 (#18, merged). Coordinates with BAT-01, which will call "copy grid from term" when creating a term.

## Required behavior

**B1 Period patterns.** A pattern belongs to one term and has:
- a unique name within the term;
- an ordered list of periods (start and end, to the minute);
- optional breaks (name, start and end, and a "No classes allowed" switch).

Periods must not overlap each other or a break, each must end after it starts, all must fall between 07:00 and 21:00, and a pattern needs at least one period. "Fill evenly" generates periods from a first start, a length and a count, with an optional break after period N. A pattern that is in use cannot be deleted.

**B2 Stream week.** For each stream and each day Saturday–Friday, the day is either *No classes* or uses one pattern. The day also has **class hours** (allowed class time), which default to the first period's start through the last period's end and can be edited. Class hours are stored as the existing `permitted_windows` rows, so validation keeps its current meaning.

**B3 Batch exceptions** apply to one batch on one day, with a required reason:
- **Extra day:** the stream has no classes that day, but this batch does (pattern plus class hours).
- **Own periods:** the stream teaches that day, but this batch uses another pattern and its own class hours.
- **No classes:** the stream teaches that day, but this batch does not.

**B4 Effective plan.** For a batch on a day, its exception applies if one exists; otherwise the stream's plan applies. A stream's day tabs are every day where the stream or any of its batches teaches. A day taught only through exceptions shows a batch count (for example "Fri · 1 batch") and lists only those batches.

**B5 Grids.**
- Batches that share a pattern on a day share one header row.
- Batches with a different pattern appear as a separate group with its own header row, labelled with the pattern name. This applies on screen (builder and Routine) and in print (official package and public view).
- Breaks appear as break columns.
- Classes that do not line up with a period keep today's exact-time display.
- CSV columns do not change.

**B6 Validation.**
- The existing class-hours rules are unchanged.
- A class on a batch's *No classes* day is a blocker, with the batch and day named.
- A class overlapping a break marked "No classes allowed" in that batch's pattern is a blocker, as today's Jumu'ah rule is.
- Other breaks are display only.
- The migration must not change Summer 2026's validation results.

**B7 Change impact.** Before saving a pattern, day plan or exception that affects existing classes, the preview shows:
- how many classes no longer start at a period;
- which classes would fall outside class hours or on a no-classes day.

Nothing moves unless the coordinator ticks **"Move each class to the new period in the same position"**. That option is offered only when the moved class still fits and its duration matches a period (or a run of periods). The preview lists the classes that must be placed by hand. The save, any moves and the matching class-hours update happen in one audited transaction.

**B8 Copy from another term.** This replaces the active term's patterns, day plans, exceptions and class hours with a copy from a chosen term. It needs confirmation and shows the impact preview (B7). The source term is unchanged.

**B9 History and publications.**
- Grids are stored per term, and editing the active term never changes another term.
- A new publication stores its grid inside the snapshot (schema v4) and always renders with it.
- Publications made before RUT-04 render with the legacy Summer 2026 grid, exactly as today.

**B10 Permissions and audit.**
- Every internal user may view Days & periods.
- Editing requires `manage_routine` or `manage_policy` (decision D-1). This is enforced in each server action; hidden buttons are not the guard.
- Every change records actor and before/after in an audit event.
- Records from a term that is not active are refused with the existing stale result.
- A save based on an outdated version (someone else changed the pattern) is refused with a reload message.

**B11 States.**
- Empty term: no patterns yet. Setup shows "Copy from another term" and "Create a pattern", and the routine pages link to setup.
- Inline field errors are tied to their labels. Success and failure are announced. Denied and stale results use the shared `ActionResult` contract.

**B12 Layout.** Desktop and 375 px phone widths with no page-wide overflow. Timelines and preview grids scroll inside their own region. Everything works by keyboard. Status never relies on colour alone.

**B13 Settings.** The class-hours editor on Decisions & settings is replaced by a link to Days & periods. `break_rules` and legacy constants are no longer read for terms that have a grid. They stay only as history and as the legacy grid for old publications.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | Given a populated Summer 2026 copy, after migration the builder, Day/Week Routine, official package, public view, CSV and validation issue list are identical to before. | Before/after comparison on a disposable PGlite copy: byte-equal CSV, equal issue IDs, equal projection JSON; screenshots. PostgreSQL migration via `test:safety` with `SAFE01_PG_BIN`. |
| AC-02 | When a pattern's periods change and are saved, the builder, Routine, print package and CSV use the new periods; the other term in the two-term fixture and existing publications are unchanged. | Domain/integration test on the safety fixture; browser flow. |
| AC-03 | Given an HSC-25B Friday "Extra day" exception, the HSC Friday tab appears with only HSC-25B; its classes validate against its class hours; another HSC batch's Friday class is still a blocker. | Domain tests; builder flow. |
| AC-04 | Given a batch with "Own periods" on a day, screen and print show a separate header group for that batch with its pattern's periods. | Projection test; screenshot of builder, Routine and print. |
| AC-05 | Given a "No classes" exception, that batch's classes on that day become blockers naming the batch and day; removing the exception clears them. | Domain test; builder flow. |
| AC-06 | Before saving an affecting change, the preview lists classes that no longer align and classes that would break a rule; without the move option no class changes; with it, the listed classes move in one audited transaction and are revalidated. | Integration test of the action; browser flow. |
| AC-07 | Overlapping periods, a break overlapping a period, end before start, out-of-range times, an empty pattern or a duplicate name show an error at the field and save nothing. | Domain validation tests; browser check of error association. |
| AC-08 | "Copy from another term" replaces the active grid after confirmation, and the source term's grid is unchanged. | Integration test on the two-term fixture. |
| AC-09 | A publication made after RUT-04 renders with its stored grid after the working grid changes; a v3 publication renders exactly as before. | Projection tests with v3 and v4 snapshots. |
| AC-10 | A user without either capability gets a forbidden result and nothing changes; a record of a non-active term is refused; a stale version is refused; each successful change writes an audit event with before/after. | Action tests; SAFE-01 mutation inventory updated. |
| AC-11 | Days & periods and the grouped grids work at desktop and 375 px with no page overflow, full keyboard use, labelled fields, announced results and no axe violations. | `test:ux` routes and flows; screenshots. |
| AC-12 | `typecheck`, `lint`, `test:domain`, `build`, `test:safety` (PGlite and PostgreSQL) and `test:ux` pass. | Command results in verification. |

## Decisions and sources

Mockup: [days-and-periods.html](mockups/days-and-periods.html). Renders: [desktop](mockups/renders/days-and-periods-desktop.png) and [phone](mockups/renders/days-and-periods-mobile.png), both with 0 px page overflow. Sample exceptions in the mockup are illustrative.

Owner decisions requested (recommendation first):

- **D-1 Who can edit:** routine coordinators, academic administrators and system administrators (`manage_routine` or `manage_policy`). Alternative: `manage_policy` only, as class hours are today.
- **D-2 Move option:** include the opt-in "move to the same-position period" in this issue. Alternative: preview only; moves are done in the builder.
- **D-3 Lunch:** the migration adds no lunch break, so Summer 2026 looks exactly as today; the coordinator can add one. Alternative: add a display-only lunch break to the HSC patterns.
- **D-4 No-classes days:** a class on a batch's no-classes day is a blocker (recommended), rather than a warning.

Related: [product requirements §5 RUT-01](../../PRODUCT_REQUIREMENTS.md#rut-01--weekly-hscdiploma-routine), SET-01 "Scheduling windows and breaks" (#14), [owner brainstorm](../../plans/owner-brainstorm-2026-09-30.md). Batch-specific exceptions must not become stream-wide rules ([brief](../../PROJECT_BRIEF.md)).
