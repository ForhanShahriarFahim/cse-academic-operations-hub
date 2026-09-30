# UX-01 amendment A — Routine builder workbench

Issue: [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)
Status: Implemented and verified 30 September 2026; owner review pending. Approved 30 September 2026. The owner approved R1–R9 including `updateMeetingAction`, pulled L2 (drag and drop) into this amendment, and left L1 and L3–L6 for a separate issue.
Requested: 30 September 2026. The owner asked for the Routine builder to be redesigned and made easy to manage before the UX-01 PR and merge.
Updated: 30 September 2026, Asia/Dhaka

This material amendment changes UX-01's approved scope. The [spec](spec.md) excluded a builder grid redesign and all server-action changes. If approved, it is delivered on `codex/ux-01` before the PR, and its approval is recorded in the [plan](plan.md#approval-record).

## Inspected baseline, 30 September 2026

Reviewed on the disposable review server with the Summer 2026 source data (HSC Saturday day view and the add/edit dialogs). Code: `src/components/routine-builder.tsx`, `src/app/(portal)/routine/page.tsx` and `src/lib/actions.ts`.

- **Clashes are invisible where they happen.** The toolbar says "13 blockers", but no class in the grid is marked. For example, CSE-3200 in NB-407 clashes with CE's booking of NB-407 at 1:00 PM and looks identical to a clean class. The conflict engine already returns `meetingIds` for every issue, so the grid can mark them.
- **You cannot change a class's teacher or room.** The edit dialog only moves or retimes a class, or deletes it. `src/lib/actions.ts` has create, move and delete actions but no update, so changing a teacher means deleting the class and adding it again.
- **Adding a class means choosing blind.** The dialog lists all 42 teachers and every room as checkboxes, with no search and no sign of who or what is free at that time. Clashes appear only after "Validate & schedule".
- **Dialogs are not accessible.** The custom modal has no Esc handling, no focus trap and no `aria-modal`. Results appear in a toast that disappears after 4 seconds and is not announced to screen readers.
- **Space goes to the wrong things.** Three bands of controls push the grid about 430 px down the page. An always-empty "Custom time" column takes 110 px. A 150-minute class shows as a card plus a dashed "continues" ghost card instead of spanning its two columns. Each batch shows "? st." when its size is unknown.
- **Needs-attention chips are hard to act on.** Clicking one opens the add dialog in the first slot of the first batch, whether or not that time is free.
- **Explanations are written for developers.** Banners and the legend include source-review notes such as the "blue source label… treated as a class-time exception" and "Coloured dots preserve source highlights — meaning is unconfirmed".
- **Editing is day-only and desktop-only.** Week view is a read-only document, and on a phone the grid can only be scrolled sideways.

## Proposed design

Mockups: [routine-builder.html](mockups/routine-builder.html). Renders: [desktop](mockups/renders/routine-builder-desktop.png) and [phone](mockups/renders/routine-builder-mobile.png). Both show 0 px page overflow and no axe violations.

- **One-line toolbar.**
  - Controls: stream, day tabs showing each day's clash count, find (course, teacher or room), and a week summary.
  - Print, CSV, the official package and the public view move into a "Print & export" menu and a link.
  - "Auto-schedule gaps" becomes "Suggest placements".
- **Grid and side panel instead of pop-ups.**
  - Selecting a class opens it in a panel beside the grid. At narrower widths the panel slides over the grid.
  - On a phone it becomes a full-screen sheet.
  - Esc closes it and focus returns to the class you came from.
- **Clashes on the grid.**
  - A class with a blocking clash gets a clay edge and the word "Clash"; a class with a warning gets "Check".
  - Selecting a class outlines every other class or booking that shares its teacher or room.
  - The panel explains the clash in plain words and says what would fix it.
- **Edit everything in one place.** Day, start, end, teachers, rooms and the exception note can all be edited, then saved with one validated and audited change.
- **Pickers that show availability.**
  - Teachers and rooms use searchable pickers. Each option is labelled Free, In use (and by which class), Other department booking, or Check size.
  - Only labs are offered for sessional classes.
  - Before you save, the panel runs the same conflict engine in the browser: "With NB-506 this class has no clashes". The server still checks again and stays authoritative.
- **Needs-attention queue.**
  - A panel tab lists groups not yet placed and today's clashes, each with Show.
  - For an unplaced group, "Where does it fit?" highlights the cells where its batches, a teacher and a suitable room are all free.
- **Truthful grid.**
  - Classes spanning several slots span their columns, and exact times appear on the card whenever they differ from the column.
  - The empty "Custom time" column goes.
  - Unknown batch sizes are simply not shown.
- **Undo.** The result notice after a save, move or delete offers "Undo", which reverses that change through the same validated actions.
- **Phone.** An agenda by batch for the chosen day, with clash counts, and "Add a class" per batch. Editing uses the full-screen sheet.
- **Quieter explanations.**
  - Day-specific notes, such as the HSC Friday exception, sit in a short plain-language line.
  - Source-review notes move to Decisions & settings.
  - Source highlight colours stay in the data but are hidden from cards.

Unchanged: the placement rules, the conflict engine's rules, the week document, print and export output, the official package, and every permission.

## Recommendations

**Recommended for this amendment:** R1–R9, the design above:
- R1: the toolbar and the side panel.
- R2: clashes and related classes marked on the grid.
- R3: full editing through one new server action.
- R4: pickers that show availability, with a live pre-check.
- R5: the needs-attention queue and "Where does it fit?".
- R6: truthful spans.
- R7: undo.
- R8: the phone agenda.
- R9: plain notes.

**Owner decision, 30 September 2026:** L2 is included in this amendment (see RB-11 and T-20). L1 and L3–L6 go to a separate follow-up issue, [#33](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/33).

**Recommended as a later, separate issue.** Each is valuable, but together they would double this amendment:

| ID | Feature | Why later |
|---|---|---|
| L1 | Teacher and room rows ("show every teacher's Saturday") | Needs a new projection for all 42 teachers and every room. The availability pickers (R4) answer "who is free?" in the meantime. |
| L2 | Drag and drop to move a class, with a keyboard "Move to…" alternative | Needs careful pointer and keyboard design, and the side panel covers moving in the meantime. |
| L3 | Copy a day or batch pattern to another day; move several classes at once | Needs a validation preview for batches of changes. |
| L4 | "What changed since the published version" before publishing | Belongs with the Publications workflow. |
| L5 | Arrow-key grid navigation and keyboard shortcuts | Better designed together with L2. |
| L6 | Warning when another coordinator changed the same class first | Needs a version or `updatedAt` check on classes (a schema change). The actions already refuse missing classes. |

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| RB-01 | Every class involved in a blocker shows "Clash", matching Validation's issues for that day, and the "Show warnings" toggle adds "Check" to classes with warnings. Day tabs show each day's clash count. | Compare with `analyzeSchedule` output on the review data; screenshot |
| RB-02 | Selecting a class opens the side panel and outlines classes or bookings that share its teacher or room. Esc closes the panel and returns focus to the class. | UX check flow + keyboard review |
| RB-03 | Day, times, teachers, rooms and the exception note can be changed and saved as one change. A change that would create a blocker is refused and nothing is saved. Success and refusal are both announced next to the form. | Server-action tests (allowed, blocked, permission denied, outside active term, audit written) + UI flow |
| RB-04 | Teacher and room pickers are searchable and label each option Free, In use (with the class) or Other department booking for the chosen day and time. Sessional classes are offered labs only. The pre-check result matches the server's decision. | Engine parity check on sample edits + UI flow |
| RB-05 | Needs attention lists unplaced groups and the day's clashes. "Where does it fit?" highlights only cells where the group's batches, a teacher and a suitable room are free, and placing it there raises no blocker. | Flow on the review data |
| RB-06 | Multi-slot classes span their columns, the custom-time column is gone, and every class still appears exactly once per batch row. | Projection check + screenshot |
| RB-07 | Undo reverses the last save, move or delete, and is refused with an explanation if it would now create a blocker. | UI flow on the review data |
| RB-08 | At 390 px the builder shows the agenda with 0 px page overflow; add and edit work through the full-screen sheet. | `test:ux` + phone screenshots |
| RB-09 | No axe WCAG 2 A/AA violations on `/routine` at desktop and phone widths. The side panel, sheet and pickers follow the dialog and combobox patterns. | `test:ux` + keyboard review |
| RB-11 | A class can be dragged to another cell of the same day and batch row (or to another day tab) and is saved through the same validated move. Invalid drops are refused with the reason, and the class stays where it was. A keyboard and screen-reader alternative, "Move to…" in the side panel, does the same. | UI flow with pointer and keyboard |
| RB-10 | The week document, print and CSV/export output, and the official package match their state before the amendment. | Print and export comparison before and after |

**Change to UX-01 AC-11:** the amendment adds one server action, `updateMeetingAction`. It is guarded by `manage_routine`, checks the active term, validates with `analyzeSchedule` like create and move, and is recorded with `auditedChange`. There are no schema or migration changes.

## Tasks, if approved

- [x] T-11 — `updateMeetingAction` in `src/lib/actions.ts`, plus verification: allowed, blocked by a clash, denied without permission, refused outside the active term, and audited (RB-03).
- [x] T-12 — Builder state and layout: one-line toolbar, day tabs with counts, grid plus side panel (docked or overlay) replacing the custom modals, Esc and focus handling, "Print & export" menu (RB-02, RB-09).
- [x] T-13 — Grid rendering: column spans, removal of the custom-time column, exact-time labels, clash and check markers from issue `meetingIds`, related-class outlines (RB-01, RB-02, RB-06).
- [x] T-14 — Class editor in the panel: fields, availability pickers (combobox), live pre-check with `analyzeSchedule`, save through create or update, delete through the existing dialog (RB-03, RB-04).
- [x] T-15 — Needs-attention tab and "Where does it fit?" highlighting (RB-05).
- [x] T-16 — Undo for save, move and delete via the existing validated actions (RB-07).
- [x] T-17 — Phone agenda and full-screen sheet (RB-08).
- [x] T-18 — Plain notes and legend; move source-review notes to Decisions & settings (RB-09).
- [x] T-20 — Drag and drop: drag a class card onto a cell (or a day tab) to move it through `moveMeetingAction`, with a live drop preview (fits / clash reason) and a "Move to…" keyboard alternative in the panel (RB-11).
- [x] T-19 — Verification: `test:ux` routes and a builder flow, print/export comparison, typecheck, lint, domain tests, build, safety suite, screenshots, owner review (RB-01–RB-11).

## Implementation notes, 30 September 2026

- Warnings are hidden on cards by default, with a "Show warnings" toggle. With 184 warnings (mostly unknown batch sizes) marked on almost every card, the real clashes were lost; RB-01 is worded accordingly.
- A room whose seat count is not recorded counts as free for a class whose size is also unknown, with a "Seats not recorded" note. It becomes "Check" only when the class size is known.
- Undo is offered for edits, moves and deletes. Undo that would reintroduce a blocking clash is refused with the server's reason, for example undoing a fix to a class that had an existing clash. A newly added class is removed with Delete.
- New files: `src/lib/routine-workbench.ts` (pure helpers) and `src/components/routine-workbench/`. `src/components/routine-builder.tsx` was removed.
