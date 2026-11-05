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

## Implementation status

Owner approved unchanged proposal `b9958aa` (“Approve”, 5 November); approval `b035ed4` precedes implementation. Source/schema/tests now implement D-1–D-6. Final verification and acceptance are in progress; do not treat the planning captures as a functional preview.

Focused BAT-01A groups pass on PGlite and PostgreSQL: populated 0014→0015 with numeric/null/zero/negative/orphan/legacy semester/status preservation; repeat migration; explicit state/count actions and role/scope/anonymous matrix; stale/missing/ABA context; direct FK and structural/uncertain snapshot deletion guards; two-term portal/all-term room counts; public/frozen metadata privacy; verified-zero backup/restore; count/assignment races in both orders, normalized duplicate creates and competing count confirmations. Current tests also check inactive-cohort assignment/new-grid selection guards. Re-run those affected checks after their final changes.

The full safety run passed through T-06 PostgreSQL, then BUG-29's legacy catalog expectation needed the new post-0007 timestamp exclusion. Corrected that test and resumed remaining named groups rather than claim the first run completed. Final logs/criterion mapping will follow. Production browser review found an action-selector label mismatch, now corrected; refreshed review build/checks underway. The default Turbopack build fails in `globals.css` CSS-worker startup, including an elevated retry. A separately labelled Webpack build passed before the latest fixes; its refresh and final code checks remain in progress. **No BAT-01A build exception or delivery acceptance is approved.**

## Configured-client initialization incident

The first implementation imported `lockTermContext` from the database-bound `term-context.ts` into the previously database-free room transaction helper. The parent safety runner imports that helper before pinning child targets. This transitive import initialized the configured PGlite client; earlier focused runs reported changed default-directory metadata. That violates the intended no-open boundary and is disclosed here rather than attributed to an unproved external writer.

No application write, migration, preparation or reset was issued to that configured client; domain calls used injected disposable transaction readers. Constructor startup may change storage metadata. There is no pre-incident row fingerprint, so byte-for-byte institutional preservation cannot be certified from these runs. No recovery/reset or further direct opening was attempted to erase or investigate the effect.

Correction: extracted database-free `term-lock.ts`, preserving the existing API via re-export. `scripts/verify-db-free.ts` intercepts and rejects any attempt to load `src/db/index.ts` while importing all injected-adapter helpers. The parent runner additionally refuses a cached configured DB module. The regression passes; post-fix BUG-29 runs report unchanged default metadata. Retain the distinction between earlier constructor initialization and later verified isolation at delivery.

## Count and writer inventory

| Seam | Final contract |
|---|---|
| `batch_term_placements` / 0015 | Term count, source/origin, verifier/time, revision; global legacy field retained. Trigger protects new semesters/count evidence without normalizing historical anomalies. |
| `batch-actions` / `batch-store` | Exclusive context first; explicit cohort/placement revisions; all-term reference/impact fingerprints; scoped reauthorization and atomic named audit. |
| Existing routine/academic/grid/publication writes | Existing shared active context remains first; actual count/room assignment barriers prove serialization. New planning exceptions/assignments refuse inactive cohorts. |
| Room saves/lifecycle/maintenance/assignment | Database-free `lockRooms` acquires shared context before sorted room locks. All-term audience evidence joins placement by offering term, with confidence and known subtotal. |
| Portal/meeting/auto-schedule reads | Shared-context snapshot across composed reads. No global count fallback; missing placement is unknown; canonical audience IDs deduplicated. |
| Conflicts/occupancy/auto-schedule | Estimates always warn; provably excessive partial subtotals still block. Inactive cohorts are skipped for new scheduling while old reads persist. |
| New publications and archived projection | Safe optional frozen confidence; explicit batch projection excludes operational status/intake/source/verifier/context. Old stored JSON is not updated. |
| Seeds/source preparation/review fixtures | Only explicitly guarded owned runners used. Production seed counts remain null; synthetic fixtures declare per-term estimates explicitly. Institutional migration remains separate and unauthorized. |
