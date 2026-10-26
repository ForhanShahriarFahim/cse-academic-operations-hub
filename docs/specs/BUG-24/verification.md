# BUG-24 — Inspection and verification

Issue: [#24](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/24). [Spec](spec.md) · [Plan/checklist](plan.md).
Date: 26 October 2026, Asia/Dhaka. Windows PowerShell, Node 22.11.0, installed Next.js / `@next/env` 16.3.4.
Revision: application baseline `0b1e055`; only documentation changes in the planning checkpoint.
Status: defect reproduced; implementation approved for the next session on 26 October 2026. Fix is not implemented or accepted.

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

AC-01–AC-09: **Pending**. A reproduction of the old behavior is not acceptance evidence for a fix. Fill the result matrix when implementation reaches T-04; do not copy old checks as proof.

## Planning-document checks

- Passed: 11 changed/new Markdown files checked; 124 local links and 5 heading anchors resolve. Required spec/plan sections, pending approval and shared entry instructions are present.
- Passed: `git diff --check` and new-file trailing-whitespace checks. Diff review confirms local-first changes are limited to workflow, status pointers, templates and the proposed planning package.
- Passed: D-01/D-02/D-04–D-07 institutional sections are unchanged byte-for-byte after newline normalization; only D-03's outdated progress statement is clarified. The generated Next.js instruction block is unchanged. No source, application, dependency or schema change.
- Not run: code/domain/build/database/browser suites, because this checkpoint changes documentation only. Feature criteria remain pending.
- Static instruction checks do not prove a fresh agent session loaded the files. Model/effort selection was not changed by this documentation update.

## Delivery and acceptance

- Planning: owner-authorized; local checkpoint only. See the plan's checkpoint for the commit title.
- Implementation approval: granted 26 October 2026 for the presented contract at `960d5d3`; exact owner wording is in the plan's approval record. Recorded/committed before application changes.
- Implementation/code checks: pending.
- Owner inspection/acceptance: pending.
- Local merge: pending acceptance and verification.
- GitHub synchronization: intentionally deferred under the owner's local-first agreement; #24 remains open.
