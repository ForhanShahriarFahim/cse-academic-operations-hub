# ATT-02 — Inspection and verification

Issue [#9](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/9) · [Specification](spec.md) · [Plan](plan.md)

18 November 2026 (Asia/Dhaka) · Baseline `7c8cabf` · DB-free parser reproduction and source inspection

## Baseline evidence

| Surface | Evidence |
|---|---|
| Local feedback | [AttendanceManager](../../../src/components/attendance-manager.tsx) shows one message above the roster/session forms. All six actions use the same state, and the refresh/reset branch tests only `response.ok`. The underlying file input is hidden, the async read stores text independently of the filename, and native reset leaves those React values in place. Source inspection. |
| CSV parser | An inline `node node_modules/tsx/dist/cli.mjs -e` assertion with synthetic CSV reproduced the first-error abort with raw row text in the message, silent duplicate and empty-data-row loss, an unknown audience type defaulting to local, and an unclosed quote being accepted. The test imported only [attendance.ts](../../../src/lib/attendance.ts). |
| Writes and receipts | The [import action](../../../src/lib/academic-actions.ts) writes students and enrollments plus one audit with the parsed row count. Existing student conflicts update global names, phone, department and status. The [schema](../../../src/db/schema.ts) gives student codes a global unique key and group enrollments a term/group/student unique key. These are distinct records in the [domain glossary](../../../CONTEXT.md#attendance-and-workload). Source inspection. |
| Existing preservation checks | [BUG-ATT-MARKS scenarios](../../../scripts/safety/children/attendance-scenarios.ts) cover captured-session marks, roster removal, permissions and term fences. The proposed tests extend the verification to import outcomes and concurrent receipt counts. Existing scenarios were inspected for planning. |

## Implementation checks

- `npm run test:domain` passed, including supported CSV syntax, physical line numbering, duplicate detection, line-level validation and the legacy partial-result contract (AC-03, AC-04).
- The focused `BUG-ATT-MARKS` safety group passed on disposable PGlite and PostgreSQL 17.11. New assertions cover all five counters, safe row details, no-op replay, missing/denied/stale targets, cross-group enrollment without identity changes, reactivation, and atomic rollback on a forced audit failure (AC-03–AC-06).
- The PostgreSQL import race held a student-code insert open until two independent, reversed-order imports were blocked, then released it. One request created both enrollments and the other counted both as unchanged. Exactly one import audit committed. The PGlite run also verified both resulting receipts. Existing marks were unchanged (AC-04, AC-06).
- The safety runner reported the default PGlite directory metadata unchanged and the directory unopened. The first sandboxed PostgreSQL attempt denied loopback access. The successful retry ran with loopback access on the disposable cluster.
- T-03 two-term history passed on its disposable target. BUG-28 and SET-01A passed on PGlite and independent PostgreSQL, including term switch and writer fencing.
- Typecheck and lint passed. The first standalone typecheck overlapped the default build's regeneration of `.next/types`. The standalone retry ran after the isolated build and passed.
- An isolated Webpack production build passed compilation, TypeScript, page generation and output tracing. The default Turbopack attempt stalled in optimized compilation and was stopped. The first sandboxed Webpack attempt hit a generated-directory permission error. The passing retry pinned a loopback-only dummy database URL and the in-memory PGlite fallback.
- The final compiled Edge review passed (AC-01–AC-04). It checked keyboard file selection and submit, invalid-file focus, failed and superseded file reads, partial counts and roster refresh, unchanged retry and picker reset, pending save controls, draft retention after an interrupted save, successful save and reload, session validation and create/delete, roster add/edit/remove, and clearing scoped feedback on group change. Axe and overflow checks passed at 1440, 390 and 320 px. The three partial-result captures in `.tmp/att-02/browser` were inspected. Screen-reader output was not manually checked.
- The first browser run logged a server stream closing early around navigation. The final run waited for the relevant navigation and save streams and completed without that server error.
- Planning checks passed for relative links and anchors, decision and acceptance-criterion coverage, template structure and documentation whitespace.

## Review findings and disposition

- F-03 applies directly to the current CSV action. D-3 proposes refusing conflicting existing identities in that action. Manual roster identity writes and the full identity workflow remain linked to STU-01A.
- The shared partial helper has no unchanged count. D-4 and the plan define how to extend the contract while preserving existing callers.

## Delivery and acceptance

The owner approved D-1–D-5 before implementation at `9139a0c` and accepted delivery `1b6649e` on 18 November 2026 (“accept and merge”), after disclosure of the build limitation. See the [plan](plan.md#current-checkpoint-and-exact-handoff) for the local merge receipt. GitHub synchronization remains deferred.

Start or recreate the disposable preview with `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --serve` after the isolated build. Open [synthetic sign-in](http://localhost:3131/sign-in). Run with `--check` for the scripted browser review. The launcher starts and owns its fixture database and pins the application to it.

In the synthetic preview, try saving a mark and importing this sample to see a committed row and a row requiring correction.

```csv
Student ID,Student Name
ATT-02-OWNER,Synthetic Review Student
ATT-02-INVALID,
```
