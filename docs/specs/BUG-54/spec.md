# BUG-54 (RUT-04 follow-up): the official package's contacts sheet fits however many teachers are listed

Issue: [#54](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/54), "RUT-04 follow-up: official package contacts sheet clips when more or longer teacher names are listed"
Status: Approved 2 October 2026 with D-1 and D-2 as recommended (see [approval record](#approval-record)). Implemented and verified ([verification](verification.md)); owner acceptance pending.
Branch / base: `claude/cranky-hofstadter-4674b1` (the desktop app's worktree for this session) from `1cedf4c` (main after TCH-01)
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)). It follows the watch note in [TCH-01 verification](../TCH-01/verification.md#notes).

## Problem and inspected baseline

Reproduced on 2 October 2026 at `1cedf4c`, only on the disposable review copy (`npm run ux:review -- --fresh`, `.tmp/ux-review/pglite`). The placeholder codes were resolved through the real TCH-01 form (`/teachers/[id]/edit?resolve=1`), then renamed through `/teachers/[id]/edit`. The institutional `.data` directory was not opened, and `db:reset` was not run.

| Review copy | Listed teachers | `official-package.spec.ts` fit test |
| --- | --- | --- |
| Fresh Summer 2026 seed | 38 | Passes. The contacts sheet uses 152.7 of 159.5 mm. |
| AS and HUH resolved as "Synthetic Resolved Teacher … Long, Assistant Professor" | 40 | `page 5: body overflows by 11px` |
| All four placeholders resolved with short names ("Synthetic SI") | 42 | `page 5: body overflows by 5px` |
| All four resolved, AS and HUH with the long names | 42 | `page 5: body overflows by 26px` |

On screen and in print the sheet clips silently (`.official-sheet { overflow: hidden }`): the bottom of the "For any query" boxes is cut off at the footer. A clipped official document shows no warning.

### Why

1. **No fit logic on the contacts sheet.** `DirectoryAppendix` in [official-routine-package.tsx](../../../src/components/official-routine-package.tsx) always renders one sheet: Teachers, then both class-representative tables, then the query contacts. The routine sheets estimate their height in millimetres and move or split a table that does not fit ([official-routine-sheets.ts](../../../src/lib/official-routine-sheets.ts), `fitTable` and `routineSheets`). The contacts sheet has neither.
2. **Every teacher record except a placeholder is listed** ([official-routine-package.ts](../../../src/lib/official-routine-package.ts) filters only `status !== "unresolved"`). Resolving a placeholder or adding a teacher in TCH-01 adds a row. A teacher row is about 4.0 mm, so two more teachers add one row to each column.
3. **Long text wraps.** The name column (name plus designation) is about 56 mm of text at 6.9 pt, and the email column is about 39 mm. Each wrapped line adds about 2.9 mm.
4. **The columns are split by count, not height.** `Math.ceil(n / 2)` puts teachers 1 to 20 on the left. Wrapped rows all add to one column, and the grid stretches the other table's rows to match it.
5. **The fit test only catches it when the data triggers it.** No estimate is checked against the rendered contacts sheet, unlike `data-estimate-mm` on routine tables.

The expected end state already breaks the sheet: resolving the four source placeholders (SI, AS, MNI, HUH) gives 42 listed teachers, which overflows even with short names.

The course list sheet (page 4) has the same one-sheet pattern but uses 135.1 of 159.5 mm today, so it is out of scope here.

## Outcome and scope

**Outcome.** The contacts sheet is laid out from height estimates, like the routine sheets. It never clips: it tightens its rows one step when it is just over, and otherwise continues on another sheet. Every printed reference to it stays correct. The Summer 2026 data as seeded prints exactly as today.

**In scope:**

- A pure layout for the contacts appendix.
- Its rendering and print styles.
- The routine sheets' legend page reference.
- A domain verifier.
- The UX fit test.
- A review-copy option that makes a long teacher list repeatable.

**Out of scope:**

- Which teachers the package should list (for example inactive teachers, or teachers with no classes). That is an institutional question, recorded below as an open question.
- The course list sheet.
- Routine sheet layout.
- Font sizes.
- The public viewer's other actions (#32).
- The .docx export (TCH-02 D-2).

## Decisions for the owner

- **D-1, fit strategy.**
  - *Recommended:* in this order:
    1. Normal rows.
    2. Then one compact step: the same 6.9 pt type with tighter cell padding (0.45 mm to 0.2 mm top and bottom) and gaps (3.5 mm to 2.6 mm).
    3. Then continue on another sheet at normal rows.

    A list just over the limit, such as the 42-teacher case, stays on one sheet. A much longer list continues.
  - *Alternative A:* continue only. The 42-teacher case would then print a sixth sheet holding only the class representatives and query contacts.
  - *Rejected:* shrinking the type size. It would differ from the routine sheets, and 6.9 pt is already the smallest type in the package.
- **D-2, legend wording on the routine sheets.**
  - *Recommended:* "Teacher codes are listed on page 5", where the number is the first contacts sheet. This stays true when the contacts continue.
  - *Alternative:* keep "on the last page" while there is one contacts sheet, and switch to "on pages 5 to 6" only when it continues.

Mockups were rendered from the review copy with all four placeholders resolved and two long names. They are a prototype in the browser, not code. They show real seeded contacts, so like TCH-01's contact views they were reviewed and not committed:
- Today, clipped.
- D-1, compact step, one sheet.
- Alternative A, continued over two sheets.

## Behaviour (with the recommended decisions)

1. **Estimate.**
   - A new pure module estimates each part of the contacts appendix in millimetres from the print styles:
     - teacher rows, from the lines of name with designation, email and mobile at their column widths;
     - the header row;
     - section labels;
     - each class-representative table;
     - the query-contact boxes, whose lines depend on email;
     - the gaps.
   - It uses the same conservative characters-per-millimetre approach as `SHEET_MM` and checks against the same body capacity, with a safety margin.
   - The public package has no mobile or email, so it uses the same estimate with those cells empty.
2. **Balanced columns.**
   - The teacher list stays in short-code order. Column 1 holds teachers 1 to k and column 2 the rest, numbered on (SL is continuous).
   - k is chosen so the taller column is as short as possible, with column 1 never shorter than column 2.
   - Each table keeps its natural row heights: the columns align at the top and do not stretch.
3. **Fit order (D-1).**
   - If everything fits at normal rows, there is one sheet, as today.
   - Otherwise, if everything fits in compact rows, there is one sheet in compact rows.
   - Otherwise the content flows across sheets at normal rows, in this order: Teachers, then the class-representative pair, then the query contacts.
   - The class-representative pair and the query contacts each move whole to the next sheet when they do not fit.
   - The teacher list is split by rows only when it does not fit on the sheet where it starts. Each part repeats the table headers and is labelled "Teachers (continued)".
4. **Continued sheets.**
   - Every contacts sheet keeps the title "Teachers, Class Representatives and Query Contacts", the same header and the same footer.
   - With more than one contacts sheet, each adds the routine sheets' note: "Sheet i of n · continued on the next sheet" or "continued from the previous sheet".
   - Page numbers ("Page x of y") include the extra sheets.
5. **Legend (D-2).** Each routine sheet's legend names the page of the first contacts sheet.
6. **Estimates are checkable.** Each teacher table, class-representative pair and query-contact block carries `data-estimate-mm`, as routine tables do.
7. **Unchanged.**
   - The Summer 2026 seed (38 listed teachers) renders one contacts sheet at normal rows, identical to today apart from the legend text (D-2).
   - Routine sheets and the course sheet are unchanged.
   - A published snapshot is not changed. Its package is laid out again on rendering, as it is today, so a past publication whose contacts were clipped now continues instead.

## Acceptance criteria

- **AC-01** On a fresh review copy, the package has five sheets. The contacts sheet is at normal rows, and `official-package.spec.ts` passes on screen and in print.
- **AC-02** On a review copy with all four placeholders resolved and two long names (42 listed), the contacts fit one sheet in compact rows, with no clipping, overflow or element outside the frame.
- **AC-03** On a review copy with a long list (`--long-teacher-list`, at least 70 listed teachers), the contacts continue over two or more sheets:
  - nothing clips;
  - the class-representative tables and the query contacts are each whole on one sheet;
  - teacher SL numbers are continuous across columns and sheets;
  - every continued teacher part repeats its headers;
  - the "Sheet i of n" notes and "Page x of y" are correct.
- **AC-04** On every review copy above, no estimated block renders more than 1.5 mm taller than its `data-estimate-mm`, in print media.
- **AC-05** The routine sheets' legend names the page of the first contacts sheet on every review copy above.
- **AC-06** The teacher columns keep short-code order. The taller column is never more than one row taller than the most even split. Rows do not stretch to match the other column.
- **AC-07** Domain verifier, pure layout, synthetic directories:
  - 38, 42 and 130 teachers;
  - long names, designations and emails;
  - no mobile or email (public);
  - no class representatives or query contacts.

  Every sheet's estimate is within capacity, and the fit order follows D-1. No teacher, class representative or contact is lost or repeated.
- **AC-08** Black and white only, with no validation colour (the existing check), on every review copy above. On a `--publishable` copy, the public package (`/public/routine/official`) passes the same fit checks.

## Tasks

- [x] T-01: `src/lib/official-contacts-sheets.ts`. Estimates (calibrated against the measured 4.0 mm row, 2.9 mm line and 159.5 mm body), balanced columns, and the D-1 fit order. Covers AC-06 and AC-07.
- [x] T-02: `scripts/verify-official-contacts.ts`, added to `test:domain`. Covers AC-07.
- [x] T-03: Render the contacts sheets from the layout in `official-routine-package.tsx`:
  - continued notes;
  - page numbers;
  - the legend's page reference;
  - `data-estimate-mm`;
  - a compact class and top-aligned teacher columns in `globals.css`.

  Covers AC-01 to AC-06.
- [x] T-04: `npm run ux:review -- --long-teacher-list`. In the disposable review copy only, it resolves the four placeholders (two with long synthetic names) and adds synthetic teachers with long names and emails, up to at least 70 listed. This follows `--publishable`, keeps its path and target checks, and does nothing outside `.tmp/ux-review`.
- [x] T-05: Extend `official-package.spec.ts` with the estimate check for contacts blocks, the legend page check, and continued-sheet structure checks that apply when there is more than one contacts sheet. Covers AC-01 to AC-05 and AC-08.
- [x] T-06: Verification:
  - `typecheck`, `lint`, `test:domain` and `build`;
  - `test:ux` on a fresh copy;
  - `official-package.spec.ts` on the 42-teacher copy (scripted resolve), the `--long-teacher-list` copy and a `--publishable` copy (public route);
  - print screenshots of the contacts sheets with synthetic data only;
  - a verification record and a brief update.

No schema migration and no institutional data change. Every check runs against `.tmp/ux-review` or pure inputs. `db:reset` and `dev` are never run against `.data`.

## Open question (not in this scope)

- **Who the package lists.** Today every teacher record except a placeholder is printed, including inactive and on-leave teachers and teachers with no classes this term. If the department wants only teachers in the routine, or only active ones, that would shorten the list. It is an institutional choice, so it should be a separate item if wanted.

## Approval record

- Owner authorization: Approved
- Date and evidence: 2 October 2026 (Asia/Dhaka), owner's chat reply "approve as recommended"
- Approved scope: this record as written, with D-1 (normal rows, then one compact step, then continued sheets) and D-2 ("Teacher codes are listed on page N") as recommended
- Branch: kept on this session's worktree branch `claude/cranky-hofstadter-4674b1`; the owner did not ask to move it
