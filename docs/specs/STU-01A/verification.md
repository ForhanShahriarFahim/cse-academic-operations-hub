# STU-01A — Inspection and verification

[#37](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · [Specification](spec.md) · [Plan](plan.md)

Inspected revision `4205eef` · Source inspection on 18 November 2026 (Asia/Dhaka)

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

| Criteria | Status | Planned evidence |
| --- | --- | --- |
| AC-01–AC-04 | Pending | Privacy/authorization matrix, directory and exact-group roster commands in both adapters and browser. |
| AC-05–AC-07 | Pending | Read-only previews, CSV validation/counts, locked batch and import races, transactional application and rollback. |
| AC-08 | Pending | Captured-session access and row parity for previous terms, marks and publications. |
| AC-09 | Pending | Compiled browser review at desktop and phone widths with keyboard and accessibility checks. |

## Delivery and acceptance

Proposal branch `codex/stu-01a`. Implementation approval, delivery acceptance and local merge are pending. #37 remains open. The issue read on 18 November verified scope and state. The last synchronization was 11 November.
