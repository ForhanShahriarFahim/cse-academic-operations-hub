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
