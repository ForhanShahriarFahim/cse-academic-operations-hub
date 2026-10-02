# BUG-32: Verification

Issue: [#32](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/32). Records: [spec, plan and approval](spec.md).
Verified: 2 October 2026, Asia/Dhaka, on branch `claude/bug-32` (base `1cedf4c`), in a Claude Code cloud session: Linux, Node 22.22.0, the preinstalled Chromium.
Status: **Verified in the cloud session. Accepted by the owner on 2 October 2026** ("merge #55 and #58", in the cloud session) and merged through PR #55. The local Edge run was not reported as done before acceptance. It passed afterwards on the owner's machine (see [Local checks after merge](#local-checks-after-merge)).

## What changed

- **[page.tsx](../../../src/app/public/routine/page.tsx)** renders the control bar (stream, view, day, batch, Official package, Print / PDF, CSV) only when a publication exists (D-1, D-2). Without one, the header shows only the title, and the empty state says the routine is posted once reviewed and approved.
- **[official/page.tsx](../../../src/app/public/routine/official/page.tsx)** shows the same visitor message and a "Back to viewer" link instead of the staff instruction (D-3).
- **[routine-view.spec.ts](../../../tests/routine-view.spec.ts)** checks the new wording and that the controls are absent when unpublished and present when published.
- **[public-viewer.spec.ts](../../../tests/ux/public-viewer.spec.ts)** (new, part of `npm run test:ux`) checks the same anonymously at 1366 px and 390 px, plus the official page's empty state and its link.
- The CSV endpoint is unchanged and still answers `404 {"error":"No published routine."}` with no publication.

## How it was checked

Every browser check ran against the disposable review server (`npm run ux:review`, data under `.tmp/ux-review`): first with `--fresh` (no publication), then with `--fresh --publishable` (publication v2, 183 classes). The configured or institutional database was never opened, and `npm run test:ui` was not run.

Playwright's expected browser build is not installed in the cloud container. The browser checks therefore ran through a temporary, uncommitted config that only added `launchOptions.executablePath` for the preinstalled Chromium to `playwright.ux.config.ts`. `tests/routine-view.spec.ts` ran through the same kind of temporary config, pointed at the review server instead of starting `npm run dev`.

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | Unpublished, at 1366 px and 390 px: no control bar, no Official package, Print / PDF, CSV, Stream group or Batch selector (`public-viewer.spec.ts`, `routine-view.spec.ts`). Screenshots below. |
| AC-02 | Pass | The empty state reads "The department posts the class routine here once it has been reviewed and approved. Draft schedules are never shown here." No date is shown. |
| AC-03 | Pass | Unpublished `/public/routine/official` shows the visitor message, no "Publish a validated routine" text, and "Back to viewer" returns to `/public/routine`. |
| AC-04 | Pass | Published: the control bar and all three actions are visible, `routine-view.spec.ts` passes all 3 tests (CSV downloads as `…-v2.csv` containing `PUBLISHED`), and `official-package.spec.ts` passes. |
| AC-05 | Pass | `tests/ux/baseline.spec.ts` for `/public/routine` and `/public/routine?view=week` (axe WCAG 2 A/AA at desktop and phone, no overflow at 360, 390 and 768 px): 4 of 4 pass in each state. |
| AC-06 | Pass | `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build` pass. |

## Screenshots

| State | Viewer, desktop | Viewer, phone | Official page |
| --- | --- | --- | --- |
| Before, unpublished | [desktop](screenshots/before-unpublished-viewer-desktop.png) | [phone](screenshots/before-unpublished-viewer-mobile.png) | — |
| After, unpublished | [desktop](screenshots/after-unpublished-viewer-desktop.png) | [phone](screenshots/after-unpublished-viewer-mobile.png) | [desktop](screenshots/after-unpublished-official-desktop.png) |
| After, published | [desktop](screenshots/after-published-viewer-desktop.png) | [phone](screenshots/after-published-viewer-mobile.png) | [desktop](screenshots/after-published-official-desktop.png) |

## Local checks after merge

Run on 2 October 2026, Asia/Dhaka, on `main` at `34ef847`, on the owner's machine: Windows 11, Node 22.11.0, Microsoft Edge 154.0.4258.48, Playwright 1.63.0. These runs used the repository's own `playwright.ux.config.ts`, with no temporary config.

- **Unpublished (`npm run ux:review -- --fresh`):** the full UX suite gave 96 passed and 2 skipped (two tests that need a publication). This includes all of `public-viewer.spec.ts` and the `/public/routine` baseline checks.
- **Published (`npm run ux:review -- --fresh --publishable`):** `public-viewer.spec.ts`, `official-package.spec.ts` and `teacher-routine.spec.ts` gave 9 passed and 1 skipped (the test for the unpublished state).
- Earlier attempts of both runs failed only because the review server was not ready yet (the first compile takes about 2 minutes on this drive). Both were rerun after the server answered.
- `tests/routine-view.spec.ts` was not run locally: it runs under `npm run test:ui`, which prepares the configured database.
- **Institutional database:** no migration and no data change, so nothing needs applying. `/public/routine` on the real database shows the new empty state until RUT-03 (#3) publishes a routine.
