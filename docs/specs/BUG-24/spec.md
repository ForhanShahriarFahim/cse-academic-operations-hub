# BUG-24 — App and CLI select the same database

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24).
Status: Owner accepted delivery on 27 October 2026 with the disclosed default-build limitation (AC-08); local merge authorized. See the [acceptance record](plan.md#approval-record). The approved behavior below is unchanged.
Updated: 27 October 2026, Asia/Dhaka. [Plan](plan.md) · [Inspection/verification](verification.md).

## Problem and inspected baseline

At `0b1e055`, [target.ts](../../../src/db/target.ts) loads `.env.local`, then `.env`, without overriding process variables. [index.ts](../../../src/db/index.ts) uses it before opening a database. However, `migrate.ts`, `prepare.ts`, `seed-summer-2026.ts` and `bootstrap-admin.ts` import `dotenv/config` first. Those imports fill process variables from `.env` before the intended loader can see `.env.local`.

A database-free child-process reproduction on 26 October, using only synthetic files under `.tmp/planning-20261026`, selected `from-dotenv.invalid:5432/fixture` through the early import and `from-local.invalid:5432/fixture` through the direct loader. No connection was made. The existing SAFE-01 T-01 check characterizes the same divergence rather than preventing it.

Consequently `predev`/`prestart`, migration and administrator setup can change a different database from the running app. Removing early imports alone fixes the two-file example but still leaves Next's environment-specific files, test behavior and variable expansion inconsistent. The installed Next.js 16.3.4 environment guide recommends `@next/env` for tooling outside Next.

BUG-26 already gives `db:reset` a redacted target banner, exact confirmation, default-directory refusal and preservation of portal access. Those protections are reused unchanged in purpose.

## Outcome and scope

**Outcome:** operators can determine which database a command will use before it connects, and the app and command select the same target for the same root, mode and process variables.

Included: one environment-loading policy; mode handling for local development/production/test; removal of conflicting imports; a redacted target banner and database-free `--show-target` on `db:prepare`, `db:migrate`, `db:reset` and `auth:bootstrap`; regression checks; README/operator guidance.

Excluded: changing any configured target, reading real secrets into evidence, migrating/resetting/bootstrap of institutional data, academic/schema/UI changes, hosted setup, automatic environment switching, or a general command framework. No browser mockup is needed: this slice changes operator CLI behavior only.

## Required behavior

### Environment and mode

- Use Next's supported `@next/env` loader, declared directly at the installed Next version (16.3.4 for this baseline), through a database-free shared module. Keep it compatible with the selected Next version when dependencies change.
- Process environment values take precedence, including explicitly present empty values used to pin disposable runs. Never overwrite them from files.
- Development/production load in this order: process, `.env.<mode>.local`, `.env.local`, `.env.<mode>`, `.env`. Test mode skips `.env.local` and uses `.env.test.local`, `.env.test`, `.env` after process values. Preserve Next's variable expansion and escaping behavior.
- Standalone operator commands default to development when `NODE_ENV` is absent; an explicit valid `NODE_ENV` wins. Resolve the default before loading any file; report it in the banner. Invalid explicit modes fail before any database import, with a clear message.
- `predev` preparation uses development and `prestart` preparation uses production, matching the corresponding Next command. Reject an explicitly contradictory mode before preparation instead of preparing one target and starting the app on another. `db:prepare` invoked directly follows the standalone rule. Avoid a dependency on platform-specific shell environment-assignment syntax.
- Within an already initialized Next runtime, do not reload files under a different mode or replace Next-loaded values. App server environment loading remains Next's responsibility; database access must not introduce an alternative precedence.
- Do not broaden configuration to environment files under `src/`. Paths are relative to the invocation project root (the existing repository-root command contract).

### Target selection and visibility

- Preserve target priority: non-empty `DATABASE_URL` selects PostgreSQL; otherwise non-empty `PGLITE_DATA_DIR` selects PGlite; otherwise the existing default directory. Keep `memory://`, absolute-path resolution, Vercel's PostgreSQL requirement and build-worker isolation.
- Every listed operator command prints command name, resolved mode, adapter and safe target **before importing a module that creates a database client**. Internal calls to migration/seed functions do not generate duplicate banners.
- PostgreSQL output includes only host, port and database name. Never include username, password, URL parameters, auth secrets or setup-link tokens in the banner. Invalid target errors must not echo the raw connection string. Existing bootstrap setup/reset links retain their explicitly intended terminal-only output after a real authorized invocation; preview never generates one.
- Add `--show-target` to all four commands. It prints the same selection that execution would use, exits successfully and does not create a database directory/client, query, migrate, seed, reset, change an account or require an administrator email. For `db:reset`, preview does not authorize execution or waive default-directory refusal.
- Invalid configuration exits nonzero before connection. A preview of a valid target does not prove that it is reachable or authorized.

Example with synthetic configuration:

```text
Command: db:migrate
Environment: development
Mode: postgresql
Target: from-local.invalid:5432/fixture
Preview only; no database opened.
```

### Preserved safety and behavior

- Reset still requires exact `--confirm`, refuses the protected institutional directory including aliases/ancestors/descendants, and preserves access as in BUG-26. A wrong/missing confirmation opens no database.
- Ordinary prepare/migrate/bootstrap execution keeps its existing approved purpose; this issue does not remove the current prepare-on-start behavior or add a blanket confirmation prompt for non-destructive commands.
- Loading a helper as a module must not execute a command or change a database. Seed helpers inherit the already resolved environment and cannot load `.env` ahead of the shared loader.
- Existing SAFE-01 and UX review pinning must continue to override hostile files/process variables. Synthetic app targets stay inside owned scratch; PostgreSQL execution stays on disposable `safe01_*` databases.
- No schema migration, source fixture change or institutional database operation belongs to this slice.

## Acceptance criteria

| ID | Observable condition | Verification |
| --- | --- | --- |
| AC-01 | Conflicting `.env`/`.env.local` values select the same intended target across the app database resolver and all four CLI previews | Fresh child processes in synthetic roots; compare output |
| AC-02 | Development, production and test precedence, expansion/escaping and process overrides match the installed Next loader; explicit empty pins remain effective | Matrix for PostgreSQL and PGlite target variables, including no-file/default and `memory://` cases |
| AC-03 | `predev`/`prestart` resolve development/production respectively; invalid/contradictory modes fail before connection | Controlled lifecycle child inputs; parity with Next loading, without launching the institutional app |
| AC-04 | Each `--show-target` returns the same safe banner as real execution's pre-connection selection and opens nothing | Nonexistent synthetic PGlite path remains absent; PostgreSQL preview with unreachable synthetic URL succeeds without connection; connection/import tripwire |
| AC-05 | Banners/errors omit synthetic credentials, parameters and secret/token markers | Captured stdout/stderr with encoded credentials, invalid URLs and query parameters |
| AC-06 | Reset confirmation/default-directory protections and portal-access preservation still pass | Existing BUG-26 safety groups on PGlite/PostgreSQL, plus preview/refusal checks |
| AC-07 | Poisoned environment isolation, recovery, bootstrap/account behavior and term history remain intact | T-01 and relevant safety groups; final safety suite with PostgreSQL tools |
| AC-08 | Required code checks pass and no institution data is changed; operator documentation matches behavior | Typecheck, lint, domain, build, safety evidence and diff review; any unavailable adapter check remains pending |
| AC-09 | Owner can personally inspect the CLI behavior and accepts the result before local merge | Exact safe preview commands and examples in verification; actual acceptance recorded in plan |

## Decisions and sources

- Recommended technical choice: supported `@next/env` parity instead of maintaining a second dotenv policy. A direct dependency and lockfile update are included in proposed scope.
- Recommended operator choice: direct CLI defaults to development; `prestart` selects production explicitly. Banner visibility makes the mode observable. These recommendations require approval with this contract.
- Installed reference: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (Loading Environment Variables with `@next/env`; Environment Variable Load Order). Read it again if the installed version changes before implementation.
- Existing contracts: [BUG-26](../BUG-26/spec.md), [SAFE-01 mutation finding F-01](../../operations/SAFE-01-mutation-inventory.md#findings-for-follow-up-not-safe-01-fixes-unless-stated), [recovery runbook](../../operations/DATABASE_RECOVERY.md).
- No new institutional fact is required. Do not interpret technical approval as permission to run these commands against institutional storage.
