# BUG-32 (UX-01 B4): the public viewer offers no dead-end actions when nothing is published

Issue: [#32](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/32), "UX-01 finding (B4): public viewer offers print/CSV/package actions with nothing published"
Status: Approved 2 October 2026 with D-1 to D-3 as recommended (see [approval record](#approval-record)). Implemented and verified in the cloud session ([verification](verification.md)). Accepted by the owner and merged on 2 October 2026.
Branch / base: `claude/bug-32` from `1cedf4c` (main after TCH-01); inspected at `c2eff15`, and the public viewer files are identical at both
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)).

## Problem and inspected baseline

Inspected on 2 October 2026 at `c2eff15`, in a Claude Code cloud session, against the disposable review database (`npm run ux:review -- --fresh`, no publication). The institutional database was not opened.

- `/public/routine` ([page.tsx](../../../src/app/public/routine/page.tsx)) shows "No published routine" when `getPublicRoutineData()` returns nothing. It still renders `RoutineViewControls` ([routine-view-controls.tsx:94–104](../../../src/components/routine-view-controls.tsx)) with **Official package**, **Print / PDF** and **CSV**. Confirmed on desktop (1280 px) and mobile (390 px): all seven controls render (HSC, Diploma, Day, Week, Official package, Print / PDF, CSV).
- **CSV** opens `/public/routine/export`, which answers `404 {"error":"No published routine."}`. The visitor sees raw JSON ([export/route.ts:10](../../../src/app/public/routine/export/route.ts)).
- **Print / PDF** prints a page containing only the empty notice.
- **Official package** opens `/public/routine/official`, which says "Publish a validated routine before generating the official package." That is an instruction for staff, shown to an anonymous visitor, with no way back ([official/page.tsx:13](../../../src/app/public/routine/official/page.tsx)).
- The stream, view and batch selectors change nothing while there is no publication. With no time grid, the Day group renders as an empty bordered box beside "Batch".
- `RoutineViewControls` is used only by the public viewer, so changing it affects no internal screen.

## Outcome and scope

**Outcome.** A visitor who arrives before a routine is published sees one clear message saying the routine appears here once it is approved and published, and no control that leads nowhere. Once a version is published, the viewer behaves exactly as today.

**In scope:** the public viewer page and its controls, the empty state's wording, the official package page's empty state, and the browser checks for both states.

**Out of scope:** the CSV endpoint's 404 JSON response (a machine endpoint the existing test relies on); internal routine screens; publication itself (RUT-03, #3; GOV-01, #15).

## Decisions for the owner

- **D-1, actions while unpublished.** *Recommended:* hide Official package, Print / PDF and CSV. *Alternative:* show them disabled with the reason beside them. Disabled controls still take focus and space, and a visitor can't use them either way.
- **D-2, selectors while unpublished.** *Recommended:* hide the whole control bar (stream, view, day, batch and the actions), because none of it changes what is shown. This also removes the empty Day box. *Alternative:* keep the selectors and hide only the actions (the narrowest fix).
- **D-3, the official package page while unpublished.** *Recommended:* replace the staff instruction with the same visitor message and a "Back to viewer" link. *Alternative:* leave it, since the link to it disappears under D-1 and only a bookmarked URL reaches it.

## Behaviour (with the recommended decisions)

1. With no publication, `/public/routine` shows the header (title, department) and the empty state, and nothing else. There is no control bar.
2. The empty state reads: **No published routine**. "The department posts the class routine here once it has been reviewed and approved. Draft schedules are never shown here." It names no date, because none is known.
3. `/public/routine/official` with no publication shows the same heading and message plus a "Back to viewer" link.
4. With a publication, both pages are unchanged: controls, version badge, Official package, Print / PDF and CSV.
5. `/public/routine/export` keeps answering `404 {"error":"No published routine."}` while nothing is published.

## Acceptance criteria

- **AC-01** With no publication, the public viewer has no Official package, Print / PDF or CSV control, and no stream, view, day or batch control, on desktop and mobile widths.
- **AC-02** With no publication, the empty state states that the routine appears after review and approval, and announces no invented date.
- **AC-03** With no publication, `/public/routine/official` shows the visitor message and a working "Back to viewer" link, with no instruction meant for staff.
- **AC-04** With a publication, the viewer and package are unchanged: the existing `tests/routine-view.spec.ts` published branch passes, and the CSV still downloads as `…-vN.csv`.
- **AC-05** The UX baseline (`tests/ux/baseline.spec.ts`: accessibility scan, no page-wide mobile overflow) still passes on `/public/routine` in both states.
- **AC-06** `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build` pass.

## Tasks

- **T-01** `page.tsx`: render `RoutineViewControls` only when a publication exists; update the empty-state wording (D-1, D-2).
- **T-02** `official/page.tsx`: visitor wording and a "Back to viewer" link in the empty state (D-3).
- **T-03** Tests: in `tests/routine-view.spec.ts`, the unpublished branch asserts that the actions and selectors are absent. In `tests/ux/`, add the same assertion for the fresh review database, plus the official page's empty state.
- **T-04** Verify: the static checks (AC-06); browser checks against `ux:review -- --fresh` (unpublished) and `ux:review -- --fresh --publishable` (published); desktop and mobile screenshots before and after, saved under `docs/specs/BUG-32/screenshots/`; a verification record.

## Verification notes and limits

- Every browser check runs against the disposable review database under `.tmp/ux-review`. `npm run test:ui` (which prepares the configured database) is not run.
- In the cloud session, Playwright's expected browser build differs from the preinstalled Chromium. Screenshots use the preinstalled browser directly. If `npm run test:ux` can't launch a browser there, that result is recorded as **pending, to be run locally** rather than passed.
- Owner acceptance on the owner's machine closes the issue.

## Approval record

- 2 October 2026: the owner approved this spec and plan in the Claude Code cloud session, choosing D-1 hide the actions, D-2 hide the whole control bar, D-3 fix the official page's empty state, and a separate branch `claude/bug-32`.
