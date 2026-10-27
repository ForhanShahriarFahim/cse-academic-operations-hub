# ROM-01A — Room directory editor

Parent: #5 ROM-01 (partially delivered only after this slice is accepted).
Status: **Approved for implementation by the owner on 27 October 2026. Application implementation has not started.**
Updated: 27 October 2026, Asia/Dhaka.
Plan and sole checklist: [plan.md](plan.md). Inspection evidence: [verification.md](verification.md).
Design review: [mockups/index.html](mockups/index.html).

## Problem and inspected baseline

Inspected clean local `main` at `8c34c0e`, the documentation handoff after accepted BUG-24 merge `84964e2`. Work is on `codex/rom-01a`; no remote reconciliation is due. No institutional database was opened or counted.

| Evidence | Current behavior and implication |
| --- | --- |
| [Rooms page](../../../src/app/(portal)/rooms/page.tsx) | `/rooms` is read-only. Cards combine identity, type, capabilities, seats, owner, notes and active state with active-term occupancy. There are no room forms or room actions. Existing occupancy is not a free-window or dated-availability service. |
| [Schema](../../../src/db/schema.ts) | `rooms` has stable integer ID, unique code, building, type, JSON capabilities, nullable capacity and owner, `is_active`, notes. No edit revision or room-specific history. `meeting_rooms` preserves primary/alternative/segment roles; OD commitments reference the same room IDs. |
| [Data loader](../../../src/lib/data.ts), [serializer](../../../src/lib/serialize.ts) | Live views join current room values; only one active term is selected by the general loader. Room master data itself is global. A safety query must not mistake that one selected term for all references. |
| [Conflict rules](../../../src/lib/conflicts.ts) | Sessional classes require type `lab`; any declared specialist capability must match. Known audience above known capacity blocks. An unknown audience warns; unknown capacity is not zero. All assigned rooms are checked, including alternative roles. |
| [Workbench](../../../src/lib/routine-workbench.ts), [actions](../../../src/lib/actions.ts), [auto placement](../../../src/lib/academic-actions.ts) | Room suitability is previewed before the transaction. A new room-edit workflow needs a shared transaction boundary with room assignment writers so a concurrent edit cannot invalidate a just-saved class. This is a narrowly necessary integration change, not a builder redesign. |
| [Authorization](../../../src/lib/auth/policy.ts), [guard](../../../src/lib/auth/action-guard.ts) | `manage_rooms` does not exist. Existing default resource scope is CSE; owning-department metadata alone is not a permission rule. |
| [Teacher editor](../../../src/lib/teacher-actions.ts), [audit](../../../src/lib/auth/audit.ts), [results](../../../src/lib/action-result.ts) | Reusable patterns: server authorization, plain field errors, stale results, transactional before/after audit, editor-only history and contextual success messages. |
| [Public projection](../../../src/lib/public-routine.ts) | Publications contain their room references in immutable snapshot JSON. Room edits must never rewrite or replace those snapshots. |

Institutional rules come from [requirements §9](../../PRODUCT_REQUIREMENTS.md#9-rooms-and-occupancy), [architecture decision](../../architecture/ADR-001-academic-operations-boundaries.md), and [D-05 source corrections](../../decisions/INSTITUTIONAL_DECISIONS.md#d-05--routine-source-corrections). The [Summer source](../../source/CSE_SUMMER_2026_ROUTINE_V1_6.md) contains placements, including NB-408/505 alternatives, not a verified room-capacity register. [Seed defaults](../../../src/db/seed-summer-2026.ts) and migrations 0002/0003 are implementation evidence, not fresh institutional confirmation. Those earlier migrations also use numeric room codes (406/407/408/505); preserve both representations without automatic renaming. NB-506's imported computer capability and NB-608's generic laboratory label do not resolve the source questions about NB-508/NB-608. No facts or capacities are inferred from course placements.

## Outcome and scope

An authorized editor can add a room, correct its directory fields, inspect the impact of an edit, save without overwriting another editor, and inspect who changed each field. New and edited rooms are visible in the existing live directory and routine data; published output keeps its recorded values.

Included: directory entry points, add/detail/edit pages, field validation, one new capability, edit revisions, room change history, room-specific assignment safety, narrowly shared locking/revalidation with existing manual and automatic room assignment writes, a populated forward migration and synthetic adapter/UI verification.

Excluded: deactivate/reactivate/delete, status changes, picker lifecycle cleanup, weekly occupancy redesign, free-window search, maintenance/unavailability/date recurrence, automatic reassignment, bulk import/export, room merging, term activation/selection, institutional source reconciliation, publication workflow/concurrency changes, dated room versions, general schedule concurrency repair, hosting, remote writes and institutional migration. ROM-01B/01C and the rest of #5 remain open. Existing occupancy calculations, ordering, cards and print projection stay in place apart from editor links/buttons.

## Owner decisions approved on 27 October 2026

The owner replied “approve.” after the specification, sole checklist and desktop/mobile mockups were presented for approval, explicitly including D-1–D-6. These decisions are approved for this bounded slice; the exact approval evidence is in [plan.md](plan.md#approval-record).

| ID | Proposed decision | Consequence |
| --- | --- | --- |
| D-1 Editors | Grant new `manage_rooms` to system administrator, academic administrator and routine coordinator, under the current CSE planning scope. | CSE-scoped or global assignments may manage this CSE planning directory, including shared/unknown-owner rooms. Assignments scoped only to another department do not qualify. Owner field changes do not grant/revoke access. Other internal roles are view-only. |
| D-2 History | Stable room ID, current live values, immutable published values, and an editor-only before/after change log. | A correction also changes live joins in historical working records. It does not recreate the old live directory for a past date. Published screen/CSV/print values remain frozen. |
| D-3 Protected facts | In this slice NB-406/407/408 keep their codes, lab type and at least `computer` + `theory`; NB-505 keeps its code, lab type and at least `computer`, `microprocessor`, `networking`, `theory`. Apply the same minima to existing legacy numeric codes 406/407/408/505 without renaming them. | Capacity/building/owner/notes and extra capabilities remain editable. A material correction to these protected facts requires a separate owner decision; renaming one cannot bypass the rule. These protections do not certify other imported rooms. |
| D-4 Assignment safety | Check every active canonical meeting that references the room, in **every term**, including alternatives/segments. Block new or worsened room incompatibility/over-capacity and clearing known seats while such references exist. | Conservative scope deliberately avoids a new definition of future occurrences before ROM-01B/01C. Even an old term's still-active weekly meeting can block a harmful edit. Inactive/cancelled meetings are retained but do not block. No automatic active-term choice or date calculations. |
| D-5 Unknown evidence | Preserve blank seats and blank owner as Unknown / Owner not recorded. Require acknowledgement for room suitability edits with unknown audience/seats, or OD commitments whose suitability cannot be established. | No invented capacity, ownership, course requirements or OD headcount. Acknowledgement records uncertainty; it never bypasses a blocker or approves publication. |
| D-6 Capabilities | Offer controlled `theory`, `computer`, `microprocessor`, `networking`, `laboratory` choices; preserve any legacy extra tokens verbatim, read-only. | Type and capability remain independent. No arbitrary new token creation in this slice; unknown specialist requirements are shown as such and require a separate decision to extend the vocabulary. |

## Required behavior

### Fields and validation

Normalization is server-authoritative, with matching client help. Unsupported fields (including `isActive`) are ignored; malformed IDs/revisions are rejected. Existing unsupported data must be shown truthfully, never silently coerced.

| Field | Proposed contract |
| --- | --- |
| Room code | Required, 1–30 characters after trim; uppercase; ASCII letters/digits with single hyphens between nonempty segments, e.g. `NB-406`, `ANNEX-A1`. No spaces, slash or leading/trailing/consecutive hyphen. Unique across all rooms, including inactive, comparing `upper(trim(code))`. Other than protected codes, renaming preserves ID and all references. |
| Building | Required, 1–80 trimmed characters. Free text, not derived from code. |
| Room type | Required: Classroom or Lab. Never derived from capabilities or course placements. |
| Capabilities | Zero or more controlled choices (D-6), deduplicated and stored in canonical order for comparison; no automatic addition based on type. Preserve unknown legacy tokens; a crafted submission cannot add/remove them. Generic `laboratory` does not substitute for a named specialist capability. |
| Seats | Blank = unknown (`null`); otherwise a whole decimal integer 1–2,147,483,647 (storage bound, not a suggested capacity). Reject zero, negatives, decimals, exponent notation and overflow. Never coerce a bad value to blank/zero. |
| Owning department | Optional selection from existing departments, blank = owner not recorded. No default to CSE; no department creation. |
| Notes | Optional, up to 1,000 trimmed characters, plain text. Existing imported notes remain until explicitly edited. |
| Status / revision | Status is displayed, not editable; new rooms are Active. Existing inactive rooms can have directory corrections without reactivation. Revision is an opaque hidden form value, not editable business data. |

No room-use policy is invented beyond the existing room conflict contract: a lab remains usable for theory, and a sessional requires lab type plus its declared specialist capability. The `theory` chip records a fact; this slice does not introduce a new global theory-capability blocker or redesign the suitability picker.

### Directory and forms

- `/rooms` retains its Rooms & occupancy heading and report, adding **Add room** for editors, linked room codes for all internal viewers and an **Edit** entry point for editors. No new counts imply a fresh institutional census.
- `/rooms/new` opens a blank form with Active status. No preselected owner or capabilities. Saving opens `/rooms/[id]` with “Room added: CODE.”
- `/rooms/[id]` shows current fields, status and a back link. Editors also see Edit and Changes. Viewers receive neither history data nor edit controls.
- `/rooms/[id]/edit` includes the same fields, revision, assigned-use summary and publication notice. A code/building change warns that live labels/travel warnings can change while publications keep their recorded values. Unsaved input stays in place on expected errors.
- The impact area lists term, course, audience, day/time and room role for affected meetings, and term/department for OD references. It distinguishes blockers, unknown evidence and existing unrelated blockers. Links open the existing routine/OD screens with enough named context; do not promise a past-term deep link that the current app lacks.
- Save performs authoritative assessment. On a blocker, stay in the form and list the affected classes and reason. On an acknowledgement requirement, show the fresh warnings, a checkbox and **Save with these warnings**. Return an evidence fingerprint for the displayed candidate/reference warnings; recompute it at submission rather than trusting a client warning list. A checked acknowledgement applies only to that candidate and evidence. Changed warning evidence requires acknowledgement again. There is no force-save for blockers. Record acknowledged warning summaries with the successful change event.
- Successful edit opens the detail page with a field-count confirmation and return-to-directory link. “Nothing changed” does not bump revision or add a change event. Failed requests never clear entered values. Pending disables repeated saves and announces “Saving…”; success/validation/conflict/stale/permission feedback uses the standard result contract.
- A stale edit says “Someone else changed this room. Review the latest values before saving.” Preserve entered values for copying; **Reload latest** explicitly replaces the form and revision. Missing record and revoked access have distinct messages. A direct unauthorized edit URL is denied before loading edit/history data. Unexpected failures show a safe retry message, not SQL or stack traces.
- Empty directory: brief explanation and Add room for editors; viewers see the explanation only. Missing ID: normal not-found/back link. Loading: labelled skeleton or loading text without fake room values. User navigation while dirty uses the existing form pattern where supported and offers an explicit discard choice.

### Assignment impact algorithm

Assess a candidate against current transaction data, never against only the browser's summary or `getPortalData()`'s selected term. Keep canonical meeting and audience semantics from the serializer/conflict engine, including merged local audiences and external participants. Count each meeting once per room, not once per offering. A missing/empty audience is unknown, not a confirmed class of zero.

For each active referenced meeting compare the old and proposed room:

1. **Sessional type:** block a change from compatible lab to non-lab. Existing non-lab blockers are displayed but do not prevent an unrelated correction or an improvement.
2. **Specialist capability:** block removing a capability that the assigned course declares. A missing capability that was already missing is not a new block; adding it can repair the existing block.
3. **Capacity:** with a fully known audience, block a proposed finite capacity below the audience if that violation is new, or if the proposed capacity is lower than the old already-insufficient capacity. Improving 30 seats to 40 for a known class of 50 may save with the remaining blocker plainly shown; 30 to 20 may not. Unknown to 40 for that class is newly unsafe and blocked. Candidate capacity equal to audience is valid. Apply to each assigned room individually, not summed room seats.
4. **Evidence loss:** clearing a known capacity while any active meeting references the room is blocked. With no such meetings it can be cleared, with D-5 acknowledgement if OD references exist. This prevents using Unknown to hide known over-capacity.
5. **Unknowns:** changes to type, capabilities or seats that cannot establish fit because seats/audience is unknown warn and need D-5 acknowledgement. Unchanged uncertainty does not obstruct a notes/code/owner-only correction. OD records have no enforceable course/headcount contract; any suitability-field change with an OD reference in any term warns, even where its time or kind is incomplete. Never invent constraints from its label.

Identity/notes/owner corrections do not need assignment warnings except the visible publication/live-label notice. A building correction can alter existing cross-building travel warnings; it does not move classes. Changes to protected facts fail field validation independently of assignments. Unchanged existing unrelated routine blockers do not block room corrections or become resolved by this editor. Room saves do not edit meetings, room roles, courses, audiences, dates, allocations or source reconciliation records.

### Transactions, stale protection and history

- Add a non-null integer `revision`, initially 1 for each existing room. Use the revision read from the form. Under a room row lock, compare revision, read reference data, assess, write the changed fields, increment revision and insert one `room.update` event atomically. Creates insert revision 1 and one `room.create` event. A stale/invalid/denied/conflicting/failed/no-op request writes neither a room event nor a revision change.
- Database uniqueness handles racing code creation/rename; translate the losing unique violation to a code field error. Authorization is checked in every action using CSE planning scope, with no client-provided owner used as authority.
- A room lock alone is insufficient if assignment writers validate before acquiring it. Existing manual meeting create/update and automatic placement must lock the involved room IDs in ascending order and reload room suitability inside the same transaction before writing. Update locks the union of old/new room IDs, so removal is ordered too. If a room edit won first, an incompatible placement is refused; if placement won first, the editor sees the new reference and refuses an unsafe edit. Auto placement is all-or-nothing on changed room suitability. Never partially commit its suggestions/audits.
- Scope that integration to room type/capacity/capability safety. It does not claim to solve all teacher/time/publication races. Existing OD writes do not provide suitability facts; warning evidence must be recomputed under the same room lock, and OD room-reference insert/change must participate in that lock so a new reference cannot slip past required acknowledgement. Current actions only add/delete OD records; inspect all writers again before implementing. Read/write lock ordering must be one shared helper contract, exercised on real PostgreSQL.
- Changes are newest first, stable by audit ID for ties, paged in batches of 20 with Load older. Each shows Asia/Dhaka date/time, stored actor display name, action, changed field names and before → after. Creation shows initial directory values and Active status. No raw JSON dump or mutable actor-name lookup. Room history is keyed by ID, so a rename keeps the same log. Legacy rows show “Earlier changes were not recorded”; migration must not fabricate user events.
- Public and superseded snapshot JSON, version numbers and publication metadata are untouched. Published screen/CSV/print remain derived from their saved projection. Live routine/validation/OD/directory views read the correction after refresh. No automatic publish or source-blocker clearance.

### Data migration and recovery

One forward migration adds revision and case/whitespace-insensitive code uniqueness and checks for supported room type, nonblank code/building and positive-or-null capacity. Preserve existing IDs, field values, active flags, references, snapshots and audit rows byte-for-byte apart from the new revision value. Do not uppercase, trim, deduplicate, reclassify rooms, invent capacity or overwrite source notes during backfill. Existing capability JSON is preserved; application validation controls new writes without discarding legacy tokens.

First inspect populated **disposable** data for duplicate canonical codes, unsupported types, invalid capacities and blank identity. Conflicting legacy values must produce a clear migration/preflight report and stop; no automatic winner or destructive cleanup. Broader existing field shapes/lengths that violate new form rules need an explicit repair decision before institutional rollout. Synthetic PGlite and PostgreSQL cover both valid upgrades and deliberate failure/recovery. The active institutional database is not opened for planning or routine implementation tests. Institutional rollout remains a separate explicit operation after an exercised cold-backup/recovery procedure and owner authorization.

### Responsive and print contract

Reuse paper/ink/pine/gold surfaces and existing portal navigation. Desktop forms use a main column with a compact impact aside; mobile uses one column, impact above Save and full-width touch actions without horizontal page overflow. Labels, hint/error associations, announced summary/result, visible keyboard focus, 44px action targets and textual status accompany the design. No color-only warnings. Existing `/rooms` print report remains available without controls/history; no new export or official room-directory print is proposed.

The static [mockup review index](mockups/index.html) covers directory, add, edit with impact, detail/history and error/stale/denied states on both widths. All example seat counts, class counts, versions, actors and history are synthetic. It is a design artifact, not an implemented application or evidence that real source blockers have been resolved.

## Acceptance criteria

| ID | Observable condition | Verification method |
| --- | --- | --- |
| AC-01 | D-1 editor can create an Active room and edit directory fields, retaining ID/references/status; success is visible in directory/detail/live room consumers. | Synthetic browser and action flow; before/after relational comparison. |
| AC-02 | View-only, unauthenticated, expired/revoked and non-CSE-scoped actors cannot mutate or fetch edit/history payloads; owner changes cannot elevate authority. | Server permission matrix and direct URL/action attempts. |
| AC-03 | Field rules, protected facts, unknowns and legacy token preservation are enforced; duplicate canonical codes, including concurrent creates/renames and inactive duplicates, give field errors. | Pure validation and adapter action checks. |
| AC-04 | Two edits from one revision yield one save and one stale result; no-op leaves revision/history unchanged; audit failure rolls back the room write. | Two-connection PostgreSQL race, sequential PGlite, injected audit failure. |
| AC-05 | Newly/worsened incompatible or over-capacity edits are refused across all terms/room roles; existing unrelated blockers permit useful corrections; equal capacity and partial improvements behave as specified. | Synthetic multi-term/merged/alternative fixtures; pure and adapter checks. |
| AC-06 | Unknown count/capacity/OD evidence remains explicit; warning acknowledgement cannot bypass a blocker and refreshes if evidence changes; clearing known seats with active meetings is refused. | UI/action cases including empty audience and OD-only/partial references. |
| AC-07 | Racing manual create/update/auto-placement and room edits cannot leave a newly invalid room assignment; auto batch failure rolls back all inserted rows/audits. OD reference races cannot bypass D-5. | Barrier-controlled PostgreSQL checks of both commit orders, plus PGlite transactional cases. |
| AC-08 | Each successful change has exactly one ID-linked event with actor/time/before/after; paged editor history follows rename; failures and no-ops add none. | Audit inspection/rollback and history UI with >20 events. |
| AC-09 | Published/superseded JSON and published screen/CSV/print values remain identical after rename/type/capacity edits; live projections show the edit without changing schedules or source facts. | Snapshot hashes, projection comparison and representative published output review. |
| AC-10 | Populated PGlite and PostgreSQL upgrade preserves all existing business values and references; invalid legacy data fails safely and tested restoration works. | Disposable migration/preflight/recovery evidence; institutional rollout separately pending. |
| AC-11 | Desktop/mobile forms and directory cover empty/loading/pending/success/validation/conflict/stale/denied; focus, keyboard, labels and 320px overflow checks pass; existing room print has no regressions. | Browser/a11y review and desktop/phone/print captures. |
| AC-12 | Required final checks have truthful results; local source/secret review is clean; #5 remains open and no broader backlog or bundler policy changes are bundled. | Final diff and verification record; owner inspection then local merge. |

## Decisions and sources

The owner's approval covers this bounded specification, plan and mockups, including D-1–D-6, without amendments; see [plan.md](plan.md#approval-record). No decision here supplies institutional capacity/ownership facts or settles institutional D-05. Material migration conflicts, vocabulary additions or unsafe transaction limitations return for a decision before dependent work.

BUG-24 carry-forward: default Turbopack CSS-worker IPC failure is unresolved despite accepted merge `84964e2`. Its Webpack production build and all 17 safety groups passed. Neither a build-policy/configuration switch nor repetition of those suites is authorized by this planning task. Future application changes still require final checks under [WORKFLOW](../../WORKFLOW.md); a repeated default-build failure is reported separately from any Webpack evidence, and any material build-policy change needs a decision.
