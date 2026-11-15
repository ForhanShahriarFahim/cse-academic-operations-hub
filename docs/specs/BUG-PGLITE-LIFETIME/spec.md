# BUG-PGLITE-LIFETIME — consistent local production saves

Combined specification, sole checklist, verification and next-session handoff.

Status: **accepted and merged into local `main` at `57be6ea` on 15 November 2026. AC-06 remains partial under the accepted default-build limitation.**
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
- [x] T-03 — Add a permanent guarded duplicated-bootstrap/build-isolation regression; establish red baseline, then implement runtime reuse/identity guard and green checks. Covers AC-01–03.
- [x] T-04 — Run required/focused checks and ordinary compiled production persistence/restart verification; fix in-scope findings and record criterion evidence/limits. Covers AC-04–07; AC-06 remains partial with the default-build failure disclosed below.
- [x] T-05 — Review/commit the bounded delivery, provide a runnable owner inspection path and obtain acceptance. Owner accepted delivery `7c8f064` on 15 November; acceptance `4f563c0` precedes local merge `57be6ea`. Leave CRS-01A for the next owner-started session.

## Verification and exact handoff

Planning checks: real-client diagnostic passes with production writer/read counts 1/0, development reuse and build memory isolation; institutional metadata unchanged. Documentation-only tracked changes; no app server/build/database-preparation command, institutional census, migration/reset or GitHub operation. Documentation links/whitespace/content and the planning diff are checked before committing. Application checks and HTTP/restart behavior remain pending implementation, not passed.

Approval checkpoint `4a8067d` precedes all application/test changes. Planning commit `c13c4ed`, branch/base unchanged. Implementation and verification evidence follows below. No acceptance, local merge, institutional operation or remote sync has been authorized by implementation approval.

## Implementation verification — 15 November 2026

Implementation stores `{ directory, client }` in `globalThis.__pundraPgliteRuntime` for all non-build runtimes, checks target identity before filesystem/client access, and bypasses that record for build memory stores. PostgreSQL and transaction/read/proxy code are unchanged. README documents one process per local directory and restart on target changes.

| Criteria | Recorded result |
|---|---|
| AC-01–03 | New `BUG-PGLITE-LIFETIME bootstrap` safety group fails against the baseline with `production bootstrap copies must share one PGlite client`, then passes after the fix. Real disk-backed duplicate bootstrap writes agree in both directions, rollback leaves two committed rows, target changes fail before filesystem/construction, three build clients are independent memory stores under a disk-access tripwire, the runtime record survives builds, development/test share clients, and sequential close/reopen retains only committed rows. Institutional metadata unchanged. |
| AC-05 | Existing BUG-LOAD-BASIS eligibility groups pass on PGlite and disposable PostgreSQL 17.11: real loaders/actions, permissions/assignment/anonymous/wrong-term/stale refusals, claim/policy audit fault rollback/retry and precision/legacy-policy behavior. PostgreSQL first hit sandbox loopback `EACCES`; the isolated PostgreSQL-only retry outside the sandbox passes. Existing T-03 two-term history passes, including snapshots/rows/audits, repeated migrations, term-switch loader/CSV parity and cross-term write refusals. |
| AC-06 | **Partial.** Typecheck, full domain suite and final full lint pass. Initial lint found Next's reserved local variable name `module` in the new regression harness; renamed to `bootstrapModule`, final lint passes. Default Turbopack build fails at the existing `globals.css` CSS-worker startup (child exits 0 before connection). A separate guarded Webpack build first failed with sandbox `EPERM` creating `.next/static/chunks/app/public/routine`; its retry outside the sandbox passes, including TypeScript, page generation and tracing. No build-policy change or implicit passing exception. |
| AC-04 | **Pass on the ordinary compiled Webpack/PGlite app.** Two extra-class saves and two policy edits alternate between `/extra-load` and `/settings`, each visible after action refresh and hard reload. Verified owned server stop/closed port, then a new server process against the same synthetic directory: both rows and rate 203.75 persist. A third class is submitted in the new process at 375px and survives reload; no page-wide overflow. After stopping that server, an independent PGlite read confirms all three notes/dates, rate 203.75, three `extra_load.create` audits and two `policy.update` audits. All database-owning phases are sequential. Launcher has no client preload/global assignment or database injection, only environment pins and real synthetic Better Auth sessions. |
| AC-07 | Pass. No institutional client, schema/migration/reset or remote operation. Completed safety groups compare default institutional file metadata unchanged; no row-level institutional census is claimed. Final diff, documentation links/content/whitespace and captures reviewed. Generated `next-env.d.ts` changes restored to the baseline. |

Existing BUG-24 environment group passes: 94 fresh-process precedence/preview cases, both adapters, supported modes, process pins, pre-import refusals and review pinning. The new regression runs the actual transpiled bootstrap with only target/environment/schema boundaries stubbed; the browser checks use real compiled actions, loaders and authentication against synthetic stored sessions. Neither is a hosted-production certification.

Browser execution limits/corrections: sandbox npm cache lacked the Playwright CLI, so the existing user-cached CLI was used directly. Sandbox Edge launch failed at its named-pipe boundary; isolated Edge outside the sandbox worked. The only observed browser console error was the existing `/favicon.ico` 404. No provider request was needed. Server restart used Windows `Stop-Process` after checking the exact saved PID, command and listening-port owner; this verifies sequential process restart, not a newly implemented graceful shutdown mechanism.

Full `test:safety`, `test:ux`, `test:ui`, print, keyboard/axe suites, real-provider OAuth and hosted PostgreSQL browser deployment were not run for this bootstrap slice. Default-build failure remains separate from the passing Webpack production runtime evidence. No application changes followed the final compiled build; the lint correction changed only a local test-harness variable.

Captures: [first save after reload](../../../output/playwright/BUG-PGLITE-LIFETIME/first-save-reloaded-desktop.png), [policy after reload](../../../output/playwright/BUG-PGLITE-LIFETIME/policy-reloaded-desktop.png), [saved rows after restart](../../../output/playwright/BUG-PGLITE-LIFETIME/restarted-desktop.png), [mobile save after restart/reload](../../../output/playwright/BUG-PGLITE-LIFETIME/after-restart-save-mobile.png). [Compact persistence evidence](../../../output/playwright/BUG-PGLITE-LIFETIME/persistence.json). Desktop 1440×1000; mobile 375×900. No UI or print template change.

## Owner inspection and exact handoff

- Retained branch `codex/bug-pglite-lifetime`, base `575b830`; plan `c13c4ed`, actual approval `4a8067d` before implementation/delivery `7c8f064`. Acceptance `4f563c0` precedes local merge `57be6ea`; checkout is now local `main`. Inspect actual Git/status on resume. No push, PR, GitHub issue update or institutional operation.
- Open the already signed-in isolated Edge review window at `http://localhost:3100/extra-load`. Synthetic Summer fixture retains its original 4 July class, plus the three new classes on 8/9/10 July. Settings show rate **203.75**. Existing manual override remains 4 classes/Tk 1,000; ledger total is 8 classes/Tk 1,815. This fixture is unrelated to institutional data.
- Ignored launcher: `node node_modules/tsx/dist/cli.mjs .tmp/BUG-PGLITE-LIFETIME/start-review.ts`. It starts ordinary compiled Next on port 3100, guarded target `.tmp/ux-review/pglite-lifetime-preview`, no `--require` or client injection. Synthetic authentication state is in `.tmp/BUG-PGLITE-LIFETIME/browser-state.local.json`; keep it private/ignored. A different browser needs that synthetic state and will otherwise show sign-in. Do not run `npm start`/prestart against configured institutional storage for inspection.
- Review scripts and persisted independent-read checker are in ignored `.tmp/BUG-PGLITE-LIFETIME`; permanent lifetime regression is `scripts/safety/pglite-lifetime.check.ts`, invoked with `node node_modules/tsx/dist/cli.mjs scripts/verify-safety.ts BUG-PGLITE-LIFETIME`. Do not run preparation/inspection clients while the preview owns its directory. Restart existing development processes when adopting the new runtime registry; the old BUG-LOAD-BASIS client preload is not supported or needed.
- **Next action:** no issue in implementation. Suggest CRS-01A inspection/specification for a new owner-started session; do not start it automatically. The Turbopack worker investigation remains separate unless selected. Migration `0017` remains a separate backed-up institutional operation.

## Owner acceptance — 15 November 2026

The owner replied **“Accept.”** after delivery `7c8f064` was presented with the passing checks, synthetic preview/evidence and explicit default Turbopack CSS-worker build failure. Acceptance covers this bounded delivery and that disclosed limitation; AC-06 remains partial, and the passing Webpack build is separate evidence. This authorizes the workflow's local merge, not a bundler-policy change, next-package implementation, institutional operation or remote synchronization. Acceptance is committed before the merge. No source changes or new test uncertainty require repeating the recorded verification.

Local merge receipt: acceptance `4f563c0`, merge `57be6ea` into `main` on 15 November. One checkout, retained issue branch, no conflicts or application changes at merge; no tests repeated. This documentation-only receipt updates the current pointer and delivery sequence; links/content/whitespace and preservation of older handoffs are checked. Remote synchronization and institutional migration remain separate.

Suggested next-session prompt: “Inspect and specify CRS-01A / #7 catalog create/edit/lifecycle/history from current local main. Read the current handoff and relevant installed Next documentation; use one branch/checkout, preserve historical labels and existing offering impact, prepare one bounded specification/plan and applicable desktop/mobile sketches, then obtain actual approval before implementation. Do not open institutional storage or synchronize remotely. Keep the accepted Turbopack build limitation explicit and its investigation separate.”
