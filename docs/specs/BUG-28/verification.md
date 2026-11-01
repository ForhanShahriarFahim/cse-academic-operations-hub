# BUG-28 — Inspection and verification

[Specification](spec.md), [sole plan](plan.md), [state sketches](review-states.md). Updated: 1 November 2026, Asia/Dhaka.
Status: **Planning verification only; implementation and feature acceptance pending.**

## Inspected evidence

- Baseline: local main `f09df27`, after C acceptance `e99f586` / merge `0dc096c`. Work branch `codex/bug-28`; one checkout/writer. The authorized C merge required no conflict resolution and preserves reviewed code as ancestors of local main.
- `academic_terms` original DDL and current schema retain non-null status/default `active` without any unique active index. Scanned all production `academicTerms.status` predicates: five first-row selectors in four modules, listed in the specification. Scanned production term inserts/updates: only source seed inserts a term; no activation/editor API found. Synthetic switching and draft insertions are not product authority.
- Read real migration/preparation/target command code, shell fallback, dependent actions, teacher reference transaction, public viewer/official/CSV and internal CSV. Existing zero-active behaviors differ by consumer; the proposal makes ambiguity explicit while preserving optional public absence and term-independent scope semantics.
- Installed Next.js guides read: `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` and `07-mutating-data.md`. Expected failures should be explicit results/conditional UI; Server Functions must retain authorization even when directly invoked. No product code was written in this checkpoint.
- [Reproduction receipt](inspection.json): explicit in-memory PGlite, original table DDL only; two synthetic inserts omit status and both become active. Original primary key is the sole index; matching LIMIT 1 returns one row and conceals ambiguity. The observed ID is not evidence of guaranteed ordering. No environment loader, application database import, institutional target or production loader was used.

## Planning checks

Local links/anchors, source paths, required document sections, sole-checklist ownership, D-1–D-4 and AC-01–AC-08 references, pending approval and Git diff are checked for the planning checkpoint; exact counts/results are recorded in [document review](document-review.json). The Markdown state sketches provide desktop/390/320 and print behavior for approval; no browser capture, axe scan or print rendering is claimed for them. No institutional census, backup, migration, preparation, reset, application server or GitHub read/write occurred.

## Implementation checks — pending

| Criteria | Current result | Required evidence |
| --- | --- | --- |
| AC-01 | Defect reproduced; fix pending | Actual constraint/index/default/status cases on both adapters |
| AC-02 | Pending | Real pre-upgrade populated migration, duplicate refusal, journal/data preservation, reapply and separate-target restored backups on both adapters |
| AC-03/04 | Source inspection only | Shared resolver and all production read/action boundaries on zero/one/pre-0013 duplicate fixtures, permission precedence, transaction use and unchanged fingerprints |
| AC-05 | Pending | Deterministic independent PostgreSQL connections for both commit orders, rollback and migration/write barriers |
| AC-06 | Design only | Diagnostic preview/read-only/resource/secret contract and remediation runbook; no real mapping selected |
| AC-07 | Markdown sketches only | Production browser/keyboard/axe desktop/390/320, unavailable public/print and route status/privacy checks, normal frozen-output parity |
| AC-08 | Pending | Final typecheck/lint/domain/default build/full applicable safety with PostgreSQL, runnable owner review and actual acceptance |

ROM-01C's historical 23-group/browser/A4 results are evidence for C, not BUG-28. Its accepted default-build exception does not turn BUG-28's future default build into a passed or waived check. No production-readiness or institutional roll-out claim is made.

## Delivery and handoff

Planning authorization is the owner's 1 November “accepted and go for the next task.” Implementation approval remains pending for the concrete D-1–D-4 package. Resume through the [sole plan's exact handoff](plan.md#current-checkpoint--handoff); do not infer implementation authorization from checked planning tasks or a proposed roadmap entry. GitHub issue #28 status remains the dated remote snapshot until an agreed synchronization boundary.
