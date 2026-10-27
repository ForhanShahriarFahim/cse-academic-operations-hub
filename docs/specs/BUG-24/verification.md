# BUG-24 — Inspection and verification

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24). [Spec](spec.md) · [Plan/checklist](plan.md).
Date: 26 October 2026, Asia/Dhaka. Windows PowerShell, Node 22.11.0, installed Next.js / `@next/env` 16.3.4.
Revision: implementation on `codex/bug-24`, based on `0b1e055`; approval committed at `e0d823e` before application changes.
Status: owner accepted delivery on 27 October 2026 with the disclosed default-build limitation. Default Turbopack remains failed; local merge authorized and pending. Check results below are from 26 October and were not rerun for acceptance-only documentation.

## Inspection evidence

- Local/remote `main` agree at `0b1e055`; no open PR. GitHub issue #24 is open. All open issue bodies/comments and the earlier roadmap/brainstorm were reviewed for the proposed sequence. No GitHub write was made.
- Production-path inspection finds early `dotenv/config` in migrate, prepare, source-seed helper and administrator bootstrap. Direct target loading uses `.env.local` before `.env`. Existing T-01 code explicitly characterizes their disagreement.
- A temporary diagnostic used fresh Node/tsx child processes from `.tmp/planning-20261026/env-reproduction`, importing **only the database-free target module**, with synthetic `.env` and `.env.local` PostgreSQL URLs. No client or database module was imported.

| Entry style | Observed target |
| --- | --- |
| Early `dotenv/config`, then target loader (CLI style) | `from-dotenv.invalid:5432/fixture` |
| Target loader alone | `from-local.invalid:5432/fixture` |

The first diagnostic attempt needed the CommonJS default-export interop corrected; the corrected two-child run exited successfully and produced the values above. No production source change was made. Diagnostic scratch contains only synthetic configuration and is ignored by Git.

- The installed environment guide confirms environment-specific precedence, omission of `.env.local` in test mode, and use of `@next/env` outside Next. Current manual loading only covers two files. The proposed contract therefore addresses supported-loader parity as well as the reproduced defect.
- No institutional data was opened. No application server, migration, seed/reset, bootstrap or feature test suite was run during planning. Earlier passing code checks remain historical evidence, not a new pass for this proposal.

## Acceptance evidence

The new `BUG-24 environment` safety group uses synthetic root files and fresh Node processes. It compares both adapters across development/production/test with the installed `@next/env`, then exercises all four real CLI previews. An armed ESM/CommonJS import tripwire rejects database imports and confirms ordinary execution prints the same banner before reaching that boundary. The first CommonJS-only tripwire missed dynamic ESM imports; it was corrected and explicitly armed against real migration execution before preview checks. Its failed diagnostic used only an owned scratch target.

| Criterion | Result and evidence |
| --- | --- |
| AC-01 | **Pass.** Fresh-process Next/app-boundary parity and all four real CLI previews agree under conflicting synthetic root files. |
| AC-02 | **Pass.** Development/production/test file tiers for both adapters, test omission of `.env.local`, expansion/escaping, non-empty process overrides, empty pins, default directory and `memory://` verified. |
| AC-03 | **Pass.** Lifecycle children select development/production; contradictory and invalid modes fail before the armed import boundary. Actual `npm.cmd run predev/prestart -- --show-target` also selected the expected modes. |
| AC-04 | **Pass.** All previews pass with database imports forbidden; real execution reaches the armed tripwire only after the identical banner. Helper imports open nothing. Synthetic target directories remain absent. |
| AC-05 | **Pass.** Encoded credentials, query/password/token markers, auth secrets and invalid URL/mode input are absent from banners/errors; bootstrap preview needs no email or link setup. |
| AC-06 | **Pass.** Import-tripwire tests cover preview/refusal before client import. Existing BUG-26 groups pass on both adapters: protected directory refusal, exact confirmation, access preservation, interrupted-reset recovery and prepare-on-empty behavior. |
| AC-07 | **Pass.** All 17 safety groups pass with PostgreSQL 17.11 enabled, including poisoned environment isolation, recovery/history/audit, time zones, accounts/bootstrap, cluster cleanup, reset, teacher records and blocked deletes. |
| AC-08 | **Partial; disclosed exception accepted with delivery on 27 October.** Typecheck, lint, domain, full safety, UX harness and Webpack production build pass. Default Turbopack build fails as detailed below. Institutional directory metadata is unchanged; it was never opened. |
| AC-09 | **Owner accepted, 27 October.** After the result and build limitation were presented, the owner replied "Looks good move forward". The exact inspection block below was executed successfully; four previews and an unconfirmed reset left its target absent. Local merge authorized. |

## Code checks and build limitation

- Passed: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npx tsx scripts/verify-ux-review.ts`; matching installed direct `@next/env` 16.3.4 confirmed.
- Passed: full `npm run test:safety` with `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`, exit 0. All 17 groups passed; no adapter group was skipped. The final harness report was `Default PGlite directory metadata unchanged (present); it was never opened.` All application mutations used synthetic owned PGlite runs or disposable `safe01_*` PostgreSQL databases.
- Passed: `node node_modules/next/dist/bin/next build --webpack` with `npm_lifecycle_event=build`, production mode, `DATABASE_URL=''`, `PGLITE_DATA_DIR=memory://`, empty Vercel/Google values and synthetic auth origin/secret. Compilation, TypeScript, static generation, traces and all routes completed. No app server was started.
- **Failed/unresolved:** default `npm run build` (Turbopack). Its CSS worker exits before IPC connection while compiling unchanged `src/app/globals.css` for `/_not-found`. The same failure occurred outside the sandbox and with bundled Node 24.22.1 in addition to system Node 22.11.0. This is an observed build-tool failure, not a passing default build or proof of its root cause. The build script/configuration and installed runtime were not changed.
- The installed Next CLI guide documents `--webpack`. On this machine `npm.ps1` drops forwarded option flags; an attempted `npm run build -- --webpack` repeated Turbopack. Direct Node invocation selected Webpack correctly. PowerShell operators should use `npm.cmd` for forwarded flags; its migration and lifecycle previews were exercised successfully. The owner inspection below avoids the wrapper entirely.
- The restricted sandbox refused the existing synthetic junction-escape check. The full safety suite was restarted outside that restriction with `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`; the isolation group then passed. This was a tooling retry, not a weakened target guard.
- Static review: extracted administrator account behavior matches baseline exactly except removed early loader, exported entry name and CLI wrapper extraction. No schema/source-fixture change. Generated `next-env.d.ts` build-path churn was restored to the committed baseline. `git diff --check`, 120 local documentation file links and 7 heading anchors pass across the seven delivery documents.

## Owner inspection

From the repository root, this PowerShell block starts children with explicitly pinned values, previews all four commands, and demonstrates reset refusal without confirmation. The JavaScript child environment preserves empty pins even on older PowerShell versions. It leaves the caller's environment unchanged. None of these commands opens a database or prints a setup/reset link.

```powershell
@'
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const directory = path.resolve(".tmp/bug-24-owner-preview/not-created");
const env = {
  ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: directory,
  NODE_ENV: "development", VERCEL: "", npm_lifecycle_event: "",
  __NEXT_PROCESSED_ENV: "", NEXT_RUNTIME: "",
};
const entries = ["src/db/prepare.ts", "src/db/migrate.ts", "src/db/seed.ts", "scripts/bootstrap-admin.ts"];
for (const file of entries) {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", file, "--show-target"], { env, stdio: "inherit" });
  assert.equal(result.status, 0, `Preview failed: ${file}`);
}
const refused = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/seed.ts"], { env, stdio: "inherit" });
assert.equal(refused.status, 1, "Expected unconfirmed reset refusal.");
assert.equal(existsSync(directory), false, "Preview/refusal must create nothing.");
console.log("Preview target remains absent.");
'@ | node
```

Each preview prints the command name, `Environment: development`, `Mode: pglite`, the resolved `.tmp/bug-24-owner-preview/not-created` path, and `Preview only; no database opened.` The unconfirmed reset prints the same selection and exits 1 with `Nothing was changed.` Do not add `--confirm` for this inspection.

To reproduce the synthetic precedence, redaction, lifecycle, no-open and pinning matrix:

```powershell
npm.cmd run test:safety -- 'BUG-24 environment'
```

This CLI-only change has no new browser flow or screenshot requirement. UX review target/pinning checks are included in final validation; the app server is not started on institutional storage.

## Planning-document checks (before implementation)

- Passed: 11 changed/new Markdown files checked; 124 local links and 5 heading anchors resolve. Required spec/plan sections, pending approval and shared entry instructions are present.
- Passed: `git diff --check` and new-file trailing-whitespace checks. Diff review confirms local-first changes are limited to workflow, status pointers, templates and the proposed planning package.
- Passed: D-01/D-02/D-04–D-07 institutional sections are unchanged byte-for-byte after newline normalization; only D-03's outdated progress statement is clarified. The generated Next.js instruction block is unchanged. No source, application, dependency or schema change.
- Not run during planning: code/domain/build/database/browser suites, because that checkpoint changed documentation only. Feature criteria were pending at that point; current results are above.
- Static instruction checks do not prove a fresh agent session loaded the files. Model/effort selection was not changed by this documentation update.

## Delivery and acceptance

- Planning: owner-authorized; local checkpoint only. See the plan's checkpoint for the commit title.
- Implementation approval: granted 26 October 2026 for the presented contract at `960d5d3`; exact owner wording is in the plan's approval record. Recorded/committed before application changes.
- Implementation checkpoint: `c9b564a` (`fix(BUG-24): unify database environments and add safe CLI previews (#24)`). Final validation/handoff is a separate local documentation checkpoint.
- Implementation/code checks: recorded above; AC-08 remains partial because the default Turbopack build failed. Webpack production build and all other required code/safety checks passed.
- Owner inspection/acceptance: granted 27 October 2026 after disclosure of the validation results and default-build failure; exact wording: "Looks good move forward". The limitation remains recorded, not reclassified as a pass.
- Local merge: authorized; pending execution.
- GitHub synchronization: intentionally deferred under the owner's local-first agreement; #24 remains open.
