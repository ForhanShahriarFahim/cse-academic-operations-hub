# CRS-01B — Verification record

Specification: [spec.md](spec.md). Sole checklist/approval/handoff: [plan.md](plan.md).
Updated: 16 November 2026, Asia/Dhaka. **Planning package only; no application code exists for this slice.**

## Inspection — 16 November 2026

Read-only inspection on `codex/crs-01b`, base `f0c4d8c`. No database was opened, no application, dev server, migration or `db:*` command was run, and no institutional storage was touched.

| Area | What was inspected |
| --- | --- |
| Requirements | [Requirements §11](../../PRODUCT_REQUIREMENTS.md#11-course-catalog-offerings-and-completeness), role table and capability vocabulary; [local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md) row 10; issue #7 body and its single owner comment (GitHub read only). |
| Data model | `courses`, `course_offerings`, `teaching_groups`, `teaching_group_offerings`, `batch_term_placements`, `academic_terms`, `term_rollovers` in [schema.ts](../../../src/db/schema.ts); protected-table list in [term-protection.ts](../../../src/lib/term-protection.ts). |
| Writers and readers | Seed offering construction; every `src` reference to offerings (21 files); rollover evidence and refusal rules; catalog evidence, lifecycle and lock order; term-context lock helpers; courses and term pages; capability table. |
| Prior records | Accepted [CRS-01A specification](../CRS-01A/spec.md) (lock/active-course obligations on future offering writers) and its mockup conventions. |

Findings are stated in the specification's baseline table. One point is deliberately left for implementation task T-03: the lock modes used by cohort lifecycle and rollover writers.

## Planning-document checks

| Check | Result |
| --- | --- |
| Structure | Seven decisions (D-1–D-7), ten acceptance criteria, seven tasks in one checklist; T-01 complete, T-02–T-07 open. Proposal distinguished from approval throughout. |
| Links | 190 local references across the three issue records, the PERF-01 plan and the two entry pointers resolve; the one path containing `(portal)` was confirmed by hand because the checker does not parse parentheses. |
| Static mockups | Six pages at 1440, 390 and 320 pixels: 18 full-page Edge captures, no page-wide overflow, one `main` and one `h1` per page. [Measurement receipt](../../../output/playwright/CRS-01B/static-review.json); examples: [offerings 1440](../../../output/playwright/CRS-01B/offerings-1440.png), [start 390](../../../output/playwright/CRS-01B/start-390.png), [change 320](../../../output/playwright/CRS-01B/change-320.png). Terms, cohorts and courses in the sketches are illustrative. |
| Diff | Documentation, mockups and captures only. No source, schema, migration, seed, dependency or configuration change. `git diff --check` passes. |

Required application commands (`typecheck`, `lint`, `test:domain`, `build`) are intentionally not run for a documentation-only package.

## Acceptance evidence

Not started. Every criterion AC-01–AC-10 is **pending implementation approval**; nothing is claimed as passing.

## Delivery and acceptance

- Owner authorized this inspection/specification on 16 November by selecting “Accept, merge, plan CRS-01B”. That answer separately accepted PERF-01 (`836f4fc`, merged `2156fac`).
- Implementation approval pending. No merge, remote synchronization or institutional operation. Parent CRS-01 / #7 remains open.
