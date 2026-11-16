# CRS-01C — Implementation plan and sole checklist

Specification/decisions: [spec.md](spec.md). Inspection/checks: [verification.md](verification.md). Design: [mockups/index.html](mockups/index.html).
Status: **Proposed. Awaiting owner approval of D-1–D-8. No implementation authorized.**
Branch/base: `codex/crs-01c` / `3832d33` (local `main`).
Updated: 16 November 2026, Asia/Dhaka.

## Inspection and proposed approach

Follow the CRS-01A/CRS-01B shape: pure rules in a records module, an injected-reader store that decides inside one transaction, thin guarded server actions, and server-rendered pages. No migration, no change to existing loaders' outputs.

| Seam | Bounded change after approval |
| --- | --- |
| `src/lib/auth/policy.ts` | Add `manage_class_groups` to system administrators, academic administrators and routine coordinators (D-2). No other role changes. |
| `src/lib/class-group-records.ts` (new) | Pure, database-free: audience rules, teacher/units parsing and totals in hundredths, crediting method, weekly-requirement rules, unit and requirement suggestions with their source, completeness states, reconciliation detection, input parsing, fingerprints. Covered by `test:domain`. |
| `src/lib/class-group-store.ts` (new) | Injected reader/transaction with type-only DB imports. Reads one term's offerings, links, groups, requirements, allocations, teachers and dependent-record counts; decides create / update / remove; writes groups, links, requirements, allocations and audit events atomically. Shared context lock, then term row `for update`, then teacher rows. |
| `src/lib/class-group-data.ts`, `src/lib/class-group-actions.ts` (new) | Authorized term-scoped page loader (viewer payload vs editor payload), paged history, and server actions that accept each field once as text and map expected database conflicts to plain results. |
| `src/app/(portal)/terms/[id]/groups/` (new), `src/components/class-groups/` (new) | List, create, group page with edit and remove, history; loading and not-found states. Forms dispatch their action from `onSubmit` (no automatic form reset). |
| `src/app/(portal)/terms/[id]/page.tsx`, `terms/[id]/offerings/page.tsx`, `courses/page.tsx` | Add links and counts; offering rows link to their class group or to **Create class group**. No other behavior change. |
| `scripts/safety/`, `scripts/verify-safety.ts`, `scripts/verify-db-free.ts` | Focused CRS-01C groups on both adapters, real PostgreSQL races, and the injected-import guard for the new store. |
| Guarded synthetic review tooling | A launcher and browser script modelled on `review-offerings.ts`, with a prepared draft term and an active term fixture. |

Open points to confirm during T-03, not scope changes: (1) which lock the teacher deactivate/delete writers take, so class-group writes serialize with them as the specification requires; (2) whether any existing reader assumes one offering per group. If either needs a change outside the seams above, return to the owner first.

No schema, backfill or recovery operation is proposed. Read the installed Next.js guidance for server actions, forms and revalidation before writing code.

## Approval record

- Owner on 16 November selected **“Accept and merge”** for CRS-01B (acceptance `50b7588`, merge `e1e0644`) and then asked **“plan CRS-01C”**. This authorizes this inspection/specification package only.
- **Implementation approval: not given.** Record the owner's actual words, date and any amendments here, and commit that record before any application or test code.
- No remote issue update, push/PR, institutional operation, extra worktree/writer or CRS-01D authorized.

## Tasks — one checklist

- [x] T-01 — Inspect post-CRS-01B base, requirements §11, issue #7, schema, seed, meeting actions, coverage, workload, access and neighbouring writers. Write scope, D-1–D-8, AC-01–AC-12, this plan and static mockups. Planning-document checks are in verification.
- [ ] T-02 — Owner approves or amends D-1–D-8; record the actual approval and commit it before implementation.
- [ ] T-03 — Capability, pure `class-group-records` module and domain tests. Confirm the two open points above. AC-03–AC-05 (rules), part of AC-08 and AC-10.
- [ ] T-04 — Store, actions and audit events; CRS-01C safety groups on PGlite and PostgreSQL with whole-database preservation fingerprints and real lock races. AC-01, AC-02, AC-06, AC-07, AC-09 (data).
- [ ] T-05 — Pages, forms, history and links; real-browser states at 1440/390/320, keyboard, axe and print. AC-08, AC-11.
- [ ] T-06 — Final typecheck, lint, domain, default build; compiled browser review including scheduling a class for a new group; archived CSV parity. AC-12.
- [ ] T-07 — Commit bounded verified delivery, provide runnable review and evidence, obtain actual owner acceptance (including any unresolved checks), record it, then merge locally. Update handoff; keep #7 open and leave CRS-01D for the owner to start.

## Verification and delivery

Planning only so far: links, template/one-checklist completeness, mockup rendering and diff/whitespace checks. No database or application suite is needed for these documents.

After approval: prove behavior with persisted results and whole-table before/after fingerprints on PGlite and PostgreSQL, not query-text matching. Use independent PostgreSQL connections for races. Reuse `T-03` history, `CRS-01A`, `CRS-01B`, `BAT-01A/B` and BUG-LOAD-BASIS eligibility groups where the touched seams overlap; run broad suites only when a failure or uncertainty warrants it. Use `F:/AI/tools/pgsql-17.11/pgsql/bin` and harness-owned `.tmp/safe-01` storage only; never run institutional `dev`, `start` or `db:*` commands.

Required final commands: `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`. Record the default build's actual result; do not repair bundling under this plan.

Delivery is local. Last remote reconciliation remains 11 November 2026.

## Current checkpoint / exact handoff

- Branch `codex/crs-01c`, base `3832d33`, one writer/checkout. Planning package only: specification, this plan, inspection record and six static sketches. No application, test, schema or dependency change.
- Next: the owner reviews the sketches and approves or amends D-1–D-8. Record the actual approval and commit it; only then start T-03. Do not start CRS-01D.

Next-session prompt: “Resume CRS-01C on codex/crs-01c, base 3832d33. Read the current brief/workflow and docs/specs/CRS-01C/{spec,plan,verification}.md, then inspect actual Git state. The planning package (D-1–D-8, AC-01–AC-12, static mockups) is proposed, not approved. If the owner has approved, record their actual words and any amendments in plan.md and commit that before code; then work T-03 onward. No schema change, institutional migration 0017/0018 or database operation, extra writer/worktree, remote sync or automatic CRS-01D. Keep #7 open.”
