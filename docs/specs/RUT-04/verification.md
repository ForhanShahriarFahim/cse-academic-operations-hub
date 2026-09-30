# RUT-04 — Verification

Issue: [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md)
Status: Implementation verified; owner acceptance pending
Updated: 1 October 2026, Asia/Dhaka

## Environment

- Branch `codex/rut-04` from main `39a39b3`. Implementation commits `c11940e` (data, validation, projections) and `a11f4f8` (page, actions, checks), plus the verification/docs commit.
- Databases: disposable PGlite only (`.tmp/ux-review`, SAFE-01 owned runs, and scratch parity copies outside the repository), and a disposable PostgreSQL 17.11 cluster from `SAFE01_PG_BIN`. The configured database under `.data/` was never opened; the safety suite confirms its metadata is unchanged.
- Browser: Microsoft Edge (Playwright channel `msedge`) and the Claude desktop browser pane, against `npm run ux:review` on port 3100.

## Acceptance results, 1 October 2026

| ID | Result | Evidence |
|---|---|---|
| AC-01 | **Pass** on the Summer 2026 source dataset (PGlite). **PostgreSQL:** migration and backfill pass in the SAFE-01 PostgreSQL group; the byte-level comparison was run on PGlite only. | The pre-RUT-04 code (`39a39b3`, exported to scratch) seeded a scratch database and produced 147 outputs: every HSC/Diploma Day and Week projection for all batches and each batch, every CSV, the official package, and all 197 validation issues with their IDs. A cold copy was migrated by the new code (backfill: "Term grids created for 1 existing term") and produced the same 147 outputs, **0 differing**. Re-run on the final code: 0 differing; a second migration is a no-op. The institutional database was not used, so edits made in it after the source import are not covered. |
| AC-02 | **Pass** | SAFE-01 T-03 grid section (PGlite and PostgreSQL): a Spring pattern edit changes Spring only; the Summer history fingerprint (including its patterns, day plans, class hours and snapshot) is unchanged. Browser: after editing HSC Sunday–Monday to 75-minute periods, the builder, Day/Week, official package and CSV used the new periods. |
| AC-03 | **Pass** | `verify-time-grid.ts` (extra Friday for HSC-25B allowed within its hours; another HSC batch on Friday is still `outside_permitted_window`). UX flow: the Friday tab appears marked `*`, only HSC-25B is listed, with the note "Friday is an extra teaching day for HSC-25B only"; removing the exception removes the day. |
| AC-04 | **Pass** | Projection test (two groups on Tuesday, stream pattern first). UX flow: separate "UX lab block" and "HSC Tuesday" grid regions. Print: [official package PDF](screenshots/official-package.pdf) page 1 keeps Saturday–Tuesday; the Lab block group and the Friday extra day continue on page 2. |
| AC-05 | **Pass** | `verify-time-grid.ts`: a class on a "No classes" day is a blocker naming the batch and day ("HSC-23B has no classes on Monday"); an approved exception makes it a warning; removing the plan clears it. |
| AC-06 | **Pass** | Browser: editing HSC Sunday–Monday to 9:30/75-minute periods previewed "46 classes no longer start at a period", 15 would fall outside class hours, and 46 can move; ticking the move shows that it fixes the 15. Saved with the move: classes moved in one audited transaction, and the builder showed the resulting clashes. The number-of-periods-changed case shows no move option (UX flow and domain test). SAFE-01 T-03: the save with moves is audited. |
| AC-07 | **Pass** | Domain tests (empty name, duplicate name ignoring case, no periods, end before start, outside 7 AM–9 PM, overlapping periods, break over a period, unnamed break). UX flow: errors appear on the name and period fields with `aria-invalid` and `aria-describedby`, and nothing is saved. |
| AC-08 | **Pass** | SAFE-01 T-03 (PGlite and PostgreSQL): copying from Summer replaces Spring's patterns and day plans with Summer's, writes a `time_grid.copy` audit, and leaves Summer unchanged; a copy with a stale pattern count is refused. |
| AC-09 | **Pass (domain)** | New publications write snapshot schema 4 with `timeGrid` (`verify-routine-projection.ts`); schema 4 snapshots keep their grid when normalized, malformed grids are rejected, and v3 snapshots fall back to the legacy layout, which the parity run shows equals the old rendering. Not exercised as a live publish-then-edit browser flow, because Summer 2026 has 13 blockers and cannot be published. |
| AC-10 | **Pass** | SAFE-01 T-03: a teacher is denied (`permission`), a stale edit is refused (`stale/changed`), and neither changes anything; the three id-based grid actions refuse Summer rows while Spring is active (`stale/not_active_term`), within the 13 cross-term actions. Mutation inventory rows 33–37 added and rows 9–10 retired. |
| AC-11 | **Pass** | `test:ux`: `/routine/periods` has no page-wide overflow at 360, 390 and 768 px and no axe WCAG 2 A/AA violations at desktop and phone widths. Flows: keyboard opening moves focus to the editor heading, Cancel returns focus to the Edit button, and results are announced and focused. |
| AC-12 | **Pass** | See command results below. |

## Commands (final code)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, no warnings |
| `npm run test:domain` | pass, including the new `verify-time-grid.ts` |
| `npm run build` | pass; `/routine/periods` built |
| `SAFE01_PG_BIN=… npm run test:safety` | pass: T-01, T-02, T-03 (with the new grid section), T-04, T-06 PostgreSQL |
| `npm run test:ux` | 55 passed on a fresh review database (baseline including `/routine/periods`, builder flows RB-01–RB-11, 5 Days & periods flows); after the final print change, the affected 10 re-run and passed |

## Screenshots

- [Days & periods, desktop](screenshots/days-periods-desktop.png) and [with exceptions](screenshots/days-periods-with-exceptions.png), [phone](screenshots/days-periods-phone.png) (0 px overflow)
- [Pattern editor with change preview](screenshots/pattern-editor-impact.png)
- [Builder: Tuesday with a separate period group](screenshots/builder-tuesday-groups.png), [Friday extra day](screenshots/builder-friday-extra-day.png)
- [Official package, HSC page](screenshots/official-hsc-page.png) and [A4 PDF](screenshots/official-package.pdf)

The sample exceptions in these screenshots were created on the disposable review database and removed afterwards.

## Findings fixed during verification

- The print package assumed four equal HSC tables; with extra groups the tables overlapped. It now keeps each day's main table on the first sheet (unchanged for Summer 2026) and continues extras on a content-sized sheet.
- Field errors sat inside their `<label>`, so they became part of the field's name. They are now separate and linked with `aria-describedby`.
- Focus did not return to the Edit button after Cancel when the pattern list was re-created, and did not move to the result message after saving. Both fixed.
- The backfill would have given a future term the Summer layout on every restart; it is now a one-time conversion.
- Two SAFE-01 recovery assertions hard-coded six migrations; they now read the migration journal.

## Pending and limits

- The byte-level parity (AC-01) used the Summer 2026 source dataset, not the institutional database, which was not opened. Before merging to production data, run `npm run ux:review -- --from-copy <cold copy>` on a stopped copy to review the owner's real data.
- A live publish-then-edit check of AC-09 waits until a routine can be published (RUT-03).
- Changing a whole period pattern can create teacher or room clashes when classes move; they are reported by validation, not prevented.
