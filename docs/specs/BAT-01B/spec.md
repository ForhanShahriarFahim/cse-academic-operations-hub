# BAT-01B — Reviewed next-term cohort rollover

Parent: [BAT-01 / #6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6)

Status: **D-1–D-6 approved by owner on 8 November 2026; implementation authorized.**

Updated: 8 November 2026, Asia/Dhaka

[Sole plan/approval/checklist](plan.md) · [verification](verification.md) · [responsive proposal](mockups/rollover.html)

## Problem and inspected baseline

BAT-01A is accepted and merged at `6beac09`; local handoff `10e3485`. Cohort identity/lifecycle and active-term manual placements/counts exist. There is no next-term rollover action, draft placement editor or durable record of a term-specific hold. Semester 1–8 is supported. Graduation is an explicit cohort planning status, subject to all-term unresolved-use guards; it does not certify individual degrees.

SET-01A creates an unused draft, saves an explicit starting policy and separately reviews activation. `termProtectedUse` treats placements as business use, freezing draft identity and starting-policy editing. Therefore rollover must require those settings to be ready before adding placements. Period patterns/day plans/windows are term-scoped; batch exceptions must remain batch-specific. No academic calendar model or CAL-01 workflow exists in the inspected schema; dated room maintenance is not a term calendar.

Evidence: [requirements](../../PRODUCT_REQUIREMENTS.md#bat-01--cohort-lifecycle-and-springsummer-rollover), [accepted BAT-01A](../BAT-01A/spec.md), [schema](../../../src/db/schema.ts), [term actions](../../../src/lib/term-actions.ts), [term evidence](../../../src/lib/term-data.ts), [batch actions](../../../src/lib/batch-actions.ts), [batch reference guards](../../../src/lib/batch-store.ts), [time-grid actions](../../../src/lib/time-grid-actions.ts). Only repository code/synthetic examples were inspected; no institutional data census or operation.

## Outcome and scope

An authorized administrator prepares an existing unused destination draft from an explicit source term, reviews every cohort disposition and optional time-grid copy, then confirms one atomic operation. Source placements, counts and frozen publications remain intact. The destination remains draft until SET-01A activation.

Included: source/destination selection, progress/repeat/hold/graduate decisions, counts copied only as estimates, optional grid cloning, durable receipt/history, strict authorization, stale/concurrency safeguards and responsive review/results.

Excluded: automatic term creation/policy cloning/activation, standalone draft placement/count editing, undo/re-run/partial append into a rolled-over term, course/offering/group/meeting/teacher/student/enrollment/contact/attendance/payment cloning, degree eligibility, calendar creation/cloning (unavailable prerequisite), institutional migration/rollout, build-policy repairs, remote synchronization and unrelated attendance/print fixes.

## Approved decisions — D-1–D-6

### D-1 — Explicit terms, authority and setup gate

- Entry **Prepare next term** from Batches and an eligible draft's term workspace; proposed route `/terms/[id]/rollover`. Select an existing source with status active/completed and a different destination with status draft. No names/dates are generated as institutional facts. Destination start must be later than source start; overlapping date ranges warn without changing SET-01A's overlap policy. No active term is required if a completed source exists. Ambiguous active context fails closed.
- Require both `manage_terms` and `manage_batches` under the existing CSE department scope, on loaders/previews and again in the commit transaction. No new role. Other portal users may see the safe term setup/rollover summary; only authorized editors see editable plans, reasons and raw receipt details.
- Destination must have valid identity/dates and an explicitly stored valid starting policy. Refuse business use using the full existing protected-use inventory, any previous rollover receipt, or any pre-existing destination placement. Explain that details/policy become read-only once placements exist. Link the existing draft details/setup actions before confirmation.
- Pre-existing grid setup may remain when cloning is off. Cloning requires zero destination patterns, day plans and term-owned permitted windows; never overwrite or merge them. Include these rows in the fresh destination evidence, even though setup rows do not freeze draft identity by themselves.

### D-2 — Cohort progression, hold and graduation

- Show every source placement, stream-qualified identity, current lifecycle state, source semester/count/confidence and proposed outcome. Only active cohorts with a valid 1–8 semester may produce new placements. Inactive/graduated/unknown-status and anomalous source placements remain visibly excluded, with the reason; do not normalize legacy data. Show active cohorts missing a source placement separately; do not infer their semester or include them automatically. New identities/manual placement remain BAT-01A work after activation.
- Valid source semester 1–7 proposes **Progress** to exactly `n + 1`. **Repeat** creates destination semester `n`. Both preserve identity and insert a new placement. No arbitrary semester correction in this wizard. Semester 8 requires an explicit Repeat, Hold or Graduate decision; no semester 9 or automatic graduation. Every displayed eligible source cohort must have exactly one decision; reject omitted, duplicated, unknown or forged cohort IDs.
- **Hold** creates no destination placement and changes no global cohort/student status. Require a short non-private reason. The receipt retains that term-specific decision, so absence is distinguishable from an accidental omission. A later term may use an explicitly selected earlier source; do not silently resurrect a held cohort.
- **Graduate** requires an explicit per-cohort acknowledgement and reason. Apply BAT-01A's unchanged fresh all-term unresolved-use guards before global cohort status becomes graduated; active source offerings/meetings/enrollments and other draft placements may block it. Dates alone do not mark obligations complete. Display blockers with aggregate term links. Offer Hold as an alternative, never substitute it automatically. Safe graduation preserves historical placements/counts and all student records. No lifecycle change at preview time.
- Hold/graduate reasons are 1–300 characters without control characters; the whole operation also requires a reason. Refuse a plan with zero eligible decisions and no valid selected grid copy rather than creating a meaningless receipt.

### D-3 — Count carry-forward without verification

- For each Progress/Repeat, show **Carry source count as estimate** (default on) or **Start unknown**. A valid source number, including explicit zero, copies to the new placement only as an unverified estimate; all destination verifier/time fields are null. Null remains unknown. Invalid legacy numbers fail closed for copying and require Start unknown.
- Source count value/confidence/revision participates in preview evidence. Do not transfer private free-text count source, actor or verification time. Generate non-private provenance from source term/placement IDs and a rollover origin. Keep the original count and its verification untouched. Destination count confirmation remains BAT-01A's active-term workflow after separate activation. Existing room-fit and publication warnings continue to apply.

### D-4 — Optional time-grid clone with remapped references

- Clone is an explicit opt-in, off by default. Preview counts of period patterns, stream day plans/windows and included/excluded cohort exceptions. Copy pattern periods and named breaks, assign new IDs, remap day-plan pattern references to destination IDs and preserve stream-level versus batch-specific scope.
- Copy term-owned stream plans/windows and only exceptions for cohorts receiving destination placements through Progress/Repeat. Exclude held/graduated/inactive/unplaced cohort exceptions, list their count/reason in review and receipt. Preserve valid no-classes overrides (`patternId = null`). No expansion from a cohort exception into a stream rule. Null-term legacy windows are not silently assigned to either term; show them as excluded legacy evidence.
- Validate source pattern/plan/window shapes, stream ownership, unique semantic keys, valid weekday/time ranges and same-source-term pattern references. Contradictory/ambiguous legacy rows block cloning with an explanation; cloning off remains possible if the placement plan is otherwise safe. Do not infer a corrected timetable. Clone neither legacy `break_rules`, meetings, room bookings/maintenance nor external commitments. Do not move existing classes.
- Calendar cloning is unavailable with the current schema. Explain this in the review; add no working-looking calendar checkbox or placeholder that suggests CAL-01 exists.

### D-5 — Atomic evidence, replay prevention and retention

- Add one durable `term_rollovers` receipt per destination (unique destination FK), referencing source/destination, authorized actor/server timestamp, operation reason and a bounded decision/clone summary. Holds exist here without fake placement rows. Do not expose private reasons via public snapshot assembly. Use a forward-only next migration (expected 0016; confirm actual journal first), preserving existing rows and publications.
- Preview is a read-only, consistent context-lock transaction. Commit takes the exclusive term-context lock first, reauthorizes the actor/scope, locks source/destination terms in ID order, then affected cohorts/placements in ID order, and recomputes the complete preview evidence before any write. Never upgrade a shared context lock. Existing shared context participants serialize source grid/count/reference writes and activation against rollover; inventory any unguarded destination/setup writer before implementation.
- Bind a SHA-256 evidence fingerprint to context ID/generation (including zero-active state), source/destination fields/revisions, policy, complete source placements/cohort revisions/count values, all relevant grid rows, source lifecycle-blocking references, destination protected use/setup and proposed choices/options/reasons. Do not trust frontend eligibility, actor, time, computed semesters/counts or fingerprints as authorization. A changed value requires another review; retain typed decisions, highlight changed rows and require explicit acknowledgement again.
- Within one transaction insert placements/grid/receipt, apply only safe explicitly requested graduation, increment destination term revision and affected cohort revisions as applicable, and append named audits containing source/destination/decision/ID maps. Audit failure rolls everything back. Do not bump active-context generation because active selection is unchanged. Replays/races cannot produce duplicate destination placements or receipts; stale/replayed results link the existing receipt without claiming a new write. Unique constraints are a final backstop, not a replacement for fresh checks.
- A committed receipt freezes this wizard for that target. No silent overwrite, rollback/delete or repeated append. Corrections after rollover need a separately approved scope; disclose this before confirmation. Existing activation remains usable with prepared placements/grid and a saved policy. Old snapshots and student/attendance/payment/claim rows remain byte-identical in both-adapter synthetic preservation evidence.

### D-6 — Reviewable interface and honest states

- Three stages: **Choose terms → Review cohorts & grid → Confirm preparation**. Show source and destination names/status/dates and current active term throughout. Review displays exact source/destination semesters, dispositions, source count confidence → estimate/unknown, graduation blockers and grid inclusion counts. Back preserves local choices; changing choices invalidates prior confirmation. Reload may discard an uncommitted proposal with a clear notice; no server draft-plan persistence is promised.
- Require operation reason, typed destination identity and acknowledgement that preparation does not activate the destination and copied counts need reconfirmation. Show the setup freeze and one-time nature before commit. Pending disables duplicate submissions and announces progress; success displays persisted receipt and destination setup links, then **Review activation** as a separate action.
- Cover no source/destination/no cohorts, missing policy, destination used/already prepared, denied/not-found, invalid/duplicate fields, blocked graduation/grid, stale/ABA, failed/rolled-back save and success. Field errors associate with labels; feedback is announced and receives focus. No page-wide overflow at 1440/390/320px; desktop compact rows become mobile cards. Keep paper/ink/pine/gold design. No new print/export product; existing frozen routine/teacher/official/CSV projections are regression surfaces.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | Only correctly scoped term+cohort administrators preview/commit; raw unauthorized actions refuse. | Role/scope/anonymous and expired/revoked-role matrix; viewer journeys. |
| AC-02 | Valid explicit source and ready unused draft required; dates/status/usage/grid conflicts shown truthfully; activation remains separate. | Zero-active/two-term/ambiguous-context and protected-use fixtures; full SET-01A integration. |
| AC-03 | Progress/repeat insert correct unique placements; hold inserts none; semester 8 requires choice; exclusions/missing/anomalous rows visible. | Pure domain boundaries, persisted all-choice fixtures, forged/missing/duplicate IDs. |
| AC-04 | Only explicitly confirmed safe graduates change global status; unresolved uses block atomically; students/history retained. | Every BAT-01A blocker/status, fresh evidence and reference/graduation races. |
| AC-05 | Valid counts including zero copy as estimates or unknown with fresh provenance and no verifier/private source leakage. | Verified/estimate/unknown/invalid source matrix; after-activation room/publication warning regression. |
| AC-06 | Optional clone remaps pattern IDs/scopes and exceptions correctly; existing destination setup never overwritten. | Stream/batch/no-classes/held/excluded/legacy-grid matrix; rollback on invalid source. |
| AC-07 | Receipt, placements, grid, lifecycle and audits commit together once; stale/context/replay/race outcomes are truthful. | Audit-failure rollback, concurrent replay, source-edit/activation/destination-write races on both adapters. |
| AC-08 | Populated forward migration/reapply/recovery preserve old fields/IDs and historical publication/attendance/claim data. | Disposable PGlite/PostgreSQL copies, row/snapshot hashes and restore evidence; DB-free import guard. |
| AC-09 | Responsive editor/restricted/feedback journeys preserve choices and distinguish preparation from activation. | Production browser 1440/390/320px, keyboard, pending, labels/contrast and captures. |
| AC-10 | Existing active/history/public/CSV/A4 projections remain unchanged until separately authorized writes. | Two-term preserved snapshot/CSV/render evidence, native A4 baseline regression. |
| AC-11 | Required checks reported honestly; runnable synthetic review supplied; owner acceptance precedes local merge. | Typecheck/lint/domain/default build, full safety inventory, relevant browser evidence and delivery receipt. |

## Decisions and sources

D-1–D-6 were explicitly approved on 8 November: **“Approve D-1–D-6 and implement”** in response to the concrete decision request. These are application behavior, not institutional claims. The owner's **“Done! Now go for the implementation.”** on 8 November requests implementation, but no BAT-01B specification existed at that point. Per the owner's [AGENTS.md](../../../AGENTS.md) and [workflow](../../WORKFLOW.md), the concrete scope above must be presented/approved and committed before feature code. The approved BAT-01A unresolved-use/history/privacy rules remain authoritative; no degree/calendar facts are invented. Approval is recorded only in the sole plan.
