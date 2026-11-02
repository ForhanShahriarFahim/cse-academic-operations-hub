# SET-01A — Verification and review

Parent [#14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14) · [specification](spec.md) · [sole plan](plan.md)

Date/environment: 2 November 2026, Asia/Dhaka; Windows, local branch `codex/set-01a`, base `6011e0f`; disposable PGlite and PostgreSQL 17.11; headless Microsoft Edge.

Verified application: implementation `0928e4a`, corrections `c5bf6bb`; approval `c6c7bdc` precedes both. Final tests `96291ff` strengthen exact-ID replacement and schema-3 coverage without changing application code. Evidence/documentation commits follow; inspect the final Git log for their hashes.

## Acceptance evidence

| Criterion | Result | Evidence |
|---|---|---|
| AC-01 | Passed | Raw global/CSE/other-department, administrator/coordinator/viewer/teacher and anonymous matrix; real viewer directory, direct management denial, zero-active directory and first activation. |
| AC-02 | Passed | Civil-date/name/year/policy boundaries; all 13 protected reference families; setup-only exemptions; revision refusal; actual draft date edit; real duplicate-create and edit/create barriers. |
| AC-03 | Passed | Blank policy rejected, zero allowed, explicit stored six-value save required; managed drafts remain empty through preparation while legacy conversion is retained, on both adapters. |
| AC-04 | Passed | URL-selected workspace/archive does not select the global active term; actual activation is separately confirmed. Snapshot hash survives the full browser workflow. |
| AC-05 | Passed | Supported schema 3/4, malformed/foreign/unsupported refusal, whitelist projection and private sentinels; actual HTML/CSV/print agree; four archived official pages match the public reference pixel-for-pixel. |
| AC-06 | Passed | Fresh/changed/missing review, reason/acknowledgement, zero-active activation, only intended lifecycle/context/audit changes and audit-insert failure rollback on both adapters. |
| AC-07 | Passed | [26-path coverage audit](../../../output/playwright/SET-01A/action-inventory.json); raw missing/stale/ABA and malformed-token refusals leave persisted fingerprints unchanged; actual old form and soft-refresh checks. |
| AC-08 | Passed using each adapter's actual model | PostgreSQL independent-connection barriers observe real blocking PIDs for both switch/save orders and competing activations; PGlite tests real independent async requests queued on its single SQL connection. Active/public reads recheck context. |
| AC-09 | Passed | Populated forward upgrade, repeated preparation, legacy/managed grids, exact old fields/snapshot hashes; cold PGlite and encrypted PostgreSQL separate-target recovery including schema, journal, sequences and context. Institutional storage was not opened. |
| AC-10 | Passed | 57 production workflow captures plus 9 delayed-transport pending captures at 1440/390/320px: no page overflow or detected WCAG A/AA/2.1 AA violations. Actual keyboard traversal/labels/focus pass; loading boundary inspected. Existing routine/room/teacher/attendance/extra-load regressions pass. |
| AC-11 | **Partial — default build failed** | Typecheck, lint, domain and all 27 named safety groups pass across preserved/resumed runs. Final default Turbopack exits 1 in CSS-worker startup/IPC; separately labelled Webpack review build exits 0. No owner exception or delivery acceptance inferred. |

## Implementation checks

The focused SET-01A safety groups exercise the actual database singleton, guards, actions and transactions through the pinned controlled runtime. Only identity-provider session and request-scoped framework dependencies are controlled. Older regression scenarios use an explicit test-only fresh-page adapter to supply the new context; missing/stale/ABA cases use raw actions without that adapter.

On both PGlite and PostgreSQL: populated pre-0014 preservation, draft default, repeated preparation, preserved context generation, managed-draft exclusion from legacy-grid backfill, policy readiness, revision/duplicate refusal, role/scope denial, audit-failure rollback and historical snapshot hashes pass. All 26 active-dependent action paths refuse missing/stale/ABA contexts without changing complete persisted fingerprints. PostgreSQL uses independent SQL connections with real trigger/advisory barriers and observed blocking PIDs for writer/switch ordering and competing activations. PGlite is a single-connection engine: actual independent async requests queue behind its open transactions; both orderings pass. Do not describe that as independent PGlite SQL sessions.

Native teacher sheets show “Not stored in publication” for historical workload allocations because snapshots never stored those totals; no current allocation is substituted. The trusted development-replacement path locks and advances the retained context before clearing academic rows. Owned tests actually reuse the same term ID and prove the old form remains stale. This does not authorize or perform an institutional reset.

| Check | Result / versioned evidence |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run test:domain` | Passed; includes civil-year/leap/precision/blank/File/duplicate-token/schema-3/4 boundaries. |
| `npm run test:safety` and focused/resumed groups | All 27 named groups passed; [complete group/command-log hash receipt](../../../output/playwright/SET-01A/implementation-checks.json). Initial fixture failures are retained locally and superseded by passing corrected groups, not reported as a single uninterrupted suite pass. |
| Default build | Failed: `npm run build`, exit 1, `globals.css` worker exits before Turbopack's IPC connection. Rechecked on final application code; no bundler/runtime policy change. |
| Separate production review build | Passed: `npm_lifecycle_event=build node node_modules/next/dist/bin/next build --webpack`, exit 0. The local npm wrapper dropped forwarded `--webpack`, so that attempt was another default build; the explicit Next CLI command supplied the actual alternate build. |
| Actual production browser | [57-capture workflow manifest](../../../output/playwright/SET-01A/runtime/browser-review.json): actual create/edit/policy, stale review, activation, old form with retained input, soft refresh, public visibility, completed metadata, viewer/anonymous and zero-active first activation. No workflow script errors. |
| Pending / keyboard | [Nine pending captures](../../../output/playwright/SET-01A/runtime/pending-review.json) delay only HTTP transport; real application requests finish and repeat submit is disabled. [Keyboard evidence](../../../output/playwright/SET-01A/runtime/keyboard-review.json), [focus capture](../../../output/playwright/SET-01A/runtime/keyboard-focus-390.png). |
| Native print/export | [Ten-page PDF/raster/parity receipt](../../../output/playwright/SET-01A/runtime/print-review.json): four archived landscape A4 pages, two teacher portrait A4 pages, four public reference pages; CSV course parity, private sentinels absent, official page PNG hashes identical. All six distinct page layouts visually inspected. |
| Diff / data / external work | Source/schema/tests reviewed, prior checks re-run when affected. All database runners pin owned disposable targets; default PGlite metadata remains unchanged. No institutional migration/status mapping/reset, extra worktree, push/PR/GitHub update or other external message. |

## Actual owner review path

Open [the synthetic review control](http://localhost:3115/) and choose **Sign in as synthetic administrator**. The application is [Academic terms](http://localhost:3114/terms). The old port-3112 tab is the static proposal, not this runnable implementation. Only invented fixture people, contacts and records are present. The preview uses the separately labelled Webpack build; it is not evidence of a passing default build.

Create a draft → edit identity/dates while unused → explicitly enter all six policy values → review the public-routine effect → supply reason/unchecked acknowledgement → activate. Keep an old Settings tab open to inspect stale-save refusal. View the previous term's immutable routine, CSV, official and teacher sheets. Use the viewer sign-in to inspect read-only access. Fixture **No active term / Restore synthetic Summer** controls are explicitly test controls, not portal lifecycle features.

Host-local guarded restart, if needed: `node node_modules/tsx/dist/cli.mjs .tmp/set01a-review.ts --serve`. This ignored helper creates its own disposable cluster using `F:/AI/tools/pgsql-17.11/pgsql/bin`; it never selects the configured institutional target. Do not substitute `npm run dev/start`, preparation or reset commands against institutional storage. If the helper is unavailable, rebuild an owned preview from the versioned safety fixtures/target guards rather than opening institutional data.

Reviewable artifacts: [official PDF](../../../output/playwright/SET-01A/runtime/archive-official.pdf), [teacher PDF](../../../output/playwright/SET-01A/runtime/archive-teachers.pdf), [public reference PDF](../../../output/playwright/SET-01A/runtime/public-official-reference.pdf), [frozen CSV](../../../output/playwright/SET-01A/runtime/archive.csv). Runtime capture filenames are listed in the two browser manifests above; planning captures below are historical proposal evidence only.

## Planning checks

Source inspection covered term schema/index/default, active/ownership helpers, 25 action exports and active-dependent teacher deactivation, audit/permission boundaries, composed active/public reads, initial-policy fallback, startup grid backfill and snapshot/archive projections. Installed Next page/server-action/cookie guides were inspected. No institutional database or preparation command was used.

Static sketches: [navigation between proposed states](mockups/terms.html). All terms/counts/policy values are synthetic examples, not approved institutional policy. Static links/buttons illustrate workflows without executing application actions.

| Planning check | Result / evidence |
|---|---|
| Ten views × 1440/390/320px | Passed: 30 full-page captures, one visible selected view, no page overflow or browser script errors; [capture/axe manifest](../../../output/playwright/SET-01A/sketch-review.json). |
| Static accessibility | Zero WCAG A/AA/2.1 AA axe violations in the 30 checked views; labelled fields, visible focus styling and navigation inspected. This is not a complete accessibility certification. |
| Example navigation / inputs | Create navigation, blank initial-policy fields, required reason plus unchecked acknowledgement before example activation, selected archive-version identity and success active label checked. |
| Visual review | Directory desktop, create desktop, activation mobile, setup 320px, stale mobile and historical excerpt 320px inspected. No clipped controls or overlapping labels observed. The archive table is an illustrative excerpt, not a redesigned official template. |
| References / content | At proposal review, local links/anchors, six decisions, eleven criteria and sole checklist were checked. [Current reference report](../../../output/playwright/SET-01A/document-review.json) rechecks the final records and committed approval. External links not fetched. |
| Diff / preservation | Planning changed only docs/sketches/captures; subsequent approved implementation is recorded above. BUG-28's partial failed-default-build result, acceptance and merge remain intact. |

Planning helper: installed Playwright library with headless Microsoft Edge and `axe-core` (no dependency install). Capture helpers and the optional loopback-only static server live under ignored `.tmp/`. [Port 3112](http://127.0.0.1:3112/) serves only the proposal HTML. The Playwright CLI is absent; the installed-library fallback was used. Application suites and native prints were deliberately deferred during planning and have now been exercised above; existing BUG-28 results were not substituted for SET-01A checks.

## Capture index

| Proposed view | Desktop 1440 | Mobile 390 | Narrow 320 |
|---|---|---|---|
| Directory | [Capture](../../../output/playwright/SET-01A/directory-1440.png) | [Capture](../../../output/playwright/SET-01A/directory-390.png) | [Capture](../../../output/playwright/SET-01A/directory-320.png) |
| Active workspace | [Capture](../../../output/playwright/SET-01A/active-1440.png) | [Capture](../../../output/playwright/SET-01A/active-390.png) | [Capture](../../../output/playwright/SET-01A/active-320.png) |
| Completed workspace | [Capture](../../../output/playwright/SET-01A/term-1440.png) | [Capture](../../../output/playwright/SET-01A/term-390.png) | [Capture](../../../output/playwright/SET-01A/term-320.png) |
| Create draft | [Capture](../../../output/playwright/SET-01A/create-1440.png) | [Capture](../../../output/playwright/SET-01A/create-390.png) | [Capture](../../../output/playwright/SET-01A/create-320.png) |
| Starting policy | [Capture](../../../output/playwright/SET-01A/setup-1440.png) | [Capture](../../../output/playwright/SET-01A/setup-390.png) | [Capture](../../../output/playwright/SET-01A/setup-320.png) |
| Activation review | [Capture](../../../output/playwright/SET-01A/activate-1440.png) | [Capture](../../../output/playwright/SET-01A/activate-390.png) | [Capture](../../../output/playwright/SET-01A/activate-320.png) |
| Stale refusal | [Capture](../../../output/playwright/SET-01A/stale-1440.png) | [Capture](../../../output/playwright/SET-01A/stale-390.png) | [Capture](../../../output/playwright/SET-01A/stale-320.png) |
| Frozen publication | [Capture](../../../output/playwright/SET-01A/history-1440.png) | [Capture](../../../output/playwright/SET-01A/history-390.png) | [Capture](../../../output/playwright/SET-01A/history-320.png) |
| Empty/denied/pending variants | [Capture](../../../output/playwright/SET-01A/empty-1440.png) | [Capture](../../../output/playwright/SET-01A/empty-390.png) | [Capture](../../../output/playwright/SET-01A/empty-320.png) |
| Success | [Capture](../../../output/playwright/SET-01A/success-1440.png) | [Capture](../../../output/playwright/SET-01A/success-390.png) | [Capture](../../../output/playwright/SET-01A/success-320.png) |

## Review findings

| Finding | Disposition | Reverification |
|---|---|---|
| Old forms could write A's submitted policy or data into newly active B. | Strict rendered ID/generation, transaction context locking and composed-read recheck cover every caller. | All 26 raw paths and real browser old-form/soft-refresh checks pass; AC-07/08. |
| Missing policy falls back silently; globally empty grids trigger legacy setup for all terms. | Require explicitly stored starting policy and managed-term backfill exclusion. | Both-adapter readiness, preservation and preparation checks pass; AC-03/09. |
| Historical lookup through active loader could relabel or expose old content/private contacts. | Explicit term/version scope, supported frozen snapshot only, public-equivalent redaction and reused projection. | Domain, persisted privacy/hash, real HTML/CSV/native print and official pixel parity pass; AC-04/05. |
| Initial sketch preselected the activation acknowledgement. | Removed preselection and prefilled reason; example action now requires both explicit inputs. | Revised activation captures and interaction check pass. |
| Archived teacher sheets initially overflowed the mobile page. | Reused the existing focusable `teacher-routine-sheets` scroll container; native A4 format unchanged. | Final production captures pass at all three widths; native portrait A4 pages inspected. |
| A soft refresh could preserve old input state while supplying a new context/revision/review. | Keyed operational form subtree by term/generation; draft forms by ID/revision; activation form by fingerprint. New reviews require a fresh acknowledgement. | Actual old-form refusal, same-route refresh and changed-review checks pass on final build. |
| Old regression fixtures relied on an active insertion default and current-schema inserts into pre-0014 storage. | Summer fixture now names `active` explicitly; fixture switches bump generation; legacy time-zone insertion uses its actual old columns. | Both room-lifecycle and time-zone groups pass after correction; final 27-group receipt retains run boundaries. |
| pg 8.20 warned about overlapping reads on a transaction client. | Request-local batches sequence lazy reads on one transaction while retaining parallel pool reads; explicit transaction readers also sequence. | Final typecheck, both-adapter action/maintenance, history and production browser checks pass. |
| Owned development replacement could recycle term IDs without invalidating forms. | Reset path locks the retained singleton first and advances generation atomically; no institutional reset operation is performed. | Final raw tests on both adapters assert the exact same term ID is reused and the old generation refuses. |
| Native JSONB snapshot check hashed input key order rather than persisted storage. | Browser helper now captures its baseline from the stored JSONB row immediately after fixture setup. | Final browser persisted snapshot hash comparison passes. |
| Long vertical break labels crowd cells in the inherited official print template. | Carried [BUG-28 follow-up](../../plans/LOCAL_DELIVERY_2026-10-26.md#observed-follow-up-proposal-only); no template redesign in this slice. | All four archived/public official pages have identical rendered hashes. This preserves the baseline; it does not resolve the existing label fit. |

## Delivery and acceptance

- Local branch: `codex/set-01a`; application `0928e4a`/`c5bf6bb`, final test/evidence commits in Git log. Local `main` remains `6011e0f`. BUG-28 acceptance/merge is recorded in its own [plan](../BUG-28/plan.md).
- D-1–D-6 approved unchanged on 1 November: owner replied “Approve.” after proposal `de43546`. Approval is recorded/committed before implementation, per [workflow](../../WORKFLOW.md#issue-lifecycle).
- Owner implementation approval: **Approved**. Delivery acceptance and local SET-01A merge: **Pending**.
- Delivery is reviewable at the synthetic control above. AC-11 remains partial; obtain an explicit owner decision on the failed default build before local merge. Prior slice exceptions do not authorize this delivery. No automatic next part.
- Parent #14 remains open. No GitHub access/update/push/PR or institutional operation. Last remote reconciliation remains 26 October, `0b1e055`.
