# ATT-02 — Implementation plan

Issue [#9](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/9) · [Specification](spec.md) · [Verification](verification.md)

Approved on 18 November 2026 (Asia/Dhaka) · Branch `codex/att-02` from local `main` at `7c8cabf`

## Proposed approach

- Keep [AttendanceManager](../../../src/components/attendance-manager.tsx) and the [term-bound actions](../../../src/components/term-write-context.tsx) as the entry points. Reuse the portal's [Notice](../../../src/components/ui.tsx) visual language and existing confirmation dialog. Replace the shared page result with results scoped to the initiating section, group and, where applicable, session. Use one concise announcement for each outcome. Announce the import summary and keep the ordered row details in ordinary navigable content.
- Evolve the [roster parser](../../../src/lib/attendance.ts) to return candidate rows and safe row issues with physical line numbers. Add an import-specific receipt to the existing action result. The [shared partial builder](../../../src/lib/action-result.ts) currently requires `total = applied + rejected.length`. Allow an optional unchanged count so ATT-02 can retain the real input total and keep applied restricted to mutations. A rejected entry can be shown as skipped or failed using the import receipt. Preserve the shared result shape when the new count is absent and verify both forms.
- Keep the write under the existing [active-term transaction](../../../src/lib/term-context.ts). Resolve identity and enrollment conflicts using current database state and the existing unique keys. Use a consistent write order for overlapping files while preserving source order in the receipt. A concurrent insert must be re-evaluated as an existing student or enrollment before reporting its effect. Keep audit and mutations atomic, and record the existing audit `count` as applied, alongside the receipt totals. Preserve the existing event name. Refresh only when needed to reflect committed changes, including successful partial uploads.
- Use the installed Next.js forms and Server Actions guides before writing code. Use the current schema on disposable databases. No migration is proposed. Follow the guarded review pattern with isolated build output and explicit synthetic DB targeting from build through start.

## Workflow sketches

**Desktop, Attendance**

```text
Add one student                      Import roster CSV
[Student fields]                     [Choose CSV]  synthetic-roster.csv
[Add student]                        Download sample CSV    [Import roster CSV]
[Local result if submitted]          Some rows need attention
                                     2 created · 1 updated · 1 unchanged
                                     1 skipped · 2 failed
                                     Line 5    Skipped · Duplicate Student ID
                                     Line 7    Failed · Student Name is required
                                     Line 8    Failed · Check the Student ID
                                     Correct and resubmit the affected rows.

Create attendance session
[Date] [Phase] [Optional times] [Teacher] [Create session]
[Create result if submitted]

Take attendance                                [Session]
[Mark all present] [Save] [Delete session]
Attendance saved for 24 students.
[Attendance table]

Student roster & semester summary
[Removal result if submitted]
[Roster and summary table]
```

**Narrow screen, result after Import**

```text
Import roster CSV
[Choose CSV]
synthetic-roster.csv
Download sample CSV
[Import roster CSV]

Some rows need attention
2 created · 1 updated
1 unchanged · 1 skipped · 2 failed

Line 5 · Skipped
Duplicate Student ID

Line 7 · Failed
Student Name is required

Line 8 · Failed
Check the Student ID
```

The same order works for touch and keyboard. Row reasons and filenames wrap inside the panel. Full success uses one short result and clears the picker. File-level validation returns focus to the picker when replacing the file can correct the error. The result summary is the focus target for partial or general failures. Attendance controls and their result stay stacked above the existing scrollable marks table on a narrow screen. There is no changed print workflow.

## Approval record

- Owner replied “Approved.” on 18 November 2026 after being asked to approve D-1–D-5 in proposal `ab3db9a`. This authorizes implementation and verification of that scope without amendments.
- Owner replied “accept and merge” on 18 November 2026 after delivery `1b6649e` and disclosure of the stalled default Turbopack build and passing isolated Webpack build. This accepts ATT-02 for local merge.

## Tasks

- [x] T-01 — Inspect current writes and feedback, reproduce CSV behavior with synthetic rows and present D-1–D-5, AC-01–AC-06 and workflow sketches.
- [x] T-02 — Record owner approval of D-1–D-5 and commit the approved plan.
- [x] T-03 — Implement CSV validation, truthful transactional receipt and the identity safeguard. Verify role/term gating, no-op, rollback, concurrent effects and history on disposable adapters (AC-03–AC-06).
- [x] T-04 — Implement local attendance feedback, draft retention and accessible file selection, refresh and focus handling (AC-01–AC-04).
- [x] T-05 — Record adapter, history and compiled browser evidence and publish the local synthetic review path (AC-01–AC-06). Default Turbopack remains incomplete and is disclosed for acceptance.
- [x] T-06 — Record acceptance at `df5dab6` and merge into local `main` at `a62ff2d`. GitHub reconciliation remains deferred.

## Verification and delivery

Run typecheck, lint, domain checks and the default production build. Exercise parser cases and the shared partial invariant, then run the focused import, BUG-ATT-MARKS, T-03 and term-context safety cases on PGlite and PostgreSQL. Include two independent PostgreSQL imports with shared student IDs and a forced audit failure. In the compiled synthetic review, cover 1440, 390 and 320 px, keyboard/file selection, pending/repeated submit, group and session changes, full/partial/no-op imports, refusal and mark/summary refresh. Record result announcements actually tested and any build or browser limitation in [verification.md](verification.md). Keep commands local and point the review only at disposable data.

## Current checkpoint and exact handoff

18 November 2026. Approval `9139a0c`, verified delivery `1b6649e`, owner acceptance `df5dab6`, local merge `a62ff2d`. The branch `codex/att-02` is retained. The merge applied the accepted tree without conflicts. Default Turbopack remains incomplete. Last GitHub reconciliation was 11 November 2026, per the [project brief](../../PROJECT_BRIEF.md).

> Start from local main and read the current brief and workflow. The next proposed part is STU-01A / #37 inspection and specification for the student directory, CSV preview and enrollment workflow. Review identity, privacy and historical enrollment decisions before seeking implementation approval.
