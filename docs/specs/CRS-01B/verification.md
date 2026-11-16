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
| `npm run build` (default) | **Pass** (resumed session, 16 November), before and after the form correction below; all five offerings routes compiled. The CSS-worker failure of recent deliveries did not occur. |
| Separate Webpack build | Not run: it was only ever a substitute for a failing default build, which passes here. |
| `scripts/review-offerings.ts --check` (compiled preview, disposable PostgreSQL) | First run **failed** and found a real defect (below). After the correction: **pass, 48 captures**. |

The full safety suite and `test:ux`/`test:ui` were not run; the groups above cover the touched seams. After the form correction, typecheck, lint and domain were re-run and pass; safety groups were not repeated because no server code changed.

### Defect found by the first browser run, and its correction

On “Start from previous term”, submitting without a reason showed the validation message but cleared every tick the editor had added, while the summary and button still said “4 offerings”. React resets a form after an `action` submission; the controlled checkboxes were unticked in the page while their state stayed ticked. The three offering forms now submit through `onSubmit` and dispatch the action themselves, so no reset happens ([offering-forms.tsx](../../../src/components/offerings/offering-forms.tsx)). No server, rule or store change. The browser script needed no selector corrections.

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
| AC-09 | Pass, with stated limits | Compiled preview, Edge: 16 states × 1440/390/320 = [48 captures](../../../output/playwright/CRS-01B/runtime/) with no page-wide overflow and no axe WCAG 2 A/AA or 2.1 AA violation; validation, stale, success, cancelled, linked, filtered, history and view-only states; no page errors ([receipt](../../../output/playwright/CRS-01B/runtime/review.json)). Examples: [list after start 1440](../../../output/playwright/CRS-01B/runtime/list-started-1440.png), [start validation 390](../../../output/playwright/CRS-01B/runtime/start-validation-390.png). **Limits:** keyboard is one scripted tab-order assertion on the add form, not a full walk; the loading skeleton is not captured. |
| AC-10 | Pass | Typecheck, lint, domain, the listed safety groups and the default build pass. |

The browser run also closes the earlier “browser pending” parts: AC-01 (view-only account has no controls; direct editor URLs go to the forbidden page), AC-05 (list printed to [A4 PDF](../../../output/playwright/CRS-01B/runtime/offerings.pdf)) and AC-08 (archived CSV byte-identical; 13 preserved tables and the source term's offerings hash-identical after the whole flow). The archived official and teacher A4 PDFs were printed before and after and are the same size (148,746 and 130,206 bytes); their bytes were not compared, since PDFs embed creation times.

## Blocked checks

**Resolved in the resumed session:** the old preview had already exited (nothing listening on 3126/3127, no PostgreSQL process), so nothing had to be stopped. The text below is the earlier record.

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
- **Accepted on 16 November:** the owner selected “Accept and merge” after delivery `4b5aa75` and a summary that disclosed the corrected start-form defect and the limits (one scripted keyboard assertion, loading skeleton not captured, A4 PDF bytes not compared, Webpack build and safety groups not re-run). The owner did not ask for the preview first. This acceptance is committed before the local merge. Earlier record:
- Delivery acceptance was requested (16 November, resumed session): all ten criteria have evidence, with the AC-09 limits above. Review with `node node_modules/tsx/dist/cli.mjs scripts/review-offerings.ts --serve`, then open http://localhost:3127. No merge, remote synchronization or institutional operation. Parent CRS-01 / #7 remains open.
