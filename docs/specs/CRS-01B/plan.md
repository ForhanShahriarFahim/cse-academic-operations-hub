# CRS-01B — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md). Design: [mockups/index.html](mockups/index.html).
Status: **Approved for implementation on 16 November 2026; implementation in progress.**
Branch/base: `codex/crs-01b` / `f0c4d8c` (local `main`).
Updated: 16 November 2026, Asia/Dhaka.

## Inspection and proposed approach

Follow the CRS-01A shape: pure rules in a records module, an injected-reader store that decides inside one transaction, thin guarded server actions, and server-rendered pages. No migration, no change to existing loaders' outputs, no general service rewrite.

| Seam | Bounded change after approval |
| --- | --- |
| `src/lib/auth/policy.ts` | Add `manage_offerings` to system and academic administrators. No other role changes. |
| `src/lib/offering-records.ts` (new) | Pure, database-free: slot basis (stream + semester), proposal with reasons, carried/added/dropped/changed comparison, status vocabulary, input parsing, fingerprints. Covered by `test:domain`. |
| `src/lib/offering-store.ts` (new) | Injected reader/transaction with type-only DB imports. Reads term, placements, cohorts, courses, offerings and group links for one term plus the chosen source term; decides start / add / cancel / restore / remove; writes offerings and audit events atomically. Shared context lock, then term row `for update`. |
| `src/lib/offering-data.ts`, `src/lib/offering-actions.ts` (new) | Authorized page loader (viewer payload vs editor payload), paged history, and server actions that accept each field once as text and map expected database conflicts to plain results. |
| `src/app/(portal)/terms/[id]/offerings/` (new), `src/components/offerings/` (new) | Page, start review, add form, change confirmations, history; loading and not-found states. Reuse existing form, feedback and dirty-form patterns. |
| `src/app/(portal)/terms/[id]/page.tsx`, `src/app/(portal)/courses/page.tsx` | Add links and an offering count. No other behavior change. |
| `scripts/safety/`, `scripts/verify-safety.ts`, `scripts/verify-db-free.ts` | Focused CRS-01B groups on both adapters, real PostgreSQL races, and the injected-import guard for the new store. |
| Guarded synthetic review tooling | Extend the existing review launcher with a prepared draft term fixture; reuse its auth, target guard and capture harness. |

Open point to confirm during T-03, not a scope change: the lock modes used by cohort lifecycle and rollover writers, so that offering writes serialize with them as the specification requires. If they do not already take the context lock exclusively, return to the owner before changing them.

No schema, backfill or recovery operation is proposed. Read the installed Next.js guidance for route handlers, server actions and revalidation before writing code.

## Approval record

- Owner on 16 November said “Go for the next task.” and, asked how to proceed, selected **“Accept, merge, plan CRS-01B”**. This accepted PERF-01 (`836f4fc`, merged `2156fac`, receipt `f0c4d8c`) and authorizes this inspection/specification package only.
- **CRS-01B implementation approved, 16 November 2026 (Asia/Dhaka).** After proposal `935b309` presented the specification, D-1–D-7, AC-01–AC-10, sole checklist and mockups, the owner replied **“Approve and implement”** with no amendments. This authorizes the unchanged implementation and verification scope; delivery acceptance remains separate. This approval checkpoint precedes application/test implementation.
- No remote issue update, push/PR, institutional operation, extra worktree/writer or CRS-01C authorized.

## Tasks — one checklist

- [x] T-01 — Inspect post-PERF-01 base, requirements, issue #7, schema, seed, rollover, catalog and term seams. Write scope, D-1–D-7, acceptance criteria, this plan and static mockups. Planning-document checks are in verification.
- [x] T-02 — Owner “Approve and implement” recorded on 16 November, no amendments; this approved plan is committed before application/test implementation.
- [ ] T-03 — Capability, pure records module and domain tests for basis, proposal, comparison and parsing. Confirm lock modes of neighbouring writers. AC-03, part of AC-05.
- [ ] T-04 — Store, actions and audit events for start / add / cancel / restore / remove; both-adapter safety groups, preservation fingerprints and real PostgreSQL races. AC-01, AC-04, AC-06, AC-07, AC-08.
- [ ] T-05 — Pages, forms, history, links from term and courses pages; all states at 1440/390/320, keyboard and print. AC-02, AC-05, AC-09.
- [ ] T-06 — Final typecheck, lint, domain, default build and relevant safety groups; compiled synthetic browser review, CSV/A4 parity, diff review. Record limits honestly. AC-10.
- [ ] T-07 — Commit bounded verified delivery, provide runnable review and evidence, obtain actual owner acceptance (including any unresolved checks), record it, then merge locally. Update handoff; keep #7 open and leave CRS-01C for the owner to start.

## Verification and delivery

Planning only so far: links, template/one-checklist completeness, mockup rendering and diff/whitespace checks. No database or application suite is needed for these documents.

After approval: prove behavior with persisted results and whole-table before/after fingerprints on PGlite and PostgreSQL, not query-text matching. Use independent PostgreSQL connections for races. Reuse `T-03` history, `CRS-01A`, `BAT-01A`, `BAT-01B`, `BUG-28` and `PERF-01` groups where the touched seams overlap; run broad suites only when a failure or uncertainty warrants it. Use `F:/AI/tools/pgsql-17.11/pgsql/bin` and harness-owned `.tmp/safe-01` storage only; never run institutional `dev`, `start` or `db:*` commands.

Required final commands: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`. The default Turbopack build has failed at CSS-worker startup on recent deliveries; record its actual result and do not repair bundling under this plan. A separate Webpack build may supply the compiled review but is not a default-build pass.

Delivery is local. Last remote reconciliation remains 11 November 2026.

## Current checkpoint / exact handoff

- Branch `codex/crs-01b`, base `f0c4d8c`, one writer/checkout. Proposal committed; T-01 complete, T-02 pending. No application, test, schema or dependency change.
- Next: the owner reviews [spec.md](spec.md) and the [mockups](mockups/index.html) and approves or amends D-1–D-7. Do not implement before that record is committed. Do not start CRS-01C.

Next-session prompt: “Resume CRS-01B on codex/crs-01b, base f0c4d8c. Read the current brief/workflow and docs/specs/CRS-01B/{spec,plan,verification}.md, then inspect actual Git state. The planning package (scope, D-1–D-7, AC-01–AC-10, mockups) is committed and awaits owner approval; T-01 is complete. If the owner approves or amends, record their actual words in plan.md and commit before any application code, then work T-03–T-07 in order. No schema change, institutional migration 0017/0018 or database operation, extra writer/worktree, remote sync or automatic CRS-01C. Keep #7 open.”
