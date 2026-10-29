# ROM-01B — Implementation verification and inspection

Updated: 29 October 2026, Asia/Dhaka. Sole checklist: [plan.md](plan.md).
Status: **Accepted and merged locally on 29 October 2026 at `850f42a`.**

## Implemented and verified — 29 October 2026

Implementation checkpoint `3002bb2` and verified correction/evidence commit **`25e75d0`** implement unchanged D-1–D-6. Approval `b713996` preceded feature code. T-01–T-08 are complete; actual owner acceptance/local-main merge (T-09) remain pending. Parent #5 stays open. No institutional database was opened, prepared, migrated or reset; no remote activity, worktree, extra writer or ROM-01C implementation.

### Acceptance evidence

| Criteria | Result and evidence |
| --- | --- |
| AC-01 | Passed real action/read permission matrices on PGlite and PostgreSQL: qualifying global/CSE roles, other-department scopes, expired/future grants, anonymous and malformed requests. Production browser viewer occupancy/editor-denial flow also passes. |
| AC-02/03 | Passed pure inclusive Dhaka-midnight/date/weekday/leap/effective-bound/ambiguous-OD rules and both-adapter all-term future, cancelled, historical and partial-OD cases. Future terms count without active status. |
| AC-04 | Passed malformed/duplicate/File fields, required reasons, stale/no-op/missing results and atomic status/delete/retention rollback under injected audit failure. Browser preserves blocked/stale reasons, validates fields and shows pending feedback/history. |
| AC-05 | Populated 0010 → 0011 on both adapters: every existing room retained, all original room fields and other business/snapshot/audit fingerprints preserved; imports default retained. Cold PGlite and encrypted PostgreSQL pre-upgrade restoration recover the exact complete fingerprints on separate owned targets. |
| AC-06 | Passed new-draft deletion, typed-code/revision, retained/protected identity rules, all-status references, prior-code structured snapshots, unknown shapes, audit preservation, missing repeat and new-ID code reuse. Unknown snapshot shapes fail closed; no substring code matching. |
| AC-07/08 | Passed real PostgreSQL production create/update/recomputed-auto/OD actions versus lifecycle/delete in both commit orders, plus shared single/bulk move lock barriers. Inactive/missing choices refuse; failed batches retain no partial writes. Real bulk period-action refusal rolls back patterns, hours and placements. UI retains inactive selected rooms, requires remediation and excludes them from OD choices. |
| AC-09/10 | Passed an independent minute-set interval oracle, overlaps/adjacency, canonical deduplication, stream-specific breaks before union, batch exclusion, outside/common totals, unknown counts, partial OD, exact maximal gaps and duration/day/capability/seat/inactivity filters. Directory, agenda, gaps and print use one projection. |
| AC-11 | Passed 17 recorded production-browser page/viewport checks at desktop, 390 px and 320 px with zero page-wide overflow, automated WCAG A/AA violations or page script errors. Native A4 print stress fixture: all seven rendered pages inspected, repeated room/term/full Dhaka timestamp/filter basis and counters, no overlapping header or clipped event rows. Public screen/official/print text and CSV hashes match before/after lifecycle changes. |
| AC-12 | Typecheck, lint, domain and final default Turbopack production build pass. All 21 safety groups pass, PostgreSQL included. The interrupted full run was resumed by group prefix, preserving completed evidence; final lifecycle refinements were rechecked on both adapters. Actual acceptance/local merge remain pending. |

[Implemented capture gallery](../../../output/playwright/ROM-01B/implementation/index.html), [browser observations and publication hashes](../../../output/playwright/ROM-01B/implementation/review.json), [21-group results](../../../output/playwright/ROM-01B/implementation/safety-results.json), [A4 PDF](../../../output/playwright/ROM-01B/implementation/weekly-occupancy.pdf), [print checks](../../../output/playwright/ROM-01B/implementation/print-review.json). Automated accessibility checks are bounded evidence, not a full accessibility certification. The seven-page PDF deliberately stresses alerts, overlapping classes and continued pages with synthetic records.

### Writer and date inventory

| Path | Guarded contract |
| --- | --- |
| Manual class create/update | Meeting first for updates; sorted stored/new room union, authoritative active/fit checks and first-assignment retention in the same audited transaction. Existing room roles survive explicit edits. |
| Automatic application | Lock the entire room union and validate every suggestion before retaining drafts/inserting any class. Whole batch rolls back on failure. |
| OD insertion | Fresh existence/activity under room lock, atomic first-use retention; stale choice returns plain feedback and entered values are kept. |
| Drag, keyboard and undo | Shared move action locks affected meetings, reads current assignments and locks sorted rooms before activity checks/writes. |
| Period/day-plan bulk moves | All meeting locks ascending before the complete sorted room union; any missing/inactive room refuses the entire grid/placement transaction. |
| Reference removals | Existing meeting/OD deletion uses the established meeting/reference-before-room order and never restores draft eligibility. |
| Date-bound/source paths | No exposed term-date or meeting-effective-date editor exists in the inspected application paths. Seed, migration and isolated review writers are outside institutional operation scope; imports default retained. No new date writer added. |

### Check execution and corrected findings

- `npm run typecheck`, `npm run lint`, `npm run test:domain`: pass on the final authored code; the domain script includes the new room lifecycle/occupancy checks. `git diff --check` and local documentation/artifact references pass.
- Default `next build` with the normal npm build lifecycle flag and pinned synthetic environment: final two reviewed builds pass (exit 0). Earlier attempts hit the inherited CSS-worker IPC failure inside and outside the sandbox; no claim is made that its root cause was repaired. A separately labelled Webpack build also passed earlier. No bundler, dependency, runtime or build-script policy changed; ROM-01B needs no build exception for the passing final default result.
- `test:safety`: all 21 named groups pass across the preserved initial run and resumed prefix runs, with PostgreSQL 17.11. Final checks use only owned synthetic databases and completed runs report the protected directory metadata unchanged. Detailed raw logs stay ignored under `.tmp/rom01b-*`; the tracked result index records each group and phase.
- Browser verification used the installed Playwright library/headless Edge and the actual default-build production server on owned PostgreSQL. The CLI package was unavailable, so no dependency was added. The guarded UX harness target rules also pass. A broader unrelated source-fixture UX suite is not claimed; the implemented room, OD, inactive-class, permission, publication-parity and native-print flows are explicitly recorded in the linked observations.
- Review corrected expired malformed-weekday handling, stricter supported snapshot shapes, stale evidence refresh, OD row contrast, full dated Dhaka stamps, compact expandable screen alerts and repeated native print context. A fixed-position print header overlapped content and missed the last page; it was replaced by a repeated table header and all seven final pages were re-rendered and checked with browser header/footer injection disabled.
- Intermediate tooling limitations are preserved honestly: a direct-build wrapper initially omitted the build flag and shared only the disposable review target across workers; it was corrected to use the repository's existing in-memory build behavior and the fixture was rebuilt. Direct production PGlite showed its existing multi-instance stale-read limitation, and development Webpack compilation stalled; final browser evidence uses owned PostgreSQL. No institutional target was involved. Poppler rendered the PDF and bundled Python extracted/checked every page.

### Owner inspection and boundary

A fresh synthetic PostgreSQL review is served locally on `http://localhost:3102/rooms` with a private loopback sign-in/capture helper. The private link is kept only in ignored `.tmp/rom01b-owner-review.json`, not Git. Local-only helper processes/files are not application code or a portable installed workflow. On this checkout they can be restarted with `node node_modules/tsx/dist/cli.mjs .tmp/rom01b-pg-review.ts --serve` and `node .tmp/rom01b-owner-preview.cjs`; the parent validates/owns the disposable cluster and its watchdog stops it with the owner process. Do not run ordinary dev/start/database preparation against configured institutional storage for this review.

Inspect directory filters; DEMO-BLOCK's all-term paged refusal; a never-assigned draft's lifecycle/deletion; DEMO-WEEK's totals, gaps, alerts and print; DEMO-PARTIAL's uncertainty; and existing inactive class remediation. Keep parent #5 open and retain the institutional database and publications. Obtain actual owner acceptance before local-main merge. ROM-01C requires a separate owner-started specification session.

## Inspected baseline

ROM-01A was explicitly accepted with its disclosed default-build failure and merged locally at `2b363cb`, preserving acceptance `44753cb`, implementation `e996e39` and correction `a38f2f3`. Local merge handoff `3c4e7cc` is the ROM-01B branch base. No merge conflicts or application changes; passing recorded ROM-01A suites were reused. Focused final room source/capture review found no new actionable blocker.

Inspected room schema/references/revisions/audits, term/meeting date bounds, OD partial records, active-term loader/serializer/snapshot shapes, existing manual/OD/automatic transaction and lock seams, workbench pickers, grid/break/window projection, room-card utilization and accepted protected-source/access rules. [Specification](spec.md) distinguishes observed behavior from proposed decisions. No institutional database was opened, prepared, reset, migrated or freshly counted. Last remote reconciliation remains 26 October 2026; no GitHub/push/PR operation.

## Planning checks at proposal checkpoint 19509b0

- Passed local Markdown/HTML references and heading/fragment anchors, required spec/plan sections, explicit pending approval and exactly one nine-task checklist. **16 text files, 258 local references and 19 anchors resolve**, including the capture index. `git diff --check` passes, including new-file whitespace checks.
- Passed **15 page/viewport combinations**: five static sketches at 1440×1000, 390×844 and 320×800. No page-wide horizontal overflow, unlabelled control, missing/duplicate primary heading, page script error or automated WCAG A/AA violation. First keyboard focus is Skip to content in each combination. These are static checks, not a full application accessibility certification.
- Captured 11 desktop/phone/narrow screenshots and reviewed lifecycle desktop and occupancy phone layouts; the initial focus-check overlay was removed from delivery captures without removing keyboard focus behavior. [Capture index](../../../output/playwright/ROM-01B/index.html), [machine observations](../../../output/playwright/ROM-01B/render-review.json).
- A4 occupancy print: corrected a stranded heading and excessive page breaks; final two-page output has repeated room/term/context and page counts. Rendered both final pages with Poppler and visually checked legibility, gaps/totals, complete rows and uncertainty labels. [Print review](../../../output/playwright/ROM-01B/print-review.json). The mockup combines five empty weekdays for compact illustration; implementation must list all seven separately as specified.
- Tooling: Playwright skill applied; `npx` exists but offline `@playwright/cli` is not cached. Used the already-installed Playwright library and headless Edge without adding dependencies or tests. Sandbox launch failed; permitted unsandboxed static rendering succeeded. PDF skill used for read/render/print QA. No app/database imports in these helpers; helpers remain ignored under `.tmp`.
- Review via static loopback preview at `http://127.0.0.1:3178/`, limited to this proposal and its captures. This is not a Next.js/application/database server. Host Edge returned HTTP 200 for the final index at desktop/390px/320px and capture gallery, with no overflow; an outside-mount path returns 404. The initial sandbox-bound preview was unreachable from the host browser, so the static server was restarted on host loopback; final checks pass. If stopped, open [mockups/index.html](mockups/index.html) locally; its assets are self-contained.
- Diff scope is documentation, static mockups and synthetic captures only. No application/schema/dependency/build-policy change, institutional database operation or remote activity. No repeated application/domain/build/safety suite for documentation changes. All AC-01–AC-12 remain pending approved implementation and validation.

## Carried limitation and proposal handoff (historical)

The default Turbopack production build remains failed in the CSS-worker IPC path. ROM-01A's separately labelled Webpack build and passing domain/adapter/browser checks remain historical evidence. No dependency/runtime/bundler/build-script policy was changed. ROM-01A acceptance includes its own delivery exception, not automatic ROM-01B acceptance.

The owner must review D-1–D-6, especially deletion eligibility for existing rooms, all-term today-inclusive deactivation and the common weekly-window basis. At proposal checkpoint `19509b0`, ROM-01B approval was pending; the actual approval below supersedes that state. Commit any eventual approved plan before feature code; retain #5 open. ROM-01C, institutional rollout and remote synchronization remain outside this planning delivery.

## Actual owner approval — 28 October 2026

The owner replied **“approved.”** to the concrete specification, sole checklist and responsive/print sketches, including the explicit request to approve D-1–D-6 before implementation. All six decisions are approved without amendments; no new institutional facts or build exception granted. Proposal checkpoint `19509b0` is preserved; commit this approval record before any feature implementation. Historical sketch banners retain “Approval pending” as review-time artifacts, not the current authorization state. Actual implementation acceptance/local merge remain pending. Approval-only changes use documentation checks and reuse unchanged static evidence.

Approval checkpoint **`b713996`** is committed before application/schema/test changes. Final approval-record checks pass: 16 text files, 258 local references, 19 anchors, the sole nine-task checklist with T-01–T-03 complete, unchanged D-1–D-6 and `git diff --check`. Implementation remains the next session's T-04; no application/database commands or repeat suites were run for this approval-only handoff.

## Actual owner acceptance — 29 October 2026

The owner replied **“accept and merge. And go for the next task.”** after the delivered review. ROM-01B is accepted with its passing final default build and recorded checks. The bounded local-main merge is authorized; parent #5 remains open. The follow-on authorization is ROM-01C inspection/specification, with implementation still requiring its own approved plan. No institutional migration/rollout, push, PR or GitHub update is included.

Local merge receipt: acceptance `57471b3`, merge **`850f42a`**, no conflicts or additional application changes. Passing evidence is reused; no unnecessary database/code suite was rerun for this documentation/Git operation. Parent #5 remains open.
