# CRS-01A — Inspection, verification and review

Specification: [spec.md](spec.md). Sole checklist/status/approval/handoff: [plan.md](plan.md).
Environment/date: Windows/PowerShell, local repository, 15 November 2026 (Asia/Dhaka).
Verified revision: documentation proposal based on clean `bc25757`; feature implementation does not exist yet.

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

## Acceptance evidence

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

- Planning package only; implementation approval and delivery acceptance remain pending in the plan.
- No local merge or remote sync. Parent #7 stays open; no next part automatically started.
