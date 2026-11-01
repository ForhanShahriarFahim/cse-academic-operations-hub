# SET-01A — Academic terms and safe activation

Parent: [SET-01 / #14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14)

Status: **Approved for implementation, 1 November 2026**

Updated: 1 November 2026, Asia/Dhaka

Records: [sole plan/checklist](plan.md), [verification](verification.md), [responsive workflow sketches](mockups/terms.html).

## Problem and inspected baseline

The portal has one active academic term but no production screen to create or activate another. Most operational screens implicitly use the active term. Simply adding an activation button would let a form opened for term A save into B, or race a publication or room/teacher check that still assumes A. An academic term here is Spring/Summer, not a cohort's curriculum semester.

Inspection of local `main` at `6011e0f` (no institutional database opened):

| Evidence | Current behavior / implication |
|---|---|
| [`academicTerms`](../../../src/db/schema.ts), migration `0013` | One-active partial unique index; zero active is valid. Status is free text with an `active` default. No revision or management provenance. Preserve existing IDs, dates and statuses. |
| [`active-term.ts`](../../../src/lib/active-term.ts), [`term-scope.ts`](../../../src/lib/term-scope.ts) | BUG-28 refuses unavailable/ambiguous active state. Owning-term checks generally precede the actual writing transaction; no switch-generation protocol. |
| [`actions.ts`](../../../src/lib/actions.ts), [`academic-actions.ts`](../../../src/lib/academic-actions.ts), [`time-grid-actions.ts`](../../../src/lib/time-grid-actions.ts) | 25 term-dependent action entry points need switch ordering and stale-page protection. Existing callers lack explicit expected term/generation. |
| [`teacher-actions.ts`](../../../src/lib/teacher-actions.ts), [`auth/audit.ts`](../../../src/lib/auth/audit.ts) | Teacher deactivation consults active-term references inside its transaction. Audit is atomic with business writes; preserve that and the existing meeting/teacher/room lock order. |
| [`data.ts`](../../../src/lib/data.ts), [`academic-operations.ts`](../../../src/lib/academic-operations.ts) | Active projections compose multiple reads. Missing policy silently falls back to defaults; this cannot serve as consent to start a new term with those rates/marks. |
| [`time-grid-backfill.ts`](../../../src/db/time-grid-backfill.ts), [`migrate.ts`](../../../src/db/migrate.ts) | Startup backfill synthesizes legacy grids for all terms when no patterns exist globally. A newly managed draft must remain empty even in that case. |
| [`settings/page.tsx`](../../../src/app/(portal)/settings/page.tsx), [`nav.tsx`](../../../src/components/nav.tsx), [`auth/policy.ts`](../../../src/lib/auth/policy.ts) | Settings requires an active term; administrators manage policy. A separate term directory must also work with zero active. |
| [`public-routine.ts`](../../../src/lib/public-routine.ts), [`serialize.ts`](../../../src/lib/serialize.ts) | Public output uses the sole active term's immutable published snapshot. Historical viewing must not change this selection or reconstruct old snapshots from current labels. |

These are code observations, not a census of institutional terms. BUG-28 was accepted and merged at `649f292`; its default-build limitation remains recorded separately.

## Outcome and scope

Deliver an internal term directory, draft identity and initial policy setup, explicit read-only historical publication access, and reviewed manual activation that safely orders existing term-dependent writers. An administrator can create an empty draft, save its starting policy, review the change and activate it; the previous active term becomes completed. Existing working pages then use the newly active term.

Included: D-1–D-6 below, responsive management flows, forward migration and disposable recovery/concurrency evidence. This is one bounded foundation under #14; it does not complete the parent.

Excluded: editing historical operational data; whole-portal historical selectors; completed-term reopening; term deletion or a clear-active action; automatic date-based activation; rollover/enrollment/course/grid cloning (BAT-01B/CRS-01B); policy versioning, approval chains and claim recalculation (SET-01B/GOV-01); contact allowlists; public archive discovery; BUG-25 publication numbering/concurrent-publisher repair; institutional migration/rollout; remote synchronization; bundler changes.

## Required behavior and six proposed decisions

### D-1 — Authority, identity and lifecycle

Add `manage_terms` for system and academic administrators using the existing global/CSE permission scope. A role confined to another department does not grant this permission; routine coordinators do not receive it. All authorized internal viewers can read the term directory and redacted publication archive. Recheck authentication, role and scope on every mutation; hiding controls is insufficient. Retain existing session/revocation semantics.

New terms are explicitly `draft`; change the database default for future omitted statuses to `draft`. This is a new SET-01A proposal, not a retroactive BUG-28 change. Preserve all existing rows and unknown legacy status values. Managed lifecycle: `draft → active → completed`. Unknown statuses are displayed literally with an explanation and have no lifecycle controls. No inferred mapping, deletion, clearing the active term or completed reactivation.

Create/edit fields: name, academic year, start date, end date and optional routine effective-from date. Name: trim and collapse whitespace, 1–120 characters; canonical duplicate key is case-insensitive normalized name plus academic year. Refuse a new duplicate on create/edit under serialization, but preserve existing duplicates and IDs without a cleanup constraint; an unchanged inherited duplicate key does not itself block a permitted date edit. Academic year is an integer 1–9999. Dates are valid ISO civil dates in years 0001–9999; start ≤ end; effective-from, when present, is within the range. Do not invent a season list, matching-year rule, timezone instant conversion or prohibition on overlapping terms. Show an overlap notice without blocking a valid draft.

Identity/dates can be edited only on an unused draft, with expected revision. Setup-only policy, period patterns, day plans and permitted windows do not freeze it. Any other term-owned domain reference freezes identity/dates, including cancelled/incomplete rows: cohort placements, contacts/representatives, source reconciliation, offerings/groups, enrollment/attendance, extra-load/manual summaries, external commitments, workload and schedule versions. Indirect references are included through their owning term. Audit entries alone do not freeze it. Active/completed/unknown-status metadata is read-only. This avoids retroactively changing date-based maintenance or attendance meaning.

### D-2 — Viewing is separate from activation

`/terms` lists all terms and the global active state, including zero/ambiguous cases. `/terms/[id]` is a URL-selected workspace showing identity, setup summary and saved publication list. A conspicuous label distinguishes **Viewing [term/status]** from **Active across the portal [term or none]**. Following a GET link changes neither database state nor a hidden selection cookie. Existing operational pages remain active-only; label their link “Open active routine”. Invalid IDs return not found; no unauthorized term metadata or action payload leaks.

Historical editing is excluded. `/terms/[id]/publications/[versionId]` and its print/export actions require internal viewing permission and exact term/version ownership. Only stored `published`/`superseded` snapshots with supported, structurally valid schema 3/4 are viewable. Invalid/unsupported legacy snapshots show unavailable; never fill missing historical identity or content from today's draft data. Use snapshot-derived routine, version, generated/published dates and the existing public-equivalent contact redaction even for administrators. Do not expose raw snapshot JSON, private rosters, payment claims or internal notes. Existing official/teacher print/export formats are reused through the same redacted frozen projection, with a visible historical/version label outside the unchanged official sheet where needed. No new report format.

Public URLs continue to show only the current active term's published routine. Selecting an old term or archive version never changes public visibility. Tokens for writes remain private operational context; they are not added to snapshot schemas or public projections.

### D-3 — Explicit starting policy; truthful empty setup

Creation saves metadata only. The unused-draft setup screen requires an explicit initial save of the existing six numeric values: theory/sessional course credit hours (the existing fields), extra-load threshold, payment per extra class, and theory/sessional attendance marks. Require both `manage_terms` and existing `manage_policy`, finite non-negative values within existing storage constraints (0–999.9 with at most one decimal place for the five non-rate fields; 0–99,999,999.99 with at most two decimal places for the payment rate), and expected draft revision. The protected-business-use test in D-1 also freezes this new draft policy editor. Blank fields are not zero; never prefill an apparent approved policy from `DEFAULT_ACADEMIC_POLICY`. A displayed reference value must be labelled as reference and requires explicit entry/selection before save. Setup changes increment the term revision and are audited atomically. Do not introduce policy notes/governance or silently clone an earlier term's policy.

Activation requires valid identity/dates and an explicitly stored valid policy row, including on a legacy draft; a fallback value does not qualify. A term may have zero classes, cohort placements or grid rows. Show those counts and warn that the new routine will be empty/unpublished and scheduling still needs Days & periods. Do not fabricate students, classes, grids, windows or previous enrollments. Grid editing remains on the existing active-term screen after activation; next-term preparation/cloning is deferred.

Mark newly portal-created terms as managed setup so startup's legacy-grid backfill skips them even when there are no patterns anywhere. Existing rows remain eligible for the original one-time legacy conversion. Preserve explicit source-fixture grid creation and old migration behavior; never infer that a new empty draft is a historical Summer term.

### D-4 — Fresh, manual activation with explicit effects

Only a draft can be activated. The directory/workspace offers **Review activation**, not an inline status dropdown. The review shows previous active identity, target dates/revision and six stored policy values, setup counts, and each term's publication state. Warn that replacing a currently published term removes it from the public active view; its snapshots remain in the internal archive. A target's pre-existing published version, if any, is shown explicitly: it becomes public on activation. Otherwise it stays unpublished until the existing publication action succeeds. Activation does not publish anything.

Require a trimmed reason of 1–500 characters and an initially unchecked acknowledgement naming the target. The server captures expected current active ID (including none), context generation, target revision and a fingerprint of displayed policy/count/publication evidence. On submission, recheck authority, sole-active state, target status, readiness and displayed evidence under the activation lock. If evidence changed, refuse without a write and return an accessible “Review changed; refresh activation review” result. Reject malformed/missing evidence. Ambiguous active state remains unavailable; no UI repair or choice of a winner. Zero active permits a valid first activation.

One transaction changes the previous `active` row to `completed`, target `draft` to `active`, increments affected revisions/context generation, and inserts the before/after audit with actor/reason. Update the former active first to satisfy the retained one-active index. A failed status/audit step rolls back all changes. Two simultaneous reviews cannot silently activate successive terms; the loser must review the new context. Do not rewrite meetings, attendance, claims, snapshots or their existing statuses. Active/completed term policy and operational-history limitations remain explicitly outside this slice's new editing controls.

### D-5 — Stale forms and in-flight writes cannot cross a switch

Every active-dependent mutation must submit the explicit active term ID and context generation from the page that produced it. Missing/malformed tokens fail without a write; no compatibility bypass reads “whatever is active now”. This covers policy, scheduling/auto-scheduling, external commitments, time-grid/copy, extra-load/manual top sheets, student enrollment/import/deactivation and attendance, plus active-dependent teacher deactivation. Preserve existing not-found, active-only ownership and dependent-history refusal results. A global edit with no term-dependent decision keeps its existing behavior.

Use a singleton database context row with a monotonic positive generation; the status/index remains the source of active-term truth. Normal term-dependent writers acquire a shared context lock at the beginning of their actual writing transaction, re-read sole active state, compare both tokens and recheck row ownership there. Activation takes the exclusive lock on the same row before reading its decision evidence. Always acquire context before existing meeting/teacher/room locks; do not upgrade a shared lock late. Thus a writer that owns the shared lock completes before activation, or the later writer observes the new generation and refuses. Ordinary writers may still run concurrently. Retain room-maintenance conflict protections and existing publication checks; this lock does not solve BUG-25's independent publisher race.

Capture term/generation consistently in active loaders, bind all dependent reads to that captured term and recheck generation before returning composed results; refuse/retry a changed context rather than returning A's data with B's token. Current public projection must also detect an intervening activation before returning an old active selection. Historical archive reads bind to explicit IDs instead. Keep internal `writeContext` separate from public term/snapshot objects and carry it through every actual caller, including drag/drop and non-form actions. A delayed page must fail after A→B and even A→B→A (the latter exercised by a disposable test seam, not a reopening feature). Explain the new active term, retain unsaved fields where possible, and provide a refresh link; do not automatically resubmit in the new term.

### D-6 — Preservation, recovery and usable states

Use a forward-only migration (next expected `0014`, confirm journal before implementation) for context, revisions, managed-setup marker and the future-insert default. Initialize context even with zero active; do not choose or repair term statuses. Preserve all existing rows and snapshot bytes. Repeat migration/preparation must be safe. Handle missing context as unavailable, never synthesize an unlocked context during writes. Exercise populated PGlite and PostgreSQL migration/recovery and actual independent-connection lock races on disposable data only.

Use paper/ink/pine/gold styling, keyboard-labelled controls, associated field errors, focusable confirmation and live save/stale feedback. Show loading, empty directory, no active, unavailable, denied, pending, validation, conflict, success and stale states. During pending, prevent repeat submission and keep context visible; on success navigate to the saved selected term. Provide 1440, 390 and 320px layouts with no page-wide horizontal overflow. Print/export use the selected frozen snapshot and existing formats; prove screen/export/print parity and privacy. [Sketches](mockups/terms.html) use invented example terms only; they are not institutional data or runtime proof.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | Directory/workspace works with zero active; viewers read, only correctly scoped administrators mutate; all entry points enforce authority. | Role/scope/session/direct-call matrix; zero-active and unavailable browser flows. |
| AC-02 | Create/edit validation, canonical duplicate races, revision checks and unused-draft freeze rules follow D-1; old statuses/names/dates survive. | Boundary/domain checks plus both-adapter reference and concurrent create/edit cases. |
| AC-03 | Initial policy is an explicit audited draft save; no fallback qualifies for activation; new managed drafts stay empty through startup. | Missing/invalid/zero policy cases, rollback, legacy/no-pattern backfill and source-fixture checks. |
| AC-04 | Viewing a term/version is read-only and does not alter active state or public selection; all other operational pages remain clearly active-only. | URL navigation/state comparisons and browser captures. |
| AC-05 | Archive permits only authorized, correctly owned supported frozen publications and redacts all private contacts; screen/export/print agree. | Seed distinctive private sentinels; malformed/legacy/foreign/draft version refusal, projection and native A4 checks. |
| AC-06 | Fresh acknowledged activation changes only intended lifecycle/context/audit rows; zero-active first activation works; missing/changed review refuses. | Before/after row and snapshot hashes; policy/count/publication/revision races; audit failure rollback. |
| AC-07 | Every identified active-dependent action and caller rejects missing/stale tokens and wrong-term ownership inside the write transaction. | Exhaustive action inventory and persisted-state refusal checks, including teacher deactivation and non-form callers. |
| AC-08 | Independent writers and activation order safely in both directions; competing activations/ABA refuse stale submissions; active/public loaders return coherent context. | Real two-connection barriers on PGlite/PostgreSQL, controlled read interleaving, lock-order/deadlock regressions. |
| AC-09 | Forward migration, repeated preparation and disposable restore preserve historical rows/publication bytes and one-active enforcement. | Populated legacy, zero-active, managed-draft and recovery scenarios on both adapters; no institutional commands. |
| AC-10 | Desktop/mobile management, confirmation, denied/empty/error/stale/pending/success states meet D-6; existing active room/scheduling/policy flows remain usable. | Production browser/keyboard/contrast/layout checks at three widths and targeted integration regression. |
| AC-11 | Required code and domain/safety/build checks are recorded honestly and changes reviewed; owner has a guarded runnable inspection path. | Shared workflow suites, issue groups, diff review and isolated preview; default build separately from any alternate. |

All criteria are pending implementation. Approval of this specification is not acceptance of a future failed check or an institutional rollout.

## Decisions and sources

**Owner decision:** D-1–D-6 approved unchanged on 1 November 2026. Owner replied **“Approve.”** to the explicit approval request after proposal `de43546`; [approval record](plan.md#approval-record). This authorizes bounded implementation, not future failed-check exceptions, institutional rollout or merge before acceptance.

Sources: [local delivery sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md), [workflow approval gate](../../WORKFLOW.md#issue-lifecycle), [SET-01 requirements](../../PRODUCT_REQUIREMENTS.md#SET-01--Separate-configuration-from-governance), [institutional decisions](../../decisions/INSTITUTIONAL_DECISIONS.md), [BUG-28 accepted foundation](../BUG-28/spec.md), [RUT-04](../RUT-04/spec.md), [ROM-01C](../ROM-01C/spec.md). The missing institutional specification, policy approval hierarchy and rollover decisions remain open; this proposal does not resolve them by inference. Administrator authority, draft starting-policy entry and permitted empty activation are explicit owner-review choices here.
