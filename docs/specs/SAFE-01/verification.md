# SAFE-01 — Verification and review

Issue / specification / plan: [#2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) · [spec](spec.md) · [plan](plan.md) (task authority)
Verified revision: T-01 checkpoint — the commit that adds this file (on `a0d7fe8`).
Environment and date: Windows 11, Node 22.11.0, PGlite 0.5.x on-disk owned runs under ignored `.tmp/safe-01/`; 30 September 2026 (Asia/Dhaka). No PostgreSQL server or clients available.

## Acceptance evidence

| Criterion | Result | Method and evidence |
|---|---|---|
| AC-01 | Passed for T-01 scope; recovery commands pending T-02/T-06 | `npm run test:safety` → `T-01 isolation: passed`. Refuses the default/`.data`/inherited/relative/outside-scratch/junction-escape PGlite targets. Refuses implicit, configured, non-`safe01_`, unconfirmed and redirecting PostgreSQL URLs. Refuses identical/nested locations and non-empty restore targets. Unmarked runs and a second writer are refused. The import-boundary scan passes. Pinned children stay on the owned run under a poisoned parent environment and poisoned `.env`/`.env.local` files. The default PGlite directory's file metadata was unchanged across the run, and the harness never opened it. |
| AC-02 | Pending | T-02. |
| AC-03 | Pending (external prerequisites) | T-06. Needs an approved PostgreSQL target, client tools and encrypted storage. |
| AC-04 | Pending | T-03. |
| AC-05 | Partial: inventory complete, tests pending | [Mutation inventory](../../operations/SAFE-01-mutation-inventory.md): 25 server actions plus 7 other paths, classified, with the bootstrap and activation gaps listed. The success, rollback and denial tests are T-04. |
| AC-06 | Pending | T-05. |
| AC-07 | Passed at T-01 checkpoint | `typecheck`, `lint`, `test:domain` (4 suites), `build` and `test:safety` all passed after the final T-01 edits. |
| AC-08 | Pending | Final review and owner acceptance. |

## Checks

- **T-01 environment behaviour.** The child-process checks demonstrated two hazards.
  - Without pinning, a `.env.local` in the working directory silently switches `src/db` to PostgreSQL.
  - CLI scripts that import `dotenv/config` before `src/db` give `.env` precedence over `.env.local`, which is the reverse of Next.js (inventory finding F-01).
  - The harness avoids both: child environments set `DATABASE_URL` and the auth variables to empty strings (dotenv never overrides an existing key), set `PGLITE_DATA_DIR` to the owned run, and drop `PG*`/`npm_*` variables.
- **Build target review.** `next build` sets `npm_lifecycle_event=build`, so `src/db` uses `memory://`. No `.env`/`.env.local` files exist in the checkout. The build's regeneration of `next-env.d.ts` was restored rather than committed.
- **Not run:** `dev`, `start`, `db:prepare`, `db:migrate`, `db:reset` or `auth:bootstrap` against any non-owned target, and any connection to the institutional database.

## Review findings

| Finding | Correction / disposition | Reverification |
|---|---|---|
| Next's `ProcessEnv` augmentation made plain env maps fail typecheck | Safety code uses an `EnvironmentView` string map | typecheck passed |
| F-01 to F-07 in the [inventory](../../operations/SAFE-01-mutation-inventory.md#findings-for-follow-up-not-safe-01-fixes-unless-stated) | Recorded as follow-ups; the bootstrap/activation gaps are fixed in T-04; F-07 goes in the T-02 runbook | — |

## Delivery and acceptance

- Commits / PR: `a0d7fe8` (approval); T-01 checkpoint commit on `codex/safe-01`.
- Remaining gates: T-02 to T-07; PostgreSQL prerequisites; operational owners (D-07).
- Owner acceptance: Pending.
- Merge / closure: Pending.
