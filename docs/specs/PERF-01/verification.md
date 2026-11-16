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

### Unmodified-base measurement checkpoint

Approval `a8cb252` precedes the harness. Before application changes, `scripts/verify-performance.ts --baseline` captured complete synthetic outputs and real adapter returned-row/digest counts for PGlite and PostgreSQL. Receipts: [PGlite](../../../output/perf-01/baseline-pglite.json), [PostgreSQL](../../../output/perf-01/baseline-postgresql.json). Application source is identical to `d6e3cdb`; baseline mode refuses a changed `src` diff. Creation/update timestamps in synthetic evidence records are fixed before rollover measurements, rather than removing fingerprints from comparisons.

At 2→20 total terms, returned rows grow: links 5→23, requirements 3→21, meetings 3→21, meeting teachers 4→22, meeting rooms 3→21, windows 6→24. Create validation performs two full portal loads and four offering reads (two portal, two audience). HSC cohort evidence transfers 24 enrollments and retains five. Two graduation choices read the same two-version set twice and hash their shared referenced payload twice. These are transferred-row/call measurements, not latency or query-plan speed claims.

Harness corrections before capture: the initial synthetic Thursday slot hit an existing scheduling blocker; the passing Saturday 11:00–12:15 case is used. Counters exclude destination-emptiness aggregate probes and distinguish full portal dictionary reads from CSE permission lookups. The first default-sandbox PostgreSQL attempt failed with loopback EACCES; the complete passing adapter capture used reviewed escalation against owned `safe01_*` targets. A harness overload type error was fixed before the passing typecheck. No application change was made to clear these fixture/instrumentation issues.

### Implementation verification in progress

Approval `a8cb252` precedes application changes. Baseline checkpoint `8d28335` initially left source-grid `updatedAt` instants variable in portal output; full parity correctly failed. Fixture timestamps are now fixed before the first measurement as well as rollover. Saved optimized source was temporarily replaced by the original four files from `d6e3cdb`, baseline mode verified unchanged `src`, both adapter receipts were recaptured, and saved bytes restored in `finally`; no worktree or second writer. No timestamps/fingerprints are removed from comparison. Candidate-query counters were corrected to distinguish the unchanged authoritative room-evidence query from the new audience read; those harness failures are not passes.

Both optimized adapter groups pass full original-output equality and actual stale-confirmation tests. [PGlite verified receipt](../../../output/perf-01/verified-pglite.json), [PostgreSQL verified receipt](../../../output/perf-01/verified-postgresql.json): links 4→4, requirements 2→2, meetings 2→2, meeting teachers 3→3, meeting rooms 2→2, windows 5→5 as 2→20 terms grow. Manual create uses one full portal read and one audience query returning both merged audiences. HSC enrollment evidence transfers exactly five rows instead of 24; empty relevance performs no enrollment query. Two graduates share one version-set read and one payload digest; held-only performs neither. A same-ID payload change changes the fingerprint and the actual confirmation refuses the old review. Six actual-query EXPLAIN plans per adapter are recorded for diagnostics; no speed/latency promise is inferred.

Typecheck, full lint and domain suite pass on the application changes; later review-harness additions receive their own final checks. The default `npm run build`, outside the sandbox, **fails** on Turbopack CSS-worker startup (`globals.css`, child exits before IPC connection). Separate Webpack build is pending at this checkpoint. BAT-01A both-adapter action/permission/lifecycle/independent-race/recovery groups pass; other affected groups and compiled browser/export/A4 checks continue. No institutional client was opened; safety runs report unchanged default-directory metadata.

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
