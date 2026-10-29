# ROM-01C — Dated room maintenance and placement checks

Parent: ROM-01 / #5. Status: **D-1–D-6 approved for implementation on 29 October 2026.**
Updated: 29 October 2026, Asia/Dhaka. [Sole plan/checklist](plan.md), [verification](verification.md), [workflow sketches](mockups/index.html).

## Problem and inspected baseline

ROM-01B is accepted and merged locally at `850f42a`. It supplies safe room lifecycle, first-use retention, active-room guards and weekly occupancy. There is no maintenance table or dated closure check. A room can therefore appear usable during a real outage. [Requirements](../../PRODUCT_REQUIREMENTS.md#rom-01--room-crud-and-availability) call for effective dates/reasons, visible maintenance and rejection of overlapping meetings. These requirements do not establish institutional recurrence or approval policy; D-1–D-6 below are proposals for owner approval.

Inspection on local base `cbdbce9`: `src/db/schema.ts` has term date bounds and nullable meeting effective bounds, but the shared meeting view omits those dates. External commitments have a term and optional weekly time/room, without effective dates. `room-transaction.ts`, `room-lifecycle-transaction.ts`, `actions.ts`, `academic-actions.ts` and `time-grid-actions.ts` supply the existing sorted room-lock seams. `conflicts.ts`, `routine-workbench.ts` and `auto-schedule.ts` currently reason about weekly intervals. `room-occupancy.ts` explicitly reports a weekly pattern. Publication freezes immutable schema-4 snapshots; it currently has no maintenance lock/check. The public routine reads snapshots, never live room records. No exposed term-date or meeting-effective-date editor was found in these operational paths. No institutional database was opened or migrated for this inspection.

## Outcome and scope

Internal staff can record a finite dated room outage, review affected bookings and retain correction history. Every placement path checks the actual recurring date range; publication refuses current maintenance conflicts. Occupancy retains its weekly baseline and adds an explicitly selected date view. The public routine remains an immutable publication.

Included: room-scoped create/edit/cancel/history; fresh impact confirmation; dated conflict evidence and placement/publication checks; matching date occupancy/print; populated migration and recovery verification on both adapters. Reuse ROM-01A/B identity, fit, permissions, lifecycle and provenance contracts.

Excluded: single-date class cancellation/make-up/substitution (RUT-05), holidays/academic calendar (CAL-01), leave, automatic reassignment, term switching/activation/editing, external notifications, maintenance attachments/approvers, public live outage notices, new CSV, generic OD editing, broad publication concurrency repair (BUG-25), institutional migration/rollout or remote synchronization. Parent #5 stays open pending accepted delivery and remaining requirements review.

## Required behavior and proposed decisions

### D-1 — Authority, lifecycle and history

Use the existing CSE/global `manage_rooms` authority for create/edit/cancel; recheck server authorization on every request. Existing internal-portal viewers can read maintenance and its operational reason in room/occupancy views; management history remains under the existing room-history permission. Public/unauthenticated users receive no maintenance endpoint or operational reason. Do not introduce an institutional approval hierarchy.

A record belongs to a room globally, across all terms. Active/inactive room status and maintenance are independent. Recording on an inactive room is allowed; reactivation does not remove maintenance, and cancellation does not reactivate a room. First maintenance use irreversibly retains a draft room. Any maintenance history, including past/cancelled entries, prevents physical room deletion. Existing/imported rooms remain retained.

Require a plain-text operational reason, trimmed 1–300 characters. Edits/cancellation require an additional correction reason of 1–300 characters. Past records may be corrected with before/after audit; this is operational history, not an as-of historical certificate. Cancellation retains the record and reason; no hard deletion or reinstate action. A new outage after cancellation is a new record. Normalize identical edits as no-op without revision/audit; a repeated cancellation truthfully reports already cancelled. Stale requests must refresh rather than overwrite.

### D-2 — Civil dates, times and recurrence

Use canonical ISO dates, Gregorian years 0001–9999, and **Asia/Dhaka civil dates**. Start/end are finite and inclusive; start must not exceed end. A one-day outage uses equal dates. Choose all days or a nonempty set of academic weekdays (0 Saturday through 6 Friday). Chosen weekdays must include at least one actual date within the range. All-day means `[00:00,24:00)`; timed means a same-day half-open interval with integer minutes, `0 <= start < end <= 1440`. Offer an explicit end-of-day choice. Reject overnight/open-ended input with a useful message; split overnight work into two records. Different daily hours require separate records. Do not infer a holiday, swap day or daylight-saving conversion.

Overlapping active maintenance records are allowed, with a warning. Keep their identities/reasons; union their intervals for calculations to avoid double counting. Cancelled records never block. Compare date ranges using civil-date/weekday arithmetic, without enumerating every day in a large range. Invalid stored date context must yield unverified evidence and refuse clearance for potentially affected placements/publication, not silently report clear.

### D-3 — Record the outage and review its impact

Do not prevent staff from recording a real outage because a class is already booked. Before saving an impactful create/edit, show a fresh impact review across **all terms**, with separate totals for active canonical meetings, complete physical OD reservations, uncertain room-associated OD records and potentially affected current published versions. All room roles use the entire stored meeting interval, including alternative/segment roles. Cancelled meetings are excluded. A merged class is counted once. Distinct entries are not occupied-minute totals; show first overlap and optionally occurrence count separately.

Require an explicit “Save maintenance despite these bookings” confirmation when any definite or uncertain impact remains. Bind confirmation to normalized input, room/entry revisions, relevant term/effective bounds, current affected references and relevant current publication evidence. Recompute under the room lock before saving. Changed evidence requires a fresh review, including newly introduced/changed uncertainty. Paginate long detail lists with full totals and access to every affected record. A clear review may save directly; if new impact appears before commit, require confirmation. Cancellation needs its correction reason and confirmation, but no override of class clashes because it removes the block.

Do not move, cancel or delete bookings automatically. Show an internal warning that affected published routines may need a separately reviewed replacement. Existing snapshots can lack term/meeting bounds: label their impact potential/unverified rather than inventing exact occurrence dates. Restrict publication advisories to the current effective published version for each overlapping term, not every superseded version. Frozen screen/CSV/official print bytes remain unchanged by maintenance create/edit/cancel.

### D-4 — Recurring placement and conflict semantics

A weekly booking conflicts when its weekday occurs within the intersection of term dates, nullable meeting effective bounds (null = corresponding whole-term bound) and maintenance dates, the weekday is included, and half-open minute intervals overlap. Boundary adjacency is valid. There is **no today cutoff** for schedule validity: a past occurrence within the record's range still matters. An effective range with no occurrence does not create a maintenance clash; malformed context cannot certify clearance. `isException` does not bypass this rule.

Any overlapping occurrence invalidates the entire recurring placement. **One one-off outage can therefore block a whole-term weekly class.** This slice does not add a single-date class override/editor; users may record the outage, inspect the clash and use existing authorized scheduling controls, or await the dated-class-change feature. This limitation is an explicit approval decision.

Show definite maintenance conflicts as blockers, with room, date(s), time and internal operational reason/link. Keep the existing weekly clash rules. Use typed evidence for OD-only/uncertain impacts rather than inventing a meeting ID, teacher or weekday. A teacher-only `teaching` commitment with room metadata alone is not a physical room reservation. Complete `room_reservation`/`combined` commitments reserve the room over their term, including pending verification. Missing day/time on room-associated reservation/unresolved records means unknown occupancy, never fabricated occupied minutes.

### D-5 — Fresh checks on every writer and publication

Carry internal term/meeting date context from raw rows alongside shared schedule data; do not expand or rewrite public schema-4 snapshots to expose live maintenance. For existing candidates use stored effective bounds; new candidates use whole-term bounds. Preview conflicts and server actions use the same pure calculation, with authoritative checks after locks.

Integrate manual create/update, OD create, automatic batch apply, drag/keyboard/undo moves, and bulk time-grid moves. Recheck every assigned room role. Existing meeting edits lock meeting(s) first, then the sorted complete room union, as in ROM-01B. Automatic/bulk actions are all-or-nothing. Closure mutations lock the parent room and entry, never acquire meeting locks afterwards; assignment writers and closure writers serialize on the same parent room. Re-read current closure rows under that lock. Cancellation/edit races must also yield a result consistent with commit order. Keep B's activity/fit/retention guards.

Unknown OD notes may still be recorded under existing active-room rules and shown as unverified. A new complete physical OD reservation must pass the dated check. **If an unresolved room-associated use could intersect active maintenance within its term, publication is blocked until the use is corrected/removed or maintenance no longer intersects.** This proposed conservative gate applies even when the current snapshot normally omits an unverified OD record. It does not invent a teacher conflict or bar unrelated rooms/terms. This slice does not add OD correction UI.

Publication locks the sorted union of rooms referenced by the candidate snapshot plus relevant unresolved room-use evidence, re-reads maintenance and relevant date/use context, and validates the actual data being frozen before transaction commit. Do not validate one projection then freeze a different one. Record maintenance-check identifiers/revisions in the internal publication audit, excluding operational reasons from public output. If publication commits first, later maintenance can save after impact confirmation and raises an internal publication advisory; if maintenance commits first, conflicting publication must refuse. This guarantees maintenance-versus-publication ordering only. It does not repair all schedule-versus-publication races/version numbering in BUG-25.

### D-6 — Weekly versus selected-date occupancy

Keep the ROM-01B default weekly pattern and its denominator. Show relevant dated-maintenance badges/caveat; do not subtract a one-day outage from every week. Add “Check a date” for an ISO date **within the active term**; invalid/outside dates retain input and explain the bound. No historical-term selector. Date basis filters meetings by weekday and effective dates, applies weekly OD to its term and intersects active maintenance with that date. Multiple active terms remain the separate BUG-28 concern; do not choose another term silently.

Reuse stream-specific common windows, break subtraction, batch-exception exclusion and exact-minute unions. For each room/date distinguish:

| Measure | Definition |
| --- | --- |
| Recorded bookings | Union of complete class/physical OD intervals, even outside common windows or during maintenance |
| Common usable time | Union of the existing common windows after stream breaks, before maintenance |
| Maintenance | Union of active maintenance on this date; report overlap within common usable time separately |
| Usable after maintenance | Common usable time minus maintenance |
| Booked within available time | Booking intersection with usable-after-maintenance intervals |
| Booked during maintenance | Booking intersection with maintenance; show a blocker, never conceal it in utilization |
| Utilization | Booked-within-available / usable-after-maintenance; show “Closed” for a fully closed configured day, “Not configured” when no common window exists, never divide by zero |
| Potential gaps | Common usable time minus union(bookings, maintenance), then exact duration/fit/capacity/capability filters |

Uncertain OD makes potential gaps **unverified** without guessing minutes. Inactive rooms have no assignable gaps. Unknown audience/capacity remains unknown. Do not bridge breaks, round to grid slots or count merged/overlapping intervals twice. This is a date projection of recorded weekly data, not full live availability: holidays, single-date class changes and unrecorded use are not modeled.

Preserve room/term, selected basis/date, filters, Asia/Dhaka generated timestamp and warnings in screen/A4 portrait print, including continued-page context and page counts. Do not add CSV or public live maintenance. Keep operational reasons in authorized internal output only.

### Interaction states

From room detail, maintenance list shows upcoming/current/past/cancelled entries and independent room status. Provide list/history, create/edit form, explicit impact review and cancellation dialog. Keep one primary action per stage; label date, weekday, all-day/time and reason controls. Preserve form values and anchor errors to fields; announce refused/stale/success results and return focus sensibly. Pending submissions prevent duplicates; failed audit rolls back data/revisions. Empty lists explain how to add; denied controls have no writable server path. Full impact totals/history remain reachable on phones. Reuse paper/ink/pine/gold, 44px controls, keyboard access and no page-wide overflow at 390/320px. [Sketches](mockups/index.html) illustrate synthetic normal/impact/stale/date/print states, not implemented behavior.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | Authorized staff create/edit/cancel; read/manage scopes and public denial hold on forged requests | Role/action matrix, browser denied flow |
| AC-02 | Finite civil dates, weekday/time/end-of-day rules and half-open overlap agree without host-timezone dependence | Pure cases: leap/year bounds, adjacency, empty weekday occurrence, malformed bounds, large ranges |
| AC-03 | Fresh all-term impact review distinguishes definite/uncertain/publication evidence and reconfirms changed input/data | Action/integration races, paged browser review |
| AC-04 | Draft retention and all maintenance history prevent deletion; room status stays independent; no-op/stale/audit rollback are truthful | Both adapters, lifecycle/action flows |
| AC-05 | Manual/OD/auto/move/undo/bulk writers enforce actual recurring date overlap and keep fit/activity rules | Actual production-action tests; both commit orders and atomic rollback |
| AC-06 | Typed definite/uncertain OD evidence has no fake teacher/weekday/minutes; uncertain overlap gates publication as D-5 | Pure classifier, publication/actions/UI cases |
| AC-07 | Maintenance-versus-publication has D-5 commit ordering; frozen outputs/history remain unchanged | Two-connection PostgreSQL publication race; screen/CSV/print hashes |
| AC-08 | Weekly basis preserved; selected-date figures/gaps match D-6 interval algebra and uncertainty | Shared projection tests, merged/alternative/segment/stream/break/unknown fixtures |
| AC-09 | Desktop/390/320 states, keyboard/focus/labels/pending/stale/denied and A4 continuation remain usable | Production browser, axe WCAG A/AA, native PDF render and visual inspection |
| AC-10 | Forward populated migration/recovery preserves old business rows, historical terms and snapshots on PGlite/PostgreSQL | Before/after fingerprints and exercised disposable recovery |
| AC-11 | Required final code checks and safety suites pass with honest limitations; delivery reviewed before local merge | Typecheck/lint/domain/default build, relevant full safety/browser results, owner acceptance |

## Decisions and sources

The owner approved **D-1–D-6 as one bounded package** on 29 October 2026: “Approve D-1–D-6 to begin implementation. Approved”. This includes dates/recurrence, saving despite clashes, the whole-week placement consequence, the conservative uncertain-OD publication gate and unchanged public snapshots. No amendments were requested. No institutional maintenance calendar or approver has been inferred from source documents.

Evidence: [requirements](../../PRODUCT_REQUIREMENTS.md), [institutional decisions](../../decisions/INSTITUTIONAL_DECISIONS.md), [local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md), accepted [ROM-01A](../ROM-01A/spec.md) and [ROM-01B](../ROM-01B/spec.md), and the inspected source modules listed above. The [plan approval record](plan.md#approval-record) owns actual authorization; this proposed document is not approval.
