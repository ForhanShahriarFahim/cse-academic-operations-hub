# CAL-01 — Implementation plan

[Issue #38](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/38) · Approved · 19 November 2026, Asia/Dhaka

Branch `codex/cal-01` from local `main` at `a4b0ccb`. [Specification and decisions](spec.md) · [Inspection and verification](verification.md) · [Workflow sketches](mockups/index.html)

## Inspection and proposed approach

- Add term-owned calendar metadata with optional teaching bounds and provenance, plus entries linked to the term calendar. Use a forward-only additive migration after `0018`; a missing calendar row represents an existing term with no calendar. Use SQL dates, foreign keys, inclusive-range, paired-bound and entry-effect constraints, plus a term-scoped duplicate key. Check term containment in the write path and when narrowing draft term dates. Keep historical and routine-related rows outside the migration's writes.
- Add an injected read/store layer and a pure date lookup used by a term-scoped calendar page. Reuse the existing date validation and time-zone conventions. Read one selected term's projection consistently and use that projection for the dated view and print. Keep weekly-meeting selection, occurrence generation and attendance out of the calendar layer.
- Mirror the term workspace's server authorization and audited results. Serialize writes with a shared term-context lock followed by the target term row lock. Use existing exclusive term lifecycle and draft-identity locking to order those changes against calendar writes. Verify the term identity and status and the calendar revision under lock, then save and audit together. A no-op does not generate another audit event. A revision also covers first saves and removals, so delete/re-add cannot make an old form current. Keep draft identity and policy checks intact apart from rejecting a boundary edit that would strand calendar dates.
- Add a calendar link from the term workspace, a protected A4 view and manager-only history. Use the existing page, panel, form-feedback and print conventions. Validate normalized identifiers, text lengths and optional HTTP(S) sources at the server boundary. Reuse keyboard focus and local feedback patterns for pending, validation and stale states.
- Review the forward migration and backup/restore against disposable populated data on both adapters. Leave institutional migration for an explicit operations decision and cold backup. Check preserved rows and frozen outputs against pre-migration fixtures before proposing delivery.

## Approval record

- “Go for the next task” starts the CAL-01 inspection and specification described in the ATT-01 handoff.
- 19 November 2026, owner: “approve D-1 to D-5 as proposed, and go for it.” D-1–D-5 are accepted unchanged and implementation of T-03–T-05 is authorized.
- D-1 as accepted: staff enter dates manually from approved university/CSE notices or an owner-confirmed term document. The owner named no separate office and supplied no document, so global `manage_terms` holders enter dates and conflicting notices go to the owner. No institutional dates are entered by the agent.
- D-2 as accepted: day swaps are deferred out of this delivery. Institutional migration still needs its own operations decision and cold backup.

## Tasks

- [x] T-01 — Inspect issue #38, sources and current term/date behavior. Present the proposed scope, criteria and sketches.
- [x] T-02 — Confirm source authority and day swaps. Record and commit the owner's decisions and implementation approval.
- [ ] T-03 — Implement additive storage, date validation and date lookup, with term-bounds protection, server authorization, revision control and transactional audit. Covers AC-01–AC-05.
- [ ] T-04 — Implement term workspace entry, screen/lookup, manager editing and history, and authenticated A4. Covers AC-01–AC-06.
- [ ] T-05 — Verify disposable migrations and recovery, parity, final application checks and compiled review. Record evidence and give the owner a runnable review. Covers AC-01–AC-07.
- [ ] T-06 — Record delivery acceptance and merge the bounded delivery into local `main`. Keep the parent issue open for deferred #38 work.

## Verification and delivery

Run typecheck, lint, domain tests and default build with disposable configuration. Include calendar/domain tests, term workspace and rollover guards, active-term and attendance regressions, forward migration, fault rollback, PostgreSQL concurrency, and populated restore/reapply testing. Compare archived routine/official/CSV outputs and existing attendance data before and after. Use synthetic calendar and role fixtures for compiled Edge desktop and phone, axe and keyboard checks, and native A4 output with long text and continued pages. If the default Turbopack build fails, report its actual result and use an isolated Webpack build for browser evidence. Provide the exact review command and record all pending checks.

## Current checkpoint and exact handoff

The planning package is ready for review on `codex/cal-01`. Only T-01 is complete. [Inspection and verification record](verification.md)

> Resume CAL-01 / #38 on `codex/cal-01`. Read the proposed specification and workflow sketches. Obtain and record the owner's accepted source authority, answer on day swaps and approval or amendments to D-1–D-5. Commit the approved plan before starting T-03. Historical calendars, attendance, frozen public routines and institutional storage are protected by the stated scope. GitHub updates follow the next owner-directed synchronization boundary.
