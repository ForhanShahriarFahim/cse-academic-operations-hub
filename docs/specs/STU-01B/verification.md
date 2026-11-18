# STU-01B — Inspection and verification

Issue [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · [Specification](spec.md) · [Plan](plan.md) · 18 November 2026 (Asia/Dhaka)

## Inspected baseline

| Area | Observation |
| --- | --- |
| Checkout and parent | Clean local `main` at `70c9aa1` before branching, with accepted STU-01A merge `c4fc99c`. The STU-01A handoff records #37 open and delegates inspection of Excel, roster downloads and printable roll-call. [Handoff](../STU-01A/plan.md#current-checkpoint-and-exact-handoff) |
| Intake | The CSV client reads headings and submits the file, mapping and review proof in FormData. The server applies a 256 KiB and 500-data-line limit, parses and matches rows, and rechecks the proof before writing under transaction and audit. There is no workbook reader/writer in the declared runtime dependencies. [Review](../../../src/components/students/review.tsx) · [Action](../../../src/lib/student-roster-actions.ts) · [Dependencies](../../../package.json) |
| Access and projection | Students uses directory-only server entry points. Manage roster checks `manage_rosters` and shows both active and removed enrollments. Attendance resolves the selected group, computes capabilities separately, and uses active enrollments and active identities for its current roster. [Policy](../../../src/lib/auth/policy.ts) · [Roster page](../../../src/app/(portal)/attendance/roster/page.tsx) · [Attendance page](../../../src/app/(portal)/attendance/page.tsx) · [Attendance data](../../../src/lib/academic-operations.ts) |
| Attachments and print | Internal routine CSV provides a private-response precedent with a dynamic route and `no-store`. Teacher-routine print provides a separate printable page with an explicit print button. These are UI and transport references for the roster-specific authorization and projection. [CSV route](../../../src/app/(portal)/routine/export/route.ts) · [Print page](../../../src/app/(portal)/teachers/routines/print/page.tsx) |
| Framework | Read the installed Server Actions security/body-limit guidance and Route Handler routing/cache guidance. |

## Checks and evidence

Local Markdown targets and referenced headings passed the link check. Reviewed the desktop, narrow layout and A4 sketch markup against D-1–D-5. AC-01–AC-05 are pending implementation and verification. Browser rendering, build, adapter and institutional database operations were outside this planning checkpoint.
