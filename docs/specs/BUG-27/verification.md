# BUG-27: Verification

Issue: [#27](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/27). Records: [spec, plan and approval](spec.md).
Verified: 2 October 2026, Asia/Dhaka, on branch `claude/bug-27` (base `75ed28e`), in a Claude Code cloud session: Linux, Node 22.22.0, the preinstalled Chromium, no PostgreSQL tools (the container runs as root, which `initdb` refuses).
Status: **Verified in the cloud session. Awaiting owner acceptance**, which includes the [pending](#pending) PostgreSQL group and a local Edge run.

## What changed

- **[actions.ts](../../../src/lib/actions.ts)**
  - `deleteMeetingAction` looks for attendance sessions linked to the class inside the audited transaction. If any exist, it throws a private `DeleteBlocked` that rolls the transaction back, so nothing is deleted and no audit event is written. The action returns `conflicted(...)` with the session dates: up to five, then "and N more".
  - `deleteExternalAction` does the same with workload allocations, naming each teacher's short code and units.
  - A foreign-key error raised at delete time (a reference added after the check) maps to a conflict with a generic message ("This class/commitment can't be removed: another record uses it."). Other errors still throw.
- **[db-errors.ts](../../../src/lib/db-errors.ts)** (new): `isForeignKeyViolation`, which reads code `23503` from either adapter, directly or from a Drizzle `cause`.
- **[od-manager.tsx](../../../src/components/od-manager.tsx)**: `OdRowActions` keeps a refused result from **Remove** or **Mark verified** and shows it under the buttons with `role="alert"`. It is cleared on the next action (D-3). Before this change, both results were discarded.
- **[workbench.tsx](../../../src/components/routine-workbench/workbench.tsx)**: the class drawer ignores `cancel`/`close` events from dialogs nested inside it. See the [implementation finding](#implementation-finding).
- **Tests:**
  - [delete.check.ts](../../../scripts/safety/delete.check.ts) and [delete-scenarios.ts](../../../scripts/safety/children/delete-scenarios.ts) add the group "BUG-27 blocked deletes" (PGlite, and PostgreSQL with `SAFE01_PG_BIN`) to `npm run test:safety`.
  - [history.check.ts](../../../scripts/safety/history.check.ts) (T-03) now asserts that Spring's linked commitment returns a conflict instead of throwing.
- **Docs:** F-08 is marked fixed in the [SAFE-01 inventory](../../operations/SAFE-01-mutation-inventory.md), and the brief points here.

## Implementation finding

Below the docked width (1440 px), the routine builder's class panel is itself a `<dialog>`. React delivers the nested confirmation dialog's `close` event to the panel's `onClose`, so **confirming any action in the panel closed the panel**. After a refused delete, the class stayed but the explanation disappeared with the panel. This was reproduced at 1366 px before the fix. The panel now acts only on its own events (`event.target === dialog.current`). Escape, its Close button and a successful save or delete still close it, and the full UX suite passes. The change is one handler in `workbench.tsx`, recorded as a scope addition in the spec.

## How it was checked

- **Database checks** ran on owned disposable PGlite databases under `.tmp/safe-01`, through the real actions in a pinned child signed in as an administrator.
- **Browser checks** ran on the disposable review server (`npm run ux:review`, data under `.tmp/ux-review`). For the screenshots, two attendance sessions were linked to MTH-1101 and one OD commitment was counted toward AAM's workload, in that disposable copy only.
- The regression run used a fresh review database.
- Playwright ran through a temporary, uncommitted config that only set `executablePath` for the preinstalled Chromium.
- The institutional database was never opened.

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | A class with attendance on 6 dates returns `conflict`, "This class can't be removed: attendance is recorded against it.", listing 5 dates "and 1 more". The database fingerprint is unchanged, with no audit event and no throw (`delete.check.ts`). |
| AC-02 | Pass | A commitment counted in SYB's workload returns `conflict`, "SYB's workload counts this commitment (3.00 units).", with the fingerprint unchanged and no throw. |
| AC-03 | Pass | An unused class (with its teachers and rooms) and an unused commitment are deleted, with exactly one audit event each. |
| AC-04 | Pass | A real foreign-key error from deleting a referenced commitment is recognised (`23503`); a unique violation is not. The race itself (a reference added between check and delete) is covered by review, not reproduced. |
| AC-05 | Pass | Browser, review database: OD Remove shows the message and AAM's allocation in the row (`role="alert"`) at 1366 px and 390 px, with no page-wide overflow. The routine builder shows the conflict with both dates in the class panel at 1366 px, and the class stays. Mark verified uses the same row feedback path; it was not driven to a refusal. |
| AC-06 | Pass | T-03 passes: 13 cross-term actions are still refused as "not active". Spring's same-term `deleteExternal` is now a conflict, not a thrown error. |
| AC-07 | Pass (PGlite) | `typecheck`, `lint`, `test:domain` and `build` pass. `test:safety`: all PGlite groups pass, and the PostgreSQL groups are PENDING (see below). `test:ux`: 93 passed, 1 skipped (the teacher-routine test that needs a publication), and the review-harness check passes. |

**The test fails without the fix.** With the previous `actions.ts`, the new group fails with `deleteMeeting threw: … violates foreign key constraint "attendance_sessions_meeting_id_meetings_id_fk"`.

## Screenshots

- [Routine builder, class with attendance, 1366 px](screenshots/routine-delete-refused-desktop.png)
- [OD commitment counted in workload, 1366 px](screenshots/od-remove-refused-desktop.png)
- [The same at 390 px](screenshots/od-remove-refused-mobile.png)

## Pending

- **PostgreSQL (owner's machine):** `$env:SAFE01_PG_BIN="F:\AI\tools\pgsql-17.11\pgsql\bin"; npm run test:safety -- BUG-27` (the T-03 group also runs on PostgreSQL through T-06).
- **Local browser run (Edge):** `npm run ux:review -- --fresh`, then `npx playwright test --config playwright.ux.config.ts`.
- **Institutional database:** no migration and no data change.
