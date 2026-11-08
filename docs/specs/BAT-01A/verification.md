# BAT-01A — Planning verification and review

Parent [#6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6) · [specification](spec.md) · [sole plan/approval](plan.md)

Date: 5 November 2026, Asia/Dhaka. Branch `codex/bat-01a`, base local main `7437def`.

## Planning evidence

Inspected source/code and requirement evidence is linked from the specification and plan. No institutional storage opened; no app/prepare/migration/reset commands run. No remote activity or extra agent/worktree. New documentation is a proposal; application behavior is unchanged.

Proposed sketches use synthetic examples, including a synthetic future active term; they are not a report of institutional data or an implementation preview.

| Planning check | Result and evidence |
|---|---|
| Source/requirement/template review | Passed. Spec records actual global-count/current-page seams, supplied source versus synthetic fixtures, six pending owner decisions, 11 criteria, exclusions and forward preservation requirements. One primary task checklist; no approval inferred. |
| Relative links/anchors | At planning, 166 links across six changed Markdown records, existing targets/heading anchors and required spec/plan sections passed; the linked receipt now checks the latest delivery records; [machine record](../../../output/playwright/BAT-01A/document-review.json). |
| Responsive static browser | Passed: 63 cases (21 screens/variants at each of 1440/390/320px), one visible page heading, no page-wide overflow, script errors or detected WCAG A/AA/2.1 AA violations; [measurements](../../../output/playwright/BAT-01A/planning-review.json). |
| Focused correction | Current count source in detail was inconsistent with its latest synthetic change. Corrected the label, refreshed all three detail captures and rechecked the affected view: 3 cases pass; [record](../../../output/playwright/BAT-01A/detail-correction-review.json). |
| Sketch interactions/keyboard | Passed: count acknowledgement enables confirmation and reaches success; search/no-match/clear; first-tab skip link reaches content; labelled count controls have visible keyboard focus. Disabled confirmation is skipped until enabled. These exercise static sketches, not real server actions. |
| Visual inspection | Desktop directory, 390px detail/history and 320px count form reviewed. Clear hierarchy, stacked history and no clipped fields/actions. [Desktop](../../../output/playwright/BAT-01A/directory-1440.png), [mobile history](../../../output/playwright/BAT-01A/detail-390.png), [narrow count](../../../output/playwright/BAT-01A/count-320.png). 23 representative screen captures retained in the issue output folder. |
| Diff/scope/data safety | Whitespace/diff reviewed; changes limited to issue proposal/sketch/evidence and three current-work pointers. No source/schema/seed/dependency changes or institutional preparation. Required application suites intentionally not run for documentation-only work. |

Browser method: Playwright CLI package retrieval failed with registry DNS `ENOTFOUND`; used the already installed `playwright` library with installed headless Microsoft Edge instead, without installing dependencies or creating Playwright test specs. The sandboxed Edge launch closed during startup; the same local-file review succeeded with approved elevated execution. No automatic-review rejection occurred. No app server or institutional preview was opened.

Reproduce the sketch review by opening [batches.html](mockups/batches.html) directly and following its screen navigation. Captures/JSON are in `output/playwright/BAT-01A/`; local disposable review scripts are ignored under `.tmp/bat-01a/`. The retained JSON states exact browser checks and scope. No new directory print/export feature is proposed, so static print QA is inapplicable; existing publication/native A4 regression checks remain required during implementation.

## Implementation status

Owner approved unchanged proposal `b9958aa` (“Approve”, 5 November); approval `b035ed4` precedes implementation `67780ff` and browser corrections `3e126a6`. **Ready for owner inspection; AC-11 partial and acceptance/local merge pending.** Planning captures below are historical design evidence; use the runnable production review path below for inspection.

Focused BAT-01A groups pass on PGlite and PostgreSQL: populated 0014→0015 with numeric/null/zero/negative/orphan/legacy semester/status preservation; repeat migration; explicit state/count actions and role/scope/anonymous matrix; stale/missing/ABA context; direct FK and structural/uncertain snapshot deletion guards; two-term portal/all-term room counts; public/frozen metadata privacy; verified-zero backup/restore; count/assignment races in both orders, normalized duplicate creates and competing count confirmations. Final focused recheck includes inactive-cohort assignment/new-grid selection guards and corrected database-free imports.

The full safety run passed through T-06 PostgreSQL, then BUG-29's legacy catalog expectation needed the new post-0007 timestamp exclusion. Corrected that test and resumed remaining named groups: **all 29 named groups pass across the recorded runs**, not in one uninterrupted invocation. [Safety receipt](../../../output/playwright/BAT-01A/runtime/safety-review.json). Production review corrected action-selector labels, view-only direct-route denial (standard forbidden page), duplicate Unknown wording and history presentation. Final typecheck/lint/domain checks pass. Default Turbopack still fails on final source in `globals.css` CSS-worker startup, including elevated execution; separately labelled Webpack build passes. [Build receipt](../../../output/playwright/BAT-01A/runtime/build-review.json). **No BAT-01A build exception or delivery acceptance is approved.**

## Acceptance evidence

| Criterion | Result | Evidence and limits |
|---|---|---|
| AC-01 | Passed | Actual raw global/CSE/other-department/coordinator/teacher/viewer/anonymous role matrix; zero-active directory/history; production viewer controls absent, private source absent and direct edit routes redirect to forbidden. |
| AC-02 | Passed | Normalized same-stream duplicate rejection, distinct streams, protected used stream, malformed/duplicate/forged fields, actual stale identity refusal with typed values retained, no-op paths and atomic audit. |
| AC-03 | Passed | Manual active placement, unused-semester correction, duplicate/stale placement, 1–8 write guard, retained anomalous legacy semester and missing/ABA context refusal; earlier rows unchanged. |
| AC-04 | Passed | Explicit deactivate/reactivate/graduate/restore with actual persisted transitions; ongoing and draft-term use refused; production used-cohort block and retained history. No automatic progression/graduation/hold. |
| AC-05 | Passed | Every direct cohort FK family independently protects deletion; offerings protect linked meeting/attendance descendants; structural and unsupported snapshots/aliases tested; new unused mistake deletes with tombstone audit. |
| AC-06 | Passed | Unknown, estimate, confirmed zero, revoke and clear states; server verifier/time/source; fresh count-impact review; actual estimate/verified-zero browser workflow; changing one term does not mutate earlier placement rows. |
| AC-07 | Passed | Actual portal/all-term room evidence and shared partial-total cases; estimate warning plus known-subtotal blocker; assignment/auto-schedule consume term counts, inactive selection guarded. Counts never fall back to the preserved global legacy field. |
| AC-08 | Passed on disposable evidence | Both-adapter populated upgrade/reapply and full-fingerprint verified-zero recovery; old snapshot hashes unchanged through workflow; safe optional frozen confidence and private sentinels; public/archive CSV and native output parity. This does not certify the configured store's pre-incident rows; see the incident record below. |
| AC-09 | Passed | Real production actions: missing/ABA context, revisions/fresh fingerprints, audit fault rollback; PostgreSQL independent trigger/advisory barriers with observed blocking PIDs; PGlite actual queued requests. Count/assignment and competing identity/count writes pass. Ten additional orderings per adapter cover publication/delete, publication/count, placement/delete, placement/lifecycle and count/activation in both directions, including immutable winning counts and stale/new-reference refusals. |
| AC-10 | Passed for BAT-01A flows; existing findings disclosed | [66 production captures](../../../output/playwright/BAT-01A/runtime/browser-review.json) at 1440/390/320px, no page overflow or page script errors; cohort/viewer states have zero detected WCAG A/AA/2.1 AA violations; keyboard/skip link and delayed real POST pending states pass. Unchanged attendance has three pre-existing unnamed selects; existing synthetic print-fit observations remain below. Native A4/projection preservation checked, not a whole-portal accessibility or print-quality certification. |
| AC-11 | **Partial — default build failed** | Typecheck, lint, domain and all 29 named safety groups pass; final default build exits 1 in CSS-worker IPC startup; separate Webpack production review build exits 0. Owner inspection/exception acceptance and local merge are still pending. |

## Production browser and native output

The final production browser run passes 66 captures, including create/duplicate, active placement, reviewed estimate/verified zero, stale identity and term epoch, all supported lifecycle actions, blocked/unused deletion, zero-active history and viewer privacy/direct denial. The final three pending captures hold the actual POST before transport completes: Saving status appears, fields are disabled, keyboard focus is visible and submission later succeeds. Loading boundary source is inspected; this is not a claim of a separate delayed-server loading capture. Routine/room/attendance/workload regressions are recorded explicitly in the [manifest](../../../output/playwright/BAT-01A/runtime/browser-review.json).

Native Edge print produces four public official landscape A4 pages, four archived official landscape A4 pages and two teacher portrait A4 pages. Pypdf checks dimensions/text/privacy; Poppler renders all ten. Every public/archive official page has the same rendered-pixel hash. The selected default-view public/archive CSVs are byte-identical and unchanged before/after cohort workflows; their exported course appears in each print output. Historical teacher workload remains explicitly unavailable, not reconstructed from live allocations. [Native print receipt](../../../output/playwright/BAT-01A/runtime/print-review.json).

Visual inspection covered desktop directory, narrow count confirmation, verified-zero detail/history, pending form and all six distinct native page layouts. Public/archive duplicates are identical by pixel hash. Existing long synthetic vertical break captions crowd narrow cells (already observed in the local delivery plan), and the deliberately long synthetic `REVIEW-NEW` row label exceeds its narrow legacy print cell. These are retained template/fixture-fit observations; no print-template change or retroactive snapshot repair is claimed. Native artifacts here are regression evidence, not a newly designed PDF deliverable or a claim of flawless legacy-template fit.

### Existing follow-up observed — proposal only

The unchanged [attendance component](../../../src/components/attendance-manager.tsx#L148) has three unlabeled per-student status selectors in the synthetic roster (`select-name`, critical). A Git comparison to base `7437def` confirms no attendance component/page edit in BAT-01A. The browser manifest preserves the exact nodes instead of suppressing them globally: only that unchanged regression screen records the finding; all cohort screens must have zero findings. No attendance fix, new issue, remote action or backlog implementation is started. The existing long-break/long-label template fit can be inspected with a separately scoped print follow-up.

## Actual owner review path

Open [BAT-01A synthetic review](http://localhost:3117/) and choose **Sign in as synthetic administrator**. The application is [Batches & placements](http://localhost:3116/batches). Use **View-only account** for the restricted journey. All people, students, contacts and count references are synthetic; the preview uses the separately labelled Webpack build, with the failed default build disclosed on the control page.

Inspect: create a batch → place it in Summer → save an estimate → review and confirm its count → inspect placement/change history. Try graduation on HSC-22B to see ongoing-use refusal. A new unused mistake can be deleted; a batch with a placement or publication reference is retained. Review deactivate/reactivate/graduate/restore on a safe cohort. Fixture controls can temporarily remove the active term; they are testing controls, not new portal features. The UI-COHORT/ UI-PENDING records left by review are invented test records.

Guarded restart: `node node_modules/tsx/dist/cli.mjs scripts/review-batches.ts --serve` after the recorded separate review build. The versioned helper creates its own harness-owned PostgreSQL cluster and uses direct Next start with a pinned synthetic target; it never selects institutional storage. `SAFE01_PG_BIN` defaults to the previously installed `F:/AI/tools/pgsql-17.11/pgsql/bin`. No `npm run dev/start` or institutional prepare/reset/migrate command is needed. Source `scripts/review-batches.ts` owns setup; ignored `.tmp/bat-01a/` contains local browser/print scripts and raw logs. Evidence receipts and captures are versioned in `output/playwright/BAT-01A/runtime/`.

Owner acceptance: **“Approved.”**, 8 November 2026, following the explicit delivery summary of the default-build failure, passing separate Webpack preview and configured-client incident/preservation limits. The disclosed default-build exception is accepted for this delivery; AC-11 remains partial and build policy is unchanged. Local merge is authorized; no remote synchronization or institutional migration. Parent #6 remains open; BAT-01B is not started. See the sole plan for the merge receipt.

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
