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

## Proposal checks

Local Markdown targets and referenced headings passed the link check. Reviewed the desktop, narrow layout and A4 sketch markup against D-1–D-5.

## Implementation checks

- `node node_modules/tsx/dist/cli.mjs scripts/verify-student-workbook.ts` checks worksheet visibility and selection, original row numbers, inline and shared text, formula refusal, expanded archive and worksheet bounds, and workbook readback. An independent openpyxl 3.1.5 workbook was accepted, and openpyxl read the app’s exported leading-zero ID and formula-like name as literal text.
- The `BUG-ATT-MARKS` safety group passed on disposable PGlite and PostgreSQL 17.11. It exercised exact-file and format binding, expiry, overlapping confirmation, audit rollback, directory and scoped roster permissions, loss of teacher assignment, expired roles, and matching allowlisted roster projections. Captured attendance was unchanged. PostgreSQL blocking-PID evidence confirmed the second Excel confirmation waited for the first transaction.
- The default Turbopack build failed while starting its CSS worker for `globals.css` during compilation of `/_not-found/page`. Runs used an unused loopback database endpoint and an in-memory PGlite fallback. The safety harness reported unchanged institutional PGlite directory metadata.
- Workbook transport uses pinned `yauzl`, `saxes`, and `fflate`. Format handling follows SpreadsheetML shared/inline text and worksheet relationships. Current-roster download and printing use the shared attendance roster projection. [SpreadsheetML text representation](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-the-shared-string-table) · [yauzl stream and size validation](https://github.com/thejoshwolfe/yauzl/blob/master/README.md)
- `npm run typecheck`, `npm run lint`, and `npm run test:domain` passed. The final guarded `node node_modules/next/dist/bin/next build --webpack` passed compilation, TypeScript, page generation and output tracing. The review initially used an earlier bundle, then needed corrections to wait for the streamed print page and match the receipt's underlying text. The final Edge run used the final bundle and passed.

## Acceptance evidence

| Criterion | Result and evidence |
| --- | --- |
| AC-01 | Passed. Both adapters exercised admin, scoped admin, assigned and reassigned teachers, expired roles, stale context and anonymous requests. Compiled Edge verified private cache headers and anonymous download refusal. |
| AC-02 | Passed. Parser checks covered workbook bounds, hidden sheets, source row 8, cached formulas, and inline and shared strings. Compiled Edge exercised worksheet changes, row errors, partial commit, directory Excel, the sample download and CSV retry. |
| AC-03 | Passed. Both adapters exercised write-free inspection and preview, exact-file and format proof matching, expiry, one committed result during overlapping confirmation, and transactional audit rollback. |
| AC-04 | Passed. CSV, Excel and roll-call membership and ordering agreed on the seeded roster. Checked removed and inactive members, cross-department membership, read-audit failure, empty output, Unicode, leading zeroes and formula-like text. |
| AC-05 | Passed on Edge. The review checked focus, axe and page overflow at 1440, 390 and 320 px. The generated one-page and eight-page A4 portrait PDFs had repeated context and headings, correct page numbers, separate rows, and blank mark cells. All 57 added long-name roster members appeared once. Rendered all pages for visual inspection. The attendance regression preserved captured marks. |

## Owner review

Open the [synthetic preview](http://localhost:3147/sign-in). Start with **Attendance → Manage roster** for downloads and paper roll-call. The **Students** page has its own Excel sample and import. Review artifacts are under the ignored `.tmp/stu-01b/browser` folder.

To restart on a completed isolated build, run `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --stu-01b --serve`. Add `--check` for the synthetic Edge workflow and PDF generation. The review uses a disposable PostgreSQL cluster and localhost only.

Owner acceptance and local merge are pending. The default Turbopack failure remains open. The recorded workbook interoperability check used openpyxl, and the A4 check used the Edge print engine. Desktop Excel and a physical printer were outside these checks.
