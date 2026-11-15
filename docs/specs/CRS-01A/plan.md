# CRS-01A — Implementation plan and sole checklist

Parent: CRS-01 / #7. Specification: [spec.md](spec.md). Evidence: [verification.md](verification.md). Sketches: [mockups/index.html](mockups/index.html).
Status: **Owner approved; implementation in progress.**
Branch / base: `codex/crs-01a` / `bc2575785e39ceab0e65c01bd3335b3465283128`.
Updated: 15 November 2026, Asia/Dhaka.

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
- Proposed approval package: this plan, [specification](spec.md), all six decisions and [sketches](mockups/index.html), particularly live historical title correction versus frozen academic facts.
- Record the actual owner message/date/scope and commit the approved plan **before** implementing. A draft checkpoint is not approval. Approval of unchanged scope persists across handoffs.
- Material amendments: none; do not infer missing institutional classifications or a build exception from silence.

## Tasks — one checklist

- [x] T-01 — Inspect clean base, current handoff, requirements/source/code/installed Next guides; define bounded specification, permission/history/credit/lifecycle decisions and responsive sketches. Documentation checks are recorded in verification.
- [x] T-02 — Obtain actual D-1–D-6/scope/design approval; record it and commit approved plan before implementation. Owner approval recorded above; approval checkpoint precedes feature work.
- [ ] T-03 — Implement pure rules, revision migration, injected evidence/transactions, capability and atomic audits; verify legacy preservation and both adapter migration/recovery paths. AC-01, AC-03–07.
- [ ] T-04 — Implement global directory/create/detail/edit/history/lifecycle and narrowly necessary serialized status/assignment integrations. AC-01–05, AC-08–09.
- [ ] T-05 — Run focused server/action/adapter/race/history regressions, required typecheck/lint/domain/default build; guarded synthetic production desktop/mobile/keyboard/axe and applicable CSV/A4 parity. Correct findings and record evidence/limits. AC-01–10.
- [ ] T-06 — Review/commit bounded delivery; give owner runnable synthetic inspection path; obtain actual acceptance (including any disclosed limitation), record it, then merge locally into `main`. Keep #7 open and leave CRS-01B/PERF-01 for an owner-started session.

## Verification and delivery strategy

Documentation now: relative links/anchors, source preservation, whitespace, one-checklist/template completeness, diff and rendered static sketches. No app/database preparation or code suites for documentation-only changes.

After approval: required `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`; add one focused catalog safety group for both PGlite/PostgreSQL and reuse the existing T-03 two-term-history group. Run relevant attendance, eligibility, SET-01A/context and room-assignment regressions because academic-field protection and lifecycle touch those contracts. Broaden only for changed behavior, failures or uncertainty. PostgreSQL races use separate connections, not a Promise-only simulation. Prove audit rollback, unsupported snapshot refusal and populated forward/recovery paths. Extend `scripts/verify-db-free.ts` before importing injected helpers in tests.

Use an explicit owned synthetic target before the first app/database import; do not import configured `src/db/index.ts` from an inspection script. The prior PGlite lifetime repair permits ordinary compiled Webpack review without the old shared-client preload; reuse its guarded launch/target protections. Default Turbopack CSS-worker failure remains an inherited limitation to attempt/report, not permission to change the bundler or pre-accept a failure. Capture 1440/390/320 workflows and native A4 as applicable. Provide the actual review URL/launcher only once implemented; sketches are not a runnable product.

No institutional migration or backup operation, reset, additional worktree/writer, remote push/PR/issue update. Migration `0017` remains unapplied institutionally and separate. Any eventual full-chain institutional migration needs its own authorization/backup/preflight. Last GitHub reconciliation: 11 November 2026; do not claim current remote freshness or close partial #7.

## Current checkpoint / exact handoff

- Inspection started from clean `main` at `bc25757`; accepted BUG-PGLITE-LIFETIME is in its ancestry. Current branch is `codex/crs-01a`.
- T-01 and T-02 are complete. Owner approved the unchanged package on 15 November; T-03 implementation is next after committing this approval record. No institutional operation or remote request is authorized.
- Evidence: [verification.md](verification.md). Actual checkpoint hash comes from Git; inspect status/log on resume instead of treating a document as a clean-tree assertion.
- Next action: implement T-03–T-05 after committing approval, then present T-06 delivery for owner inspection/acceptance. Return material amendments for a decision.

Next-session prompt: “Resume CRS-01A / #7 on codex/crs-01a, base bc25757. Read current brief/workflow and docs/specs/CRS-01A/{spec,plan,verification}.md plus static sketches. Inspect actual Git state. The 15 November owner instruction authorized inspection/specification only; check for actual subsequent D-1–D-6 approval and commit it before feature code. Proposed scope: global catalog create/edit/deactivate/reactivate/history; academic credits distinct from workload; used academic fields/code frozen; acknowledged title correction changes live old-term views but never captured publication/claim labels; unresolved teaching use blocks deactivation. No deletion, offering/group wizard, academic versioning or reclassification. Reuse T-01 evidence, keep one checklist/writer/checkout and preserve institutional storage. After implementation verify both adapters/races/history, required checks and synthetic desktop/mobile/A4, disclose default Turbopack status separately from Webpack preview, obtain acceptance before local merge. No remote sync, migration 0017, automatic CRS-01B or separate build investigation.”
