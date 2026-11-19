# ATT-05 — Implementation plan

[Issue #12](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/12) · Approved · 19 November 2026, Asia/Dhaka

Branch `codex/att-05` from local `main` at `7179605`. [Specification](spec.md) · [Review sketches](mockups/index.html) · [Verification](verification.md)

## Approval record

The owner's “Start ATT-05” on 19 November started inspection and specification. On 19 November the owner replied “Approve D-1–D-6” to the specification at `f30a440`. This authorizes implementation and verification of D-1–D-6 unchanged.

## Tasks

- [x] T-01 — Inspect the attendance workspace, ATT-04 marks loader, schema, lifecycle and roster outputs. Draft D-1–D-6 and review sketches.
- [x] T-02 — Record and commit the owner's specification approval and any amendments.
- [x] T-03 — Add a database-free projection module covering session rows, counts, percentage, summary, filters and matrix cells. Add domain oracle tests and register them in `test:domain`. Covers AC-01–AC-03.
- [x] T-04 — Add the authorized loader, reusing ATT-04's term binding and group access. Use fixed-count queries and the roster rule with removed-student labelling. Covers AC-03, AC-05 and AC-07.
- [x] T-05 — Build the ledger page with tabs, the filter form, the summary, the responsive Sessions table, the scrollable matrix and entry links from the workspace and completed term. Covers AC-01, AC-02 and AC-06.
- [x] T-06 — Add the CSV export route and A4 print page that render the same projection. Covers AC-02 and AC-04.
- [x] T-07 — Verify with both-adapter fixtures for roles, forgery, two terms, deactivation and export parity. Recheck ATT-03A, ATT-04 and SET-01B regressions. Run typecheck, lint, domain, safety and the guarded build, then the compiled Edge review at 1440/390/320 px plus A4 print. Record the results in `verification.md`. Covers AC-01–AC-07.
- [ ] T-08 — Present the delivery, record owner acceptance and merge into local `main`.

## Verification and delivery

No migration is expected, so the institutional database is untouched. Use disposable PGlite and PostgreSQL fixtures only (`SAFE01_PG_BIN` for the PostgreSQL adapter). The default Turbopack CSS worker failure remains a known limitation, and the Webpack build is the accepted fallback. GitHub synchronization waits for an owner-directed boundary, and #12 closes only after the whole issue is accepted.

## Current checkpoint and exact handoff

D-1–D-6 are implemented at `358825e` and verified, with review fixes at `c1c3fe3` and `1806aab`. Typecheck, lint, domain, the default build, both-adapter ATT-05/ATT-04/ATT-03A/SET-01B/BUG-ATT-MARKS groups and compiled Edge/A4 passed. The full safety suite stops at a pre-existing BUG-29 failure that also occurs on `main`. [Verification and owner review](verification.md)

> Next: the owner inspects the delivery through the review launcher. After actual acceptance (T-08), record it and merge `codex/att-05` into local `main`. The BUG-29 inventory failure is separate work. GitHub synchronization waits for an owner-directed boundary.
