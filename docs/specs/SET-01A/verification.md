# SET-01A — Verification and review

Parent [#14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14) · [specification](spec.md) · [sole plan](plan.md)

Date/environment: 1 November 2026, Asia/Dhaka; Windows, local documentation branch `codex/set-01a`, base `6011e0f`.

Verified revision: proposal working tree; no application implementation. See the local proposal commit for the finalized docs/captures.

## Acceptance evidence

| Criterion | Result | Evidence |
|---|---|---|
| AC-01–AC-11 | **Pending implementation** | Specification and sketches describe proposed behavior only. No runtime/schema/action claim is made. |

## Planning checks

Source inspection covered term schema/index/default, active/ownership helpers, 25 action exports and active-dependent teacher deactivation, audit/permission boundaries, composed active/public reads, initial-policy fallback, startup grid backfill and snapshot/archive projections. Installed Next page/server-action/cookie guides were inspected. No institutional database or preparation command was used.

Static sketches: [navigation between proposed states](mockups/terms.html). All terms/counts/policy values are synthetic examples, not approved institutional policy. Static links/buttons illustrate workflows without executing application actions.

| Planning check | Result / evidence |
|---|---|
| Ten views × 1440/390/320px | Passed: 30 full-page captures, one visible selected view, no page overflow or browser script errors; [capture/axe manifest](../../../output/playwright/SET-01A/sketch-review.json). |
| Static accessibility | Zero WCAG A/AA/2.1 AA axe violations in the 30 checked views; labelled fields, visible focus styling and navigation inspected. This is not a complete accessibility certification. |
| Example navigation / inputs | Create navigation, blank initial-policy fields, required reason plus unchecked acknowledgement before example activation, selected archive-version identity and success active label checked. |
| Visual review | Directory desktop, create desktop, activation mobile, setup 320px, stale mobile and historical excerpt 320px inspected. No clipped controls or overlapping labels observed. The archive table is an illustrative excerpt, not a redesigned official template. |
| References / content | [Local reference/content report](../../../output/playwright/SET-01A/document-review.json): links and anchors resolve, six decisions and eleven criteria present, sole checklist belongs to plan, actual approval remains pending. External links not fetched. |
| Diff / preservation | Documentation/sketch/capture paths only; whitespace and diff reviewed. Updated pointers retain BUG-28's partial failed-default-build result, acceptance and local merge. No application/schema/dependency change. |

Planning helper: installed Playwright library with headless Microsoft Edge and `axe-core` (no dependency install). Capture helpers and the optional loopback-only static server live under ignored `.tmp/`. Optional static review URL while its process runs: [SET-01A proposal](http://127.0.0.1:3112/); reopen the HTML directly if stopped. It serves only this HTML and has no database/application handlers. The Playwright CLI is absent; the installed-library fallback was used. Native production print/export and all implementation suites remain pending T-07/T-08; deliberately not run for this documentation-only proposal. Existing BUG-28 results do not satisfy SET-01A criteria.

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
| Old forms could write A's submitted policy or data into newly active B. | Proposed strict rendered ID/generation, transaction context locking and composed-read recheck, covering every caller. | Runtime proof pending AC-07/08. |
| Missing policy falls back silently; globally empty grids trigger legacy setup for all terms. | Require explicitly stored starting policy and managed-term backfill exclusion. | Runtime proof pending AC-03/09. |
| Historical lookup through active loader could relabel or expose old content/private contacts. | Explicit term/version scope, supported frozen snapshot only, public-equivalent redaction and reused projection. | Runtime proof pending AC-04/05. |
| Initial sketch preselected the activation acknowledgement. | Removed preselection and prefilled reason; example action now requires both explicit inputs. | Revised activation captures and interaction check pass. |

## Delivery and acceptance

- Local branch: `codex/set-01a`; proposal only. BUG-28 acceptance/merge is recorded in its own [plan](../BUG-28/plan.md).
- D-1–D-6 approved unchanged on 1 November: owner replied “Approve.” after proposal `de43546`. Approval is recorded/committed before implementation, per [workflow](../../WORKFLOW.md#issue-lifecycle).
- Owner implementation approval: **Approved**. Delivery acceptance and local SET-01A merge: **Pending**.
- Parent #14 remains open. No GitHub access/update/push/PR or institutional operation. Last remote reconciliation remains 26 October, `0b1e055`.
