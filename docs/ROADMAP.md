# Academic operations — roadmap

Status: living work order; entries are proposals until their issue plans are approved.
Reconciled: 30 September 2026 (Asia/Dhaka). GitHub #1, #2, #16, #17 and #20 were inspected; other dependencies are carried from the 26 September execution plan and need inspection when selected.
Tracker: [GitHub index #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16).

## Current work and gates

- WORKFLOW-01 (#20): Steps 2 and 3 delivered; Step 4 review/acceptance remains. [Plan/checkpoint](plans/WORKFLOW-01.md).
- SAFE-01 (#2): next feature proposal before master-data editing; detailed scope below needs its own approval.
- RUT-01: completed (e6c8fae and completion tag), without a GitHub issue for that earlier work. DOC-01 (#17) is closed (e183980).
- AUTH-01 (#1): code implemented (26eb86c, c70984f); real OAuth, hosted PostgreSQL, adversarial permissions/sessions and approved contact projection remain pending. Do not close on code presence.
- Documented development baseline: 185 parsed source entries, two teacher-managed thesis/project entries, 183 scheduled meetings, 42 teacher records, 78 courses and 13 publication blockers. Counts were not re-seeded/retested during migration. Local PGlite is not production storage.
- Missing original specification and institutional source/policy gates are recorded in the [decision register](decisions/INSTITUTIONAL_DECISIONS.md).

Use [product requirements](PRODUCT_REQUIREMENTS.md) for behavior, [workflow](WORKFLOW.md) for delivery and the [brief](PROJECT_BRIEF.md) for fast resumption.

## Work order and issue map

Dependencies are gates, not estimates. When a gate needs institutional input, continue with an independent approved issue; do not invent source facts to clear it.

| Order | Issue | Concrete outcome and acceptance emphasis | Depends on |
|---|---|---|---|
| Current | [#20 WORKFLOW-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20) | Shared workflow, document migration and final acceptance before merge. | [Approved plan](plans/WORKFLOW-01.md) |
| Done | `RUT-01` | Compact shared routine screen/export and source import; completed tag exists. | — |
| 1 | [#2 SAFE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) | Tested PGlite/PostgreSQL backup and restore, second-term fixture, mutation/audit inventory, common action-result contract. | None; **next implementation proposal** |
| 1a | [#1 AUTH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/1) | Finish real Google OAuth, hosted PostgreSQL migration, denied/allowed action matrix, role revocation/session tests and source-bounded public-contact projection before closure. | Credentials/test environment; SAFE-01 before production migration |
| Done | [#17 DOC-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/17) | Retire contradictory pre-authentication handover/context; provide a current short brief, README guide, source counts and agent entry point. | Documentation-only; real OAuth remains #1 |
| 2 | [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18) | Review shell/navigation and reusable form/table/feedback patterns on desktop, mobile and print; establish visual/accessibility baseline. | #1; coordinate with ATT-02 |
| 2 | [#9 ATT-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/9) | Local, accessible save/import feedback with truthful CSV counts, partial-error detail and focus handling. Can be an early UX improvement. | #1, UX-01 pattern |
| 3 | [#3 RUT-03](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/3) | Review all 13 source blockers, four unknown teacher codes and room capability questions; publish only after named approval and screen/CSV/print parity. | #1, #2, institutional source answers |
| 4 | [#4 TCH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4) | Teacher create/edit/deactivate/reactivate/history; preserve references and distinguish teacher from login. | #1, #2 |
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
| Release | [#19 DEP-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/19) | Vercel staging then production with hosted PostgreSQL, OAuth, backup, telemetry, smoke tests and rollback drill. | #1, #2, DOC-01; public launch also #3 and #15 |

Independent issues can move when blocked, but do not start a new feature before its plan is reviewed. `#16` remains the open GitHub index and should always point to the next unblocked issue.

## SAFE-01 — retained proposal, not an approved implementation plan

**Outcome:** prove that normal change, migration and term rollover cannot silently destroy Summer 2026 history. This is a safety baseline, not a new master-data screen.

1. Inventory every database (local PGlite and any available PostgreSQL), existing migrations, `db:prepare`/`db:reset` behavior, auth tables, audit writers and every mutation entry point. Record exact counts and a checksum/fingerprint of a disposable Summer 2026 fixture; never run a reset against the user's active database.
2. Document PGlite cold-copy backup: stop all app/database processes, copy the **specific** data directory to a dated location, restart, then restore into a separate disposable directory. Reject a backup made while writers are active unless a supported online-backup method is proven.
3. Document PostgreSQL logical dump/restore with least-privilege credentials, encrypted storage and a test restore into a separate database. Confirm tables, rows, foreign keys, migration journal, auth roles and publication snapshots. Do not print secrets or commit dumps.
4. Add a disposable two-term integration fixture. Create Spring alongside Summer; repeat one cohort, graduate another, keep one merged group and one cross-department student. Verify term-scoped reads and old routine/attendance/extra-load records are unchanged.
5. Build a mutation-to-audit inventory. Verify each successful action's actor and before/after summary, rollback when audit insertion fails, and denial without mutation for unauthorized actors. Record any exceptions instead of declaring blanket coverage.
6. Define one `ActionResult`/notification contract for later UI work, including success, validation, conflict, permission, stale-data and partial-import outcomes. Do not refactor every screen in this issue.
7. Test restore and migrations on both adapters where a PostgreSQL instance is available; otherwise mark the PostgreSQL acceptance gate pending rather than pretending the local adapter proves it.

**SAFE-01 acceptance:** documented and exercised restore; verified second-term history preservation; mutation/audit matrix with no unowned write path; no changes to the active user's database; passing typecheck, lint, domain/integration tests and build. Review the restore evidence before closing #2.
