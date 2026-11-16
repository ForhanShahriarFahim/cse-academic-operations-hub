# CRS-01A — Implementation plan and sole checklist

Parent: CRS-01 / #7. Specification: [spec.md](spec.md). Evidence: [verification.md](verification.md). Sketches: [mockups/index.html](mockups/index.html).
Status: **Implemented and verified; owner inspection/acceptance pending.**
Branch / base: `codex/crs-01a` / `bc2575785e39ceab0e65c01bd3335b3465283128`.
Updated: 16 November 2026, Asia/Dhaka.

## Inspection and proposed approach

Use existing directory/action/history patterns, with one course-specific rules module, injected transaction/evidence helpers, authenticated global loader/actions and responsive forms. Separate global catalog loading from term completeness. Add revision via a forward migration; retain existing institutional facts. Conservative academic-field freezing avoids a catalog/offering versioning subsystem in A. Title correction intentionally follows the existing live-directory model; see D-2 before approval.

Expected implementation seams (not permission to refactor whole modules):

| Seam | Bounded work |
| --- | --- |
| `src/db/schema.ts`, `drizzle/` | Revision and canonical lookup index; populated forward-chain/recovery evidence. |
| New `src/lib/course-records.ts`, `course-store.ts`, `course-data.ts`, `course-actions.ts` | Pure normalization/comparison, all-term use/lifecycle/snapshot evidence, locks/fingerprint/audit, guarded views and actions. Helpers must import DB types only. |
| `src/lib/auth/policy.ts` and action/page guards | New capability with D-1 CSE scope; no granting from the selected owner field. |
| `src/app/(portal)/courses/`, new course components | Directory first; separate term report, detail/add/edit/history/lifecycle; common feedback and navigation. |
| `src/lib/data.ts`, manual/auto assignment guard | Serialize active status, retain used inactive courses in reads, authoritative active-course check at meeting creation. Keep retained history and existing scheduling rules. |
| Domain/safety/browser harness | Focused real actions, adapters, race/history/recovery coverage and synthetic browser target; no institutional environment use. |

Lock order: standalone catalog write → exclusive singleton context → course row → fresh evidence → domain write plus audit. Existing active-term writers keep their shared-context order. A future offering/group writer must follow this contract; do not create it in A. Check actual writer inventory and nested/ambient transactions before implementation; a required material change returns to the owner, routine details do not.

## Approval record

- Owner instruction on 15 November: **“CRS-01A catalog inspection and specification”.** This authorizes the inspection/proposal and review sketches only.
- Implementation authorization: **Approved, 15 November 2026 (Asia/Dhaka).** Owner replied **“approved.”** after the review summary linked this specification and sketches, identified D-1–D-6 and highlighted live historical title correction and frozen used academic fields. This approves the unchanged catalog-only scope, six decisions, design, implementation and verification plan; delivery acceptance remains separate.
- Approved package: this plan, [specification](spec.md), all six decisions and [sketches](mockups/index.html), particularly live historical title correction versus frozen academic facts. Approval checkpoint: `50acb88`.
- Record the actual owner message/date/scope and commit the approved plan **before** implementing. A draft checkpoint is not approval. Approval of unchanged scope persists across handoffs.
- Material amendments: none; do not infer missing institutional classifications or a build exception from silence.

## Tasks — one checklist

- [x] T-01 — Inspect clean base, current handoff, requirements/source/code/installed Next guides; define bounded specification, permission/history/credit/lifecycle decisions and responsive sketches. Documentation checks are recorded in verification.
- [x] T-02 — Obtain actual D-1–D-6/scope/design approval; record it and commit approved plan before implementation. Owner approval recorded above; approval checkpoint precedes feature work.
- [x] T-03 — Implement pure rules, revision migration, injected evidence/transactions, capability and atomic audits; verify legacy preservation and both adapter migration/recovery paths. AC-01, AC-03–07.
- [x] T-04 — Implement global directory/create/detail/edit/history/lifecycle and narrowly necessary serialized status/assignment integrations. AC-01–05, AC-08–09.
- [x] T-05 — Run focused server/action/adapter/race/history regressions, required typecheck/lint/domain/default build; guarded synthetic production desktop/mobile/keyboard/axe and applicable CSV/A4 parity. Correct findings and record evidence/limits. AC-01–10.
- [ ] T-06 — Review/commit bounded delivery; give owner runnable synthetic inspection path; obtain actual acceptance (including any disclosed limitation), record it, then merge locally into `main`. Keep #7 open and leave CRS-01B/PERF-01 for an owner-started session.

## Verification and delivery strategy

Documentation now: relative links/anchors, source preservation, whitespace, one-checklist/template completeness, diff and rendered static sketches. No app/database preparation or code suites for documentation-only changes.

After approval: required `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`; add one focused catalog safety group for both PGlite/PostgreSQL and reuse the existing T-03 two-term-history group. Run relevant attendance, eligibility, SET-01A/context and room-assignment regressions because academic-field protection and lifecycle touch those contracts. Broaden only for changed behavior, failures or uncertainty. PostgreSQL races use separate connections, not a Promise-only simulation. Prove audit rollback, unsupported snapshot refusal and populated forward/recovery paths. Extend `scripts/verify-db-free.ts` before importing injected helpers in tests.

Use an explicit owned synthetic target before the first app/database import; do not import configured `src/db/index.ts` from an inspection script. The prior PGlite lifetime repair permits ordinary compiled Webpack review without the old shared-client preload; reuse its guarded launch/target protections. Default Turbopack CSS-worker failure remains an inherited limitation to attempt/report, not permission to change the bundler or pre-accept a failure. Capture 1440/390/320 workflows and native A4 as applicable. Provide the actual review URL/launcher only once implemented; sketches are not a runnable product.

No institutional migration or backup operation, reset, additional worktree/writer, remote push/PR/issue update. Migration `0017` remains unapplied institutionally and separate. Any eventual full-chain institutional migration needs its own authorization/backup/preflight. Last GitHub reconciliation: 11 November 2026; do not claim current remote freshness or close partial #7.

## Current checkpoint / exact handoff

- Branch `codex/crs-01a`, base `bc25757`; proposal `84311ab`, actual implementation approval `50acb88` precedes feature code. One writer/checkout; no worktree, institutional operation or remote request.
- T-01–T-05 complete. Implementation checkpoint `5161c28`; final evidence/helper checkpoint is the delivery commit containing this handoff. T-06 delivery acceptance remains pending. Both catalog adapter/migration/recovery/race groups and relevant historical regressions pass; typecheck/lint/domain and separate Webpack build pass. Default Turbopack remains failed (AC-10 partial).
- 16 November resume: owner said “go for the next task”. This requests progression but does not explicitly accept the remaining default-build limitation; do not fabricate acceptance. Final outstanding evidence/helper diff reviewed, 152 local file links resolve, receipt records 63 captures with zero overflow/violations/errors, representative desktop/mobile images inspected, browser helper syntax and typecheck pass. Prior application/adapter/build checks were not repeated. Before CRS-01B, the existing review recommends PERF-01 inspection/specification; no implementation scope is approved for it.
- Evidence and execution corrections: [verification.md](verification.md). Actual checkpoint hash/status come from Git. No application changes may be inferred from a document's clean-tree claim.
- Runnable synthetic owner review: `node node_modules/tsx/dist/cli.mjs scripts/review-courses.ts --serve`, then [control/sign-in](http://localhost:3127) / [Courses](http://localhost:3126/courses). The launcher owns a disposable PostgreSQL cluster; no old PGlite preload. See verification for exact build and `--check` paths.
- Next action: present the committed bounded delivery for owner inspection. Obtain actual acceptance, explicitly including the failed default build if it remains, record/commit acceptance, then merge into local `main`. Parent #7 remains open. No automatic CRS-01B/PERF-01, institutional migrations `0017`/`0018`, database operation or remote sync.

Next-session prompt: “Resume CRS-01A / #7 on codex/crs-01a, base bc25757. Read current brief/workflow and docs/specs/CRS-01A/{spec,plan,verification}.md. Inspect actual Git state and any outstanding final verification. Owner approved unchanged scope/design and D-1–D-6 on 15 November, committed as 50acb88 before implementation; do not ask to repeat that approval. Catalog create/edit/deactivate/reactivate/history is implemented, with used academic fields frozen, fresh title/lifecycle fingerprints, immutable captured labels and all-term blockers. Complete pending verification if any, then support owner inspection/acceptance; the default Turbopack CSS-worker failure remains distinct from the passing Webpack build and needs explicit delivery acceptance. After acceptance, record/commit it before a bounded local main merge. Keep parent #7 open. No next slice, academic versioning/reclassification, institutional operation, migration 0017/0018, extra worktree/writer, remote sync or separate build investigation.”
