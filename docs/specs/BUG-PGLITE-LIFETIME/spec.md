# BUG-PGLITE-LIFETIME — consistent local production saves

Combined specification, sole checklist, verification and next-session handoff.

Status: **approved for implementation; verification and delivery acceptance pending.**
Updated: 15 November 2026 (Asia/Dhaka).
Branch/base: `codex/bug-pglite-lifetime` from clean local `main` `575b830`; one checkout/writer.
Source: [BUG-LOAD-BASIS runtime finding](../BUG-LOAD-BASIS/spec.md#implementation-verification--11-november-2026). Local bug identifier; no GitHub issue created or remote query made.

## Authorization

The owner's **“What is the next task? Go for it.”** on 15 November started the inspection/specification explicitly suggested in the previous handoff. The owner then replied **“Approved.”** on 15 November 2026 to the concrete package committed at `c13c4ed`. This authorizes the unchanged scope and technical decisions below. This approval record is committed before implementation under [AGENTS.md](../../../AGENTS.md) and the [workflow](../../WORKFLOW.md#issue-lifecycle). Acceptance/local merge remain separate.

## Problem and inspected evidence

The previous guarded Webpack preview returned a successful extra-load save but showed an old ledger after reload. A preload providing one synthetic global PGlite client resolved that observation; it was a review workaround, not an application fix.

Inspection on 15 November:

- `src/db/index.ts` reads `globalThis.__pundraPglite` in every environment but assigns it only outside production. Separate production copies can therefore create separate clients for the same directory. Existing `.next/server/chunks/2336.js` and `8600.js` both contain this bootstrap; their presence is supporting build evidence, not a new HTTP reproduction.
- `next.config.ts` already externalizes `@electric-sql/pglite`. Externalizing the package does not make separate `new PGlite(...)` calls share an instance. No dependency/configuration change is proposed.
- `databaseTarget` resolves a directory before opening; `loadDatabaseEnvironment` preserves initialized Next environments. The existing `npm_lifecycle_event === "build"` branch substitutes `memory://`. Keep those boundaries.
- The PostgreSQL branch also uses a development-only global pool assignment, but independent PostgreSQL connections do not reproduce PGlite's separate embedded stores. Pool optimization is excluded.
- `inDatabaseTransaction`, the database proxy and `databaseReadBatch` must retain their current semantics. Sharing a client must not turn transaction context into a process-global current transaction.

### Disposable reproduction

Ran `node .tmp/BUG-PGLITE-LIFETIME/reproduce.cjs` against unchanged `src/db/index.ts` (SHA-256 `46d93282cf8b7c9c1315308fe43e5a04c8a61d5fff95e4aa90e539b4031b6fc5`). This ignored diagnostic uses installed TypeScript to transpile the exact bootstrap and evaluates two module wrappers in one shared VM realm. Only target/environment selection and the unused application schema are stubbed; PGlite, Drizzle, filesystem persistence and the bootstrap are real.

1. Create a fresh owned diagnostic directory `.tmp/safe-01/bug-pglite-lifetime-1794701494806`; initialize `lifetime_probe(id integer primary key)` with one client, then close it.
2. Evaluate the two production module copies against that directory and initialize both before writing. They expose **different** `db.$client` instances, with no global client populated.
3. Insert row 1 through the first exported `db`; its count is **1**, while the second exported `db` reads **0**. Assertions confirm the disagreement after a successful insert.
4. Evaluate two development copies with `memory://`: they share one client. Evaluate production/build copies: they use separate memory clients. Close all diagnostic clients.
5. Compare the default institutional directory's recursively collected file paths/sizes/mtimes before and after: unchanged. No institutional client was opened. This is a metadata preservation check, not a row-level census.

This confirms the duplicated-bootstrap failure mechanism with real embedded clients. It does **not** establish every cause of the earlier Next action failure, certify restart durability, or replace an unmodified production HTTP/action check. The first diagnostic attempt failed because its transpiler omitted `esModuleInterop`; correcting that diagnostic option to match `tsconfig.json` produced the result above. Application code was unchanged throughout.

Installed documentation consulted: Next's `01-app/02-guides/server-actions.md`, `self-hosting.md` (relevant single/multiple-instance and cache sections), and `01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md` under `node_modules/next/dist/docs/`; installed PGlite README's filesystem persistence and single-user limitation. Reconsult relevant guides if implementation changes the approach.

## Outcome and bounded scope

Within one local Node process, successful PGlite-backed actions and subsequent readers use the same live embedded database, even when Next compiles multiple bootstrap copies. Verify fresh reloads and a sequential server restart using the persisted synthetic data, without the old client-injection preload.

Included: PGlite runtime client lifetime in `src/db/index.ts` (a database-free helper may be extracted if useful), focused lifetime/build-isolation regressions integrated into safety tooling, existing relevant action/history checks, guarded production verification and operator/handoff documentation.

Excluded: migrations/schema changes, institutional storage access or migration `0017`, data repair/backfill, PostgreSQL pool changes, distributed or cross-process locking, multi-process/multi-instance embedded deployment, new shutdown infrastructure, environment/build-phase detection redesign, dependency upgrades, authentication/authorization or domain changes, UI/print redesign, the Turbopack CSS-worker investigation, CRS-01A and remote synchronization. Hosted deployment continues to require PostgreSQL and its existing release gates.

## Proposed behavior and technical decisions

1. **Runtime reuse:** publish the newly constructed PGlite client synchronously in a typed process-global record before callers can initiate a second bootstrap. Reuse it in production, development and test runtimes. Share the client, while retaining the existing exported database interface and request-local transaction handling. Do not cache a pending request or a current transaction globally.
2. **Target identity:** store the selected resolved directory with the client. A second initialization for the same target reuses it; a different target in the same process fails clearly before opening another client. Do not silently reuse the wrong database, replace/close an active client, or open one client per target. Target changes require a process restart. Use a dedicated typed runtime record rather than depending on the old review-preload key; cleanly restart previews/development when adopting it. No target URLs, credentials or row data in errors.
3. **Build isolation:** choose the existing build branch before consulting/publishing the runtime record. Each build bootstrap gets its own `memory://` client and neither consumes nor overwrites a runtime client. Preserve the current supported build-mode trigger; test it with explicit build environment pins. Never let a build open the configured persistent target.
4. **Other boundaries:** PostgreSQL selection/pool behavior, environment precedence, migrations/preparation, permissions, active-term checks, audited mutation rollback, historical rows and immutable publications retain their contracts. No new institutional rule decision is needed.
5. **Observable workflow:** no screen redesign. In the normal local production app, an authorized valid extra-load submission reports success and appears in the refreshed ledger, on a hard reload and after a sequential stop/restart. A supported policy edit likewise remains visible across reload/restart. Refused/stale/denied submissions still write nothing and audit failures still roll back.
6. **Process ownership:** this fix shares a client inside one JS process/realm. It does not coordinate another Node process, worker realm or a separately run database CLI. Review preparation, server and restart steps must be sequential against one disposable target. Document that local PGlite requires a single owner; use PostgreSQL for multi-process hosting. Escalate a production test showing distinct realms/processes rather than silently broadening scope.

## Acceptance criteria

| ID | Observable condition | Verification |
|---|---|---|
| AC-01 | Duplicated production bootstrap copies share one real PGlite client; committed writes through either exported database are immediately visible through the other. | Permanent regression on a guarded disk-backed fixture; record baseline red and fixed green. Check development/test reuse too. |
| AC-02 | A second target in the same runtime fails before opening it; no silent cross-target reuse or replacement. | Guarded fixture/constructor observation; existing target remains readable. |
| AC-03 | Build copies use independent memory clients even if a runtime record already exists, leave that record intact and never open the configured disk target. | Explicit production/build-mode check with a disk-access tripwire; required guarded default build. |
| AC-04 | An ordinary compiled local production server saves extra-load and policy edits visibly after action refresh, hard reload and sequential restart, without a shared-client preload or database injection. | Fresh synthetic preview using real Next HTTP/server-action paths; verify recorded rows/audits after stopping the server. Test two entry routes/alternating saves; repeat to detect stale readers. |
| AC-05 | Permissions, active-term/stale refusals, audit rollback and previous-term/publication history retain behavior; PostgreSQL remains compatible. | Focused BUG-LOAD-BASIS groups on PGlite/PostgreSQL, T-03 history and relevant environment checks; include transaction rollback/retry and denied cases. |
| AC-06 | Typecheck, lint, complete domain checks and default build pass; any remaining failure/unavailable check is disclosed separately. | Required project checks. A guarded Webpack production build/test is additional evidence, not a replacement default-build pass. |
| AC-07 | Institutional storage is not opened/changed; no schema or remote operation; proposal/delivery diff and documentation are reviewed. | Pinned targets, metadata comparison, source/diff/link checks, exact handoff. |

No print projection/template changes are proposed, so a full print capture suite is not required for this bootstrap slice. Record all unrun suites. Production browser captures should show the changed persistence behavior, not repeat the prior slice's complete UI review.

## Sole checklist and implementation sequence

- [x] T-01 — Inspect clean local main, previous finding, bootstrap/target/environment and installed documentation; reproduce on disposable data; prepare this package.
- [x] T-02 — Obtain actual owner approval of this concrete scope, record it here and commit the approved plan before application changes.
- [ ] T-03 — Add a permanent guarded duplicated-bootstrap/build-isolation regression; establish red baseline, then implement runtime reuse/identity guard and green checks. Covers AC-01–03.
- [ ] T-04 — Run required/focused checks and ordinary compiled production persistence/restart verification; fix in-scope findings and record criterion evidence/limits. Covers AC-04–07.
- [ ] T-05 — Review/commit the bounded delivery, provide a runnable owner inspection path and request acceptance. Merge locally only after actual acceptance; leave CRS-01A for the next owner-started session.

## Verification and exact handoff

Planning checks: real-client diagnostic passes with production writer/read counts 1/0, development reuse and build memory isolation; institutional metadata unchanged. Documentation-only tracked changes; no app server/build/database-preparation command, institutional census, migration/reset or GitHub operation. Documentation links/whitespace/content and the planning diff are checked before committing. Application checks and HTTP/restart behavior remain pending implementation, not passed.

Next action: after committing this actual approval record on `codex/bug-pglite-lifetime`, perform T-03 onward autonomously. Inspect Git/status before resuming; base `575b830`, planning commit `c13c4ed`. The ignored diagnostic is supporting local evidence, not the permanent regression. Do not restart the old BUG-LOAD-BASIS shared-client harness as proof of this fix. Default Turbopack's earlier CSS-worker failure remains a separate known limitation until a new required run establishes its current result. No acceptance, local merge, institutional operation or remote sync has been authorized by implementation approval.
