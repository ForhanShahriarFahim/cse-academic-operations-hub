# SAFE-01 — Implementation plan

Issue: [#2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2)
Specification: [spec.md](spec.md)
Status: Complete. Accepted and merged on 30 September 2026 (PR #23); #2 closed.
Branch / base: `codex/safe-01` / `78db43d` (merged WORKFLOW-01 review).
Updated: 30 September 2026 (Asia/Dhaka).

## Approval record

- Owner instruction: "Approved move forward" after Step 4 accepts merging PR #22/closing WORKFLOW-01 and continuing to SAFE-01 inspection/planning.
- SAFE-01 implementation: Approved by the owner on 30 September 2026 (Asia/Dhaka): "Approve SAFE-01 as written, start T-01". Scope is exactly the spec at `85d5986` and tasks T-01–T-07 below, including the stated exclusions and pending PostgreSQL gates.
- Material amendments: obtain a decision before new schema/policy/UI scope or a different recovery target.
- Amendment (30 September 2026, owner): "I am giving you the permission to set up the machine for T-06". The spec excluded installing PostgreSQL tools; the owner lifted that exclusion. Owner choices:
  - install method left to the agent: portable EDB PostgreSQL 17.11 Windows x64 binaries (340.7 MB) from get.enterprisedb.com, extracted to `F:\AI	ools\pgsql-17.11` outside the repository, with no service and no PATH change;
  - major version 17.11;
  - dumps encrypted with built-in AES-256-GCM using a key file kept outside the repository.
  The disposable PostgreSQL cluster runs only on 127.0.0.1:55432, with its data under the ignored `.tmp/safe-01`. It is never a production or institutional target.
- Follow-up issues filed with owner approval: #24 (F-01), #25 (F-03), #26 (F-07), #27 (F-08), #28 (F-09).

## Approach and planned changes

Use `scripts/safety/` and `scripts/verify-safety.ts` with explicit disposable targets and owned adapter clients. Prefer schema/migrator imports; do not import the side-effectful application database singleton just to discover configuration. Tests must exercise production loaders, authorization and transactions, not copied implementations. Add only a narrow dependency seam around existing actor/transaction behavior when needed; production callers keep authorization and no runtime bypass is introduced. The installed Next.js server-actions guide was inspected; read relevant installed guides before code changes.

Scratch data/backups stay in ignored `.tmp/safe-01/`. Canonical fingerprints sort stable keys and normalize temporal/numeric/JSON values, checking both table integrity and term history. Only synthetic counts/digests and concise results enter versioned verification. Use the six existing migrations and a small synthetic two-term fixture; existing source/domain tests run separately. Do not call fixture counts institutional counts or build a rollover feature.

Preserve shared auditedChange and existing explicit transaction boundaries. Make first-admin user/role/audit creation atomic and invited-user activation atomically audited/idempotent. Record truthful system/user identity; no credentials/tokens in evidence. Classify provider-managed auth storage and trusted destructive seed/migration paths separately. Only narrow term-query defects reproduced by regression tests may be fixed; schema/policy changes require amendment.

Define a shared compatible result type at `src/lib/action-result.ts`, retaining existing exports/consumer behavior and optional outcome fields. No mass form rewrite. Planned production seams are `scripts/bootstrap-admin.ts`, `src/lib/auth/index.ts`, audit/test boundaries, existing result/guard exports and, only if demonstrated necessary, term loaders in `src/lib/data.ts` / `academic-operations.ts`.

## Tasks — single primary checklist

- [x] P-01 — Inspect issue/config metadata, migrations, write seams and available tools; no database connection/preparation/reset.
- [x] T-01 — Build explicit target selection/connection lifecycle and refusal tests; inventory all writes in `docs/operations/SAFE-01-mutation-inventory.md`. Check environment-loader precedence and inherited variables. Covers AC-01/05; first implementation checkpoint. Done 30 September: `scripts/safety/`, `npm run test:safety`, [inventory](../../operations/SAFE-01-mutation-inventory.md), [verification](verification.md).
- [x] T-02 — Exercise owned on-disk PGlite cold backup/restore, manifest/integrity fingerprints, active-writer/corrupt-backup/overlap/non-empty-target rejection. Write `docs/operations/DATABASE_RECOVERY.md`. Covers AC-01/02; depends T-01. Done 30 September: `fixture.ts`, `fingerprint.ts`, `pglite-backup.ts`, `recovery.check.ts`, [runbook](../../operations/DATABASE_RECOVERY.md).
- [x] T-03 — Add populated two-term/repeated-migration tests for placements, attendance/enrollment, extra-load, roles/audits, snapshots and real term loaders/exports. Fix only reproduced narrow leakage. Covers AC-04; depends T-01; PostgreSQL execution waits for T-06 prerequisites. Done 30 September on PGlite: Spring fixture, `children/controlled-runtime.ts`, `children/term-scenario.ts`, `history.check.ts`; reproduced cross-term writes corrected in `src/lib/term-scope.ts` (9 actions).
- [x] T-04 — Fix bootstrap/activation audit gaps and test production success, failed-audit rollback and denied requests without domain writes. Cover shared helper, manual publication/auto-placement/access transaction categories and bootstrap/activation; link exceptions/tests to inventory. Full OAuth/session/direct-action matrix remains AUTH-01. Covers AC-05; depends T-01/03. Done 30 September on PGlite: `scripts/bootstrap-admin.ts`, `activateInvitedUser` in `src/lib/auth/index.ts`, `faults.ts`, `children/action-probe.ts`, `audit.check.ts`.
- [x] T-05 — Extract compatible result contract and test/document six outcome categories without converting unrelated UI/actions. Covers AC-06. Done 30 September: `src/lib/action-result.ts`, `scripts/verify-action-result.ts` (in `test:domain`), adopted by the permission guard and term-scope refusal only.
- [x] T-06 — Prepare protected PostgreSQL dump/restore procedure and adapter fixture entry point; execute only with approved disposable databases, compatible clients and encrypted storage. Covers AC-03/04/05 adapter evidence; depends T-01/03/04 and external prerequisites. Missing prerequisites remain pending. Done 30 September after the owner approved machine setup: `database.ts`, `pg-cluster.ts`, `pg-backup.ts`, `postgres.check.ts`; T-03/T-04 checks run unchanged on PostgreSQL 17.11.
- [x] T-07 — Focused checks, then required final checks and diff/runbook/evidence review. Create verification.md when implementation begins, map actual revisions/results to ACs, resolve findings and present acceptance. Covers AC-07/08; depends applicable tasks above. Done 30 September with T-06 pending: final checks passed, review recorded in [verification.md](verification.md), evidence presented by pull request; AC-08 owner acceptance pending.

These are bounded planned seams, not instructions to edit every file. Add a package safety-test command and reuse installed libraries. No service/dependency installation or broad test-framework change is assumed; present a concrete amendment if one is necessary.

## Verification and delivery

Required final checks: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build` and the new isolated safety integration command. Review build/test target configuration first. Do not start dev/start, db:prepare or db:reset against institutional data. Database subprocesses explicitly override inherited targets; environment loading is not assumed harmless.

Review target/source/destination separation, writer closure, corrupt/incomplete backup rejection, schema/journal/row/sequence integrity, Summer fingerprints, term isolation, real transaction rollback, actor/audit classifications, permission denial and result compatibility. Controlled auth dependencies do not certify real OAuth/hosted sessions. Record untested mutation categories and unavailable adapters explicitly.

After approval commit the approved plan first, then coherent verified checkpoints for isolation/inventory, recovery, history tests, audit corrections, contract and final evidence. Related changes may share commits. Push after relevant checks; use this one issue branch throughout. Keep partial delivery and PostgreSQL gates explicit. No merge/closure before required acceptance; unavailable PostgreSQL verification keeps #2 open.

## Current checkpoint / handoff

- Completed: P-01, spec/plan, owner approval (30 September 2026) T-01 (target isolation harness, refusal/child-environment tests, mutation inventory with findings F-01–F-07), T-02 (cold PGlite backup/restore with fingerprints, negative cases and recovery runbook), T-03 (two-term history and term isolation through real loaders/exports; cross-term write correction), T-04 (atomic audited bootstrap/activation; success/rollback/denial tests across transaction categories), T-05 (compatible six-outcome result contract), T-07 (final checks/review; acceptance presented) and T-06 (PostgreSQL 17.11 disposable cluster: encrypted dump/restore; T-03/T-04 on PostgreSQL). WORKFLOW-01 accepted, PR #22 merged at `78db43d`, #20 closed.
- Database state: institutional PGlite directory never opened (metadata unchanged across safety runs); all migrations/queries ran only on owned `.tmp/safe-01` runs. Institutional counts not reverified.
- Next: none within SAFE-01. The owner accepted PR #23 on 30 September 2026 and deferred D-07 to DEP-01; the project brief holds the next-issue pointer.
- Pending: PostgreSQL source/destination/client tooling/encrypted storage and operational owners. Live provider tests remain AUTH-01.
- Process visibility: Node processes exist; command-line inspection denied. No writer ownership/stopped-state claim; institutional live backup is outside scope.
- Current verification: final run after T-06 passed typecheck, lint, test:domain, build and test:safety; details and pending ACs in [verification.md](verification.md). This checklist remains the task authority.
