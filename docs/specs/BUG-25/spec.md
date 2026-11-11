# BUG-25 — unique, serialized publication versions

Combined specification and plan outline for a small bug slice ([workflow](../../WORKFLOW.md)). Verification will be added to this record.

- Issue: [#25](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/25) (SAFE-01 follow-up F-03); review finding [F-05](../../reviews/CODE_AND_PLAN_REVIEW_2026-11-11.md), package 3.
- Branch/base: `codex/bug-25` from local `main` `9ec8245`. One checkout, one writer.
- Status: **approved 11 November 2026.** The owner replied "Approve as recommended" to the presented specification, acceptance criteria and decisions: D-1 refuse with `stale`; D-2 `effectiveTo` not changed in BUG-25 (open, decide with GOV-01); D-3 schema change and lock design approved. Scope is this document as proposed in `58e6306`. Applying `0017` to the institutional database is not authorized here.

## Problem and inspected baseline

Established by reading the code on `9ec8245`; no reproduction was run (it needs a disposable PostgreSQL cluster and is the first implementation task).

1. `schedule_versions` ([schema.ts:699](../../../src/db/schema.ts)) has only a primary key. Nothing stops two rows with the same `(term_id, version_number)`, or two `published` rows for one term.
2. `publishActionInTerm` ([actions.ts:511](../../../src/lib/actions.ts)) reads the draft, reads the latest version, computes `latest + 1`, supersedes the published row and inserts the new one. Publishers hold only the **shared** term-context lock, so two of them can run together.
3. The issue text is partly out of date: since SET-01A the whole action already runs inside one transaction (`activeTermWrite`, [term-context.ts:36](../../../src/lib/term-context.ts)). The missing piece is an exclusive lock between publishers, not a transaction.
4. Exposure differs by adapter. On PostgreSQL two publishers can both insert version N+1 as `published`; every reader that uses `find(state === "published")` then picks one arbitrarily. On PGlite (today's institutional storage) transactions queue on the single connection, so the duplicate cannot occur, but the second publisher silently creates N+2 from a page that never showed N+1. That silent double publication also happens on both adapters whenever an approver publishes from a stale tab.
5. Every reader assumes at most one `published` row per term (`data.ts:251,439`, `public-routine.ts:38`, `routine-sources.ts:34`, six pages).
6. Other writers of the table: `seed-summer-2026.ts` and `scripts/safety/fixture.ts` (one row each), and `review-publishable.ts` (disposable review copies; refuses when a published row exists).

## Outcome and scope

A term can never hold two versions with the same number or two published versions, publications of one term happen one at a time, and an approver whose page is out of date is told so instead of creating another version.

In scope:

- Migration `0017`: unique `(term_id, version_number)`; partial unique `(term_id) WHERE state = 'published'`; a preflight that refuses, with a plain message and no change, if existing rows already violate either rule (same pattern as `0013_one-active-term.sql`). Matching index declarations in `schema.ts`.
- `publishAction`: take a per-term exclusive publication lock before reading the draft or the latest version; compare the latest version with the one the approver's page showed; map a uniqueness violation that still gets through to a `stale` result.
- Publish panel: send the latest version it displayed; show the stale result; refresh the list.
- A publication safety group on both adapters, including a real PostgreSQL race.

Excluded (no change in this slice):

- Applying `0017` to the institutional database. That is a separate owner-run step after a cold backup.
- Draft edits that commit while a publication is being built. Existing room-maintenance and cohort guards stay; a general "draft changed during publication" check is not added.
- The access actions named in #25. AUTH-02 rebuilt them with transactions and an advisory guard; they are not re-audited here.
- Version numbering semantics, the seeded `draft` row, a `state` CHECK constraint, review/approval lifecycle (GOV-01), `review-publishable.ts`, bundler policy, remote synchronization.

## Required behavior

**Lock.** Inside the existing transaction, after the permission check and before any draft read: `pg_advisory_xact_lock(<publication key>, term_id)` (the primitive `account-store.ts:115` already uses on both adapters). Lock order becomes: term context (share) → publication lock → room rows. Only publishers take the publication lock, so no other writer can wait on it while holding rooms. A row lock on `academic_terms` was rejected: `FOR UPDATE` conflicts with the key-share locks taken by every insert that references the term and would introduce a deadlock path against room writers.

**Stale check.** The panel sends `expectedLatestVersionId` (the id of the highest-numbered version it rendered for the term, or `null` for none). Under the lock the server re-reads the highest-numbered version. If it differs, or the value is missing/malformed, nothing is written and the result is `stale` (reason `changed`):

> Version N was published by NAME at TIME while this page was open. Nothing was published. Review the current version, then publish again if a new version is still needed.

**Success path** is unchanged: validation blockers refuse first; old published row becomes `superseded`; new row is `published` with number latest + 1; one `publish` audit event; same success message.

**Backstop.** A unique violation on either new index is returned as the same kind of `stale` result, never a raw database error.

**Migration.** Forward-only, hand-written SQL plus journal entry. No row is updated or deleted. If duplicates exist it raises and the migration transaction rolls back; repair needs an owner decision.

## Acceptance criteria

| ID | Criterion | Check |
|---|---|---|
| AC-01 | A second row with the same `(term_id, version_number)` is rejected by the database. | Direct insert, PGlite and PostgreSQL |
| AC-02 | A second `published` row for a term is rejected; many `superseded` rows and one published row per different term are accepted. | Direct insert/update, both adapters |
| AC-03 | Two approvers publishing the same term at the same moment: exactly one succeeds; the other receives `stale`; afterwards the term has one new version, one `published` row and one new `publish` audit event. | PostgreSQL race with observed lock wait; PGlite queue model |
| AC-04 | Publishing from a page that shows an older latest version returns `stale` and writes no version and no audit event. A missing or malformed expected value does the same. | Both adapters |
| AC-05 | A single publication behaves as before: number is latest + 1, previous version superseded, snapshot's `versionNumber` equals the row's, audit before/after unchanged in shape. | Both adapters |
| AC-06 | Blocker refusal, permission denial, changed-term refusal and the existing publish-versus-cohort, maintenance and rollover races give their current results. | Existing safety groups that call `publishAction`, re-run |
| AC-07 | `0017` applies to a fresh database and to a populated disposable copy on both adapters; `schedule_versions` rows fingerprint identically before and after. | Safety group; recovery group still passes |
| AC-08 | With a duplicate number or two published rows planted, `0017` fails with the named message and leaves schema and rows unchanged. | Both adapters |
| AC-09 | The publish panel shows the stale message, publishes nothing, and the version list then shows the current version. Success display is unchanged. | Disposable review copy, desktop and mobile |
| AC-10 | `typecheck`, `lint`, `test:domain`, `build` and `test:safety` (with `SAFE01_PG_BIN`) are run and reported as they actually finish. | Commands |
| AC-11 | The institutional directory is never opened; no push, PR or GitHub update. | Target preview / metadata unchanged |

## Decisions for the owner

| ID | Question | Recommendation |
|---|---|---|
| D-1 | When a version appeared since the approver's page loaded, refuse with `stale` (as specified), or let the second publication through as the next number? | Refuse. Without it "serialized" still yields two versions seconds apart, one of them unreviewed against the other. |
| D-2 | F-05 also asks about `effectiveTo`: a superseded version is stamped with the term's printed start date, not the day it was replaced (`actions.ts:557`), so the archive shows "start → start". Change it here? | Not in BUG-25. It is a meaning question, not a concurrency defect; record it as open and decide with GOV-01. If you want it now: stamp the Asia/Dhaka date of replacement for new supersessions only, no backfill. |
| D-3 | Approve the schema change (#25 asked for separate approval) and the lock design above? | Approve. |

## Plan outline (after approval)

1. Record approval here and commit before code.
2. Add the publication safety group; show AC-01–AC-04 failing on current code (PostgreSQL race red).
3. Migration `0017`, journal, `schema.ts` indexes; AC-07/AC-08.
4. Lock, stale check and backstop in `publishAction`; update existing test callers for the new argument.
5. Publish panel and `term-write-context`; AC-09 on a disposable review copy.
6. Full checks, diff review, verification section, brief/handoff update; present for inspection.

Read `node_modules/next/dist/docs/` on Server Functions before step 4–5 (AGENTS.md).

## Observations (not changed)

- A clean seed stores version 1 as `draft`, so the first real publication is version 2 and the draft row stays. Unique numbering is compatible with this.
- Remote check: issue #25 body read on 11 November 2026 (open). No other remote activity.
