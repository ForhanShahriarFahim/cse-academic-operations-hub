# BAT-01B — Implementation plan

Parent: [BAT-01 / #6](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/6)

[Specification D-1–D-6 / AC-01–AC-11](spec.md) · [verification](verification.md) · [responsive sketches](mockups/rollover.html)

Status: **Approved implementation in progress; approval `513113c` precedes code.**

Branch/base: `codex/bat-01b` from local main `10e3485`; one checkout/writer, no extra worktrees.

Updated: 9 November 2026, Asia/Dhaka

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
- [ ] T-06 — Verify persisted raw actions, rollback, privacy, all specified both-ordering races and full safety inventory on owned disposable targets. AC-01–AC-08/10.
- [ ] T-07 — Run required final checks, inspect production UI/keyboard/pending/desktop/mobile and frozen print/CSV regression; correct findings and deliver runnable review. AC-09–AC-11.
- [ ] T-08 — Obtain actual delivery acceptance, merge only this slice into local main and record receipt/next owner-started session. Keep parent #6 open if any parent requirements remain.

## Verification and delivery

Planning checks: local links, decision/template consistency, whitespace/diff review; static sketch rendering at 1440/390/320px and keyboard/label/overflow inspection. Static screens do not prove backend behavior. No app/database commands for this planning phase.

After detailed approval: typecheck/lint/domain/default build and relevant checks plus the preserved full safety inventory, PostgreSQL included. Test all dispositions including safe completed-source graduation and active-source graduation refusal. Test verified zero, bad legacy counts, grid scope and remapping, both source/destination concurrent writers, activation/ABA, two submissions, all-held receipt replay, audit failure rollback and copied data privacy. Preserve old populated rows/snapshots and restore a disposable copy. Default-build failures in accepted earlier slices do not exempt BAT-01B; report its actual result separately from any Webpack preview.

Provide a guarded synthetic administrator/view-only review path with clearly named source/destination and actual persisted receipt, retained source history, still-draft target and separate activation. No casual dev/start/db:* commands; preparation runners must prove owned disposable targets before importing DB. Owner acceptance precedes local main merge; no routine remote sync.

## Current checkpoint / exact handoff

- Scope: approved unchanged D-1–D-6 in spec.md; actual response above. Implementation is in progress under approval `513113c`.
- Branch/base: `codex/bat-01b`, local main `10e3485`; inspect actual status/log on resume.
- Completed: T-01–T-05. Approval `513113c`, implementation `f753b8d`, review corrections `7e6c28a`. Both adapters pass migration/action/recovery and all eight race orderings in recorded runs. Final metadata/source-preservation assertions pass on both adapters. Production browser (39 captures) and frozen CSV/native A4 parity pass; full 31-group safety inventory remains in progress. New receipt FK is explicitly integrated into disposable reset; institutional reset refusal is unchanged.
- Next: complete the full safety inventory, record final evidence, commit delivery and leave a fresh owned preview for owner inspection. Required final checks remain T-06/T-07; no delivery acceptance or local merge yet.
- Verification: [evidence](verification.md). Domain, typecheck/lint and distinct Webpack production builds pass; default Turbopack CSS-worker failure remains explicit. Durable current logs/status files are `.tmp/bat-01b/{full-safety,final-rollover,browser,review-build,final-lint}.{log,exit}`. No institutional DB operation or remote sync.
- Handoff: “Resume BAT-01B on codex/bat-01b. Read brief/workflow and this sole plan, spec D-1–D-6 and verification; check actual Git status and approval evidence. The owner requested implementation, but the concrete rollover decisions were subsequently explicitly approved (“Approve D-1–D-6 and implement”). Reuse completed inspection/static checks. Approval is already committed at 513113c. Resume T-06/T-07 from durable logs/status files; reuse recorded passing checks and rerun only changed/failed/uncertain checks. Finish browser/CSV/A4 evidence and give the owner a fresh guarded synthetic review at localhost:3121 using scripts/review-rollover.ts --serve. Retain count/history/privacy/lifecycle guards. No institutional operation, remote synchronization, extra worktree/writer or local merge before delivery acceptance.”
