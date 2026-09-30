# UX-01 — Verification

Issue: [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md)
Status: Baseline recorded; implementation not started
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

## Acceptance results

Pending implementation. Results will map to AC-01–AC-11 here, with before/after screenshots for desktop, 390 px and A4 print.
