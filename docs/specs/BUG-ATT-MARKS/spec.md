# BUG-ATT-MARKS — captured-roster attendance and duplicate-session guard

Combined specification, sole checklist, verification and handoff for a bounded bug slice.

Status: **approved for implementation; verification and owner delivery acceptance pending**.
Updated: 11 November 2026 (Asia/Dhaka).
Branch/base: `codex/bug-att-marks` from local `main` `db01442`; one checkout/writer.
Source: [11 November review](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md), F-01 and the duplicate-guard portion of F-08. This local bug slice overlaps ATT-03 / #10 and ATT-04 / #11; it does not complete either parent. No new remote issue has been created.

## Authorization and decisions

The owner replied **"Approve and implement"** on 11 November 2026 after the concrete specification and D-1/D-2 recommendations were presented. This approves the unchanged scope in planning commit `2b71d8d`, including the captured-roster UI correction, exact-duplicate semantics and stated limits. This approval record is committed before implementation per [workflow](../../WORKFLOW.md). Delivery acceptance/local merge remain separate.

| ID | Decision required | Recommendation proposed for approval |
|---|---|---|
| D-1 | Which sessions count for a late-added student? | Count only sessions containing a stored attendance record for that student. A missing record means **not in this session**, never an inferred absence. Apply consistently to Midterm, Final and Semester. Explicit stored absences still count. |
| D-2 | What counts as an accidental duplicate? | Refuse creation when the same term and teaching group already have a session on the same date with the same start/end pair, comparing missing times as equal. Teacher and phase changes do not bypass the guard. Different time pairs remain allowed. No override in this slice; corrections/lifecycle remain ATT-03. |

D-1 uses the captured roster, not inferred enrolment dates: a backdated session created after enrolment includes whoever was captured when it was created. The current model has no enrolment-effective date. D-2 is an exact-duplicate guard, not an overlap detector: a timed session and an untimed session, or different time pairs, can coexist. Historical duplicates are not automatically identified, removed or merged. These boundaries were included in the approved specification.

## Inspected baseline and reproduction

- [ADR-001](../../architecture/ADR-001-academic-operations-boundaries.md) already says sessions capture their roster at creation and later saves may update only captured students. [Attendance requirements](../../PRODUCT_REQUIREMENTS.md#7-attendance-solution) preserve present/late/excused semantics and propose duplicate prevention.
- `src/lib/academic-operations.ts:getAttendanceData` maps all group sessions to each current student, substituting `absent` for a missing record. `src/lib/attendance.ts:attendanceMark` then calculates a mark from that invented absence.
- Reproduced on 11 November without importing the app/database: read the exact current summary block, transpile it with the installed TypeScript package, and execute it with in-memory synthetic inputs and the real transpiled `attendanceMark`. Session 1 contains student A present; session 2 contains A and newly joined B present. Actual B: Midterm 0/1, Final 1/1, semester 50%, mark 5/10. Proposed D-1 result: Midterm 0/0, Final 1/1, semester 100%, mark 10/10. A remains 2/2 and 10/10.
- `src/components/attendance-manager.tsx` renders the current roster for older sessions, defaults missing records to absent, and submits every current student on Save/Mark all present. `saveAttendanceAction` correctly refuses students not captured in that session, so adding B also prevents normal UI saving of session 1. This is confirmed by reading; browser reproduction is pending.
- `createAttendanceSessionAction` unconditionally inserts after validation; `attendance_sessions` has only a non-unique group/date index. Duplicate creation is confirmed by reading, not yet reproduced against a disposable database.
- Permissions, active-term locking, audit transactions and server refusal of non-captured students already exist and must remain enforced. Installed Next.js `01-app/02-guides/server-actions.md` was read for the action/refresh boundary.

## Outcome and scope

Included: captured-record summaries, truthful session membership in the existing attendance UI, exact-duplicate refusal serialized across concurrent create requests, focused regression checks and documentation.

Excluded: schema changes/migrations, enrolment-effective dates, retroactive roster edits/backfills, removal/re-enrolment workflow redesign, student identity/import fixes, hard-delete/lifecycle changes, policy versioning/rounding changes, extra-load rules, report/CSV/print features, institutional operations and GitHub synchronization. BUG-25 migration `0017` remains a separate backed-up institutional operation.

Existing stored sessions, attendance records and audit history remain unchanged. On reading existing data, computed summaries immediately reflect D-1; this corrects derived results without rewriting historical records. Existing duplicates continue to count independently until corrected through a separately approved workflow. No official result snapshot or policy versioning is introduced here.

## Required behavior and UI sketch

1. Extract a database-free summary helper in `src/lib/attendance.ts` and use it in `getAttendanceData`. Include only this student's stored records; preserve late as attended, excused outside the denominator, policy maxima and existing rounding. With no eligible/counted records, show 0/0, 0% and mark 0 as today.
2. For the selected session, current roster members without a captured record show **"Not in this session"**, with no status selector. Save and Mark all present operate only on the intersection of the current roster and captured records. Never invent/insert a record to make Save succeed. If the intersection is empty, explain that no current roster students belong to the session and disable these controls. Captured students no longer in the current roster retain their stored records; adding historical-roster identity browsing is deferred.
3. Desktop keeps the existing session table and summary table. Example old-session rows: `A | Present [select]`, `B | Not in this session [text]`; summary B: `Midterm 0/0 | Final 1/1 | Semester 100% | 10/10`. At mobile widths these same states remain inside the existing scrollable table. Add concise membership help beside the existing present/late/excused explanation. Announce action feedback using a suitable live region and preserve input on refusal.
4. Authorize and validate as today, then serialize create requests for the same teaching group with a transaction-scoped advisory lock (distinct namespace from publication locking). Acquire after the shared term-context lock and before duplicate lookup and roster capture. Check the term/group/date/start/end key under that lock, using null-safe equality, then insert session, captured records and audit atomically. A refusal returns a plain conflict result naming the existing session's date/time, with no new session, records or audit event. Successful creation retains current defaults. No database constraint is added; this guard covers the portal action, not arbitrary direct SQL.
5. Preserve current access boundaries: anonymous, viewer, unassigned teacher and wrong-term requests cannot create/update attendance or reveal a duplicate outside their authorized group. Crafted save payloads containing non-captured students remain refused atomically. Real concurrent identical creates must yield one success and one conflict, not two sessions.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | A and late-added B in the reproduction have the D-1 totals; existing captured absences still count. | Pure regression, demonstrated failing before correction, then production loader on synthetic data |
| AC-02 | Phase separation, present/late/excused, no records, all excused, theory/sessional maxima and rounding retain documented behavior. | Domain cases shared with production summary helper |
| AC-03 | Older-session UI marks B as not captured; Save/Mark all present affect A only; B is not inserted into the session. Empty intersection disables controls. | Browser desktop/mobile plus persisted-row checks |
| AC-04 | Captured records, including records for removed students, are preserved; repeated reads/saves create no backfill. | Before/after row comparisons on disposable data |
| AC-05 | Same-key creation is refused even with a different teacher/phase; null-time duplicates are refused; different date/group/term/time pairs are not false duplicates. | Actual actions on disposable PGlite and PostgreSQL |
| AC-06 | Concurrent identical PostgreSQL creates yield exactly one session, one roster capture and one success audit. Duplicate refusal writes nothing. | Real multi-connection race and fingerprints; sequential PGlite equivalent |
| AC-07 | Denied, stale-term and crafted non-captured-student saves write nothing; audit failure rolls creation back. | Production-path permission/context/fault checks on disposable adapters |
| AC-08 | Existing attendance summaries and visible corrections agree; feedback is announced and controls work at desktop/mobile widths with keyboard access. | Focused browser checks/captures, no new export or print surface |
| AC-09 | Typecheck, lint, domain, default build and relevant safety groups pass; unrelated/pending checks are named honestly. | Recorded command results and diff review |
| AC-10 | No institutional storage opened, migrations/reset issued, history rewritten, or remote writes made. | Target-isolation evidence and final Git/diff inspection |

## Sole task checklist

- [x] T-01 — Inspect current implementation, domain/architecture rules and handoff; reproduce summary defect in memory; prepare this specification and UI sketch.
- [x] T-02 — Obtain actual approval of D-1, D-2 and this scope; record the reply and commit the approved plan before application/test implementation.
- [ ] T-03 — Add failing domain and production-path synthetic attendance scenarios, including old-session UI payload and duplicate creation baseline (AC-01–AC-07).
- [ ] T-04 — Implement shared captured-record summaries and session UI membership/save handling (AC-01–AC-04, AC-08).
- [ ] T-05 — Implement serialized exact-duplicate refusal and prove both-adapter outcomes, PostgreSQL race and audit rollback (AC-05–AC-07).
- [ ] T-06 — Run required code checks and affected safety/browser checks; review preservation, permission boundaries and diff; record results/limits here (AC-01–AC-10).
- [ ] T-07 — Commit bounded delivery and provide a synthetic owner-inspection path. After actual owner acceptance, merge locally and update the handoff; parents #10/#11 stay open.

Verification will extend the owned `.tmp/safe-01` fixtures/controlled-runtime children and safety runner, never import the configured client from an unpinned probe. Use `SAFE01_PG_BIN` for the installed disposable PostgreSQL cluster. Use the guarded `ux:review` synthetic target for UI checks; do not casually run `dev`, `start`, `test:ui` or `db:*`. Full-suite repetition is needed only where changed paths/failures/uncertainty justify it. No schema change means no migration/recovery operation in this slice.

## Verification and current handoff

Planning evidence only: in-memory reproduction above passed as a demonstration of the existing defect. No application change, database action, full suite, browser run or build was performed in this planning pass. Duplicate creation and the UI refusal still need runtime reproduction on synthetic data.

Documentation checks: all four local links in this record resolve; required combined-record sections and the single primary checklist are present. The entry-point/delivery-plan diff was reviewed and `git diff --check` passed. The planning commit contains only this record and those two pointer updates; inspect `git log -1` and the working tree at resume.

Next action: approval above authorizes T-03–T-06 on this branch after committing this approval record. Local merge still requires owner delivery acceptance. Keep the historical BUG-25 institutional migration reminder separate. GitHub remains unchanged; last live main-reference read in the preceding review was `0b1e055` on 11 November, while full issue reconciliation remains dated 26 October.
