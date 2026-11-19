# ATT-01 — Implementation plan

[Issue #8](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8) · Proposed · 19 November 2026, Asia/Dhaka

Branch `codex/att-01` from local `main` at `dec448e`. [Specification and decisions](spec.md) · [Verification](verification.md) · [Workflow sketches](mockups/index.html)

## Inspection and proposed approach

Separate the authorized active-term chooser projection and URL resolution from reading a selected group's roster, sessions and calculated summary. Use real same-term offering links and placements for browse paths. Reuse the existing course ownership fallback and resource authorization. If list authorization needs a batched form, verify its parity with per-resource `can`, including scoped roles and teacher assignment sources. Re-check the selected target before loading private group data. Keep the session-create caller explicit and preserve its roster, teacher validation, lock and audit behavior. Reuse the current-roster projection and teach the existing workspace to accept an explicit session entry.

Use the existing routine source selection conventions and Dhaka weekday handling. Project only the class details needed by Today and read today's eligible session identifiers/times in a bounded active-term query. Keep `group` stable for existing links and preserve valid browse context as the URL changes. Avoid fetching another group's roster as a navigation fallback.

Move the chooser out of the marking component. Keep the existing roster and print routes, current term guards, mutation controls and ATT-02 local feedback. No schema, migration or recovery step is planned. Use isolated synthetic data for all runtime checks.

## Approval record

- Owner authorization for implementation is pending. “Go for the next task” started the inspection and specification named in the STU-01B handoff.
- Record the actual dated approval of D-1–D-4 and any amendments here. Commit the approved plan before writing application code.

## Tasks

- [x] T-01 — Inspect issue #8, owner input, data and permissions, and present the bounded specification with an attendance design pass.
- [ ] T-02 — Record and commit owner approval.
- [ ] T-03 — Implement scoped group projection, cascade and URL validation, including old links and empty states. Covers AC-02–AC-04.
- [ ] T-04 — Implement routine-based teacher landing and safe group/session entry, retaining roster, print and marking behavior. Covers AC-01 and AC-03–AC-06.
- [ ] T-05 — Verify final behavior, record evidence and give the owner a runnable synthetic review. Covers AC-01–AC-06.
- [ ] T-06 — Commit verified delivery, record owner acceptance and merge the bounded delivery into local `main`.

## Verification and delivery

Run typecheck, lint, domain tests and the default build with disposable configuration. Exercise attendance, student roster and term-context regressions plus focused selection, authorization and history cases on synthetic PGlite and PostgreSQL. Check desktop and phone in compiled Edge, including keyboard focus, Back/Forward, stale-session recovery, long audiences, active roster/captured-student parity and existing A4 entry. Record the default build outcome separately if a compiled Webpack review is needed. Extend the existing synthetic attendance review entry where practical and provide the exact owner command after implementation.

## Current checkpoint and exact handoff

The proposal is ready for owner review on `codex/att-01`. [D-1–D-4 and acceptance criteria](spec.md) · [Sketches](mockups/index.html)

> Review the ATT-01 sketches and approve or amend D-1–D-4. Once approved, record the owner's decision and commit the approved plan on `codex/att-01`, then implement T-03 and T-04. Use the current attendance and STU-01 review fixtures for the neighboring regressions. Present the verified workflow for owner acceptance before local merge.
