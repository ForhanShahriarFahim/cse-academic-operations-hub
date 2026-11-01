# ROM-01C — Verification and review

[Specification](spec.md), [sole plan](plan.md), [sketches](mockups/index.html). Updated: 1 November 2026, Asia/Dhaka. Checks span 29–30 October; acceptance recorded 1 November.
Branch `codex/rom-01c`, base `cbdbce9`; proposal `15ab147`, owner approval `3d4361a` before implementation `c33e6ad`, corrections `49a50f2`. Owner accepted on 1 November: “accepted and go for the next task.” Acceptance covers the disclosed default-build failure; local merge authorized. **AC-11 remains partial: the default build fails.** Historical test results below are unchanged; no build-policy change or new passing default build is claimed.

## Acceptance evidence

| Criteria | Result | Evidence |
| --- | --- | --- |
| AC-01/03/04 | Focused action/adapter checks pass | Global/CSE/other-department roles, anonymous/future/expired grants, duplicate/File input, all-term canonical/physical/uncertain OD impact, changed-evidence confirmation, stale/no-op/cancel, irreversible retention and audit rollback |
| AC-02/06/08 | Domain and applicable browser checks pass | Civil year/leap/pre-epoch/large-range and independent day oracle; half-open overlap/effective bounds; typed OD-only evidence; date/weekly unions, fully closed denominator, retained invalid date input and no exception bypass |
| AC-05/07 | Focused PostgreSQL production-action races pass | Real audit and row-lock barriers in both commit orders for manual create/update/move, OD, automatic/bulk apply, publication/create/edit/cancel and first-maintenance/delete; rejected writes preserve prior rows/versions |
| AC-09 | Production browser and native A4 checks pass | Seventeen desktop/390/320 browser/axe capture checks without page-wide overflow, WCAG A/AA violations or page errors; keyboard/pending/validation/stale/denied/impact/list/history states; two six-page A4 exports, fresh and after interaction, with matching projections and repeated context/counters; every continued page rendered and visually inspected |
| AC-10 | Both adapters pass populated upgrade and recovery | Empty 0012 relation, preserved two-term business/snapshot fingerprints, direct invalid-write constraints, pre-upgrade cold/encrypted backup and exact separate-target restore |
| AC-11 | **Partial; owner-accepted delivery exception on 1 November** | Final typecheck/lint/domain and separately labeled Webpack build pass. All 23 safety groups pass across preserved/resumed runs. Required default Turbopack build fails in the previously recorded CSS-worker process/IPC path; acceptance does not turn this into a passing check |

[Production capture gallery](../../../output/playwright/ROM-01C/implementation/index.html), [browser results and frozen projection hashes](../../../output/playwright/ROM-01C/implementation/review.json), [23-group safety results](../../../output/playwright/ROM-01C/implementation/safety-results.json), [native print/raster comparison](../../../output/playwright/ROM-01C/implementation/print-review.json), [six-page A4 after interaction](../../../output/playwright/ROM-01C/implementation/selected-date-after-interaction.pdf), [fresh-page A4](../../../output/playwright/ROM-01C/implementation/selected-date-fresh.pdf), [rendered page overview](../../../output/playwright/ROM-01C/implementation/print-contact-sheet.png). Automated accessibility results are bounded checks, not a complete accessibility certification. The synthetic stress fixture intentionally has duplicate/overlapping bookings and a missing stream-window warning; it is not institutional data or a publication-ready routine.

## Implementation checkpoint

The installed Next.js server-action, revalidation and async page/search-parameter guides were read before app changes. Pure internal date context is assembled alongside the same raw meeting rows; public MeetingView and schema-4 snapshots are unchanged. All inspected exposed placement writers use fresh maintenance under the existing complete sorted parent-room lock union. No exposed term-date or meeting-effective-date editor was found; no new one was added. Publication validates its actual frozen candidate, fresh term/effective/OD context and closures under parent locks, and records only maintenance IDs/revisions/cancellation state in its private audit. General publication/version races remain BUG-25.

Final `ROM-01C` PGlite/PostgreSQL checks pass, including 44 real production-action commit-order cases (36 assignment, six publication and two first-use/deletion). All 23 named safety groups pass; the result index records the successful phase for each. The first full run stopped at a new-constraint schema fingerprint mismatch; its passing groups were preserved, and recovery plus the remaining groups were explicitly resumed. Corrections retain the full assertions: explicit reason comparisons deparse identically through PostgreSQL dump/restore; the pre-0007 fixture excludes only columns introduced by 0012, while current catalog checks include them; the migration journal's own sequence is allowed to advance while business sequences are preserved; confirmed disposable resets explicitly include maintenance without CASCADE and preserve portal access. No test was run against institutional storage.

Default `npm run build` and pinned-synthetic default-build retries fail with `globals.css → creating new process → node process exited before we could connect` inside/outside the sandbox on Node 22.11.0; a diagnostic with the already installed bundled Node 24.22.1 has the same failure. The separately labeled final `next build --webpack` succeeds with the normal build lifecycle flag and pinned synthetic environment. No package, bundler, runtime configuration or build-script policy was changed. The default build is not passed and no previous delivery exception carries over.

Browser review corrected two product findings: explicit Tab/Shift-Tab boundaries keep cancellation focus within its controls, and successful cancellation keeps its form mounted during revalidation so success feedback/navigation can complete. Cancelled records remain read-only for edits. Final create/edit/cancel, stale-input and reader/editor-denial flows pass. Browser helpers use the installed Playwright library/headless Edge because the CLI package is absent from the local/offline cache; no dependency or Playwright test spec was added. Helpers remain ignored under `.tmp`.

Native A4 was exported both after changing basis/filters in the live page and from a fresh URL. Both contain six pages with identical content apart from allowed generation time, repeated room/term/date/basis/filter/Dhaka/warning context and page counts. All pages were rendered with Poppler and inspected, including direct header crops to resolve image-preview ambiguity; no clipped text or overlapping header was found. Public screen/official text and CSV hashes are unchanged after create/edit/cancel; all four pages of each of four public official-print exports have identical rendered pixel hashes. The database/action suites separately prove frozen snapshot JSON remains unchanged. PDF creation metadata is not treated as frozen routine data.

## Owner inspection

Use the host-local safe review commands in the [sole plan](plan.md#current-checkpoint--handoff), or inspect the versioned capture gallery. The running preview is owned disposable PostgreSQL on loopback, with synthetic access cookies supplied through an ignored local helper. No institutional migration/rollout or remote synchronization occurred.

The [final running-preview smoke](../../../output/playwright/ROM-01C/implementation/owner-preview-smoke.json) checks the synthetic sign-in redirect, selected-date figures, Tab/Shift-Tab/Escape behavior and absence of the operational reason from the public page on the final Webpack build. It changes no records.

1. Open `MAINT-REVIEW` → Maintenance. Inspect the confirmed synthetic outage, then correct or cancel it with a correction reason; existing bookings remain and history records the change.
2. Open occupancy and choose date `2026-06-13`: recorded booking union 180 min, common 420, maintenance 90, available 330, booked within available 90, booked during maintenance 90 and utilization 27%. Configuration uncertainty remains explicitly visible. Weekly basis retains its original denominator.
3. Review `MAINT-INACTIVE` through the All/inactive room filter for 25 retained cancelled entries and paged change history. Public routine/CSV/official print retain their frozen publication.

**Accepted on 1 November with the disclosed default-build exception.** The owner authorized local merge and next-task inspection/specification. Parent #5 stays open; institutional operations and remote synchronization remain outside scope.

## Planning checks (proposal `15ab147`; historical design evidence)

Planning QA: four static pages at 1440, 390 and 320px (12 combinations). Final capture checks have no page-wide overflow, unlabeled controls, script errors, external network requests or axe WCAG A/AA violations. The skip link moves keyboard focus to main. Seven local-only interactions cover required impact acknowledgement, pending/disabled, announced success, stale input preservation, review focus, all-day controls and cancellation feedback. These simulate workflow states; they do not exercise production server actions.

Evidence: [capture gallery](../../../output/playwright/ROM-01C/index.html), [render/interaction results](../../../output/playwright/ROM-01C/render-review.json), [document/link results](../../../output/playwright/ROM-01C/document-review.json), [A4 print design PDF](../../../output/playwright/ROM-01C/date-occupancy-print.pdf), [page 1](../../../output/playwright/ROM-01C/date-occupancy-print-1.png), [page 2](../../../output/playwright/ROM-01C/date-occupancy-print-2.png). The separate ReportLab print design was rendered with Poppler and both pages visually inspected: repeated room/term/date/basis/filter/generated-Dhaka context, page counters, intact rows and readable warnings. Raster header crops were also compared directly to confirm visible repeated text, alongside extracted text. Desktop form, phone maintenance and narrow date-view captures were visually inspected. The figures are coherent synthetic examples: booking union 180 min; common 420; maintenance 90; available 330; booked-within-available 120; booked-during-maintenance 60; utilization rounded to 36%.

Local link/anchor, required-section, sole-checklist/approval-state and diff checks pass. The final document-review JSON gives exact counts. [Print-design checks](../../../output/playwright/ROM-01C/print-design-review.json) record A4 dimensions, repeated context/counters and identical visible-header raster hashes. Playwright's CLI package was unavailable locally; the installed Playwright library drove headless Edge as an ad hoc capture helper, without adding a test spec or dependency. Helpers are ignored under `.tmp`.

No institutional data access/migration, application server, code suite or remote operation was performed for this documentation-only checkpoint. A loopback static preview serves only this synthetic proposal/captures. B verification remains in its own accepted record; it is not C feature evidence. Native print QA covers this two-page sketch, not a future production stress fixture; long-content production continuation remains AC-09.

Print boundary: the sketch's A4 action opens a separate, explicitly composed two-page PDF. It illustrates the intended print layout and does not prototype production's dynamic browser pagination. Future production AC-09 must exercise actual browser print after interaction as well as fresh-page and long-content continuation. Static PDF evidence does not waive that requirement. An apparent missing-header difference in the image preview was not conclusive: direct raster header crops match on both final pages. No browser defect or repair is established by this planning exercise.

## Review findings

| Finding | Correction | Reverification |
| --- | --- | --- |
| Skip link scrolled but did not move keyboard focus | Main target is programmatically focusable | All 12 page/viewport combinations move focus to main |
| Image preview alone made repeated context ambiguous | Separate print-design artifact; extracted text plus direct raster-header comparison and visual review | Both final A4 pages contain the same visible context; dynamic production continuation remains AC-09 |
| Delivery-plan pointer still mixed C title with B branch/approval | Current C links/base and pending approval separated from completed B receipt | Local links and approval-state checks pass |

The planning findings above describe proposal `15ab147`, before approval. Implementation results are recorded at the top of this file; document/sketch review is not adapter, permission, race or production evidence.

## Delivery and acceptance

- B accepted and merged locally at `850f42a`; merge receipt `cbdbce9`.
- C branch: `codex/rom-01c`; planning authorized by the owner's 29 October request.
- C implementation approved without amendment on 29 October at `3d4361a`; feature accepted on 1 November with the disclosed default-build exception. Local merge authorized; receipt follows in the sole plan.
- Parent #5 remains open. GitHub synchronization deferred; last remote reconciliation 26 October 2026.
