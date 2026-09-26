# CSE Academic Operations Hub — execution plan

Status: proposed for review, not authorization to implement the next feature

Updated: 26 September 2026

Tracker: [GitHub issues](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues)

Domain language: [CONTEXT.md](../../CONTEXT.md)

## 1. What is true today

- `RUT-01` is complete: shared Day/Week routine projection, condensed HSC/Diploma official package, CSV export, and source-routine import (`e6c8fae`).
- `AUTH-01` is implemented locally in `26eb86c` and `c70984f`: invite-only Google sign-in, roles, server-side action guards, private-contact redaction, and named transactional audit writes. The two commits are **not yet on `origin/main`**. The real Google callback, hosted PostgreSQL, and adversarial role/session tests are not yet verified, so GitHub #1 must remain open.
- A fresh local seed imports 42 teacher records, 78 courses, and 183 meetings from the Summer 2026 source mapping. Validation reports 13 blockers. No routine is automatically published; public pages show the unpublished state until a valid version is approved.
- The original institutional specification file is missing from this checkout. The existing `HANDOVER_GUIDE.md` and `PROJECT_CONTEXT.md` still describe the older synthetic, no-authentication baseline and must not be used as current operating instructions until reconciled.
- Local PGlite is for development. A Vercel deployment needs persistent PostgreSQL, configured Google OAuth, explicit migration/bootstrap, backups, and production verification.

This document is the **execution/status plan**. The longer [solution roadmap](../IMPLEMENTATION_SOLUTION_ROADMAP.md) retains feature rationale; the issue tracker records work status. Source PDFs/Markdown and approved institutional decisions outrank inferred defaults. Do not silently resolve discrepancies from old handover text.

## 2. Rules for every issue

1. **Plan, review, approve, implement.** Inspect current schema, data, UI and source documents; write a bounded issue plan with open decisions and edge cases; obtain review before changing feature behavior.
2. **One issue, focused commit(s).** Use an issue ID in the commit/PR description. Do not combine unrelated migration, UX, and data-correction work. Push only after verification; close the issue only when its stated acceptance criteria pass.
3. **Preserve facts.** Apply forward-only migrations to populated data. Do not run `db:reset` on institutional data. Deactivate/archive referenced records; amend published facts with a new version. Test restore before irreversible migrations.
4. **Enforce permissions at the server seam.** UI hiding is only guidance. Check capability, department and ownership in every action, loader, internal route and print/export entry point. Record actor, before/after summary and data change together.
5. **One source per report.** Screen, CSV and print/PDF projections must agree. Show term, data status, effective version and generation date on exports. Never serve a draft from a public route.
6. **Verify proportionately.** At minimum run TypeScript, lint, domain tests and production build; add permission, database, browser, mobile, print and export-parity tests for changed behavior. Review the diff and a clean database setup before closing.
7. **Design deliberately.** Reuse the existing warm paper/ink/pine/gold visual language. Every changed screen needs loading, empty, success, error, stale-data and permission states; keyboard focus, readable contrast, responsive layout and a screenshot review. Dense schedules/ledgers should remain compact without hiding essential facts. Color is never the only status signal.

## 3. Domain invariants and hard corner cases

| Area | Invariant and cases to test |
|---|---|
| Calendar | Spring and Summer are separate academic terms. A cohort identity survives semester changes, repeats, holds and graduation; old placements are immutable. Changing an active term cannot rewrite attendance or a published routine. |
| Credits | Catalog credit is distinct from workload credit-hours: theory defaults to 3; a one-credit sessional currently counts as 2 workload credit-hours. The extra-load threshold is strictly **more than** 15 workload credit-hours; the class rate defaults to Tk 200 and can change by approved effective policy. |
| Routine | One merged/shared physical class is one meeting linked to all relevant offerings. Use exact minutes, including custom times, cross-building travel, breaks and overlapping OD commitments. A batch-specific Friday exception must not enable Friday for the whole HSC stream; HSC-25B's imported Friday entries need approved Saturday–Tuesday replacements. |
| Rooms | 406/407/408 are computer labs; 505 supports computer, microprocessor, networking and theory when free. Theory may use a capable lab; sessional delivery requires the correct lab capability. Capacity unknown is not capacity zero. Maintenance and deactivation must respect future meetings. |
| Identity | A teacher record is not a portal user. External-department teachers can be assigned to CSE or other groups without a fake CSE identity. A suspended user or revoked role must lose access on the next request, including direct action/export calls. |
| Students | A student identity is independent of enrollment and home department. A merged group can contain students from other departments. Repeated CSV import must not duplicate students/enrollments; roster changes must preserve captured historical attendance. |
| Attendance | An attendance session is one dated occurrence, not an academic term or recurring meeting. Late counts attended; Excused leaves the denominator. Duplicate group/date/time submissions, stale rosters, double saves and corrections after lock need explicit behavior and audit history. |
| Publication and privacy | Only a validated, approved immutable snapshot is public. Private phones/emails and draft data stay hidden by default. Parallel publication attempts must not create conflicting active versions. |
| Data loss | A failed audit write must roll back its mutation. Backup/restore must prove that Summer 2026 records, auth roles, attendance, extra load, publications and audit history survive. |

## 4. Work order and issue map

Dependencies are gates, not estimates. When a gate needs institutional input, continue with an independent approved issue; do not invent source facts to clear it.

| Order | Issue | Concrete outcome and acceptance emphasis | Depends on |
|---|---|---|---|
| Done | `RUT-01` | Compact shared routine screen/export and source import; completed tag exists. | — |
| 1 | [#2 SAFE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) | Tested PGlite/PostgreSQL backup and restore, second-term fixture, mutation/audit inventory, common action-result contract. | None; **next implementation proposal** |
| 1a | [#1 AUTH-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/1) | Finish real Google OAuth, hosted PostgreSQL migration, denied/allowed action matrix, role revocation and session tests before closure. | Credentials/test environment; SAFE-01 before production migration |
| 2 | `DOC-01` | Reconcile README, handover, project context, source counts and user instructions; clearly mark unresolved institutional facts. | #1 status verified enough to describe accurately |
| 2 | `UX-01` | Review shell/navigation and reusable form/table/feedback patterns on desktop, mobile and print; establish visual/accessibility baseline. | #1; coordinate with ATT-02 |
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
| Release | `DEP-01` | Vercel staging then production with hosted PostgreSQL, OAuth, backup, telemetry, smoke tests and rollback drill. | #1, #2, DOC-01; public launch also #3 and #15 |

Independent issues can move when blocked, but do not start a new feature before its plan is reviewed. `#16` remains the open GitHub index and should always point to the next unblocked issue.

## 5. Detailed next slice: SAFE-01

**Outcome:** prove that normal change, migration and term rollover cannot silently destroy Summer 2026 history. This is a safety baseline, not a new master-data screen.

1. Inventory every database (local PGlite and any available PostgreSQL), existing migrations, `db:prepare`/`db:reset` behavior, auth tables, audit writers and every mutation entry point. Record exact counts and a checksum/fingerprint of a disposable Summer 2026 fixture; never run a reset against the user's active database.
2. Document PGlite cold-copy backup: stop all app/database processes, copy the **specific** data directory to a dated location, restart, then restore into a separate disposable directory. Reject a backup made while writers are active unless a supported online-backup method is proven.
3. Document PostgreSQL logical dump/restore with least-privilege credentials, encrypted storage and a test restore into a separate database. Confirm tables, rows, foreign keys, migration journal, auth roles and publication snapshots. Do not print secrets or commit dumps.
4. Add a disposable two-term integration fixture. Create Spring alongside Summer; repeat one cohort, graduate another, keep one merged group and one cross-department student. Verify term-scoped reads and old routine/attendance/extra-load records are unchanged.
5. Build a mutation-to-audit inventory. Verify each successful action's actor and before/after summary, rollback when audit insertion fails, and denial without mutation for unauthorized actors. Record any exceptions instead of declaring blanket coverage.
6. Define one `ActionResult`/notification contract for later UI work, including success, validation, conflict, permission, stale-data and partial-import outcomes. Do not refactor every screen in this issue.
7. Test restore and migrations on both adapters where a PostgreSQL instance is available; otherwise mark the PostgreSQL acceptance gate pending rather than pretending the local adapter proves it.

**SAFE-01 acceptance:** documented and exercised restore; verified second-term history preservation; mutation/audit matrix with no unowned write path; no changes to the active user's database; passing typecheck, lint, domain/integration tests and build. Review the restore evidence before closing #2.

## 6. UI and review gate for every visible feature

- Before coding, sketch the primary desktop, narrow/mobile and print (when applicable) states: normal, no data, permission denied, validation conflict and pending save. Review the design with the user when it materially changes workflow.
- Use one consistent page hierarchy and action placement. Keep destructive controls distinct, show the entity name and consequences, and preserve context after a successful save.
- For routines and ledgers, prioritize scan speed: compact rows, stable day/time headings, sticky headers where useful, readable wrapping, explicit unknown values and no forced page-wide horizontal overflow. Print templates are checked at A4 size with heading/date/version and no clipped rows.
- Keyboard navigation and focus order must work; labels and error messages must be programmatically associated; dynamic feedback must be announced without relying only on color.
- Review the change against the approved issue/spec and repository conventions; inspect a diff, run focused browser flows, capture desktop/mobile/print screenshots and fix visual regressions before the issue commit. Use specialized browser, React and design skills when the implementation task actually calls for them.

## 7. Deployment gates, not a deployment request

**Preview:** Vercel build, separate hosted PostgreSQL database, preview Google OAuth origin, secrets, migrations, first-admin bootstrap, health and anonymous/internal access smoke tests. Never point an unreviewed preview at the production database.

**Production:** tested backup/restore, final HTTPS origin and OAuth callback, least-privilege database access/pooling, session and role tests, migration runbook, monitoring, error handling and rollback procedure. The app may be deployed internally before an official routine exists; **public routine publication** additionally requires all source blockers resolved and the institution's approver decision. Local PGlite files are not deployment storage.

## 8. Questions and decision gates

Defaults below are conservative and reversible only where noted. Record answers in the relevant issue and decision register; do not infer them from an old screenshot.

1. **Production administrator:** keep `dfahim432@gmail.com` as first admin, or use a university-managed Google account? Until confirmed, bootstrap is local/test only.
2. **Public contacts:** keep teacher, class representative and query phone/email hidden (current behavior), or publish a specifically approved subset? A changed policy needs exact fields and consent/authority.
3. **Next priority:** SAFE-01 first (recommended), or a different issue? If changed, record the dependency risk explicitly.
4. **Institutional source:** can the missing `pundra-cse-academic-portal-specification.md` be restored, and who signs off the unresolved decision count and Summer 2026 source corrections?
5. **RUT-03 facts:** who confirms teacher codes `SI`, `AS`, `MNI`, `HUH`, NB-508/NB-608 lab use, and HSC-25B Saturday–Tuesday replacements? No fabricated names or placements.
6. **Policy authority:** who approves timetable exceptions, attendance rounding/lock corrections and extra-load claims, and must submitter and approver be different people?
7. **Operations:** who owns encrypted backups, restore drills, PostgreSQL hosting and Google OAuth credentials? Production cannot pass its gate without named owners.

The first three questions are being asked now; the others can be answered when their gated issue is planned. Until then the default is **no public contacts, no invented academic facts, no destructive historical edits, and no live deployment**.
