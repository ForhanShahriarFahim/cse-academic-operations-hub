# HARDEN-01 — decision-free corrections from the 11 November review

Combined specification, plan and verification record for a small bug slice ([workflow](../../WORKFLOW.md), "a small bug can combine their essential sections in one document").

Source: [code and plan review](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md), package 6 plus F-04.

Branch/base: `codex/harden-01` from local `main` after the BAT-01B merge `a552bac`. One checkout, one writer.

## Authorization

Owner, 11 November 2026, after reading the review: **"if any issue/bug present solve it now."** This record limits that instruction to findings that need no institutional or product decision, no schema change and no migration. It is committed before the code.

## Scope

| ID | Finding | Change | Acceptance |
|---|---|---|---|
| AC-01 | F-04 | Workload catalog credits come from the allocation's course record, never from course-code text. Unknown stays 0. | Domain check: unscheduled sessional with catalog credit 1 counts 1, not 3. |
| AC-02 | F-07 | CSV text cells that begin with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`. Other output is byte-identical. | Domain check on the cell encoder; existing projection checks still pass. |
| AC-03 | F-13 | Permission lookups treat a resource id that is not a positive safe integer as "no such resource" (denied) instead of sending it to the database. | Typecheck; reading. Covered at runtime by existing malformed-input safety scenarios (not re-run, see below). |
| AC-04 | F-14 | External commitments: day must be a whole number 0–6, teacher/room ids must be positive integers that exist, credits must be 0–99.9 with one decimal. New classes de-duplicate teacher and room ids. | Typecheck; reading. |
| AC-05 | F-06 (validation only) | Active-term policy save uses the same `validateStartingPolicy` bounds as draft setup. No history/versioning change (that stays SET-01B). | Typecheck; safety scenarios already submit values that satisfy these bounds. |
| AC-06 | F-15 | Removing a student who is not on the roster returns a stale result and writes no audit row. | Typecheck; reading. |
| AC-07 | F-16 | Extra-load print ignores `from`/`to` unless both are valid dates. | Typecheck; reading. |
| AC-08 | F-17 | Manual top-sheet rows refuse negative or out-of-range count, rate and amount. | Typecheck; reading. |
| AC-09 | F-19 | `.env.example` and README name the real default directory `.data/pglite-summer-2026`. | Diff review. |

## Excluded (need an owner decision or their own slice)

F-01 late-enrolment rule (Q-5), F-02 eligibility basis (Q-2), F-03 student identity (STU-01A), F-05 publication uniqueness (BUG-25, needs a migration and race tests), F-08 attendance lifecycle (ATT-03), F-09 production prepare (DEP-01), F-11 loader scoping (PERF-01), F-12, F-18, F-20, F-21, and review question Q-1.

## Verification

Implementation `831a943` on `codex/harden-01`, 11 November 2026. **Status: accepted by the owner on 11 November 2026 (“Accept and merge”, after the verification table and its pending items were presented); merged into local `main` by the commit that follows this record.** PostgreSQL safety groups, the remaining PGlite groups and browser/print suites remain pending.

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run test:domain` | Pass, including new workload-credit and CSV-cell assertions in `scripts/verify-domain.ts` (AC-01, AC-02) |
| `npm run build` (default; banner "Next.js 16.3.4 (Turbopack)") | Pass, exit 0 |
| Focused `test:safety` groups on owned disposable PGlite targets: BUG-28 active terms, SET-01A workspace, T-04 audit atomicity, BUG-27 blocked deletes, BAT-01B rollover, BAT-01A records, T-03 two-term history | All 7 pass; each run reports the default PGlite directory metadata unchanged |
| PostgreSQL safety groups, remaining PGlite groups, browser/print suites | **Pending — not run** |

Limits of this evidence: AC-03 to AC-08 have no new dedicated test; they are covered by typecheck, reading and the existing action scenarios above continuing to pass. The new domain assertions were not first run against the old code. No screen was inspected in a browser; the only visible changes are refusal messages for invalid input.

Behaviour changes an inspector may notice: an active-term policy value with more than one decimal place (two for the rate) is now refused instead of rounded; a workload row whose course record is missing shows 0 catalog credits instead of a guessed 3.

