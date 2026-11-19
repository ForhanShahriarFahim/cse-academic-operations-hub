# OD-01A — Verification

20 November 2026, Asia/Dhaka · [Specification](spec.md) · [Plan](plan.md)

## Corrections found during verification

- Migration `0022` now adds its three check constraints only when they are missing, as `0020` does. Older safety groups delete later journal rows and migrate again. The first full run therefore failed when `0022` tried to add an existing constraint. Column additions already used `IF NOT EXISTS`.
- At 768 px the `/od` register widened the page by 209 px. The screen-reader-only labels in the action buttons had no positioned ancestor inside the table's scroll region, so the region did not clip them. The row-actions wrapper is now `relative`.
- A safety-scenario edit omitted the audience label that the previous edit had set. The action correctly cleared it. The scenario now repeats the label, matching what the full form submits.

## Domain, static and build checks

- `npm run typecheck` and `npm run lint` passed.
- `npm run test:domain` passed. The OD-01A rules covered per-choice validation, D-3 levels, legacy review labels, parity of the engine/preview overlap (AC-03), lifecycle availability, and register filters and counts.
- The default `npm run build` (Turbopack) passed. It used an unused loopback database endpoint and in-memory PGlite, and the Webpack fallback was not needed. The `next-env.d.ts` rewrite that the build generated was reverted.

## Disposable database checks

The full `npm run test:safety` with `SAFE01_PG_BIN` passed all 60 groups on disposable PGlite and PostgreSQL 17.11. That includes the new **OD-01A commitments** group on both adapters. The default PGlite directory metadata was unchanged, and the run never opened it.

- **AC-09.** The group populated a `0021` database with both fixture terms, workload and publications, then migrated to `0022`. Every other table's fingerprint and every existing commitment value stayed the same. Rows became Active at revision 1, and repeating the migration changed nothing. The database refuses an archived row with no time or reason, and a revision of 0.
- **AC-08.** A teacher and an anonymous request are refused before any write, and nothing is stored or audited. Active-term refusal is covered by the term-workspace inventory, which lists the new actions. The SAFE-01 mutation inventory rows 4–6 name the new actions.
- **AC-02, AC-04.** Missing required facts are refused without a write. A teaching record stores no room (level B). An unresolved note stores no teacher, room, day or time (level D) and cannot be verified. Adding credits raises the level to A, and a resolved note becomes level C.
- **AC-05.**
  - Verify needs a confirmation note.
  - An edit with an old revision is refused without a write, and of two simultaneous edits of the same revision exactly one commits.
  - A label-only edit keeps Verified, while a time change returns the record to Pending.
  - Archive needs a reason and refuses later edits.
  - Reactivate returns the record as Pending and blocks the teacher again.
  - A resolved note keeps its original text, and deleting a mistaken entry still works.
- **AC-06.** An archived record produces no conflict and leaves `getPortalData().externals`, which feeds the OD row, the teacher routine and new publications. Archiving the fixture commitment counted by workload discloses it, and workload allocations and published versions are byte-identical. The room maintenance, publication-maintenance and lifecycle groups passed with the archived-record filters in place.
- **AC-07.** Each success writes exactly one named audit event (`external.create`, `verify`, `edit`, `archive`, `reactivate`, `resolve`), and refusals write none. History lists the events newest first with the reason and confirmation note.

## Browser review (Edge, disposable review database on :3100)

The `tests/ux/commitments.spec.ts` flows passed with axe and page-width checks at 1440, 390 and 320 px: the register, the guided form, the lifecycle, note resolution and teacher denial. They cover AC-01, AC-02, AC-07 and AC-10. Screenshots are kept in `.tmp/ux-review/od-01a/`. The baseline suite passed 67 of 69. The `/od` 768 px overflow failure is fixed above and passed on rerun. The remaining failure, “no native confirm() remains”, comes from `attendance-lifecycle-ui.tsx` (a local function named `confirm`) and `batches/batch-form.tsx`. Neither file is changed on this branch, so the failure is pre-existing.

The review ran on the development review server, not a compiled production server. The production build is covered separately above.

## Not done here

- The institutional database has not been migrated. Applying `0022` to it is a separate, backed-up operation that needs owner approval.
- OD-01B (effective ranges, carry-forward, teaching-group link) is not implemented. #13 stays open.
