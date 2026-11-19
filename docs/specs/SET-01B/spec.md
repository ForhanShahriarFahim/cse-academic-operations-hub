# SET-01B — Effective policy history and reviewed changes

Parent: [SET-01 / #14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14)

Status: **Approved for implementation, 19 November 2026** (owner: “Approve D-1–D-6”; [approval record](plan.md#approval-record))

Updated: 19 November 2026, Asia/Dhaka

Records: [plan/checklist](plan.md), [workflow sketches](mockups/index.html). Verification is created at implementation.

## Problem and inspected baseline

An administrator can change the active term's payment rate, extra-load threshold and attendance marks on Settings. The change overwrites the term's single policy row and immediately changes every payment and attendance mark already shown or printed for that term. No second person sees it first and no history explains an earlier figure. Review finding [F-06](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md) recorded this; the interim fix added validation only.

Inspection of local `main` at `26f1414` (no institutional database opened):

| Evidence | Current behavior / implication |
|---|---|
| [`academicPolicies`](../../../src/db/schema.ts) | One row per term, six numeric values, `updatedAt` only. No version, effective date, proposer or approver. |
| [`updateAcademicPolicyAction`](../../../src/lib/academic-actions.ts) | `manage_policy` upserts four values in place with an audit event. Credit-hour fields are legacy and already preserved read-only. |
| [`getAcademicPolicy`](../../../src/lib/academic-operations.ts) | Reads the single row; falls back to `DEFAULT_ACADEMIC_POLICY` when missing. |
| [`getExtraLoadData`](../../../src/lib/academic-operations.ts), [extra-load page](../../../src/app/(portal)/extra-load/page.tsx), [top sheet](../../../src/app/(portal)/extra-load/top-sheet/print/page.tsx) | Every recorded class is priced at today's single rate; teacher totals, page total and printed top sheet follow it. Manual rows without a rate override use it too. |
| [`createExtraLoadClassAction`](../../../src/lib/academic-actions.ts) | Eligibility is checked against today's threshold at recording time; recorded classes are not re-checked later. |
| [`getAttendanceData`](../../../src/lib/academic-operations.ts), [`attendanceMark`](../../../src/lib/attendance.ts) | The theory/sessional maximum is a whole-term figure; marks round to two decimals. Locked ATT-03A sessions still re-mark when the maximum changes. |
| [`term-actions.ts`](../../../src/lib/term-actions.ts) (SET-01A) | Unused drafts receive an explicit, audited starting policy; activation requires it. |
| [`auth/policy.ts`](../../../src/lib/auth/policy.ts) | System and academic administrators hold `manage_policy`; no approval capability exists. |

Institutional decision [D-06](../../decisions/INSTITUTIONAL_DECISIONS.md#d-06--policy-authority-and-separation-of-duties) (who approves policy) remains unresolved. The owner's choices below are a product design for this portal, not a resolution of D-06.

## Outcome and scope

Policy figures for an active term change only through a proposed, impact-previewed change that a second person approves. Each approved change is an effective-dated version. Payments follow the version in force on each class date; earlier figures never change silently; every screen and print shows which version produced a figure.

Included: D-1–D-6, forward migration `0021`, responsive Settings and history screens, and disposable recovery and concurrency evidence. This is a bounded slice under #14; it does not complete the parent.

Excluded: GOV-01 claim/payment states; ATT-04 midterm/final marks; workload credit-hour policy (stays legacy read-only); a decision register application; changing rounding rules; editing completed terms; policy for draft terms beyond SET-01A's starting policy; institutional migration; remote synchronization.

## Owner choices recorded during inspection

On 19 November 2026 the owner chose, in reply to three questions:

- **Payment rate:** by class date, with backdated changes showing exactly which classes they reprice.
- **Approval:** a second person with a new `approve_policy` capability; the proposer cannot approve their own change.
- **Attendance marks:** allowed through the reviewed change, with an impact preview; locked sessions are flagged.

These choices shape D-1–D-4. They are not implementation approval.

## Proposed decisions

### D-1 — Baseline plus effective-dated versions

The existing `academic_policies` row stays as the term's **baseline (version 1)**, effective from the term start date. SET-01A's starting-policy editor continues to edit it on unused drafts. Once a term is active or completed, its baseline is read-only and the in-place Settings update is removed; its server action refuses every call.

A new append-only `academic_policy_versions` table holds later changes: term, version number (2, 3, …), effective-from civil date, the four editable values (threshold, payment rate, theory marks, sessional marks), status, reason, proposer and time, decider, time and note, and the impact fingerprint captured at decision. Credit-hour fields stay on the baseline only. Rows are never deleted or edited after a decision.

Effective-from must lie within the term range and must be later than the term start (the baseline owns the start). At most one approved version per effective date.

### D-2 — How each value applies

One rule: a value is the one in the latest approved version whose effective-from is on or before the relevant date, else the baseline.

| Value | Relevant date |
|---|---|
| Payment per extra class | Each recorded class's date. A teacher total may contain more than one rate. |
| Manual top-sheet row without a rate override | The row's recording date (Asia/Dhaka civil date), clamped into the term range. Overrides are unchanged. |
| Extra-load threshold | The class date when recording a class. The page's eligible count uses today, clamped into the term. Recorded classes are never re-checked. |
| Theory/sessional attendance marks | Today, clamped into the term; for a completed term, its end date. |

Rounding is unchanged and named on screen: payments are exact to the paisa; attendance marks round to two decimals; percentages to one decimal.

A future-dated change has no effect until its date. A backdated change reprices only classes on or after its date, and the impact preview lists them.

### D-3 — Propose, review, approve

- **Propose:** `manage_policy` holders submit new values, an effective-from date, and a reason of 1–500 characters, with the term's write context. Values use the existing validation bounds. At most one open proposal per term; another proposal waits. A proposal that changes nothing is refused.
- **Approve or reject:** a new `approve_policy` capability, granted to system and academic administrators. The server refuses when the decider proposed the change. Approval requires a note of 0–500 characters and the fingerprint of the impact the decider saw; rejection requires a note of 1–500. The proposer may withdraw an open proposal.
- **Locking:** proposal, decision and withdrawal run inside the term-context transaction and take the term's policy lock. Decisions also take the exclusive term-context lock while they recheck evidence, so concurrent attendance, roster, workload or payment writes cannot change it before commit. The term generation, proposal status and decision fingerprint guard against stale pages, and the policy write and audit commit atomically. A changed impact refuses with “Impact changed; review again” and no write.
- Only an active term's policy can change. Completed terms are read-only. A term switch closes open proposals and retains them in history with status `stale`.
- If only one person holds `approve_policy`, nothing can be approved. The screen says so; it does not fall back to self-approval.

### D-4 — Impact preview

Computed when the proposal is created and again on the decider's screen, from the same function:

- **Payments:** classes repriced (count, per teacher, before/after amount and the total change); manual rows affected.
- **Threshold:** teachers whose current eligibility changes. Already-recorded classes stay recorded and are listed as “recorded under the earlier threshold”.
- **Attendance marks:** courses and students whose mark changes, with the largest before/after difference; sessions already locked are counted and flagged.
- **Nothing affected yet:** stated plainly, for example for a future-dated change.

The preview never writes. Its fingerprint covers the target values, date and every affected row identity and amount.

### D-5 — History and trace on every output

Settings shows the policy in force today with its version label, a timeline of baseline and versions (status, effective date, values changed, proposer, decider, reason and notes), the open proposal with its impact, and the propose form. The term workspace `/terms/[id]` shows the same timeline read-only for any term.

Extra-load screens and the teacher sheet show the rate per class line and a version label when more than one rate applies. The printed top sheet keeps its official layout; a footer names the policy versions used. Attendance summaries name the version that set the maximum. Screen, print and export agree.

### D-6 — Migration, preservation and usable states

Forward-only migration `0021` creates the version table, constraints and indexes. It writes no version rows and leaves existing baselines in place. A term with no baseline keeps the SET-01A unavailable behavior. Repeat preparation is safe. Exercise populated PGlite and PostgreSQL migration, backup/restore and concurrency on disposable data only.

**Addendum, 19 November 2026 (owner: “Reviewed baseline”).** During T-03 the owner chose how a term with no baseline recovers. Nothing is priced or marked from defaults. An administrator proposes a baseline effective on the term start, and a second person with `approve_policy` approves it; approval creates the baseline as Version 1. Until then, extra-class pricing, the top sheet and attendance marks show an explicit unavailable state, and new extra-load classes are refused.

Use the paper/ink/pine/gold language, labelled keyboard controls, associated errors, live feedback and a focusable confirmation. Cover empty history, open proposal, own-proposal (cannot approve), stale, denied, pending, conflict and success states at 1440, 390 and 320 px without page-wide overflow, plus the A4 top sheet.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | Active-term values change only by an approved version; the old in-place update refuses; completed terms are read-only. | Direct-call matrix; persisted-state comparison. |
| AC-02 | Proposer cannot approve; only `approve_policy` decides; entry points recheck authority, term generation and applicable proposal status or review evidence. | Role/actor/session matrix including forged payloads. |
| AC-03 | Payment, threshold and attendance values resolve by D-2 for past, future and backdated versions, including mixed-rate teachers and manual rows. | Pure domain tests; both-adapter fixtures. |
| AC-04 | Impact preview matches the figures after approval; a changed impact refuses without a write. | Before/after projection comparison; race cases. |
| AC-05 | Approved or rejected versions and the baseline of a used term are immutable; audit is atomic. | Constraint tests and fault-injected rollback. |
| AC-06 | Existing terms show identical payments and marks after migration `0021`. | Populated fingerprint before/after on both adapters; restore and reapply. |
| AC-07 | Concurrent proposals, decisions and term activation order safely. | Two-connection barriers on PGlite and PostgreSQL. |
| AC-08 | History and version labels agree across Settings, term workspace, extra-load screens, sheets and attendance summaries. | Projection parity tests; native A4 print. |
| AC-09 | D-6 states, widths, keyboard and contrast pass. | Compiled browser review at three widths. |
| AC-10 | Required checks recorded honestly; runnable owner review with two administrator accounts. | Shared suites, issue safety group, diff review. |

## Sources

[SET-01 requirements](../../PRODUCT_REQUIREMENTS.md#set-01--separate-configuration-from-governance), [local delivery plan item 18](../../plans/LOCAL_DELIVERY_2026-10-26.md), [SET-01A](../SET-01A/spec.md), [ATT-03A](../ATT-03A/spec.md), [review F-06](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md), [institutional decisions](../../decisions/INSTITUTIONAL_DECISIONS.md).
