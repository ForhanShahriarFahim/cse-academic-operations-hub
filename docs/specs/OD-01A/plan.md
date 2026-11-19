# OD-01A — Implementation plan

[Issue #13](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/13) · Approved · 19 November 2026, Asia/Dhaka

Branch `codex/od-01a` from local `main` at `d0e5980`. [Specification](spec.md) · [Review sketches](mockups/index.html)

## Approval record

The owner's “Start OD-01 inspection and specification” on 19 November started this work. On 19 November the owner replied “Approve D-1–D-7” to the specification at `4d237d5`. This authorizes implementation and verification of D-1–D-7 unchanged, including the OD-01A / OD-01B split. OD-01B is not authorized.

## Tasks

- [x] T-01 — Inspect the schema, `/od` page and form, server actions, conflict engine, routine and teacher projections, publication validator, room checks and seed data. Draft D-1–D-7 and the review sketches.
- [x] T-02 — Record and commit the owner's specification approval and any amendments.
- [ ] T-03 — Add migration `0022` and the schema fields (D-7). Run populated PGlite-copy and PostgreSQL migration fixtures. Covers AC-09.
- [ ] T-04 — Add database-free rules: choice validation, the completeness level, planning facts, the shared overlap/impact function and the register projection and filters. Add domain tests and register them in `test:domain`. Covers AC-01–AC-04.
- [ ] T-05 — Replace the create action and add edit, verify-with-note, return to pending, resolve, archive, reactivate and the relabelled delete. Each is audited and checks the revision, permission and active term. Update the SAFE-01 mutation inventory. Covers AC-05, AC-07 and AC-08.
- [ ] T-06 — Exclude archived records from conflicts, routine projections, teacher routine, room maintenance and deactivation checks, and new publications. Leave snapshots and workload unchanged. Covers AC-06.
- [ ] T-07 — Build the register, `/od/new`, `/od/[id]/edit` with the impact preview, the action dialogs, `/od/[id]/history` and the navigation rename. Covers AC-01, AC-02, AC-07 and AC-10.
- [ ] T-08 — Verify with both-adapter fixtures (roles, stale revision, archive effects, audit), run typecheck, lint, domain, safety and the guarded build, then the compiled Edge review at 1440/390/320 px. Record the results in `verification.md`. Covers AC-01–AC-10.
- [ ] T-09 — Present the delivery, record owner acceptance and merge into local `main`.

## Verification and delivery

This slice changes the schema, so migration evidence on both adapters is required (`SAFE01_PG_BIN` for PostgreSQL). Use disposable PGlite and PostgreSQL fixtures only. The institutional database stays untouched until a separate, backed-up, owner-approved migration. The default Turbopack CSS worker failure remains a known limitation, and the Webpack build is the accepted fallback. GitHub synchronization waits for an owner-directed boundary. #13 stays open until OD-01B is also accepted.

## Current checkpoint and exact handoff

- **19 November — approved.** The owner approved D-1–D-7 unchanged. Implementation starts at T-03 on `codex/od-01a`.
- **19 November — proposal ready.** The specification, plan and sketches are committed on `codex/od-01a`. No code has changed. **Next:** the owner reviews D-1–D-7 and the sketches, then approves them, amends them, or chooses ATT-03B instead. On approval, record it in T-02, commit it, and start T-03.
