# STU-01A — Implementation plan

Issue [#37](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · [Specification](spec.md) · [Verification](verification.md)

Status: Proposed · Branch `codex/stu-01a` · Base local `main` at `4205eef` · 18 November 2026 (Asia/Dhaka)

## Inspection and proposed approach

| Area | Change and dependencies |
| --- | --- |
| Private directory | Add a server-only student reader/mutator and `/students` list/detail routes. Add `manage_students` with an explicit unscoped check shared by nav eligibility, readers and actions. Use bounded queries and minimal projections. Reuse the portal’s forms, status and confirmation controls and the stored batch/department references. Use the unique student code for manual conflicts and a server-checked record fingerprint for edits and lifecycle changes. |
| Class group roster | Add a focused roster path under Attendance, carrying the validated group and current term. Replace the existing coupled edit path and route CSV through reviewed confirmation. Audit identity and enrollment independently when a new student is created and enrolled together. Replace full-row attendance serialization with minimal current-roster and captured-session projections. Match students by stable internal ID when marking a session. |
| Mapping and preview | Extend the pure CSV parser used by ATT-02 for a one-to-one mapping and normalized validation. Share classification and receipt rules between preview and apply. Resolve optional batches using stable references. Read only relevant rows for the file or batch. Derive an authenticated, short-lived confirmation from the configured server secret with a purpose-specific key. Bind an opaque digest of source, target and reviewed state to the actor. Preview can expire after 15 minutes. The browser resubmits selected inputs with the proof, and receives safe line dispositions. No persistent upload store or extra schema. |
| Writes and ordering | Keep roster mutations inside the shared active-term guard. Coordinate the target with existing class-group writes under the term writer lock and use consistent batch/student/enrollment lock order. Protect the batch candidate set against concurrent home-batch assignment, identity lifecycle and inserts, including an initially empty set. Recompute the plan after acquiring locks. Resolve missing student or enrollment keys using their unique constraints without overwriting identity, and roll back and request review if a race changed the plan. Use one transaction for the writes and audit, including creation plus enrollment. Ensure new attendance sessions read the current roster consistently when an enrollment or identity changes concurrently. |
| Storage and history | Reuse `students`, `course_enrollments`, batch placements, group-offering links and captured records. No migration, reset or data backfill is proposed. Use disposable fixtures with label-only, structured, absent, inactive and cross-department data. Keep existing event/history rows. Defend relational term/group consistency in every write and query. |

The [desktop and phone sketches](mockups/index.html) use synthetic content. Before implementation, recheck the branch, scope and installed Next.js guides for data security, page parameters, mutations, and revalidation.

## Approval record

- Owner authorization: Pending for implementation. The 18 November request authorizes inspection and specification.
- Scope awaiting approval: [D-1–D-7 and AC-01–AC-09](spec.md#decisions-for-owner-review).
- Material amendments: None recorded. Record the actual approval and commit the approved plan before implementation.

## Tasks

- [x] T-01 — Inspect the parent and local implementation, document privacy/history boundaries, and prepare the proposal and desktop/phone sketches.
- [ ] T-02 — Record owner approval or amendments and commit the approved scope.
- [ ] T-03 — Build private directory reads, role and phone gating, explicit identity mutations and safe audit behavior. AC-01–AC-03.
- [ ] T-04 — Build single roster actions, group and term authorization, stable attendance projections and private data minimization. Close alternate write paths. AC-01, AC-04, AC-08.
- [ ] T-05 — Implement shared CSV mapping/classification, batch review, authenticated confirmation, transactional application and truthful receipts. AC-05–AC-07.
- [ ] T-06 — Complete accessibility, responsive states, adapter/browser review and history/publication regression. Record delivery evidence and present the local synthetic preview before requesting acceptance. AC-01–AC-09.
- [ ] T-07 — Record owner acceptance and merge into local `main`. Retain parent #37 for STU-01B.

## Verification and delivery

Use the repository's guarded synthetic database tooling. Run pure parsing, matching and receipt cases, then the new focused group on both PGlite and PostgreSQL. Include independent PostgreSQL races for overlapping confirmations, class-group edits, new identities with the same code, batch membership/lifecycle changes and session creation near roster changes. Compare actual database mutations with receipts, assert zero writes/audits on preview or stale confirmation, and inject an audit failure. Verify revoked/expired roles, wrong group/term, misbound proof, cross-department matching, existing legacy actions, projection privacy, and unchanged historical rows and publication outputs. Run neighboring ATT-02/BUG-ATT-MARKS, term-context, class-group and batch safety checks.

Run `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build`. Record the default build outcome separately from any isolated Webpack result. Use a compiled synthetic browser flow at 1440, 390 and 320 px with keyboard and accessibility checks, including authorized and denied routes, stale confirmation, error recovery and truthful partial receipts. Record the exact disposable review command and limitations in [verification.md](verification.md) before delivery.

## Current checkpoint and exact handoff

The proposal is on `codex/stu-01a`, based on `4205eef`. T-01 is complete. Application behavior and adapter/browser acceptance checks remain pending implementation. The parent issue was read on 18 November and was open. The last broader GitHub reconciliation was 11 November. Institutional data access and GitHub synchronization are separate delivery boundaries.

> Continue on `codex/stu-01a`. Read the current brief, this plan, D-1–D-7, AC-01–AC-09 and the verification record. If the owner approved or amended the proposal, record the actual message and scope in T-02 and commit that record before implementing T-03–T-06. Otherwise retain the proposal for review. Verify using synthetic PGlite and PostgreSQL, present the bounded delivery for acceptance, then merge into local `main` only after acceptance. Keep #37 open for STU-01B.
