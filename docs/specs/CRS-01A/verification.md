# CRS-01A — Inspection, verification and review

Specification: [spec.md](spec.md). Sole checklist/status/approval/handoff: [plan.md](plan.md).
Environment/date: Windows/PowerShell, local repository, 15 November 2026 (Asia/Dhaka).
Implementation base: clean `bc25757`; proposal `84311ab`, actual approval `50acb88` precedes feature code. Implementation checkpoint: `5161c28`; final delivery/evidence revision is recorded in Git and the plan. Inspection-only evidence below is retained as history.

## Inspection evidence

- Static reads: current handoff/workflow/local sequence, selected requirements/glossary/decision/architecture/source sections, course page/schema/data/serializer, source parser/seed, auth/guards/audit patterns, attendance/workload/assignment and context-lock seams. No GitHub read was necessary; 11 November reconciliation is the last remote evidence.
- Installed Next `16.3.4` guides consulted under `node_modules/next/dist/docs/01-app/`: `01-getting-started/07-mutating-data.md`, `02-guides/forms.md`, `02-guides/server-actions.md`. Action authorization remains server-side; `useActionState` supports input feedback/pending; client dispatch ordering is not cross-browser serialization; revalidate before redirect. No framework code was written.
- Database-free source parser executed with `node --import tsx` on stdin, requiring only `src/lib/source-routine.ts` and reading the checked-in transcription. Result: 78 courses; 47 theory / 29 sessional / two thesis; academic credits 1/2/3/4; both CSE-4000 suffixes preserved; all parsed codes match the proposed shape. CSE-3100/CSE-3200/Industrial Training still parse as theory; no correction was made. This is source/parser evidence only, not a database census or academic sign-off.
- Mutation search found course/offering/group insertion only in seed and disposable safety fixtures, not a portal offering creator. Existing interactive meeting writers remain relevant to lifecycle/title serialization.
- Local branch creation needed a sandbox escalation because `.git` is read-only in the default sandbox; the same local `git switch -c codex/crs-01a` succeeded after review. No remote operation.

## Documentation checks

| Check | Result / evidence |
| --- | --- |
| Local links/anchors | Passed: 305 local references across 13 Markdown/HTML files, including the two updated entry pointers; all targets and anchors exist. Rechecked after the final evidence links were added. |
| Structure/scope | Six tasks in the sole plan; ten AC rows in the spec; actual instruction distinguished from pending implementation approval. No source/schema/seed/dependency or institutional files changed. Only two current-work pointers, issue docs/mockups and static review artifacts are included. |
| Static rendering | Eight pages at 1440, 390 and 320 pixels: 24 full-page Edge captures. No page-wide overflow; one main/h1 per page. [Measurement receipt](../../../output/playwright/CRS-01A/static-review.json), [capture index](mockups/index.html#main). |
| Visual review | Representative capture of every page inspected: catalog/detail/lifecycle/index at 1440, edit/history at 390, add/states at 320. Readable wrapped forms/cards and distinct notices; no clipped content found. The review navigation scrolls within its own strip on phones. |
| Whitespace/diff | `git diff --check` and `git diff --cached --check` passed. Final staged scope reviewed: 39 files, restricted to two entry pointers, issue docs/static sketches and 24 captures plus their receipt. |
| Source preservation | Existing source transcription, parser, application, schema, seeds, dependency manifests and migration files remain unchanged. Parser observations are evidence only. |

Rendering-tool limits/corrections: `npx --offline --package @playwright/cli playwright-cli --version` could not find a cached CLI package (ENOTCACHED); no package was installed. Used the repository's installed Playwright/Edge CLI for an initial capture, then its `playwright` library in a temporary static-only capture/measurement helper for the complete matrix. Default-sandbox Edge exited during startup; reviewed escalation succeeded. No application test specs were added, and no app route was opened. Final artifacts are linked above; ignored `.tmp` helpers are not delivery source.

## Original planning acceptance status

| Criteria | Result | Evidence / pending work |
| --- | --- | --- |
| AC-01–10 | Pending | Specification only. No application implementation, permission/integration/domain/build/production UI/print/recovery checks have been run for CRS-01A. |

Required application commands are intentionally deferred for documentation-only work. Rendered HTML sketches are illustrative, not evidence that real server actions or product accessibility pass. No institutional directory/client, environment secrets, migration, reset, `dev`, `start`, `db:prepare` or backup operation was accessed/executed. Existing `0017` institutional application remains separate. Prior default Turbopack failure is carried history, not a fresh CRS-01A build result.

## Review findings and boundaries

| Finding | Proposed disposition |
| --- | --- |
| Global catalog labelled as active-term; missing lifecycle state; coverage count presented as course groups | Separate global catalog from term report and serialize status; remove misleading catalog Groups count. |
| Academic edits can affect marks, scope, room rules and historic working facts | Freeze code/academic/ownership/room fields on any recorded use; no versioning in A. |
| Title corrections can relabel old live reports | Explicit owner decision D-2 and fresh impact acknowledgement; captured publications/claims remain unchanged. |
| Imported project/type/owner/capability choices are unverified facts | Preserve them; no parser-driven reclassification or source correction. |
| All-term evidence can be costly | Query relational references by course ID; inspect saved snapshot evidence as needed. No broad loader/performance rewrite. PERF-01 remains before CRS-01B as proposed in the existing review. |

## Delivery and acceptance

- Planning package was approved by the owner on 15 November; approval checkpoint `50acb88` precedes implementation. Delivery acceptance remains separate in the plan.
- No local merge or remote sync. Parent #7 stays open; no next part automatically started.

## Implementation verification — 15 November 2026

The implementation adds independent global catalog loaders and editor-only impact/history, pure validation/snapshot evidence, standalone exclusive-context transactions, stable-ID/revision protection and atomic course audits. Migration `0018` adds positive revision and a nonunique canonical lookup index; imported facts and normalized duplicate IDs remain intact. All manual/automatic assignment paths share the authoritative active-course check. No offering/group creation or academic versioning was added.

| Criteria | Result and evidence |
| --- | --- |
| AC-01 | Real action/loader allow-deny matrix on PGlite and PostgreSQL: global/CSE administrators allowed; coordinator/teacher/viewer/anonymous/revoked and other-department-only actors denied. View-only detail omits impact/history; direct editor/history loads refuse access. |
| AC-02 | Independent directory works with zero and ambiguous active terms; creates no offering/group. Real report rendering also keeps the catalog available when the term changes or disappears between the directory read and report load. Search/status/detail and separate completeness exercised over real HTTP; published-version print heading corrected during visual review. |
| AC-03 | Domain boundaries and persisted malformed/repeated/file/canonical duplicate/alias/legacy cases pass; CSE-4000(A/B), explicit unknown owner, independent semester and academic credits covered. Unchanged unsupported fields permit title correction. |
| AC-04–05 | Both adapters cover relational/all-term, metadata-only and unsupported snapshot use, frozen academic fields, fresh title fingerprints, status blockers and retained historical references. Inactive course remains serialized; shared assignment guard and real manual/automatic actions refuse it. |
| AC-06 | Stale/no-op/failed operations and audit rollback pass. Independent PostgreSQL transactions observe lock waiting for competing edits, duplicate create/rename, reference-vs-academic changes and snapshot-capture-vs-title corrections in both commit orders. |
| AC-07 | Actual populated `0009`→`0018` and `0017`→`0018` paths pass on both adapters, including unsupported snapshots/legacy values/duplicates, repeat migration and BUG-25 refusal. Cold PGlite and encrypted PostgreSQL separate-target restores have identical full schema/row/sequence fingerprints. Import-boundary guard passes. |
| AC-08 | Catalog action/browser fingerprints preserve attendance, workload allocations, claim labels, saved versions and unrelated rows. T-03 two-term history and focused attendance/eligibility/SET-01A/room groups pass. Archived CSV bytes are identical; four official plus two teacher A4 pages have identical text and rendered pixels before/after. |
| AC-09 | Final production run: 63 captures at 1440/390/320, including maximum-length title form/detail/catalog states, zero page overflow/axe violations/page errors, keyboard focus traversal passes. Create/edit/pending/error/stale/title-impact/lifecycle/history/filter/no-term/viewer/denied states exercised. The final presentation/header/long-title corrections pass; representative images were visually inspected. |
| AC-10 | Typecheck, lint and complete domain suite pass; focused checks pass on both adapters. Default Turbopack build **fails**, including outside sandbox, at CSS-worker startup. Separate final Webpack build passes on implementation `5161c28`; final runtime checks pass. **Partial; explicit owner acceptance of this remaining limitation is required before local merge.** |

Permanent checks: `scripts/verify-course-records.ts`; `scripts/safety/course.check.ts`, `course-races.ts`, `children/course-scenarios.ts`; `scripts/verify-safety.ts CRS-01A`. Relevant existing groups run: `BUG-ATT-MARKS`, `BUG-LOAD-BASIS`, `SET-01A`, `ROM-01A` (both adapters) and `T-03` (its PGlite history group). PostgreSQL 17.11 client tools: `F:/AI/tools/pgsql-17.11/pgsql/bin`. Full safety/browser suites were not repeated.

### Execution corrections and limits

- Initial typecheck found the new capability missing from the access-summary label map; fixed. Initial role-matrix test assumed EEE-only actors could open the CSE portal; corrected to assert its actual viewing denial. These were not passing runs.
- Sandbox PostgreSQL attempts returned loopback `EACCES`; passing groups ran outside sandbox against harness-owned `safe01_*` clusters. PGlite passes did not need network access. Default institutional directory metadata stayed unchanged in completed safety runs; it was never opened, queried or migrated. No institutional row census is claimed.
- Older migration tests rewind their journal while retaining later columns. Their initial SET-01A/ROM-01A runs failed on the retained course revision. `0018` now safely replays the additive column/index/constraint, following existing term/cohort migration patterns; both affected groups and final catalog migration/recovery checks pass. No imported data correction was made.
- Windows `npm run build -- --webpack` dropped its forwarded flag and actually ran Turbopack, which failed. It is recorded as another default-build failure. The separate successful Webpack command pins `npm_lifecycle_event=build` and invokes `node node_modules/next/dist/bin/next build --webpack` directly; build database access stays memory-only. No bundler configuration or dependency change.
- Visual review corrected technical usage labels, long-title wrapping, history event labels and a catalog print header that had incorrectly claimed no published routine. The follow-up maximum-title browser test found an overflowing preview notice; its failed run was not counted as passing and cleaned up its owned preview. Wrapping was corrected for the form notice and all catalog cells. The corrected compiled result passes all 63 captures. A final review also added the term-switch report guard; its real render paths are covered by the catalog safety child.
- Initial PDF extraction referenced an unavailable Poppler text binary; its optimistic shell output was discarded. Actual `pypdf` extraction and complete Poppler page rendering prove archived before/after text/pixel parity. Existing official-template vertical break-label overlap is unchanged baseline output and is not repaired by this catalog slice; teacher sheets retain their existing captured-workload explanation. No print redesign was authorized.
- Browser fixture is synthetic PostgreSQL with real compiled Next actions/loaders/authentication; no provider requests or DB injection. This is local review evidence, not hosted production/OAuth certification. Configured institutional storage, migrations `0017`/`0018`, backup operations, remote sync and next-slice implementation remain separate.

### Review artifacts and runnable path

[Runtime capture/check receipt](../../../output/playwright/CRS-01A/runtime/review.json), [A4 comparison receipt](../../../output/playwright/CRS-01A/runtime/print-review.json), [desktop catalog](../../../output/playwright/CRS-01A/runtime/catalog-1440.png), [narrow add form](../../../output/playwright/CRS-01A/runtime/add-320.png), [mobile title impact](../../../output/playwright/CRS-01A/runtime/title-impact-390.png), [history](../../../output/playwright/CRS-01A/runtime/history-390.png), [catalog A4](../../../output/playwright/CRS-01A/runtime/catalog-after.pdf).

Launcher: `node node_modules/tsx/dist/cli.mjs scripts/review-courses.ts --serve`; control/sign-in [http://localhost:3127](http://localhost:3127), application [http://localhost:3126/courses](http://localhost:3126/courses). Launch only after the documented production build and with PostgreSQL tools available. `--check --serve` runs the guarded browser matrix before retaining owner review. Restarting creates a fresh synthetic fixture; the prior preview's owned server was verified by port/PID/command before stopping and its launcher cleaned up. Do not run institutional `dev`, `start`, `db:*` or the old PGlite preload for review.

Final browser evidence is for implementation `5161c28`. The review-only launcher now serves UTF-8 explicitly and captures reset scroll position so sticky navigation is shown at the top in full-page images. These helper-only changes do not change application behavior. The inherited official break-label overlap remains disclosed; changed catalog A4 output is reviewed separately.

16 November handoff review: outstanding evidence/helper changes inspected; 152 local file links across the four changed handoff documents resolve. Receipt confirms 63 captures, zero overflow/accessibility violations/page errors. Desktop catalog and 320px add form visually reinspected; browser helper `node --check`, `git diff --check` and `node node_modules/typescript/bin/tsc --noEmit` pass. Application/adapter/build suites were not repeated. Previous preview was stopped; synthetic launcher restarted and control page HTTP 200/title verified outside the sandbox's loopback restriction. Delivery acceptance, including the default-build limitation, remains pending.
