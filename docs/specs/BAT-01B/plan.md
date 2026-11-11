# BAT-01B — Implementation plan

Parent: [BAT-01 / #6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6)

[Specification D-1–D-6 / AC-01–AC-11](spec.md) · [verification](verification.md) · [responsive sketches](mockups/rollover.html)

Status: **Implemented and verified for owner inspection; AC-11 partial for the disclosed failed default build. Acceptance/local merge pending.**

Branch/base: `codex/bat-01b` from local main `10e3485`; one checkout/writer, no extra worktrees.

Updated: 11 November 2026, Asia/Dhaka

## Inspection and proposed approach

BAT-01A/SET-01A are merged dependencies. The main integration risks are draft placements freezing policy setup, graduation's all-term guards, count-confidence reset, grid foreign-key remapping and stale/replay races. No calendar model exists. Reuse existing scoped capabilities, ActionResult, term context/ambient transactions and audit conventions; keep pure helpers free of configured DB imports.

Installed Next guides read: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `01-app/03-api-reference/03-file-conventions/page.md`. Route params/searchParams are async; raw actions need full independent validation/auth, and per-client sequential dispatch does not serialize independent requests. Before code also read relevant installed forms/error/revalidation guidance.

| Area | Bounded change |
|---|---|
| Schema | Add one receipt per destination, source/destination/actor/time/reason/decision summary. Expected next migration 0016; confirm journal first. Populated adapter migration/recovery, no institutional migration. |
| Domain | Pure strict plan parser, eligibility/progression/count carry rules, deterministic clone plan/semantic validation and safe review/result types. |
| Evidence | Consistent source/destination/context/policy/placements/grid/lifecycle inventory, whole-plan fingerprint, reusable BAT-01A lifecycle guards. |
| Actions | Reauthorize both scoped capabilities after exclusive context lock; sorted row locks; recompute evidence; atomic placement/grid/graduation/receipt/audits; truthful replay/stale handling. |
| UI | Eligible term links, staged editor/review/confirmation, receipt/detail read path, guarded activation link, loading/pending/error/empty/stale/denied states. |
| Safety | Database-free imports, both-adapter preserved upgrade/reapply/rollback/recovery, raw actions, real queued races, privacy/public/archive parity. |
| Review | Owned synthetic production preview; 1440/390/320px/keyboard/pending/browser evidence; relevant existing native A4/CSV regression. |

Inventory all source grid/count/reference and destination policy/identity/setup/activation writers before implementation. Context lock participation is required, not assumed from route names. Existing global `permitted_windows` rows require explicit exclusion, and period-pattern IDs must never leak across terms. Keep reason/actor/count-source metadata out of published projections. Do not import configured DB into the parent safety harness.

## Approval record

- Request: owner said **“Done! Now go for the implementation.”**, 8 November 2026, after BAT-01A acceptance/merge and the BAT-01B planning handoff.
- Baseline inspected: no BAT-01B specification/plan existed; the roadmap held a one-line proposal only. This message authorizes preparing the requested work; it is not recorded as approval of the subsequently authored D-1–D-6.
- Concrete D-1–D-6 approval: **“Approve D-1–D-6 and implement”**, 8 November 2026, in response to the explicit request summarizing ready unused draft, progress/repeat/hold, unchanged graduation guards, count reset, optional empty-grid clone, atomic receipt and separate activation. Approves unchanged spec.md D-1–D-6. This record is committed before feature code.
- Material decisions presented together: ready unused existing draft; no automatic activation; strict graduation guards; hold receipt without placement; optional non-overwriting grid clone; one-time atomic preparation and explicit correction exclusion.
- No institutional operation, remote sync, extra worktree/writer, parent closure or local merge authorized by this planning checkpoint. BAT-01A acceptance does not close #6.

## Tasks — sole checklist

- [x] T-01 — Inspect dependencies and actual domain/schema/action seams; document bounded decisions and AC-01–AC-11.
- [x] T-02 — Explicit D-1–D-6 approval recorded/committed `513113c` before code. Static proposal/link checks pass; desktop/mobile/keyboard captures in verification.
- [x] T-03 — Inventory writers/readers, implement pure rollover/clone validation and receipt migration; prove populated preservation/reapply/recovery on both adapters. AC-02/03/05/06/08.
- [x] T-04 — Implement consistent evidence, independent scoped loaders/actions and atomic audited/replay-protected preparation. AC-01–AC-08.
- [x] T-05 — Implement staged responsive editor/review/receipt and safe term integration. AC-01/02/09.
- [x] T-06 — Verify persisted raw actions, rollback, privacy, all specified both-ordering races and full safety inventory on owned disposable targets. AC-01–AC-08/10.
- [x] T-07 — Run required final checks, inspect production UI/keyboard/pending/desktop/mobile and frozen print/CSV regression; correct findings and deliver runnable review. AC-09–AC-11.
- [ ] T-08 — Obtain actual delivery acceptance, merge only this slice into local main and record receipt/next owner-started session. Keep parent #6 open if any parent requirements remain.

## Verification and delivery

Planning checks: local links, decision/template consistency, whitespace/diff review; static sketch rendering at 1440/390/320px and keyboard/label/overflow inspection. Static screens do not prove backend behavior. No app/database commands for this planning phase.

After detailed approval: typecheck/lint/domain/default build and relevant checks plus the preserved full safety inventory, PostgreSQL included. Test all dispositions including safe completed-source graduation and active-source graduation refusal. Test verified zero, bad legacy counts, grid scope and remapping, both source/destination concurrent writers, activation/ABA, two submissions, all-held receipt replay, audit failure rollback and copied data privacy. Preserve old populated rows/snapshots and restore a disposable copy. Default-build failures in accepted earlier slices do not exempt BAT-01B; report its actual result separately from any Webpack preview.

Provide a guarded synthetic administrator/view-only review path with clearly named source/destination and actual persisted receipt, retained source history, still-draft target and separate activation. No casual dev/start/db:* commands; preparation runners must prove owned disposable targets before importing DB. Owner acceptance precedes local main merge; no routine remote sync.

## Current checkpoint / exact handoff

- Scope: unchanged D-1–D-6 approved explicitly on 8 November, committed `513113c` before code. No material scope amendment.
- Branch/base: `codex/bat-01b` from local main `10e3485`; no extra worktree/writer or remote sync.
- Completed: T-01–T-07. Implementation `f753b8d`, review corrections `7e6c28a`, browser/print evidence `459f6a3`; final evidence/checkpoint follows. Historical timestamp-fixture integration adds migration-0016's receipt timestamp to the existing later-feature exclusions; current catalogs still check every instant column.
- Verification: all 31 named safety groups pass across preserved/resumed runs, including both adapters, eight rollover race orderings each, full recovery and reset/access preservation. Typecheck/domain/lint pass; 39 production captures and 16 native before/after PDF pages plus frozen CSV parity pass. [Evidence/receipt](verification.md). Default Turbopack CSS-worker build fails; separate Webpack production build passes. AC-11 is partial; no BAT-01B exception has been accepted.
- Owner review: http://localhost:3121/ (application 3120), guarded `scripts/review-rollover.ts --serve` restart in verification. Fixture is synthetic and owned; no-active context intentionally demonstrates preparation from a completed source. Existing broad warning/leading print page is preserved and disclosed.
- Next: T-08 only — owner inspection/findings and actual acceptance explicitly including the failed-default-build limitation, then record acceptance before bounded local merge. Parent #6 stays open. Do not start CRS-01A or another feature automatically.
- Safety: no institutional migration/preparation/reset/census/recovery or remote operation. Configured DB import regression and final focused/resumed metadata checks pass. Keep raw logs/private runtime state ignored; version only synthetic evidence.

Next-session prompt: “Resume BAT-01B / #6 delivery review on codex/bat-01b. D-1–D-6 approval 513113c precedes implementation f753b8d/correction 7e6c28a and browser evidence 459f6a3; inspect later final evidence commits and actual Git status. T-01–T-07 are complete. Read verification and its 31-group receipt, default Turbopack failure, distinct passing Webpack preview and inherited no-active context/print finding. Reuse recorded passing checks; rerun only changed/failed/uncertain behavior. Owner review is localhost:3121; restart only with scripts/review-rollover.ts on owned synthetic targets. Fix owner findings within approved scope. Obtain actual delivery acceptance including the disclosed default-build limitation before recording/merging into local main; keep #6 open. No institutional operation, extra worktree/writer, remote sync or automatic next feature. After acceptance/merge, update handoff and suggest CRS-01A inspection/specification for an owner-started session.”
