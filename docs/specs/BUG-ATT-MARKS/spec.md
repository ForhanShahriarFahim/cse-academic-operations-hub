# BUG-ATT-MARKS — captured-roster attendance and duplicate-session guard

Combined specification, sole checklist, verification and handoff for a bounded bug slice.

Status: **implemented and verified; owner delivery acceptance/local merge pending**.
Updated: 11 November 2026 (Asia/Dhaka).
Branch/base: `codex/bug-att-marks` from local `main` `db01442`; one checkout/writer.
Source: [11 November review](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md), F-01 and the duplicate-guard portion of F-08. This local bug slice overlaps ATT-03 / #10 and ATT-04 / #11; it does not complete either parent. No new remote issue has been created.

## Authorization and decisions

The owner replied **"Approve and implement"** on 11 November 2026 after the concrete specification and D-1/D-2 recommendations were presented. This approves the unchanged scope in planning commit `2b71d8d`, including the captured-roster UI correction, exact-duplicate semantics and stated limits. This approval record is committed before implementation per [workflow](../../WORKFLOW.md). Delivery acceptance/local merge remain separate.

| ID | Decision | Approved rule |
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
- [x] T-03 — Add failing domain and production-path synthetic attendance scenarios, including old-session UI payload and duplicate creation baseline (AC-01–AC-07).
- [x] T-04 — Implement shared captured-record summaries and session UI membership/save handling (AC-01–AC-04, AC-08).
- [x] T-05 — Implement serialized exact-duplicate refusal and prove both-adapter outcomes, PostgreSQL race and audit rollback (AC-05–AC-07).
- [x] T-06 — Run required code checks and affected safety/browser checks; review preservation, permission boundaries and diff; record results/limits here (AC-01–AC-10).
- [x] T-07 — Commit bounded delivery and provide the synthetic owner-inspection path below. Owner delivery acceptance and local merge remain pending; parents #10/#11 stay open.

Verification will extend the owned `.tmp/safe-01` fixtures/controlled-runtime children and safety runner, never import the configured client from an unpinned probe. Use `SAFE01_PG_BIN` for the installed disposable PostgreSQL cluster. Use the guarded `ux:review` synthetic target for UI checks; do not casually run `dev`, `start`, `test:ui` or `db:*`. Full-suite repetition is needed only where changed paths/failures/uncertainty justify it. No schema change means no migration/recovery operation in this slice.

## Verification — 11 November 2026

Approval `fd527d0` precedes implementation `38b923f`. Changes: shared `summarizeAttendance`, captured-only controls/payloads, and advisory-lock namespace `61027` before roster/duplicate reads. No schema/configuration change. Review found no remaining defect within this scope.

| Criteria | Evidence/result |
|---|---|
| AC-01, AC-02 | Pass. `npm run test:domain`, including late enrolment, explicit absence, phase separation, present/late/excused, empty/all-excused, both maxima and rounding. Actual loader on both adapters gives the late student 0/0 Midterm, 1/1 Final, 100% and full marks. |
| AC-03, AC-04 | Pass. Both-adapter persisted-row checks: captured-only saves succeed, crafted added-student payloads fail atomically, reads do not backfill, removed students' records and original fixture attendance remain unchanged. Production browser: add A, create/save session 1, add B, save session 1, reload; B stays “Not in this session” with no selector. Remove A: Save/Mark all present disabled, no selectors, preservation explanation visible. Re-enrol A: original captured Present record reused. |
| AC-05, AC-06 | Pass. `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin` with `npm run test:safety -- BUG-ATT-MARKS`: both PGlite and PostgreSQL 17.11 pass. Duplicate refusal across phase/teacher changes and null times; different times/dates/groups and other-term data do not falsely block. PostgreSQL race observes the second creator's blocking PID while the first is held at insert; exactly one session, roster capture and audit, and one conflict. PGlite queues the second request behind the first. |
| AC-07 | Pass. Assigned teacher succeeds; invalid input, anonymous, viewer, unassigned teacher, wrong-term create/save and stale context write nothing. Injected audit failure rolls creation back; retry succeeds. |
| AC-08 | Pass. Production build on guarded synthetic target, Edge at 1440×1000 and 375×900. Late B shows 0/0, 1/1, 100%, 10/10; duplicate creation across phase change is refused with input preserved. No page-wide overflow; keyboard ArrowDown/ArrowUp changes/restores attendance. axe WCAG 2 A/AA returns zero violations at both widths. Three captures below were visually reviewed. |
| AC-09 | Pass. `npm run typecheck`, `npm run lint`, `npm run test:domain`, default `npm run build` (Next.js 16.3.4 Turbopack), both attendance safety groups and existing `npm run test:safety -- T-03` pass. T-03 verifies two-term loader/export parity, retained history, repeated migrations, 13 cross-term action refusals and time-grid guards. |
| AC-10 | Pass. Successful safety runs report institutional/default PGlite metadata unchanged and never opened. Browser/production preview is pinned to `.tmp/ux-review/pglite`; no institutional operation, application migration, reset, GitHub write or history rewrite. Synthetic harness fixtures apply migrations only to owned disposable targets. |

Red-before-green: the new PGlite production-action scenario failed on the old create action because the second same-key request inserted an extra session, captured records and audit event instead of refusing with no write. The earlier planning reproduction ran the exact old summary block in memory and showed the false 5/10 result. New summary-helper unit assertions were not separately run against an old exported helper (none existed).

Limits and execution corrections:

- Full `test:safety`, `test:ux`, `test:ui`, print/export suites and real-provider sessions were not re-run. Evidence here is the focused attendance groups, existing T-03, domain checks and direct browser workflows; no new print/export surface exists.
- Sandbox PostgreSQL access initially failed with `EACCES`; the same owned checks pass with elevated localhost access. Sandbox browser launch and build worker also required elevated execution.
- A build run alongside the development review server compiled but then failed on malformed generated `.next/dev/types` files. Both processes were stopped, only `.next/dev` was removed, and the default build alone passed. No bundler/settings change. Build-generated `next-env.d.ts` changes were restored to the committed baseline. The final browser review used that passing production build, not concurrent development compilation.
- The successful build retains the existing dynamic-filesystem tracing warning at `src/db/target.ts:36`; that file was not changed. Browser console showed only the existing missing `favicon.ico` 404, with no workflow errors. The first browser wait used the wrong success text; it was corrected to the real “Attendance saved for …” message and the complete workflow passed.
- The exact-duplicate guard protects the portal create action; direct SQL is not constrained. Different time pairs and timed versus untimed sessions can coexist as approved. Existing duplicates and policy/versioning remain deferred.

Captures: [desktop](../../../output/playwright/BUG-ATT-MARKS/desktop.png), [mobile](../../../output/playwright/BUG-ATT-MARKS/mobile.png), [empty-session mobile](../../../output/playwright/BUG-ATT-MARKS/empty-mobile.png). Mobile tables retain their internal horizontal scrolling; the whole page does not overflow.

## Owner inspection and exact handoff

- Branch `codex/bug-att-marks`, base `db01442`, plan `2b71d8d`, approval `fd527d0`, implementation/evidence `38b923f`. This verification/handoff is a subsequent documentation checkpoint. Inspect the actual Git log/status when resuming.
- Host-local production preview: `http://localhost:3100/attendance`, guarded synthetic `.tmp/ux-review/pglite`. In the selected first BAN-1201 group, synthetic `ATT-UI-A` and `ATT-UI-B` are enrolled. Choose 1 May Midterm: A has Present; B is not in that session. Choose 2 May Final: both are captured. B's summary is 0/0 Midterm, 1/1 Final, 100%, 10/10. Duplicate 2 May 09:00–10:00 is refused even if phase changes.
- The ignored host-local launcher `.tmp/BUG-ATT-MARKS/start-review.ts` starts the passing production build with `reviewEnvironment`, an explicitly resolved review target and production mode, bypassing configured-data `prestart`. If stopped, run `node node_modules/tsx/dist/cli.mjs .tmp/BUG-ATT-MARKS/start-review.ts`. It needs the existing review target/session. For a fresh environment use the guarded `npm run ux:review` preparation instead, sequentially with build; never open a second PGlite process while a review server is using that directory.
- Synthetic browser authentication is in ignored `.tmp/ux-review/session.local.json` (`cookie` field for `better-auth.session_token` on localhost); isolated CLI storage state is `.tmp/ux-review/attendance-browser-state.local.json`. Do not commit either. CLI browser is closed; production review server remains available for owner inspection. Browser scripts are ignored under `.tmp/BUG-ATT-MARKS`; tracked captures and this record retain the results.
- **Next action: owner inspects/accepts this delivery.** After actual acceptance, record it, merge the bounded branch into local `main`, then update the brief/sequence with the merge receipt. Do not push or advance another package automatically. Parents #10/#11 remain open. Suggested later package: BUG-LOAD-BASIS, after its separate rule decision/specification.
- BUG-25 institutional migration `0017` remains unapplied under its separate backed-up operation. GitHub remains unchanged; last live main-reference read was `0b1e055` on 11 November, full issue reconciliation 26 October.
