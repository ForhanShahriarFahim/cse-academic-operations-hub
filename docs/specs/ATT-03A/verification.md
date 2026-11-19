# ATT-03A — Inspection and verification

[Issue #10](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/10) · [Specification](spec.md) · [Plan](plan.md) · 19 November 2026, Asia/Dhaka

## Inspection evidence

| What was checked | Observed result |
| --- | --- |
| `gh issue view 10` on 19 November | Open. Duplicate detection is ticked by BUG-ATT-MARKS. Meeting link with unscheduled reason, the four lifecycle states with actor and time, and reasoned correction with void instead of delete remain. Acceptance asks that locked corrections preserve the original record and responsible actor. |
| [Requirements](../../PRODUCT_REQUIREMENTS.md#att-03--attendance-session-lifecycle), [decision D-06](../../decisions/INSTITUTIONAL_DECISIONS.md#d-06--policy-authority-and-separation-of-duties) and the owner's 30 September notes on issue #8 | Requirements propose the states, a meeting link, duplicate confirmation, a correction audit trail and void over deletion. D-06 leaves the approver for locked corrections and any separation of duties unresolved. The owner's notes ask for routine/calendar suggestions and a Present-by-default, searchable roll-call, which are proposed for ATT-03B. |
| [Schema](../../../src/db/schema.ts) | `attendance_sessions` has term, group, optional teacher and meeting, date, phase, optional times, notes and creation time. There is no state, revision or actor column. Records are unique per session and student. The last migration is `0019_term-calendar`. |
| [Attendance actions](../../../src/lib/academic-actions.ts) | Create takes the term-context lock, a per-group create lock, roster locks and the exact-duplicate check, then inserts session, absent records and audit together. Save checks group authority, active term and captured students, then upserts with one audit event and no revision check. Delete removes records and session with an audit event. |
| [Loader](../../../src/lib/academic-operations.ts), [summary rule](../../../src/lib/attendance.ts) and [manager](../../../src/components/attendance-manager.tsx) | Every stored session for the group counts in summaries. The manager offers create, session selection, Mark all present, Save and Delete, with announced inline feedback and confirmation before delete. |
| [Access policy](../../../src/lib/auth/policy.ts) and [resource checks](../../../src/lib/auth/index.ts) | `take_attendance` belongs to system administrator, academic administrator and teacher. Administrators pass by department scope. Teachers must be assigned to the group by allocation or meeting. No capability distinguishes an attendance reviewer. |
| Other session readers | The ATT-01 Today match, course/class-group/teacher evidence counts and term-scope checks read sessions by term, group or teacher. |

## Proposal checks

- Opened the local sketch in the desktop app's browser pane. At 1440, 390 and 320 px there was no page-wide overflow and no element extended past the viewport. All nine in-page links resolve, and every select and textarea has a label.
- Local document links and the D-06 and ATT-03 anchors were checked with the diff review before commit.

## Implementation checks

- Storage is forward-only migration `0020_attendance-lifecycle`. It adds state, revision, current submitted/locked/voided actor and time columns referencing portal users, and the void reason, to `attendance_sessions`. Check constraints keep each state's required columns, actor pairs, reason length and a non-negative revision. Columns use `IF NOT EXISTS` and constraints are added only when absent, so a check that rolls back an earlier migration record can reapply it safely.
- Rules live in [`attendance-lifecycle.ts`](../../../src/lib/attendance-lifecycle.ts). `scripts/verify-attendance-lifecycle.ts`, now part of `npm run test:domain`, checks every command against every state for teacher, reviewer, both and neither, plus reasons, counting and change lists.
- `review_attendance` is granted to system and academic administrators and resolves through the group's department like other attendance access.
- Server actions authorize first, then validate, check the active term, lock the session row, compare the revision, apply the transition table and write one audit event in the same transaction. Restore takes the per-group create lock before its duplicate check. Lock-all locks the confirmed submitted set in ID order.
- The loader adds state, revision and actor names, excludes voided sessions from summaries and reports the not-yet-submitted count. The duplicate guard and the ATT-01 Today match ignore voided sessions.
- Existing callers in the active-term, term-scope, term-workspace and BUG-ATT-MARKS scenarios now pass a revision.
- The review fixture's second dated session now gets the roll-call records the create action would write. Without them Submit was correctly disabled. The browser check matches the lock-all dialog by its heading and exact count.

## T-05 results, 19 November 2026

- `npm run typecheck`, `npm run lint` and `npm run test:domain` passed. The domain run includes the ATT-03A transition table, roles, reasons, counting and change lists.
- The ATT-03A SAFE-01 groups passed on disposable PGlite and PostgreSQL 17.11 (`SAFE01_PG_BIN` set). They cover:
  - the populated `0019`→`0020` migration, with every other table fingerprint and every existing session column unchanged, all sessions as unsubmitted drafts, an identical repeat migration and the enforced constraints
  - teacher draft, submit, reopen with reason, correction and resubmission
  - reviewer lock, reopen of the full locked roll-call, void with reason and restore
  - the duplicate guard, Today match and summaries ignoring voided sessions, and restore refused over an active duplicate
  - stale revisions refused with no writes
  - every refused role and forged term, ID or context writing nothing
  - lock-all of exactly the confirmed set
  - audit-fault rollback
  - lock against reopen, twin submits and twin restores committing once. On PostgreSQL the second writer was observed blocked on independent connections.
  - backup, separate restore and reapply with identical full fingerprints
- Summary parity was added during T-05. On migrated fixture sessions, the loader's summaries equal the pre-ATT-03A rule (every session counts) computed independently from the raw sessions and records. A voided session leaves every summary exactly as before.
- The full `npm run test:safety` passed all 52 groups on both adapters, including BUG-ATT-MARKS, ATT-01, CAL-01, the term-scope and archived-output groups. The harness reported that the default PGlite directory was never opened.
- The default `npm run build` passed on Turbopack. Its one warning, about tracing caused by dynamic filesystem access, comes from the unchanged `src/db/target.ts`. The build used the in-memory build database.
- The compiled Edge review (`review-attendance.ts --att-03a --check`) used disposable PostgreSQL on loopback. On its first run, axe found a colour-contrast failure: the "Reopened" state label used the gold fill colour as text (3.4:1). It now uses the existing gold text token (6.2:1). After the rebuild, the review passed:
  - teacher submit and the read-only submitted state, with no Lock or Delete offered
  - the reason dialog by keyboard, with focus moving to the reason field, a validation alert, and Escape returning focus to its trigger
  - reopen, correction marked as unsaved, resubmit and History with the reason and before/after marks
  - reviewer lock, the teacher's locked view without Reopen, void, restore, and the lock-all confirmation with submitted and reopened counts
  - no page-wide overflow and no axe violations (WCAG 2.1 A/AA) at 1440, 390 and 320 px for each state, the error dialog and the lock-all dialog
- Screenshots are in the ignored `.tmp/att-03a/browser` directory.

## Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| AC-01 | Domain transition table, plus server-action scenarios on both adapters for every allowed and refused transition, including delete and save on submitted, locked and voided sessions. |
| AC-02 | Role scenarios on both adapters (assigned and unassigned teacher, in/out-of-department and expired reviewer, viewer, anonymous, forged IDs), plus browser checks of the controls shown to teacher and reviewer. |
| AC-03 | Reason validation in domain tests and actions, audit before/after marks and actor, the reviewer's reopen of a locked roll-call, and History in the compiled review. |
| AC-04 | Stale revisions refused, PostgreSQL races on independent connections, PGlite sequential equivalents and audit-fault rollback. |
| AC-05 | Summary parity with the pre-ATT-03A rule, voided sessions leaving summaries, the duplicate guard and the Today match, restore refused over a duplicate, and draft delete. |
| AC-06 | Populated migration with unchanged fingerprints for other tables, identical repeat migration, and backup/restore/reapply on both adapters. |
| AC-07 | Compiled Edge review at 1440, 390 and 320 px with keyboard and axe checks, after the contrast fix. |
| AC-08 | Typecheck, lint, domain tests, the default build and all 52 safety groups passed. No institutional database was opened or migrated. |

## Owner review

Build with `npm run build`, then run `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --att-03a --serve`. Open `http://localhost:3161/teacher` as the synthetic teacher, or `http://localhost:3161/sign-in` as the synthetic reviewer, in separate browser profiles. Add `--check` instead of `--serve` to repeat the compiled Edge checks. The script uses loopback and a disposable PostgreSQL database.

## Pending

- Owner acceptance of the delivery, then the local merge (T-06). #10 stays open for ATT-03B.
- The institutional database is not migrated to `0019` or `0020`. That needs an operations decision and a cold backup first.
