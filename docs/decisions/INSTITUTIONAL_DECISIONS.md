# Institutional decisions and open gates

Reconciled: 30 September 2026 (Asia/Dhaka). This migrates approvals/questions recorded in the 26 September execution plan; it grants no new institutional approval.

Use the [roadmap](../ROADMAP.md) for order, [requirements](../PRODUCT_REQUIREMENTS.md) for behavior and [glossary](../../CONTEXT.md) for terms. Technical architecture choices remain in [ADRs](../architecture/ADR-001-academic-operations-boundaries.md). Record owner, actual evidence, status, effective term and affected modules when resolving a question. Unspecified owners/dates remain unknown. This repository register is distinct from the future SET-01 application feature.

## D-01 — First administrator

Status: owner choice decided; provider verification pending. Retain the owner's existing personal Google account for first administrator. Configure the exact address privately at bootstrap; keep it out of public issues and this register. Evidence: recorded owner choice in the prior execution plan and AUTH-01 (#1). Effective scope: first-admin bootstrap. Gate: approved credentials and live sign-in/out/provider verification.

## D-02 — Public contact scope

Status: owner-approved scope; implementation and source/publication verification pending. Evidence: recorded owner choice in the prior execution plan and AUTH-01 (#1); source sections below. Effective scope: the approved Summer 2026 published routine version.

the owner selected the checked-in Summer 2026 routine transcription as the publication source: [teacher table, §4](../source/CSE_SUMMER_2026_ROUTINE_V1_6.md#section-4-list-of-teachers), [HSC/Diploma CR tables, §5](../source/CSE_SUMMER_2026_ROUTINE_V1_6.md#section-5-list-of-class-representatives), and [departmental query table, §6](../source/CSE_SUMMER_2026_ROUTINE_V1_6.md#section-6-department-contacts--coordinators-for-any-query). Teacher names/codes, listed email and personal mobile; CR name/batch/mobile; and listed query role/mobile may appear in the approved public routine package. This is **not** permission to expose unrelated teacher/student directory fields or draft contacts. Preserve the source/version and allow a later correction/opt-out through a new approved version; never silently alter an older published snapshot. Two teacher mobile fields and some email fields are absent; Diploma 23rd CR is not listed; `UT` is an upcoming-teacher placeholder, not a named person. Render absence explicitly, not as invented data. Existing redaction remains until #1 implements and tests this allowlist and #3 clears publication blockers. The originally supplied PDF is not available at its earlier local path during this planning pass, so verify the transcription against the original before approval if it becomes available.

## D-03 — Next feature priority

Status: decided. The owner selected SAFE-01 (#2) before master-data editing. WORKFLOW-01 is currently authorized documentation preparation; SAFE-01 still needs its own plan approval. Evidence: prior execution plan and current workflow approval.

## D-04 — Missing specification and source sign-off

Status: unresolved. Can `pundra-cse-academic-portal-specification.md` be restored, and who signs off the decision count and Summer 2026 corrections? Documented Settings shows 21 decisions while older context claimed 31; reconcile against the original rather than infer missing choices. Owner/approver and effective term: pending source confirmation. Affects SET-01 (#14), RUT-03 (#3) and related policy work.

## D-05 — Routine source corrections

Status: unresolved. Confirm teacher codes `SI`, `AS`, `MNI`, `HUH`, NB-508/NB-608 lab use and HSC-25B Saturday–Tuesday replacements for imported Friday entries. Do not invent names, capabilities or placements. The recorded import has 13 blockers. Owner/approver: institutional coordinator to be identified. Effective term: Summer 2026. Affects RUT-03 (#3); retain before/after source evidence.

## D-06 — Policy authority and separation of duties

Status: unresolved. Identify approvers for timetable exceptions, attendance rounding/locked corrections and extra-load claims, and whether submitter and approver must differ for each workflow. The roadmap proposes two-person routine approval; it does not answer every authority question. Owner/approver and effective policy dates: pending. Affects SET-01 (#14), ATT-03/04 (#10/#11), GOV-01 (#15). Preserve current rules/history until reviewed effective changes exist.

## D-07 — Operational ownership

Status: unresolved. Name owners for encrypted backups, restore drills, PostgreSQL hosting and Google OAuth credentials. Effective scope: staging/production operations. Affects SAFE-01 (#2), AUTH-01 (#1), DEP-01 (#19). Production requires named owners and recovery/provider evidence.

## Gate handling

Answer questions when their issue is planned; independent work needs its own approval. Keep redaction until the source-bounded contact projection is implemented/tested and an approved routine is published. Preserve history; never invent academic facts. Internal deployment must pass operational/identity/recovery gates; official public publication additionally needs source correction and institutional approval. This document grants no deployment authorization.
