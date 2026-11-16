# PERF-01 — Inspection, verification and review

Specification: [spec.md](spec.md). Sole checklist/approval/handoff: [plan.md](plan.md).
Environment/date: Windows/PowerShell, 16 November 2026 (Asia/Dhaka).
Inspected base: local `main` `d6e3cdb`; planning branch `codex/perf-01`.

## Inspection evidence

- Read selected F-11/prerequisite proposal in the 11 November review, term/history/privacy requirements, ADR-001 and current delivery sequence. No GitHub reads/updates; latest reconciliation stays 11 November.
- Inspected `data.ts` loader/assembly/output, `actions.ts` manual create/candidate and existing other reads, `batch-store.ts` evidence, `batch-records.ts` snapshot classification, `rollover-store.ts`/actions/data, `term-context.ts`, database ambient transaction/batch helper, relevant schema/serializer and safety history/action/scenario entry points. Static queries confirm the specified full-table reads; no institutional row/latency claims.
- F-11 correction: current cohort evidence hashes payloads only when the snapshot parser reports a reference, although it reads/classifies all versions per checked cohort. The package avoids claiming unconditional hashing or eliminating necessary all-term checks.
- Installed Next `16.3.4` guidance consulted: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` (ORM access, request memoization and parallel reads) and `02-guides/server-actions.md` (server authorization and revalidation). Proposed approach uses explicit operation inputs and keeps existing transaction serialization; no framework cache behavior is assumed for SQL/actions.
- No new policy answers or source corrections are inferred. No application/database process was launched for PERF-01 planning. CRS-01A's synthetic review was separately restarted and its HTTP control page verified before its accepted local merge; its evidence is not PERF-01 verification.

## Planning checks

| Check | Result |
| --- | --- |
| Local references | Passed: 161 relative file references and two heading anchors across the three issue documents and two updated entry pointers; no missing targets. |
| Structure/scope | Passed: six tasks in the sole checklist, eight AC rows, explicit planning authorization versus pending implementation approval, proposed D-1–D-4, adapter/preservation/inspection strategy and exact handoff. |
| Preservation | Passed: diff from base has no application, script, migration, source transcription, schema, seed or dependency changes; new issue documents and two entry pointers only. |
| Whitespace/review | `git diff --check` passes; reviewed proposal and updated pointers for all-term safety, fresh operation ownership, truthful measurement claims and no inherited approval. Final staged check is recorded at commit. |
| UI sketches/rendering | Not applicable: no new visual workflow/layout. Existing compiled UI/export/A4 parity is required during implementation, not claimed by planning. |

No PERF-01 database, benchmark, code suite, build or browser run was performed for the documentation-only package.

## Acceptance evidence

| Criterion | Result | Reason |
| --- | --- | --- |
| AC-01–04 | Pending | No PERF-01 implementation or synthetic baseline/optimized measurements yet. Source inspection is not a performance pass. |
| AC-05–07 | Pending | Projection/evidence/history, adapter/race and production browser/export/A4 checks belong to implementation. |
| AC-08 | Pending | No code suites/build run for this documentation-only package. CRS-01A checks/accepted limitation do not establish PERF-01 results. |

## Review findings and limits

The tempting active-term filter is unsafe for cohort enrollment/snapshot lifecycle evidence. The spec therefore pushes down the exact all-term union and retains all historical snapshots. Likewise, routine links must be scoped by group ownership, not by adding an unapproved cross-term-offering repair. Global maintenance/dictionaries remain unchanged. No performance percentage or latency promise is supported yet.

New shared evidence exists only inside one locked invocation and is rebuilt at confirmation. Parser/rule/fingerprint changes, persistent caching, indexes or visual changes require a material scope decision. Adapter unavailable checks must be recorded as pending, never inferred from PGlite results.

## Delivery and acceptance

- Owner authorized inspection/specification on 16 November: “Accept, merge locally, and plan PERF-01”. That message separately accepted CRS-01A, recorded `6dfad40` and merged `246d9fa`; base/receipt `d6e3cdb`.
- PERF-01 implementation approval and delivery acceptance are both pending; no PERF-01 merge or remote synchronization. No external issue was created. Partial parent CRS-01 / #7 remains open.
- Institutional database, migrations `0017`/`0018`, backup/reset, build-policy changes and next-feature implementation are outside scope.
