# BUG-54 verification: the official package's contacts sheet fits however many teachers are listed

Issue: [#54](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/54)
Spec and plan: [spec.md](spec.md), approved 2 October 2026 with D-1 and D-2 as recommended
Branch: `claude/cranky-hofstadter-4674b1` from `1cedf4c`
Verified: 2 October 2026, Asia/Dhaka.
Accepted: 2 October 2026, owner's chat reply "accepted, merge and close #54".

Every check ran on the disposable review copy (`.tmp/ux-review/pglite`) or on pure inputs. `.data` does not exist in this worktree and was never opened. `db:reset` was never run. `next dev` ran only through `npm run ux:review` on the review copy. No schema change and no migration.

## What changed

- **Layout.** New pure module [official-contacts-sheets.ts](../../../src/lib/official-contacts-sheets.ts).
  - It estimates teacher rows, class-representative tables and query-contact boxes in millimetres.
  - It balances the two teacher columns by height, keeping code order.
  - It applies D-1: normal rows, then one compact step, then continued sheets at normal rows.
- **Rendering.** [official-routine-package.tsx](../../../src/components/official-routine-package.tsx) renders one sheet per contacts layout sheet, with:
  - the routine sheets' "Sheet i of n" note;
  - `data-estimate-mm` on each block;
  - "Teachers (continued)" on later teacher parts;
  - the legend's page reference (D-2): "Teacher codes are listed on page N".
- **Print styles.** [globals.css](../../../src/app/globals.css) adds top-aligned teacher columns (no stretched rows) and the compact step (`.official-compact`: 0.2 mm cell padding, 2.6 mm gaps, same 6.9 pt type).
- **Review option.** `npm run ux:review -- --long-teacher-list` ([ux-review.ts](../../../scripts/ux-review.ts), [README](../../../README.md)). In the review copy only, it:
  - resolves the four placeholder codes, two with long names;
  - adds synthetic teachers until 72 are listed.

  It runs before `--publishable`, so the published package is stressed too.
- **Checks.**
  - Domain verifier [verify-official-contacts.ts](../../../scripts/verify-official-contacts.ts), in `test:domain` and therefore also `test:routine`.
  - [official-package.spec.ts](../../../tests/ux/official-package.spec.ts) checks the draft and public packages:
    - fit, routine estimates and colour, as before;
    - contacts estimates;
    - the legend page;
    - "Page x of y";
    - continued notes and labels;
    - each class-representative table printed once;
    - query contacts not split;
    - continuous SL numbers;
    - repeated headers.

## Calibration

Measured in print media on the review copy:

- A single-line row is 4.03 mm and a two-line row 6.9 mm, so the line is 2.87 mm.
- The contacts body is 159.5 mm; the capacity used is 157 mm.
- A 53-character name with designation fits one line of 55.4 mm, and 56 to 58 characters wrap. Names are therefore estimated at 0.9 characters per mm.
- Emails are known to fit 31 characters in 38.7 mm, so they are estimated at 0.8 characters per mm.

| Copy | Contacts sheets | Largest estimate error (real − estimate) |
| --- | --- | --- |
| Fresh seed, 38 listed | 1, normal rows | −0.02 mm (column 1 is 2.9 mm over-estimated: AMAR's 53-character name is counted as two lines) |
| Four placeholders resolved through the TCH-01 form, two long names, 42 listed | 1, compact rows | +0.06 mm |
| `--fresh --long-teacher-list --publishable`, 72 listed, draft and public | 2, normal rows | +0.03 mm |

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | Fresh copy: five sheets, one contacts sheet at normal rows (not `official-compact`), columns 19/19 as before. `npm run test:ux` on a fresh copy: **93 passed, 2 skipped**. The skips are TCH-02's published state and the new published-package test, which need a `--publishable` copy. |
| AC-02 | Pass | Fresh copy, then SI, AS, MNI and HUH resolved through `/teachers/[id]/edit?resolve=1`, AS and HUH with "Synthetic Resolved Teacher … Long, Assistant Professor". Before the fix this overflowed by 26 px. Now there is one contacts sheet, compact, with no overflow, and `official-package.spec.ts` passes. [Screenshot](screenshots/resolved-42-compact-page-5.png). |
| AC-03 | Pass | 72 listed (`--long-teacher-list`). The contacts take pages 5 and 6 (6 sheets in all), with SL 1 to 64 on page 5 and 65 to 72 on page 6. "Teachers (continued)" repeats the headers. Both class-representative tables and the query contacts are whole on page 6. The notes read "Sheet 1 of 2 · continued on the next sheet" and "Sheet 2 of 2 · continued from the previous sheet", and every sheet shows "Page x of 6". Screenshots: [draft p5](screenshots/long-72-draft-page-5.png), [draft p6](screenshots/long-72-draft-page-6.png). |
| AC-04 | Pass | `contactsProblems` in the UX spec: no contacts block is more than 1.5 mm over its estimate in print on any copy above. See the calibration table. |
| AC-05 | Pass | Every routine sheet reads "Teacher codes are listed on page 5." on all three copies, checked by the UX spec. [Page 1](screenshots/long-72-draft-page-1.png). |
| AC-06 | Pass | Domain: columns keep order, the first column is never the shorter, and the difference is at most one row. UX: `.official-teacher-columns` is top-aligned, and on the 72 copy the columns are 34 and 30 rows by height. |
| AC-07 | Pass | `verify-official-contacts.ts` covers 38 (normal, 19/19), 42 with long names (compact), 72 and 130 (continued; 130 splits the teacher list), public with no mobile or email and no representatives or query contacts, and no teachers. Every sheet is within capacity, and no one is lost or repeated. |
| AC-08 | Pass | The black-and-white check passes in both package tests. On the `--publishable` 72 copy, `/public/routine/official` passes the same fit and contacts checks (two contacts sheets, no teacher or representative phones or emails). Screenshots: [public p5](screenshots/long-72-public-page-5.png), [public p6](screenshots/long-72-public-page-6.png). |

## Required checks

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run test:domain`: pass. All eleven verifiers pass, including the new contacts verifier.
- `npm run build`: pass. The generated change to `next-env.d.ts` was reverted.
- `npm run test:ux`, fresh copy: 93 passed, 2 skipped (see AC-01).
- `official-package.spec.ts`:
  - 42-teacher copy: 1 passed, 1 skipped (nothing published).
  - `--long-teacher-list --publishable`: both passed, and `teacher-routine.spec.ts` passed on the same copy (6 passed, 1 skipped: the unpublished state).
- `npm run test:safety`: **not run.** BUG-54 changes no server action, permission, schema or database target logic. `--long-teacher-list` writes only through the review harness's existing target check, and `verify-ux-review` passed inside `test:ux`.

## Screenshots

[screenshots/](screenshots/) are print-media captures. Every real name, mobile and email on the contacts sheets was replaced in the browser before capture: random letters of the same length, every digit zeroed, emails randomized. Codes, designations and synthetic rows are unchanged. The layout was verified on the unmasked data by the tests above.

## Notes

- **Public query contacts show a bare "Mobile".** `publicMetadata` sets their phone to `""`, so each box prints "Mobile" with no number. This predates BUG-54 and is not changed here.
- **Who the package lists** remains an open institutional question (see [spec](spec.md#open-question-not-in-this-scope)).
- **Hard stops can break the review copy.** Stopping the review server hard can leave the disposable PGlite copy unreadable. The harness says so, and `--fresh` rebuilds it. It happened once during this work and only affects `.tmp/ux-review`.
- **Branch.** The work is on this session's worktree branch, not a `claude/bug-54` branch in the main checkout. The owner did not ask to move it.
