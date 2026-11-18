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

## Acceptance evidence

AC-01 through AC-06 are pending implementation. The parser reproduction confirms baseline behavior only. Browser/keyboard runs, database scenarios and production builds are pending. Planning did not open a database or run the portal.

Planning checks passed for relative links and anchors, decision and acceptance-criterion coverage, template structure and documentation whitespace.

## Review findings and disposition

- F-03 applies directly to the current CSV action. D-3 proposes refusing conflicting existing identities in that action. Manual roster identity writes and the full identity workflow remain linked to STU-01A.
- The shared partial helper has no unchanged count. D-4 and the plan define how to extend the contract while preserving existing callers.

## Delivery and acceptance

The proposal is ready for the owner to review. Implementation approval, delivery acceptance and local merge are pending. GitHub synchronization remains deferred.
