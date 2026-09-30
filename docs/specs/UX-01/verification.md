# UX-01 — Verification

Issue: [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md)
Status: Implementation verified; owner visual review and acceptance pending
Updated: 30 September 2026, Asia/Dhaka

## Baseline, 30 September 2026

Environment:
- Branch `codex/ux-01` at `2d3ca21`.
- `next dev` on port 3100 against a disposable copy of the local PGlite data in `.tmp/ux-01/pglite`. The configured database under `.data/` was not opened.
- A synthetic `system_administrator` reviewer session was seeded only in that copy, with owner authorization on 30 September 2026.
- Microsoft Edge (Playwright) at 1366×850 and 390×844.
- axe-core with the WCAG 2 A/AA rule sets.

Screenshots stay local in `.tmp/ux-01/shots/` because internal pages show staff contact details. They are not committed.

| Route | 390 px page overflow (px) | axe `color-contrast` nodes | Other axe violations |
|---|---:|---:|---|
| `/` (dashboard) | 56 | 14 | scrollable-region-focusable 1 |
| `/routine` (day) | 106 | 19 | — |
| `/routine?view=week` | 106 | 52 | — |
| `/attendance` | 30 | 17 | — |
| `/extra-load` | 126 | 23 | — |
| `/conflicts` | 23 | 33 | scrollable-region-focusable 1 |
| `/teachers` | 0* | 31 | — |
| `/workload` | 5 | 44 | — |
| `/rooms` | 26 | 52 | — |
| `/batches` | 280 | 14 | — |
| `/courses` | 36 | 310 | — |
| `/od` | 40 | 16 | — |
| `/publications` | 266 | 14 | — |
| `/settings` | 96 | 25 | — |
| `/access` | 50 | 4 | select-name 2 (critical) |
| `/routine/official` | 9 | 31 | — |
| `/public/routine` | 0 | 0 | — |

\* `/teachers` does not overflow, but its content is compressed into the roughly 160 px beside the fixed sidebar and is unusable.

Other baseline observations:
- Printing internal pages includes app actions, and ledgers have no print heading, date or version.
- There are no route loading, error or not-found states.
- Seven `confirm()` calls remain; the specification lists them.

## Proposal mockups

Static HTML mockups in [mockups/](mockups/) use the proposed tokens. Measured with the same tooling: page overflow is 0 at 390 px, and axe finds no WCAG 2 A/AA violations on either mockup.

| View | Render |
|---|---|
| Dashboard, desktop | [dashboard-desktop.png](mockups/renders/dashboard-desktop.png) |
| Dashboard, 390 px | [dashboard-mobile.png](mockups/renders/dashboard-mobile.png) |
| Navigation drawer, 390 px | [dashboard-mobile-nav.png](mockups/renders/dashboard-mobile-nav.png) |
| Workload ledger, desktop | [workload-desktop.png](mockups/renders/workload-desktop.png) |
| Workload ledger, 390 px | [workload-mobile.png](mockups/renders/workload-mobile.png) |
| Workload ledger, A4 print | [workload-print.png](mockups/renders/workload-print.png) |

## Acceptance results, 30 September 2026

Environment:
- Branch `codex/ux-01`.
- `npm run ux:review` on port 3100: a disposable PGlite database under `.tmp/ux-review`, freshly seeded from the source fixture, with the synthetic `system_administrator` reviewer.
- Microsoft Edge (Playwright) and axe-core 4.13.0.
- The configured database under `.data/` was not opened. Its files are unmodified since the plan commit, and `test:safety` reports the default directory "never opened".

| AC | Result | Evidence |
|---|---|---|
| AC-01 | **Pass** | `npm run test:ux`: 0 px page overflow at 360/390/768 px on all 16 internal and 2 public routes. |
| AC-02 | **Pass** | `test:ux` drawer flow: Enter opens it, focus moves inside, Esc closes it and returns focus to the menu button, and following a link closes it. The page behind is `inert` while the drawer is open. |
| AC-03 | **Pass (automated)**; full manual keyboard walk-through pending owner review | The skip link is the first tab stop and focuses `main`. A global pine `:focus-visible` ring is in place. All scroll regions are focusable, and axe reports no `scrollable-region-focusable`. |
| AC-04 | **Pass** with two recorded deferrals | axe WCAG 2 A/AA at 1366 and 390 px: 0 violations on 17 of 18 routes (baseline: every internal route failed, up to 310 contrast nodes). Deferrals: People & access `select-name` (#31); the official routine package keeps the institutional template's 5–6 px grey print captions (27 nodes). |
| AC-05 | **Pass** | `StatusText` (icon + word) on the Dashboard, Workload, Teachers and Validation screens. Badges are sentence case, wrap instead of truncating, and use AA tints. Workload over the advisory limit is a gold warning; blockers are clay. |
| AC-06 | **Pass** | `test:ux` finds no `confirm(` in `src/`. Manual flow on External commitments: the dialog names the item and consequence; Cancel has initial focus; Esc and Cancel leave the rows unchanged; focus returns to the trigger; confirming removed the commitment. The other six call sites use the same `useConfirm` dialog (code review); they were not exercised one by one. |
| AC-07 | **Partial** | Loading state renders in the shell. An unknown teacher (`/teachers/999999`) shows the portal not-found page inside the shell. An unknown URL returns 404 with the root not-found page. The error boundary follows the Next 16 `error.js` contract (`retry`), but **no live error was forced**, so it remains unexercised. |
| AC-08 | **Pass** | A4-width print renders of Workload, Teachers, Validation, Rooms and Courses show the print heading (institution, page, term, draft/published state, print time), with no buttons, navigation or notices and no clipped headings. The official package and department top sheet print with no visible controls; their template CSS is unchanged (only the screen-only toolbar class changed). |
| AC-09 | **Pass** | All page headers rewritten; no eyebrow kickers and no `spec §` references remain in `src/`. The dashboard and Publications page state "not published" truthfully when no version exists (fixes #30). |
| AC-10 | **Pass** | `scripts/verify-ux-review.ts` (run first by `test:ux`) verifies that the tool refuses `DATABASE_URL`, `.data`, the configured `PGLITE_DATA_DIR`, paths outside `.tmp/ux-review` and overlapping copy sources, and that it pins the child environment. |
| AC-11 | **Pass** | `git diff main` changes nothing under `src/db`, `drizzle`, `src/lib/actions.ts`, `src/lib/conflicts.ts`, `src/lib/workload.ts` or `src/lib/auth`. `src/lib/data.ts` gains one read-only helper for the shell. Checks: `typecheck` ✔, `lint` ✔, `test:domain` ✔, `build` ✔, `test:safety` ✔ (including the PostgreSQL group), `test:ux` 39/39 ✔. |

After renders (synthetic reviewer; teacher codes only):
- [Dashboard, desktop](after/dashboard-desktop.png) and [390 px](after/dashboard-mobile.png)
- [Workload, desktop](after/workload-desktop.png), [390 px](after/workload-mobile.png) and [A4 print](after/workload-print.png)

Renders of screens with staff names or contacts stay local in `.tmp/ux-01/`.

## Findings recorded for follow-up

These are outside UX-01's approved scope and were not fixed here:
- Conflict detail sentences from the validation engine still contain developer phrasing, for example "Room-only OD entries block the room, not an invented teacher." That text lives in `src/lib/conflicts.ts`, a domain module.
- `OdRowActions` (and similar row actions) ignore the returned `ActionResult`, so a refused change would fail silently. Apply the `Notice` pattern in the owning issue, as ATT-02 (#9) does for attendance.
- The forbidden page keeps its old styling until AUTH-01 (#1) reviews permission-aware states.
