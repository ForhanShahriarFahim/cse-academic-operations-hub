# CRS-01B — Verification record

Specification: [spec.md](spec.md). Sole checklist/approval/handoff: [plan.md](plan.md).
Updated: 16 November 2026, Asia/Dhaka. **Implemented; rules, store, actions and server rendering verified on both adapters. The production build and the compiled browser review have NOT been run and are pending (see “Blocked checks”).**

## Inspection — 16 November 2026

Read-only inspection on `codex/crs-01b`, base `f0c4d8c`. No database was opened, no application, dev server, migration or `db:*` command was run, and no institutional storage was touched.

| Area | What was inspected |
| --- | --- |
| Requirements | [Requirements §11](../../PRODUCT_REQUIREMENTS.md#11-course-catalog-offerings-and-completeness), role table and capability vocabulary; [local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md) row 10; issue #7 body and its single owner comment (GitHub read only). |
| Data model | `courses`, `course_offerings`, `teaching_groups`, `teaching_group_offerings`, `batch_term_placements`, `academic_terms`, `term_rollovers` in [schema.ts](../../../src/db/schema.ts); protected-table list in [term-protection.ts](../../../src/lib/term-protection.ts). |
| Writers and readers | Seed offering construction; every `src` reference to offerings (21 files); rollover evidence and refusal rules; catalog evidence, lifecycle and lock order; term-context lock helpers; courses and term pages; capability table. |
| Prior records | Accepted [CRS-01A specification](../CRS-01A/spec.md) (lock/active-course obligations on future offering writers) and its mockup conventions. |

The point left open at planning is settled: cohort lifecycle ([batch-actions.ts](../../../src/lib/batch-actions.ts)), rollover commit ([rollover-actions.ts](../../../src/lib/rollover-actions.ts)) and catalog writes ([course-store.ts](../../../src/lib/course-store.ts)) all take the term-context lock **exclusively**. Offering writes take it shared, then lock their term row, so no neighbouring writer needed to change.

## Planning-document checks

| Check | Result |
| --- | --- |
| Structure | Seven decisions (D-1–D-7), ten acceptance criteria, seven tasks in one checklist. Proposal `935b309`; actual approval recorded at `e87cbce` before any application or test code. |
| Static mockups | Six pages at 1440, 390 and 320 pixels: 18 full-page Edge captures, no page-wide overflow, one `main` and one `h1` per page. [Measurement receipt](../../../output/playwright/CRS-01B/static-review.json); examples: [offerings 1440](../../../output/playwright/CRS-01B/offerings-1440.png), [start 390](../../../output/playwright/CRS-01B/start-390.png), [change 320](../../../output/playwright/CRS-01B/change-320.png). Terms, cohorts and courses in the sketches are illustrative. |

## Implementation verification — 16 November 2026

All database checks ran on harness-owned synthetic targets under `.tmp/safe-01` (PGlite) and a disposable PostgreSQL 17.11 cluster. The configured institutional directory was never opened; the runner reported its metadata unchanged on every run.

| Command | Result |
| --- | --- |
| `npm run typecheck` (run as `npx tsc --noEmit`) | Pass. |
| `npm run lint` | Pass, no warnings. |
| `npm run test:domain` | Pass, including the new `verify-offering-records.ts` and the extended injected-import guard (`offering-records`, `offering-store`). |
| `verify-safety.ts "CRS-01B offerings (PGlite)"` | Pass (seven result lines). |
| `verify-safety.ts "CRS-01B offerings (PostgreSQL)"` | Pass (same scenarios plus real lock races). |
| `verify-safety.ts "CRS-01A catalog"` (both adapters) | Pass on PGlite and PostgreSQL. |
| `verify-safety.ts T-03` (two-term history) | Pass. |
| `verify-safety.ts "BAT-01B rollover (PGlite)"`, `"BAT-01A records (PGlite)"` | Pass. |
| `npm run build` (default Turbopack) | **Not run — blocked.** |
| Webpack production build, compiled browser review, CSV/A4 parity | **Not run — blocked.** |

The full safety suite and `test:ux`/`test:ui` were not run; the groups above cover the touched seams.

## Acceptance evidence

| ID | Status | Evidence |
| --- | --- | --- |
| AC-01 | Pass (server); browser pending | Real action/loader entry points on both adapters: global and CSE-scoped administrators change offerings and read history; other-department-only administrator, coordinator, teacher, viewer, revoked and anonymous are refused with no write and cannot load history. A view-only role renders the list with no edit or history controls. Direct-URL redirects for editor pages are coded (`requireOfferingEditor`) but only exercised by the pending browser script. |
| AC-02 | Pass (server); browser pending | Draft term edited while another term is active; active term edited; completed and legacy-status terms readable and refused for writes; unknown term is not found. The term generation and active selection are identical before and after every operation. |
| AC-03 | Pass | Pure cases in `verify-offering-records.ts` and persisted results on both adapters: slot by stream + semester, repeat cohort, some-cohort courses unticked, empty and missing slots, cancelled and unknown-status source rows excluded, inactive and missing courses unselectable, default source rule. |
| AC-04 | Pass | Start creates exactly the ticked missing rows with one summary event; stale review, changed source, forged ticks and missing reason write nothing (whole-database fingerprint); rerun creates nothing; source-term offerings identical. |
| AC-05 | Pass (server); print pending | Counts and labels asserted after start, add, cancel, restore and remove; the rendered list shows the same cohorts, badges and dropped list; filters narrow rows. Print output is covered only by the pending browser script. |
| AC-06 | Pass | Lifecycle matrix on both adapters, including forged, repeated, file, cross-term and unrecognized inputs. |
| AC-07 | Pass | Independent PostgreSQL connections observed waiting on real locks: two editors on one reviewed start, identical adds, different cohorts of one term, offering versus catalog deactivation in both orders, offering versus exclusive context-lock holders in both orders. No-op commands add no event; audit failure rolls back start, add and cancel. |
| AC-08 | Pass (data); output pending | Across the whole scenario only `course_offerings` and `audit_events` differ from the baseline fingerprint; every other table, including schedule versions, is identical. Byte comparison of the archived CSV and A4 output is in the pending browser script. |
| AC-09 | **Pending** | Not verified. Loading, validation, stale and success states, keyboard order, axe and 1440/390/320 captures of the real pages need the compiled preview. Only the static mockups have captures. |
| AC-10 | **Partial** | Typecheck, lint, domain and the listed safety groups pass. The default build was not run. |

## Blocked checks

Building writes `.next`, which the still-running PERF-01 synthetic preview (`next start` on port 3126, launcher PID 5852 with its disposable PostgreSQL cluster) is serving. Stopping that process was not permitted in the implementing session, and overwriting its build directory underneath it would break it. Therefore, on final code:

- `npm run build` (default Turbopack) — not run. Recent deliveries failed here at CSS-worker startup; nothing is assumed either way for this one.
- Separate Webpack build (`npm_lifecycle_event=build`, `node node_modules/next/dist/bin/next build --webpack`) — not run.
- `node node_modules/tsx/dist/cli.mjs scripts/review-offerings.ts --check --serve` — not run. The launcher and [browser script](../../../scripts/review-offerings-browser.cjs) are written and typechecked/linted but **have never executed**; expect first-run corrections to selectors.

To unblock: stop the old preview (close its terminal, or end PID 12836 so the launcher tears its cluster down), then run the three commands above.

## Deviations and limits

- Class-group state on a row is plain text (“In 1 class group”), not a link to a routine filter: the routine page's filter parameters select stream/day/batch views, not a single group, and guessing a link was worse than none.
- An account whose only role is scoped to another department cannot open the page at all. That is the existing internal-portal rule, not new behavior.
- Removal keeps its audit event, which names the course and cohort; the row itself is gone, as specified.
- No schema, migration, seed, dependency or bundler change. `course-data.ts` gained one read of draft-term names for the new links on `/courses`.

## Delivery and acceptance

- Owner authorized inspection/specification on 16 November by selecting “Accept, merge, plan CRS-01B”. That answer separately accepted PERF-01 (`836f4fc`, merged `2156fac`).
- Owner approved implementation on 16 November with “Approve and implement”, recorded at `e87cbce`.
- Delivery acceptance is **not requested yet**: AC-09 and the build are unverified. No merge, remote synchronization or institutional operation. Parent CRS-01 / #7 remains open.
