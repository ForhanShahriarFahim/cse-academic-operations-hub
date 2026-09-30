# SAFE-01 — Recovery, history and mutation safety

Issue: [#2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2)
Status: Proposed; implementation approval pending.
Inspected: 30 September 2026 (Asia/Dhaka), base `78db43d`.
Implementation plan: [plan.md](plan.md).

## Problem and inspected baseline

Prove recovery and second-term history preservation before adding more management features. Code presence does not prove restore, permission denial or audit rollback.

- `src/db/index.ts` chooses PostgreSQL when DATABASE_URL exists, otherwise PGlite. No .env/.env.local or configured database URL/path override was found here; default `.data/pglite-summer-2026` exists. It was not opened or queried. Other environments remain unknown.
- predev/prestart run preparation: migrations followed by development seeding when no academic term exists. db:reset truncates academic tables with CASCADE. Six migration SQL files/journal entries exist through `0005_auth`; their active-database application was not queried.
- Static inspection found 25 mutation actions: seven routine/external/publication, fourteen academic and four access-management. Most use auditedChange; publication/auto-placement/access actions use explicit audited transactions. These paths need executable evidence.
- First-admin bootstrap inserts user/role outside a shared audited transaction. First verified-login activation updates portal_users without an audit event. Provider-managed auth storage and maintenance/seed writes need explicit inventory classifications.
- Academic rows are largely term-scoped; identities such as teachers/cohorts/students are shared. Real loaders/projections need two-term tests. Current role tests are pure policy tests, not database/action rollback tests.
- ActionResult already contains ok/message/optional issues; access actions return void/throw. No tracked backup/restore/integration harness was found. pg_dump/pg_restore/psql/Docker are unavailable on PATH; no approved PostgreSQL test target is configured.
- Node processes exist, but command-line inspection was denied. No stopped-writer or process-ownership assertion is made.

## Outcome and scope

Exercise disposable PGlite recovery; prepare protected PostgreSQL recovery with honest pending evidence; test two-term history; inventory all writes and close the identified bootstrap/activation audit gaps; define a compatible shared result contract for later UI work.

Included: safety tooling/runbooks, fixtures, narrow production test seams, atomic audit fixes and regression-backed term-scoping corrections. A material schema/policy/UI change requires an amended plan.

Excluded: connecting to or changing the owner's active database, stopping owner processes, installing/provisioning PostgreSQL services/tools, real OAuth setup, publication/source corrections, rollover policy/UI, new master-data CRUD, attendance lock/void behavior, mass toast/result conversion and deployment. AUTH-01 retains full provider/session/direct-action verification; BAT-01 retains actual rollover policy/UI.

## Required behavior

1. Tests select explicit disposable targets; never inherit an active PostgreSQL URL or use the default PGlite path. Reject protected/ambiguous paths, overlapping source/restore locations, non-empty restore targets and unconfirmed database ownership. Do not commit credentials, dumps, tokens or private student data.
2. PGlite: create/migrate/populate an owned on-disk fixture, close its writer, copy to a separate backup and restore to a distinct empty directory. Reopen and verify schema/journal, canonical row fingerprints, relationships, roles, audits and immutable snapshots. Reject corrupt/incomplete backup and an active harness-owned writer. No hot-copy claim. Runbook requires confirmation that all institutional writers are stopped; inability to prove that blocks a real backup.
3. PostgreSQL: use explicitly approved disposable source/destination, compatible clients and encrypted/protected backup storage. Restore to a separate empty owned database without resetting/dropping production. Verify rows, sequences, constraints, journal, access/publication/audit history. Documentation/tooling is not an exercised restore; missing prerequisites keep PostgreSQL criteria and #2 open.
4. Fixture: retain a synthetic Summer baseline and add a later synthetic Spring term, e.g. Spring 2027, with repeating/graduating cohorts, a merged group and a cross-department student. Graduation is represented by later placement selection, not a new institutional policy. Preserve Summer placements, attendance/enrollment, extra-load, audit and snapshot fingerprints; switching the fixture's active term must not mix reads/reports/exports. Reapply migrations to populated disposable data and prove history/journal stability. Synthetic counts are not current institutional counts.
5. Inventory every application/bootstrap/activation/provider/maintenance write with named component owner, authorization, audit/transaction classification and tests. Make bootstrap and activation audit atomic/idempotent with honest system/user identity. Test production transaction/authorization behavior with controlled dependencies: successful writes, audit-insert failure rollback and denied requests without domain mutation. No production auth-bypass flag/public test endpoint. Classify provider-managed persistence and destructive development maintenance explicitly rather than claiming blanket academic audit coverage.
6. Retain ok/message/issues compatibility while specifying success, validation, conflict, permission, stale and partial-import outcomes through safe optional structured fields. Test mappings/invariants. This contract does not itself implement stale locking or change CSV/toast behavior; consumers migrate in their own issues.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | Safety tooling cannot select/inherit an active/default target; institutional data remains untouched. | Target-refusal checks, import/connection review and disposable environment record. |
| AC-02 | Cold PGlite restore retains canonical data/schema/journal/history in another empty directory. | On-disk restore/reopen exercise, negative cases and fingerprints. |
| AC-03 | Protected PostgreSQL backup restores into a separate owned database with equivalent integrity. | Actual approved dump/encryption/restore exercise; pending without prerequisites. |
| AC-04 | Second-term operations/repeated migrations preserve Summer history and isolate reads/exports. | Populated fixture on both adapters; unavailable adapter remains pending. |
| AC-05 | Every discovered write has an owner/audit classification; bootstrap/activation gaps are fixed; failed audits/denials leave no domain writes. | Source-linked inventory and production-path success/failure/denial tests across shared/manual transaction categories. |
| AC-06 | Shared contract covers six categories and preserves existing consumers. | Type/behavior/compatibility checks; no unrelated form changes. |
| AC-07 | Changed code passes required checks and targeted safety regressions; runbook explains limits. | Typecheck, lint, domain tests, build, isolated safety tests and documentation review. |
| AC-08 | Findings are resolved and owner accepts final evidence before merge/closure. | Verification record, review and actual acceptance; pending adapters prevent full closure. |

## Decisions and sources

[Workflow](../../WORKFLOW.md), [requirements](../../PRODUCT_REQUIREMENTS.md), [roadmap proposal](../../ROADMAP.md#safe-01--retained-proposal-not-an-approved-implementation-plan), [glossary](../../../CONTEXT.md), and [operational ownership D-07](../../decisions/INSTITUTIONAL_DECISIONS.md#d-07--operational-ownership). Approved PostgreSQL target/client tooling/encrypted storage and operational owners remain unresolved. They permit isolated local work after plan approval, but block complete verification/closure. This proposal grants no new institutional rule.
