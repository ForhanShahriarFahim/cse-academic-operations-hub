# STU-01A — Inspection and verification

[#37](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · [Specification](spec.md) · [Plan](plan.md)

Inspected baseline `4205eef` · Implemented at `ef7ff89` with the form accessibility correction `42fb6ea` · 18 November 2026 (Asia/Dhaka)

## Inspection evidence

| Finding | Current behavior and disposition |
| --- | --- |
| Scope confirmed | A read-only `gh issue view 37` returned **OPEN** and confirmed a private batch/term directory, upload mapping and dry run, whole-batch and other-department enrollment, and permission-checked exports. The local sequence assigns CSV preview and enrollment here, and Excel/export/print to STU-01B. [Parent issue](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · [Delivery split](../../plans/LOCAL_DELIVERY_2026-10-26.md) |
| Identity and enrollment keys | `students.student_code` is unique globally. `course_enrollments` is unique by term, group and internal student ID. Identity has status, optional stored batch and department/label. Attendance uses stable student IDs. Batch records have stream-plus-label identity, with term placement in a separate table. Group audiences come from explicit offering links. [Schema](../../../src/db/schema.ts) |
| Coupled manual write | `upsertStudentAction` authorizes the supplied teaching group, then updates a student selected by a submitted global ID or code. The ID branch only checks that the student exists. The code conflict branch restores active status and rewrites fields. Both can change enrollment. The new directory and roster commands replace this path. [Current actions](../../../src/lib/academic-actions.ts) · [F-03](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md#high) |
| ATT-02 CSV contract | The current per-group parser uses aliases for the first nonblank header, treats values as text, supports standard quoted fields on one physical line and returns skipped/failed line reasons. Import immediately writes accepted rows and counts committed effects, rejects conflicts and inactive identities, and preserves existing identity details. It has no mapping, batch field or pre-write preview. [Parser](../../../src/lib/attendance.ts) · [ATT-02 checks](../ATT-02/verification.md) |
| Attendance visibility and private columns | The group reader scopes groups by administrator department or assigned teacher. It joins only active enrollments and active students for the displayed roster but loads captured records by session. The UI derives editable session participants from the current roster, so removing/deactivating a student hides their historical session row even though the mark still exists. The page forwards full student rows and the marking table displays phone. D-1/D-3 propose separate projections and captured-session rows. [Group reader](../../../src/lib/academic-operations.ts) · [Attendance UI](../../../src/components/attendance-manager.tsx) |
| Existing authorization and contention | `manage_rosters` is available to the two administrator roles and is enforced against the course's owning department (with the current CSE fallback). Teacher attendance checks the assignment. `withActiveTermContext` reads the expected active term/generation under a shared lock. Class-group mutation takes a term writer lock, and attendance creation takes a per-group transaction lock. [Authorization](../../../src/lib/auth/index.ts) · [Term guard](../../../src/lib/term-context.ts) · [Class group store](../../../src/lib/class-group-store.ts) · [Attendance actions](../../../src/lib/academic-actions.ts) |

## Proposal checks

Scope compared with the parent, local delivery sequence, glossary, architecture record and accepted ATT-02 behavior. Local Markdown targets and fragments, sketch anchors and labels, checklist/criterion structure, and staged whitespace were checked. Inspection used the checked-in source and prior acceptance evidence. The proposal does not assert populated database contents or live behavior on either adapter. Application changes and institutional data access are outside this checkpoint.

The static sketches were checked in Edge at 1440, 390 and 320 px using the locally installed Playwright browser runtime. No page or section overflow, browser errors or axe WCAG A/AA findings were detected. The first navigation link took keyboard focus, and the mapping, preview and receipt links reached their intended sections. These are static sketch checks.

## Acceptance evidence

| Criteria | Evidence |
| --- | --- |
| AC-01 | Both disposable adapters exercised the scoped administrator, an assigned and unassigned teacher, and anonymous action guards. A forged phone mapping was refused and the scoped attendance projection omitted the stored phone. |
| AC-02–AC-03 | Both adapters exercised directory-only upload, leading-zero lookup, stable used IDs, private detail, a home-batch edit, stale edit refusal, deactivation and restoration. Browser exercised search and a saved private phone across reload. |
| AC-04 | Both adapters rejected the old identity write path, kept cross-group enrollment independent, and enforced scoped roster access. The browser exercised manual add, remove and restore. |
| AC-05 | Both adapters verified an eligible batch, stale confirmation after a candidate's deactivation, a fresh successful confirmation, and preservation of identity data. Browser exercised a directory-created candidate and whole-batch enrollment. |
| AC-06–AC-07 | Domain parser checks and both adapters exercised source-line ordering, duplicate/failed rows, truthful partial counts, write-free preview, altered input, overlapping confirmations, replay after restoring earlier state, and audit-failure rollback. Browser exercised a mixed preview, receipt and unchanged retry. |
| AC-08 | Both adapters verified captured identities and preserved marks after removal, and serialized concurrent session creation. T-03 preserved previous term rows, archived publication snapshots and CSV behavior. Archived A4 rendering was outside these checks. |
| AC-09 | Compiled Edge captures and axe checks passed for the directory, detail and mixed receipt at 1440, 390 and 320 px. The first browser attempt identified a read-only Student ID label issue, corrected in `42fb6ea`. The final run also exercised anonymous refusal, attendance save retry, and session create/delete. |

## Checks

- `npm run typecheck`, `npm run lint`, and `npm run test:domain` passed. Focused lint also passed on the final accessibility correction and review script.
- `BUG-ATT-MARKS`, `SET-01A`, `BUG-28`, `CRS-01C`, and `BAT-01A` passed on owned PGlite and PostgreSQL 17.11. `T-03` passed on owned PGlite. The focused final adapter rerun includes single-use proof checks.
- The default Turbopack build stalled during optimized compilation and was stopped. The final explicit Webpack build passed compilation, TypeScript, static generation and output tracing using an unused local database port and an in-memory PGlite fallback.
- The verification harnesses reported unchanged institutional PGlite directory metadata. Reviewed datasets and screenshots contain synthetic records.
- Simultaneous class-group removal or batch edits against a student confirmation were not independently barrier-tested. Established class-group and term writers and the focused confirmation/session checks exercise the locking mechanisms separately.

## Owner review

[Open the synthetic review](http://localhost:3135/sign-in). Start at Attendance → Manage roster, where the active group is preselected. Open Students in the Classes navigation for directory search and private identity detail. The open preview contains synthetic records from the verification run. The [plan](plan.md#current-checkpoint-and-exact-handoff) gives the restart command.

## Delivery and acceptance

Branch `codex/stu-01a`. The proposal was approved at `25f5ff2`. The owner replied “accepted” on 18 November 2026 (Asia/Dhaka) after delivery `51d692a` and its verification disclosures. Acceptance is recorded at `41a2ee3`. The accepted tree merged into local `main` at `c4fc99c` without conflicts or source changes. The merge check matched its tree to the accepted branch, so the prior test results carry forward. #37 remains open for STU-01B. The parent scope and open state were read on 18 November. The last GitHub synchronization was 11 November.
