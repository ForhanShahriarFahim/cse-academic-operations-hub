# Academic operations — roadmap

Status: living work order; entries are proposals until their issue plans are approved.
Reconciled: 26 October 2026 (Asia/Dhaka). GitHub issue states, all open issue bodies/comments, recent merged PRs, open PRs and `main` were inspected. The [local delivery plan](plans/LOCAL_DELIVERY_2026-10-26.md) is the current proposed small-part sequence; the table below retains parent issue scope/dependencies. GitHub index #16 has older status prose and was intentionally not edited under the owner's local-first agreement.
Tracker: [GitHub index #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16).

## Current work and gates

- WORKFLOW-01 (#20): accepted/closed; PRs #21/#22 merged, final main baseline `78db43d`. [Review/acceptance record](plans/WORKFLOW-01.md).
- SAFE-01 (#2): **accepted and closed** 30 September 2026; merged via PR #23. Evidence: [verification](specs/SAFE-01/verification.md). D-07 operational ownership deferred to DEP-01 (#19). Follow-up bugs #24–#28.
- UX-01 (#18): **accepted and merged** 30 September 2026 ([verification](specs/UX-01/verification.md)); closed #30. Inspection bugs #29, #31 and #32 have since been resolved; builder follow-ups #33 remain open.
- **Current:** BUG-24 (#24), approved on 26 October 2026 for implementation in the next session on `codex/bug-24`; T-01 is next, no application changes yet. [Spec](specs/BUG-24/spec.md), [approval/plan](specs/BUG-24/plan.md). Fix local target consistency before the proposed ROM-01A room slice. The owner-approved local-first process keeps normal commits/acceptance/merges local and defers GitHub updates to agreed boundaries.
- **Later accepted deliveries:** RUT-04 (#34) and TCH-02 (#35), 1 October; AUTH-02 (#36, also closed #31), TCH-01 (#4), BUG-26/27/32/48/49/54/59, 2 October. The latest merge is BUG-59 / PR #60 at `0b1e055`. AUTH-02 and TCH-01 migrations brought institutional PGlite through 0009 after cold backups. See [brief](PROJECT_BRIEF.md) and issue verification records; these are prior results, not a fresh database check.
- RUT-01: completed (e6c8fae and completion tag), without a GitHub issue for that earlier work. DOC-01 (#17) is closed (e183980).
- AUTH-01 (#1): code implemented (26eb86c, c70984f); real OAuth, hosted PostgreSQL, adversarial permissions/sessions and approved contact projection remain pending. Do not close on code presence.
- Documented development baseline: 185 parsed source entries, two teacher-managed thesis/project entries, 183 scheduled meetings, 42 teacher records, 78 courses and 13 publication blockers. Counts were not re-seeded/retested during migration. Local PGlite is not production storage.
- Owner brainstorm (30 September 2026) registered #34–#42 and added owner input to #4–#8, #12 and #14; [historical triage](plans/owner-brainstorm-2026-09-30.md). #4/#34/#35/#36 were subsequently approved and completed. The remaining proposals still need their own scope/approval; the current order is in the local delivery plan.
- Missing original specification and institutional source/policy gates are recorded in the [decision register](decisions/INSTITUTIONAL_DECISIONS.md).

Use [product requirements](PRODUCT_REQUIREMENTS.md) for behavior, [workflow](WORKFLOW.md) for delivery and the [brief](PROJECT_BRIEF.md) for fast resumption.

## Work order and issue map

Dependencies are gates, not estimates. When a gate needs institutional input, continue with an independent approved issue; do not invent source facts to clear it.

| Order | Issue | Concrete outcome and acceptance emphasis | Depends on |
|---|---|---|---|
| Done | [#20 WORKFLOW-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20) | Shared workflow/migration and final review accepted/merged; issue closed. | [Accepted plan/evidence](plans/WORKFLOW-01.md) |
| Done | `RUT-01` | Compact shared routine screen/export and source import; completed tag exists. | — |
| Done | [#2 SAFE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) | Tested PGlite/PostgreSQL backup and restore, second-term fixture, mutation/audit inventory, common action-result contract. Accepted and merged (PR #23). | [Verification](specs/SAFE-01/verification.md) |
| 1a | [#1 AUTH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/1) | Finish real Google OAuth, hosted PostgreSQL migration, denied/allowed action matrix, role revocation/session tests and source-bounded public-contact projection before closure. | Credentials/test environment; SAFE-01 before production migration |
| Done | [#17 DOC-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/17) | Retire contradictory pre-authentication handover/context; provide a current short brief, README guide, source counts and agent entry point. | Documentation-only; real OAuth remains #1 |
| Done | [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18) | Review shell/navigation and reusable form/table/feedback patterns on desktop, mobile and print; establish visual/accessibility baseline. | #1; coordinate with ATT-02 |
| 2 | [#9 ATT-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/9) | Local, accessible save/import feedback with truthful CSV counts, partial-error detail and focus handling. Can be an early UX improvement. | #1, UX-01 pattern |
| 3 | [#3 RUT-03](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/3) | Review all 13 source blockers, four unknown teacher codes and room capability questions; publish only after named approval and screen/CSV/print parity. | #1, #2, institutional source answers |
| Done | [#4 TCH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4) | Teacher create/edit/deactivate/reactivate/history; accepted, merged and migrated through 0009. | [Verification](specs/TCH-01/verification.md) |
| 4 | [#5 ROM-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/5) | Room inventory, capabilities, maintenance and occupancy; unsafe future overlaps/deactivation blocked. | #1, #2 |
| 4 | [#14 SET-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14) | Effective-dated policy versions and actionable institutional decision register; historical marks/payments never silently change. | #1, #2; before ATT-04 and GOV-01 |
| 5 | [#6 BAT-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6) | Spring/Summer rollover wizard with repeat/hold/graduate overrides and unverified copied counts; preceding term unchanged. | #1, #2, SET-01 term rules |
| 6 | [#7 CRS-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/7) | Catalog → term offering → audience/group → workload/coverage → meeting; merged delivery stored once. | #4, #5, #6, policy decisions |
| 7 | [#8 ATT-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8) | Department → stream → cohort → course selection; own groups only for teachers; URL persistence and clear empty states. | #7 |
| 8 | [#10 ATT-03](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/10) | Draft/submitted/locked/reopened dated sessions; duplicate prevention, correction reason and void instead of destructive deletion. | #8, #9 |
| 9 | [#11 ATT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/11) | Midterm/final/semester marks with denominator, rounding and effective policy trace. | #10, #14 |
| 10 | [#12 ATT-05](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/12) | Course-by-date ledger, student matrix and filterable CSV/print from one projection. | #11 |
| 10 | [#13 OD-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/13) | Term-aware external commitments with known-fact conflict impact, edit/archive/verify and no duplicate formal offering. | #4, #5, #7 |
| 11 | [#15 GOV-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/15) | Two-person routine approval and teacher claim → reviewer → payment states with reasoned audit transitions. | #3, #13, #14 |
| Done | [#34 RUT-04](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34) | Term time grids, teaching days, batch exceptions and official package; accepted and merged. | [Verification](specs/RUT-04/verification.md) |
| Done | [#35 TCH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35) | Individual/My routine, A4 and bulk print; accepted and merged. .docx, logo and past-term selection remain deferred. | [Verification](specs/TCH-02/verification.md) |
| Done | [#36 AUTH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36) | Password sign-in, setup/reset, lockout, revocation and account administration; accepted/merged, also closed #31. | [Verification](specs/AUTH-02/verification.md) |
| 6a | [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) | Student directory, CSV/.xlsx import with preview, one-step enrolment and roster export. | #6, #9 pattern |
| 7a | [#38 CAL-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/38) | Term calendar: holidays, exam periods, teaching dates. | #6/#14 terms |
| 7b | [#40 LEAVE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/40) | Leave apply/approve with balances and private reasons; teacher availability lookup by date. | #38; #39 for affected classes |
| 7c | [#39 RUT-05](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/39) | Dated cancel/make-up/substitute classes and the effective schedule for any date. | #38 |
| Later | [#41 TASK-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/41) | Teacher day agenda: classes, portal-generated tasks, personal and assigned duties. | #39, #10 |
| Later | [#42 CERT-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/42) | Template certificates with a field designer, single/bulk PDF and an issue register. | #37; template format decision |
| Release | [#19 DEP-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/19) | Vercel staging then production with hosted PostgreSQL, OAuth, backup, telemetry, smoke tests and rollback drill. | #1, #2, DOC-01; public launch also #3 and #15 |

Independent issues can move when blocked, but do not start a new feature before its plan is reviewed. During local-first work the brief and selected plan own the live local pointer; synchronize #16 at an agreed GitHub boundary rather than after every checkpoint. Parent issue numbers above are preserved; their historical order is refined by the local delivery plan.

## SAFE-01 — historical proposal below

SAFE-01 was subsequently approved, implemented and accepted on 30 September 2026. Its authoritative records are the [specification](specs/SAFE-01/spec.md), [completed plan](specs/SAFE-01/plan.md) and [verification](specs/SAFE-01/verification.md). The retained proposal below preserves the original rationale, not a second checklist or a current approval gate. Hosted operational evidence remains DEP-01.

**Outcome:** prove that normal change, migration and term rollover cannot silently destroy Summer 2026 history. This is a safety baseline, not a new master-data screen.

1. Inventory every database (local PGlite and any available PostgreSQL), existing migrations, `db:prepare`/`db:reset` behavior, auth tables, audit writers and every mutation entry point. Record exact counts and a checksum/fingerprint of a disposable Summer 2026 fixture; never run a reset against the user's active database.
2. Document PGlite cold-copy backup: stop all app/database processes, copy the **specific** data directory to a dated location, restart, then restore into a separate disposable directory. Reject a backup made while writers are active unless a supported online-backup method is proven.
3. Document PostgreSQL logical dump/restore with least-privilege credentials, encrypted storage and a test restore into a separate database. Confirm tables, rows, foreign keys, migration journal, auth roles and publication snapshots. Do not print secrets or commit dumps.
4. Add a disposable two-term integration fixture. Create Spring alongside Summer; repeat one cohort, graduate another, keep one merged group and one cross-department student. Verify term-scoped reads and old routine/attendance/extra-load records are unchanged.
5. Build a mutation-to-audit inventory. Verify each successful action's actor and before/after summary, rollback when audit insertion fails, and denial without mutation for unauthorized actors. Record any exceptions instead of declaring blanket coverage.
6. Define one `ActionResult`/notification contract for later UI work, including success, validation, conflict, permission, stale-data and partial-import outcomes. Do not refactor every screen in this issue.
7. Test restore and migrations on both adapters where a PostgreSQL instance is available; otherwise mark the PostgreSQL acceptance gate pending rather than pretending the local adapter proves it.

**SAFE-01 acceptance:** documented and exercised restore; verified second-term history preservation; mutation/audit matrix with no unowned write path; no changes to the active user's database; passing typecheck, lint, domain/integration tests and build. Review the restore evidence before closing #2.
