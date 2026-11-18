# CRS-01D — Inspection and verification

18 November 2026 (Asia/Dhaka). [Specification](spec.md) · [Plan](plan.md)

## Inspected baseline

- Clean local `main` at `75f204e`; CRS-01C was accepted and merged at `2cb4ce4`. Last remote reconciliation recorded in the project brief was 11 November.
- Read the existing term-scoped group and offering actions/stores, start-offerings route, role gating, source notes and seed shape. Source cohort status is present-day metadata; the term placement provides the historical matching slot. Some imported groups have outside audiences or a reconciliation flag and need explicit treatment.
- Read the installed Next.js Server Functions guide for direct-action authorization and post-mutation refresh. The project’s class-group form already has the input-retention approach.
- The Courses & offerings completeness report can display “UT” for an unscheduled group with a recorded teacher. The Class groups page already shows the recorded teacher. This report issue remains tracked in [CRS-01C verification](../CRS-01C/verification.md).

## Proposal checks

- Local document links and heading anchors, the decision and criterion IDs, and the sketch's local link and label targets passed.
- Playwright with local Edge opened the static sketch at 1440, 390 and 320 pixels. The layout used two columns on desktop and one at both phone widths, with no horizontal overflow. The two group choices started unchecked and Apply was disabled. Tab reached the source selector and first group, and Space toggled the choice. The browser launched successfully with a temporary profile outside the shell sandbox after the sandboxed launch exited.

## Acceptance and delivery

AC-01–AC-08 are pending approved implementation. The sketch uses illustrative terms, courses, cohorts and teachers. Verification here covers the proposal only.

Owner implementation approval, delivery acceptance and local merge are pending. Parent #7 remains open. The planning branch has local documentation only.
