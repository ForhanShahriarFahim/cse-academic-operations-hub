# ATT-03A — Attendance session submit, lock and correction

[Issue #10](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/10) · Approved by the owner · 19 November 2026, Asia/Dhaka

[Implementation plan](plan.md) · [Inspection evidence](verification.md) · [Desktop and phone sketches](mockups/index.html)

## Problem and inspected baseline

A dated attendance session has no state. Any user who can take attendance for the group can change any mark at any time while the term is active, and can delete the session with every record in it. Nothing marks a roll-call as finished, nobody can freeze it, and a later correction leaves only a generic save event. The original roll-call and the person responsible for it are hard to recover. [Inspection evidence](verification.md)

BUG-ATT-MARKS already delivered part of #10. It refuses an exact duplicate term/group/date/start/end session, including concurrent requests, and summaries count only captured students. The parent issue still needs the lifecycle, reasoned corrections, void instead of delete, and the scheduled-meeting link. [BUG-ATT-MARKS record](../BUG-ATT-MARKS/spec.md)

## Proposed delivery

ATT-03A adds a lifecycle to each dated session. A teacher saves a **draft**, then **submits** it. A submitted roll-call is read-only until someone **reopens** it with a reason. An attendance reviewer can **lock** a submitted session so that only a reviewer can reopen it. A submitted or locked session is never deleted. It is **voided** with a reason and kept. Every transition and every correction keeps the actor, time, reason and changed marks, and the session shows that history.

ATT-03A does not change how sessions are created, how marks are calculated or what the roll-call looks like apart from state, actions and history. ATT-03B, a separate later slice under #10, covers linking a session to a scheduled meeting, an unscheduled class reason, routine and calendar date/time suggestions, and the roll-call ergonomics in the owner's 30 September notes. See D-1.

## Required behavior

### States and transitions

| From | Action | Who | Reason | Result |
| --- | --- | --- | --- | --- |
| — | Create (unchanged) | Group attendance taker | — | Draft |
| Draft | Save marks | Group attendance taker | — | Draft |
| Draft | Submit | Group attendance taker | — | Submitted |
| Draft | Delete | Group attendance taker | — | Removed, with an audit record (existing behavior) |
| Submitted | Reopen for correction | Group attendance taker or reviewer | Required | Reopened |
| Submitted | Lock | Reviewer | Optional note | Locked |
| Reopened | Save marks | Group attendance taker or reviewer | — | Reopened |
| Reopened | Resubmit | Group attendance taker or reviewer | — | Submitted |
| Locked | Reopen for correction | Reviewer | Required | Reopened |
| Submitted, reopened or locked | Void | Taker for submitted/reopened; reviewer for locked | Required | Voided |
| Voided | Restore | Reviewer | Required | Reopened |

- A **group attendance taker** has the existing `take_attendance` decision for that teaching group: the assigned teacher, or a system or academic administrator in scope. A **reviewer** holds the new `review_attendance` capability in the group's department. See D-3.
- Any other action from a state is refused. A draft never becomes voided. A session that has been submitted is never deleted. Restoring returns a voided session to **Reopened**, so it must be resubmitted.
- **Submit** sends the marks on screen and the session's revision. The server saves the marks and submits them in one transaction. Students not captured in the session cannot be included, as today. A session with no captured students cannot be submitted. A submitted, locked or voided session is read-only. Save, Mark all present and per-student statuses are disabled and the server refuses them.
- **Lock all submitted** on the group lets a reviewer lock every currently submitted session in the group at once. The confirmation names the count and phases. Draft, reopened, locked and voided sessions are unaffected and are listed as such. There is no automatic lock in this slice.
- The current state is shown in words on the session selector and in the roll-call header, not by colour alone. The header names who last submitted it and when, and, where applicable, who locked or voided it, when, and why.
- Restoring checks the existing duplicate key under the same create lock. If an active session for the same term, group, date and time now exists, the restore is refused and names that session.

### Reasons, corrections and history

- Reopen, void and restore need a reason of 3–300 characters after trimming. A lock may carry an optional note of up to 300 characters. Reasons are plain text. They must not contain student marks, grades or contact details, and the form says so.
- Every transition, save, submit and lock writes one audit event in the same transaction as the change. Saves and submissions record before and after statuses for the students that changed. Reopening a locked session records the full locked roll-call as its starting point.
- Each session has a **History** disclosure for anyone allowed to open its roll-call. It lists events newest first with actor, Asia/Dhaka time, action, reason and changed students, given as student ID, before → after. Sessions created before ATT-03A show their existing create and save events under their existing names.
- A save that changes no status writes no event. A submit or resubmit always writes one, because the submission itself is a fact. A repeated request with an already-used revision is refused as stale and changes nothing.

### Counting, duplicates and existing sessions

- Summaries keep their current rule. Every session that is not voided counts as it does now, whether it is draft, submitted, reopened or locked. Voided sessions are excluded. The summary panel states how many of the group's sessions are not yet submitted. ATT-04 decides whether official marks require submitted or locked sessions. See D-4.
- The exact-duplicate guard and the ATT-01 Today card match ignore voided sessions. A voided session can be replaced by a new session with the same date and time.
- Every existing session becomes a draft with no invented submitter. Existing records, statuses, captured rosters and audit history are unchanged. Drafts keep today's delete behavior. See D-5.
- Course, teacher and class-group evidence counts continue to count voided sessions, because the session and its records still exist.

### Permissions, stale pages and terms

- Authenticate and authorize every read and write on the server, including direct requests with a forged session, group or term. Existing active-term rules continue. Completed and other non-active terms are read-only for every state.
- A user who can open the group sees its sessions in every state, with the actions their role allows. Hidden actions are also refused by the server.
- Every write carries the session revision the user saw. If another user has saved, submitted, locked, reopened, voided or restored the session in the meantime, the write is refused with “This session changed. Reload to see its current state.” Edits on screen remain visible until the user reloads. Concurrent writers on the same session produce exactly one committed change.
- Feedback is announced and kept beside the action that produced it, following ATT-02. Reason dialogs are labelled, return focus to their trigger and keep the typed reason on refusal.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | Every allowed transition in the table produces its stated state, actor and time. Every disallowed transition, including deleting a submitted session and saving a submitted, locked or voided one, is refused and changes nothing. | Pure transition table and server actions on both adapters. |
| AC-02 | The assigned teacher, an unassigned teacher, a reviewer in and out of department, a scoped administrator, an expired role, a viewer and an anonymous user can perform only their permitted actions. Forged session, group and term IDs write nothing. | Synthetic roles against direct actions on both adapters, plus browser checks of the controls shown. |
| AC-03 | Reopen, void and restore require a valid reason. Audit events hold before/after marks and actor. A locked session corrected and resubmitted still shows its original locked roll-call and every later change in History. | Both adapters with audit assertions and compiled browser review. |
| AC-04 | Stale revisions are refused. Concurrent lock and save, twin submits and twin restores yield one committed outcome and one matching audit event. An audit fault rolls the whole change back. | Independent PostgreSQL connections, PGlite sequential equivalents and fault injection. |
| AC-05 | Summaries for non-voided sessions match pre-migration values. Voided sessions leave summaries, the duplicate guard and the Today match. Restore over an active duplicate is refused. Drafts can still be deleted. | Before/after summary fingerprints, focused regressions for the duplicate guard, Today match and delete. |
| AC-06 | The forward-only migration turns every existing session into an unsubmitted draft without changing records, other tables or archived outputs. Backup, restore and reapply succeed. | Populated synthetic PGlite and PostgreSQL databases, restore and reapply, with unchanged fingerprints for other tables. |
| AC-07 | Desktop, 390 px and 320 px views show state in words, keep actions reachable by keyboard and announce results. Reason dialogs and History are readable without page-wide overflow. No accessibility violations are found. | Compiled Edge review, keyboard checks and axe. |
| AC-08 | Typecheck, lint, domain tests, default build and the affected safety groups pass, or an unavailable check is recorded as pending. No institutional database is opened or migrated. | Recorded command results, target isolation and diff review. |

## Owner decisions (approved as proposed on 19 November 2026)

| ID | Proposed decision |
| --- | --- |
| D-1 | Deliver #10 in two slices. ATT-03A is the lifecycle, corrections, void and history described here. ATT-03B follows separately and covers the scheduled-meeting link, the reason for an unscheduled or extra class, date/time suggestions from the routine and CAL-01 calendar, and roll-call ergonomics: Present by default, search, roll-number order, live counts and phone marking. |
| D-2 | Use the five states and the transition table above. A submitted session is read-only until reopened. Draft deletion stays. Submitted sessions are voided, never deleted. Locking is manual per session or for all submitted sessions in a group, with no automatic lock in this slice. |
| D-3 | Add a `review_attendance` capability for system and academic administrators, scoped to the group's department like other attendance access. Reviewers lock, reopen locked sessions, void locked sessions and restore voided ones. Assigned teachers submit, reopen and void their unlocked sessions. No two-person rule: one person may submit and lock the same session. Every action is audited. D-06 stays open for a later institutional decision on separation of duties. |
| D-4 | Keep counting every non-voided session as today, whatever its state, and show the count of sessions not yet submitted. ATT-04 decides whether official marks require submitted or locked sessions. |
| D-5 | Migrate every existing session to an unsubmitted draft with no invented submitter or lock. Migrating the institutional database stays a separate operation with a cold backup. |

[Product requirements](../../PRODUCT_REQUIREMENTS.md#att-03--attendance-session-lifecycle) · [Institutional decision D-06](../../decisions/INSTITUTIONAL_DECISIONS.md#d-06--policy-authority-and-separation-of-duties) · [Local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md)
