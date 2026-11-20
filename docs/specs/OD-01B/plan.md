# OD-01B — Implementation plan

[Issue #13](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/13) · Proposed · 20 November 2026, Asia/Dhaka

Branch `codex/od-01b` from local `main` at `c65e410`. [Specification](spec.md) · [Review sketches](mockups/index.html)

## Inspection and proposed approach

- Extend the existing commitment facts and OD projection. Reuse the civil-date, weekday and minute helpers in room maintenance for a shared OD overlap rule. Keep the dates with the OD row through working data and the snapshot. Use the formal meeting's existing effective dates from working data for matching. Leave meeting-to-meeting overlap rules outside this slice.
- Add selection and receipt fields to the current rollover preview and transaction. Accept old requests/receipts with no selected commitments. Include selected commitment revisions and destination room evidence in the fingerprint. Reuse the existing term context lock, row lock order and room locks. Check current permissions on the server for reads, preview and commit. Review retention of source references, including a source row removed after carry-forward.
- Compute link coverage from the current term's meetings, group facts and resources. Use the same decision wherever a link suppresses duplicate planning. Check group removal inside its transaction and use a restrictive foreign key. At publication, serialize the OD/meeting/group evidence read and snapshot write with the existing term-context lock and retain the publisher and room-maintenance checks. Keep history and lifecycle dependency reads where the portal needs raw references.
- Update the main and legacy snapshot decoders, archive and public projections, and course/cohort/room reference readers that inspect the version. Project only the fields each consumer needs. Exercise a pre-change snapshot and an older rollover receipt through their normal entry points before accepting the new format.

## Approval record

- The owner's “Go for the next” on 20 November started OD-01B inspection and specification following the recommendation for this slice.
- Owner authorization to implement D-1–D-5 is pending. Record the owner's decision and commit the approved plan before feature changes.

## Tasks

- [x] T-01 — Inspect OD-01A, the planner, formal groups, rollover, maintenance and publication consumers. Draft the specification, plan and responsive review sketches.
- [ ] T-02 — Record and commit the owner's approval or amendments to D-1–D-5.
- [ ] T-03 — Add and verify forward-only migration `0023`, with term-scoped link integrity and carry provenance. Covers AC-07.
- [ ] T-04 — Add date fields and occurrence rules across commitment actions, preview, calendar-free weekly planning and maintenance/lifecycle checks. Extend history and register. Covers AC-01–AC-02.
- [ ] T-05 — Extend preparation selection, permissions, preview fingerprint, atomic copies and receipt. Add post-activation reconfirmation on the existing Verify path. Covers AC-03–AC-04.
- [ ] T-06 — Add audited link/removal, live coverage and publication blockers, group deletion protection and duplicate suppression. Extend snapshot format, readers and routine/teacher output. Covers AC-05–AC-06.
- [ ] T-07 — Run focused checks and the final suite. Review and record compiled flows and A4 examples against AC-01–AC-08 in `verification.md`.
- [ ] T-08 — Commit the verified delivery, present it for owner inspection and record acceptance before merging into local `main`.

## Verification and delivery

Run typecheck, lint, `test:domain`, full `test:safety` with `SAFE01_PG_BIN`, and the default build. Use populated disposable PGlite and PostgreSQL fixtures for migration, rollback, race and historical evidence. Extend the SAFE-01 inventory for new writes. Use the compiled Edge review at 1440, 390 and 320 px, including a dated booking in the A4 routine and a published version from before the migration. Present `/od`, term preparation, and the frozen routine with synthetic data for review. Applying `0022` or `0023` to institutional data is a separate, backed-up, owner-approved operation. GitHub synchronization waits for the agreed delivery boundary.

## Current checkpoint and exact handoff

- **20 November — proposal ready for review.** T-01 is complete on `codex/od-01b` from `c65e410`. The owner reviews D-1–D-5 and the sketches, especially reconfirmation authority and link behavior. After explicit approval, record and commit T-02, then start T-03. No feature code or institutional data has changed.
