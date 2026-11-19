# ATT-03A — Implementation plan

[Issue #10](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/10) · Proposed · 19 November 2026, Asia/Dhaka

Branch `codex/att-03a` from local `main` at `ec82ad6`. [Specification and decisions](spec.md) · [Inspection evidence](verification.md) · [Workflow sketches](mockups/index.html)

## Proposed approach

- **Storage.** Add forward-only migration `0020` to `attendance_sessions`: `status` (default `draft`, checked against the five states), `revision` (default 0), and nullable submitted, locked and voided actor/time columns referencing `portal_users`, plus `void_reason`. Check constraints keep actor and time paired and require the columns each state needs. Existing rows receive `draft` and revision 0 through the defaults. No attendance record, audit row or other table is written.
- **Rules.** Put the transition table, reason validation and role-to-action mapping in a database-free module with domain tests. Server actions call it after authorization and before any write.
- **Authority.** Add `review_attendance` to the system and academic administrator roles and to the access summary. Resolve it through the existing group department context. Teacher actions keep the existing `take_attendance` decision.
- **Writes.** Each lifecycle action and save runs inside the existing term-context transaction. It locks the session row, verifies the term, group, state and revision under that lock, applies the change, increments the revision and writes its audit event in the same transaction. Submit saves and submits together. Delete refuses anything but a draft. Group lock-all locks the group's submitted rows in ID order. Restore takes the existing create lock for the group before its duplicate check.
- **Reads.** Extend the attendance loader with state, revision, actors and the not-yet-submitted count. Exclude voided sessions from summaries, from the duplicate guard and from the Today match. Load session history from audit events only for an authorized, opened group, newest first, in pages.
- **Interface.** Reuse the attendance manager, confirm dialog, inline feedback and focus rules. Add state words to the session selector, a state header, state-specific actions, reason dialogs and a History disclosure. Stack the action bar at phone widths. The blank roll-call print and other outputs are unchanged.

## Approval record

- 19 November 2026, owner: “Go for the next task.” This starts ATT-03 / #10 inspection and specification from local `main`, following the CAL-01 handoff. It does not approve implementation.
- Implementation approval of D-1–D-5: pending.

## Tasks

- [x] T-01 — Inspect issue #10, prior attendance slices and the current session code. Present this specification, decisions and sketches.
- [ ] T-02 — Record and commit the owner's decisions and implementation approval.
- [ ] T-03 — Add migration `0020`, transition rules, authority and audited server actions with revision control. Covers AC-01–AC-06.
- [ ] T-04 — Add state display, actions, reason dialogs and History in the attendance workspace. Covers AC-01–AC-03 and AC-07.
- [ ] T-05 — Verify on disposable data: both adapters, races, fault rollback, migration recovery, summary parity and compiled review. Record the evidence and a runnable owner review. Covers AC-01–AC-08.
- [ ] T-06 — Record delivery acceptance and merge into local `main`. Keep #10 open for ATT-03B.

## Verification and delivery

Run typecheck, lint, domain tests and the default build with disposable configuration. Add domain tests for the transition table and reasons, and a SAFE-01 group for both adapters covering migration from a populated database, transitions, authority, stale revisions, PostgreSQL races, audit-fault rollback, backup/restore/reapply and summary fingerprints. Re-run the BUG-ATT-MARKS, ATT-01 and CAL-01 groups that read sessions. Review compiled Edge at desktop, 390 px and 320 px with keyboard and axe. If the default Turbopack build fails, report its actual result and the isolated Webpack result, as in earlier deliveries.

## Current checkpoint and exact handoff

The proposal is on `codex/att-03a`. No application code, schema or database has changed. Institutional storage is still not migrated to `0019`.

> Review [the ATT-03A specification](spec.md) and [sketches](mockups/index.html). Approve or amend D-1–D-5. After approval, record the owner's words here, commit the approval, then implement T-03–T-05 on `codex/att-03a`.
