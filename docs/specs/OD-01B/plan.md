# OD-01B — Implementation plan

[Issue #13](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/13) · Approved · 20 November 2026, Asia/Dhaka

Branch `codex/od-01b` from local `main` at `c65e410`. [Specification](spec.md) · [Review sketches](mockups/index.html) · [Verification](verification.md)

## Inspection and proposed approach

- Extend the existing commitment facts and OD projection. Reuse the civil-date, weekday and minute helpers in room maintenance for a shared OD overlap rule. Keep the dates with the OD row through working data and the snapshot. Use the formal meeting's existing effective dates from working data for matching. Leave meeting-to-meeting overlap rules outside this slice.
- Add selection and receipt fields to the current rollover preview and transaction. Accept old requests/receipts with no selected commitments. Include selected commitment revisions and destination room evidence in the fingerprint. Reuse the existing term context lock, row lock order and room locks. Check current permissions on the server for reads, preview and commit. Review retention of source references, including a source row removed after carry-forward.
- Compute link coverage from the current term's meetings, group facts and resources. Use the same decision wherever a link suppresses duplicate planning. Check group removal inside its transaction and use a restrictive foreign key. At publication, serialize the OD/meeting/group evidence read and snapshot write with the existing term-context lock and retain the publisher and room-maintenance checks. Keep history and lifecycle dependency reads where the portal needs raw references.
- Update the main and legacy snapshot decoders, archive and public projections, and course/cohort/room reference readers that inspect the version. Project only the fields each consumer needs. Exercise a pre-change snapshot and an older rollover receipt through their normal entry points before accepting the new format.

## Approval record

- The owner's “Go for the next” on 20 November started OD-01B inspection and specification following the recommendation for this slice.
- The owner replied “Approved.” on 20 November to the request to approve D-1–D-5 in proposal `2fb9aa6`. This authorizes implementation and verification of those decisions unchanged.

## Tasks

- [x] T-01 — Inspect OD-01A, the planner, formal groups, rollover, maintenance and publication consumers. Draft the specification, plan and responsive review sketches.
- [x] T-02 — Record and commit the owner's approval of D-1–D-5.
- [x] T-03 — Add and verify forward-only migration `0023`, with term-scoped link integrity and carry provenance. Covers AC-07.
- [x] T-04 — Add date fields and occurrence rules across commitment actions, preview, calendar-free weekly planning and maintenance/lifecycle checks. Extend history and register. Covers AC-01–AC-02.
- [x] T-05 — Extend preparation selection, permissions, preview fingerprint, atomic copies and receipt. Add post-activation reconfirmation on the existing Verify path. Covers AC-03–AC-04.
- [x] T-06 — Add audited link/removal, live coverage and publication blockers, group deletion protection and duplicate suppression. Extend snapshot format, readers and routine/teacher output. Covers AC-05–AC-06.
- [x] T-07 — Run focused checks and the final suite. Review and record compiled flows and A4 examples against AC-01–AC-08 in `verification.md`.
- [x] T-08 — Commit the verified delivery, present it for owner inspection and record acceptance before merging into local `main`. On 20 November 2026 the owner replied "Accept and merge" in the Claude Code session to delivery `9e0e43d`. This authorizes the local merge into `main`. It does not authorize applying `0022` or `0023` to the institutional database.

## Verification and delivery

Run typecheck, lint, `test:domain`, full `test:safety` with `SAFE01_PG_BIN`, and the default build. Use populated disposable PGlite and PostgreSQL fixtures for migration, rollback, race and historical evidence. Extend the SAFE-01 inventory for new writes. Use the compiled Edge review at 1440, 390 and 320 px, including a dated booking in the A4 routine and a published version from before the migration. Present `/od`, term preparation, and the frozen routine with synthetic data for review. Applying `0022` or `0023` to institutional data is a separate, backed-up, owner-approved operation. GitHub synchronization waits for the agreed delivery boundary.

## Current checkpoint and exact handoff

- **20 November — delivered for owner inspection.** T-07 passed: typecheck, lint, domain tests, all 62 safety groups on both adapters, the default build, and the compiled Edge commitments flows, A4 print and schema-4 historical publication ([verification](verification.md)). Two test-only corrections are recorded there. Next (T-08): the owner inspects `/od`, term preparation and the routine print, then accepts. After acceptance, record it and merge `codex/od-01b` into local `main`. `0022`/`0023` stay unapplied to institutional data.
