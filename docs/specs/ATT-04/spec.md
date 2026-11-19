# ATT-04 — Explain attendance marks

[Issue #11](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/11) · Proposed · 19 November 2026, Asia/Dhaka

## Inspected baseline

- The active Attendance workspace shows Midterm and Final attended/eligible counts, one semester percentage and one semester mark. The selected group and its current roster already have server-side access checks. [Attendance workspace](../../../src/app/(portal)/attendance/page.tsx) · [Attendance loader](../../../src/lib/academic-operations.ts)
- A student's denominator comes from captured records. Late counts as attended, excused and uncaptured records add nothing, and voided sessions are excluded. ATT-03A includes draft, submitted, reopened and locked sessions in the working summary and flags unsubmitted work. [Calculation](../../../src/lib/attendance.ts) · [ATT-03A counting decision](../ATT-03A/spec.md#counting-duplicates-and-existing-sessions)
- SET-01B uses the attendance maximum effective on today's Dhaka date clamped to the active term, or on the end date for a completed term. Settings currently lists the rounding precision in text. [Policy date rules](../SET-01B/spec.md#d-2--how-each-value-applies)

## Proposed decisions

### D-1 — Working attendance and review status

Keep ATT-03A's denominator across all three views. Draft and reopened sessions count toward a working mark. Flag their count for the selected phase, and identify each student's included draft or reopened records in the breakdown. Submitted and locked records count. Voided sessions may appear in the breakdown with an exclusion reason. A locked session protects the roll call through its existing lifecycle. This delivery introduces no result publication or formal mark approval. Institutional authority for official results remains open under [D-06](../../decisions/INSTITUTIONAL_DECISIONS.md#d-06--policy-authority-and-separation-of-duties).

### D-2 — Phase views and one explicit rounding rule

Add Semester, Midterm and Final views within the selected class group, with Semester as the default. Each shows attended/eligible sessions, percentage and the mark out of the applicable theory or sessional maximum. Phase marks apply the same maximum to the selected phase as a progress measure. The semester uses combined counts and is calculated independently. For example, Midterm 1/2 and Final 3/3 give Semester 4/5 and 8.00 out of 10, alongside phase estimates of 5.00 and 10.00. Multiplying the unrounded fraction by the maximum precedes rounding the mark to two decimals. Round percentage separately to one decimal. Preserve the current positive-number rounding behavior, including rounding up at a half step, and show the named calculation and precision in Settings as read-only. Configurable rounding needs an institutional decision and separate scope.

When eligible count is zero, show `0/0` with “No eligible sessions”; explain that the existing calculation contributes zero. When the policy is missing, show counts and any defined percentage with “Mark unavailable” and a short reason. A recorded maximum of zero is a valid policy value. Keep the policy version, its effective-from date and the evaluation date visible and distinguish those two dates.

### D-3 — One student's dated evidence

Open a read-only breakdown from a student row. Keep the group and phase in the URL and preserve them on return. Show the numerator, denominator, raw formula inputs and displayed result, then list dated sessions in date/time order with phase, captured status, session state and contribution or exclusion reason. Present/late add one to each count, absent adds one to the denominator, excused, uncaptured and voided add neither. The student's identity and session rows are read server-side after group authorization and term/group/student membership checks. The breakdown shows no other student's marks. Existing roll-call controls remain the editing entry point for the active term.

### D-4 — Completed terms use their own effective policy

Provide a read-only entry from the completed term workspace to select an authorized group and open its marks. Resolve that term's policy at its end date using the immutable policy version or recorded Version 1 baseline. Later versions for other terms cannot change the result. Completed results use that term's enrollment and captured student IDs, including removed students with non-voided records, and remain visible if a student is later deactivated. The archive identifies students from current directory labels and uses the original captured records for the calculation. The active view keeps today's active roster. The recorded term policy and captured evidence support reproducible calculation without fabricating past releases or storing a new mark snapshot. A term without a recorded policy shows unavailable marks. Historic results with draft/reopened records retain their review warning.

Apply the current attendance group read access to both views, including department scope and assigned-teacher access. Recheck access on every list and detail request. Bind each route to the requested term and canonical group before querying a student. Reject forged term/group/student combinations and deny anonymous or unauthorized requests through existing portal conventions. Use a consistent term context across policy, session and roster reads during activation.

## Delivery boundary

The approved formula and group-scoped working/archive reports constitute this slice. ATT-05 owns the whole-course ledger, student matrix, CSV and print. ATT-03B owns routine/calendar suggestions and roll-call ergonomics. Formal result release, historical amendments, discretionary marks and alternate rounding configurations require separate approval. The proposed calculation and archive read use existing tables and expect no migration for ATT-04 itself.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | Each phase and the combined semester produce correct totals, percentage and marks for mixed phases, late, excused, uncaptured, voided and no eligible sessions. Semester retains current results for an unchanged active roster and policy. | Independent fixture expectations and parity tests. |
| AC-02 | The selected view and drill-down agree on every counted and excluded row, reveal provisional inputs, and preserve group and phase on return. | Domain checks, loader tests and compiled browser review. |
| AC-03 | Settings names the calculation and precision. Theory and sessional marks show the effective version and dates. Missing policy is distinct from a recorded zero. | Both adapters and compiled review. |
| AC-04 | A completed group uses its own end-date policy and retained roster evidence, even after term activation, a newer policy, or student deactivation. | Disposable fixtures with two terms, inherited and missing policies, and activation/read overlap. |
| AC-05 | Anonymous users, unauthorized actors and forged cross-term/group/student requests cannot reveal marks. In-scope administrators and assigned teachers retain access. | Both-adapter role and identity matrix. |
| AC-06 | Desktop and narrow views support keyboard operation, visible focus, readable states and usable student explanations. Roll-call entry and roster workflows remain reachable. | Compiled Edge at 1440, 390 and 320 px, including axe and keyboard. |

[Product requirements](../../PRODUCT_REQUIREMENTS.md#att-04--midterm-final-and-semester-calculations) · [Plan](plan.md) · [Review sketches](mockups/index.html)
