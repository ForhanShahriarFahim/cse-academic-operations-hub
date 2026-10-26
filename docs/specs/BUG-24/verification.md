# BUG-24 — Inspection and verification

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24). [Spec](spec.md) · [Plan/checklist](plan.md).
Date: 26 October 2026, Asia/Dhaka. Windows PowerShell, Node 22.11.0, installed Next.js / `@next/env` 16.3.4.
Revision: implementation on `codex/bug-24`, based on `0b1e055`; approval committed at `e0d823e` before application changes.
Status: implementation and validation in progress; owner acceptance and local merge pending.

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

Final acceptance mapping/check results will be recorded after the running checks finish. AC-09 remains pending actual owner acceptance.

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

## Planning-document checks

- Passed: 11 changed/new Markdown files checked; 124 local links and 5 heading anchors resolve. Required spec/plan sections, pending approval and shared entry instructions are present.
- Passed: `git diff --check` and new-file trailing-whitespace checks. Diff review confirms local-first changes are limited to workflow, status pointers, templates and the proposed planning package.
- Passed: D-01/D-02/D-04–D-07 institutional sections are unchanged byte-for-byte after newline normalization; only D-03's outdated progress statement is clarified. The generated Next.js instruction block is unchanged. No source, application, dependency or schema change.
- Not run: code/domain/build/database/browser suites, because this checkpoint changes documentation only. Feature criteria remain pending.
- Static instruction checks do not prove a fresh agent session loaded the files. Model/effort selection was not changed by this documentation update.

## Delivery and acceptance

- Planning: owner-authorized; local checkpoint only. See the plan's checkpoint for the commit title.
- Implementation approval: granted 26 October 2026 for the presented contract at `960d5d3`; exact owner wording is in the plan's approval record. Recorded/committed before application changes.
- Implementation/code checks: in progress; final results pending.
- Owner inspection/acceptance: pending.
- Local merge: pending acceptance and verification.
- GitHub synchronization: intentionally deferred under the owner's local-first agreement; #24 remains open.
