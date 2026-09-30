# `ISSUE-ID` — Verification and review

Template: report only checks actually performed; link concise evidence rather than full logs. For small issues, use these sections in the combined issue document.

Issue / specification / plan: `references`
Verified revision: `commit or working-tree description; include later changes`
Environment and date: `adapter/browser/tools as relevant; Asia/Dhaka`

## Acceptance evidence

| Criterion | Result: passed / failed / pending / not applicable | Method and evidence |
|---|---|---|
| AC-01 | Pending | `check, observed result and evidence reference` |

Explain not-applicable results. Pending required criteria prevent full completion.

## Checks

Record commands or manual flows, results and relevant limitations. Code changes need typecheck, lint, domain checks, build and issue-specific checks; documentation needs links/references/content/template/diff review. Record static instruction-path checks separately from live agent-loading tests. Recheck affected behavior after fixes; do not reuse pre-fix results as final proof.

## Review findings

| Finding | Correction / disposition | Reverification |
|---|---|---|
| `specific finding or explicitly none` | `fix or justified decision` | `result` |

## Delivery and acceptance

- Commits / PR: `references`
- Remaining gates: `external checks/decisions; keep issue open when required`
- Owner acceptance: Pending; `actual authorization and date when received`
- Merge / closure: Pending; `actual references after acceptance`
