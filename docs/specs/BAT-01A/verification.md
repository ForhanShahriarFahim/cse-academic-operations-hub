# BAT-01A — Planning verification and review

Parent [#6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6) · [specification](spec.md) · [sole plan/approval](plan.md)

Date: 5 November 2026, Asia/Dhaka. Branch `codex/bat-01a`, base local main `7437def`.

## Planning evidence

Inspected source/code and requirement evidence is linked from the specification and plan. No institutional storage opened; no app/prepare/migration/reset commands run. No remote activity or extra agent/worktree. New documentation is a proposal; application behavior is unchanged.

Proposed sketches use synthetic examples, including a synthetic future active term; they are not a report of institutional data or an implementation preview.

| Planning check | Result and evidence |
|---|---|
| Source/requirement/template review | Passed. Spec records actual global-count/current-page seams, supplied source versus synthetic fixtures, six pending owner decisions, 11 criteria, exclusions and forward preservation requirements. One primary task checklist; no approval inferred. |
| Relative links/anchors | Passed: 166 links across six changed Markdown records, existing targets/heading anchors and required spec/plan sections; [machine record](../../../output/playwright/BAT-01A/document-review.json). |
| Responsive static browser | Passed: 63 cases (21 screens/variants at each of 1440/390/320px), one visible page heading, no page-wide overflow, script errors or detected WCAG A/AA/2.1 AA violations; [measurements](../../../output/playwright/BAT-01A/planning-review.json). |
| Focused correction | Current count source in detail was inconsistent with its latest synthetic change. Corrected the label, refreshed all three detail captures and rechecked the affected view: 3 cases pass; [record](../../../output/playwright/BAT-01A/detail-correction-review.json). |
| Sketch interactions/keyboard | Passed: count acknowledgement enables confirmation and reaches success; search/no-match/clear; first-tab skip link reaches content; labelled count controls have visible keyboard focus. Disabled confirmation is skipped until enabled. These exercise static sketches, not real server actions. |
| Visual inspection | Desktop directory, 390px detail/history and 320px count form reviewed. Clear hierarchy, stacked history and no clipped fields/actions. [Desktop](../../../output/playwright/BAT-01A/directory-1440.png), [mobile history](../../../output/playwright/BAT-01A/detail-390.png), [narrow count](../../../output/playwright/BAT-01A/count-320.png). 23 representative screen captures retained in the issue output folder. |
| Diff/scope/data safety | Whitespace/diff reviewed; changes limited to issue proposal/sketch/evidence and three current-work pointers. No source/schema/seed/dependency changes or institutional preparation. Required application suites intentionally not run for documentation-only work. |

Browser method: Playwright CLI package retrieval failed with registry DNS `ENOTFOUND`; used the already installed `playwright` library with installed headless Microsoft Edge instead, without installing dependencies or creating Playwright test specs. The sandboxed Edge launch closed during startup; the same local-file review succeeded with approved elevated execution. No automatic-review rejection occurred. No app server or institutional preview was opened.

Reproduce the sketch review by opening [batches.html](mockups/batches.html) directly and following its screen navigation. Captures/JSON are in `output/playwright/BAT-01A/`; local disposable review scripts are ignored under `.tmp/bat-01a/`. The retained JSON states exact browser checks and scope. No new directory print/export feature is proposed, so static print QA is inapplicable; existing publication/native A4 regression checks remain required during implementation.

## Implementation acceptance evidence

All AC-01–AC-11: **Pending — implementation not approved or started**. No application checks, database migration/recovery, actual permissions/actions, concurrency, production UI or native print pass is claimed by the planning package. SET-01A's accepted default-build exception does not transfer to BAT-01A.
