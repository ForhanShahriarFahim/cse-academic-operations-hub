# BUG-27 (SAFE-01 F-08): blocked deletes explain what still uses the record

Issue: [#27](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/27), "SAFE-01 follow-up (F-08): explain blocked deletes instead of raw foreign-key errors"
Status: Approved 2 October 2026 with D-1 to D-3 as recommended (see [approval record](#approval-record)). In progress.
Branch / base: `claude/bug-27` from `75ed28e` (main after the cloud hook, #56)
Updated: 2 October 2026, Asia/Dhaka

This is a small bug, so the spec and the plan are combined in this one record (see [WORKFLOW](../../WORKFLOW.md#issue-lifecycle)).

## Problem and inspected baseline

Inspected on 2 October 2026 at `75ed28e`, in a Claude Code cloud session, from the code, the schema and the SAFE-01 safety suite. The institutional database was not opened.

- **`deleteMeetingAction`** ([actions.ts:280](../../../src/lib/actions.ts)) deletes the class's teachers, rooms and then the meeting, inside `auditedChange`. `attendance_sessions.meeting_id` references `meetings.id` with no `ON DELETE` rule ([schema.ts:518](../../../src/db/schema.ts)). If a session is linked, the delete throws `violates foreign key constraint`, the transaction rolls back, and the error escapes the action.
- **`deleteExternalAction`** ([actions.ts:367](../../../src/lib/actions.ts)) deletes the commitment. `workload_allocations.external_commitment_id` references it ([schema.ts:626](../../../src/db/schema.ts)), so a commitment counted in a teacher's workload throws the same way.
- **Data is never lost.** The constraint and the rollback protect it. The problem is what the user sees: an unhandled server error instead of a reason.
- **How often it happens today.** No screen in the app currently sets `attendance_sessions.meeting_id` or writes an external workload allocation. These links come from imported or fixture data. The SAFE-01 fixture has both, and today the safety suite's same-term control records `deleteExternal` as having thrown. The future attendance and OD work (ATT-03 #10, OD-01 #13) will create these links routinely, so the guard is needed before then.
- **What the screens do with the result.**
  - Routine builder ([class-panel.tsx:137](../../../src/components/routine-workbench/class-panel.tsx)): a failed result is already shown in its issue list, so a `conflict` result with blockers appears without UI changes.
  - OD screen ([od-manager.tsx:146](../../../src/components/od-manager.tsx)): `OdRowActions` **discards** the result of both Remove and Mark verified, so even a refused action shows nothing today.
- **A precedent exists.** TCH-01's `deleteTeacherAction` checks references inside the transaction and returns `conflicted(...)` with one blocker per reason, using the SAFE-01 result contract ([action-result.ts](../../../src/lib/action-result.ts)).

## Outcome and scope

**Outcome.** Trying to delete a class or an external commitment that other records still use is refused with a plain explanation of what uses it, and nothing changes. The routine builder and the OD screen both show that explanation where the action was taken.

**In scope:** the two delete actions, a fallback for a reference that appears between the check and the delete, the OD row's feedback, tests in `npm run test:safety`, and the SAFE-01 inventory entry F-08.

**Out of scope:** archiving instead of deleting (see D-1), any schema change, other delete actions, and editing workload allocations.

## Decisions for the owner

- **D-1, refuse or archive.** *Recommended:* refuse the delete and explain why. An "archived" state needs a schema change and belongs with ATT-03 (#10, void and lock rules) and OD-01 (#13, edit and archive). *Alternative:* add archiving now, which widens this bug into a schema change.
- **D-2, what the explanation offers.**
  - *Class:* name the attendance session dates (up to five, then "and N more") and suggest keeping the class or changing its time instead. Attendance history must stay linked to the class it was taken in.
  - *External commitment:* name each teacher whose workload counts it, with the units, and say it can't be removed while it counts toward workload.
  - *Alternative for the commitment:* remove its workload allocations together with it, in the same audited transaction. That would silently change a teacher's workload, so it is not recommended.
- **D-3, feedback on the OD screen.** *Recommended:* show any failed result from Remove **and** Mark verified in the row, announced to screen readers (`role="alert"`). Mark verified also discards its result today. *Alternative:* fix Remove only.

## Behaviour (with the recommended decisions)

1. `deleteMeetingAction`, after the existing permission and active-term checks, looks for attendance sessions linked to the class **inside the transaction**. If there are any, it returns a `conflict` result. The message is "This class can't be removed: attendance is recorded against it." Each blocker gives the session dates. Nothing is deleted and no audit event is written.
2. `deleteExternalAction` does the same with workload allocations. The message is "This commitment can't be removed: it counts toward teaching workload." Each blocker names the teacher and units.
3. If a linked row appears between the check and the delete, the database's foreign-key error (code `23503`) is caught in these two actions and returned as the same kind of `conflict` result, with a generic reason. Any other error still throws.
4. With no linked rows, both deletes behave exactly as today, including their audit events.
5. The routine builder shows the conflict in its existing issue list. The OD row shows the message and the blockers under its buttons, and clears them on the next action.

## Acceptance criteria

- **AC-01** Deleting a class with a linked attendance session returns `outcome: conflict` naming the session date(s). It does not throw, and the database is unchanged (fingerprint), with no new audit event.
- **AC-02** Deleting an external commitment counted in a workload allocation returns `outcome: conflict` naming the teacher and units. It does not throw, and the database is unchanged, with no new audit event.
- **AC-03** Unlinked classes and commitments are still deleted, each with one audit event, as before.
- **AC-04** A real foreign-key error raised at delete time maps to a `conflict` result; any other error still throws.
- **AC-05** The OD row shows a refused Remove or Mark verified result with `role="alert"`. The routine builder shows the class conflict in its issue list. Both are checked on the disposable review database, at desktop and phone widths.
- **AC-06** The SAFE-01 cross-term checks (T-03) still pass: Summer rows are still refused as "not active", and Spring's same-term control now records a conflict for the linked commitment instead of a thrown error.
- **AC-07** `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build` pass, and so do the PGlite groups of `npm run test:safety`. The PostgreSQL groups are pending in the cloud and run locally.

## Tasks

- **T-01** `actions.ts`: in-transaction dependant checks, conflict results and the `23503` fallback for both deletes.
- **T-02** `od-manager.tsx`: keep and show the row result for Remove and Mark verified (D-3).
- **T-03** Safety tests: a "BUG-27 blocked deletes" group on the disposable two-term fixture covering AC-01 to AC-04, plus an updated T-03 same-term control (AC-06).
- **T-04** Verify: static checks, `test:safety`, and a browser check with screenshots on the review database. A synthetic linked session and allocation are added only to that disposable copy. Write the verification record and mark F-08 fixed in the [SAFE-01 inventory](../../operations/SAFE-01-mutation-inventory.md).

## Approval record

- 2 October 2026: the owner approved this spec and plan in the Claude Code cloud session, choosing D-1 refuse and explain, D-2 refuse and name the teachers, and D-3 show feedback for both OD row buttons. Branch `claude/bug-27`, following the BUG-32 convention.
