# ROM-01A — Inspection and proposal verification

Updated: 27 October 2026, Asia/Dhaka. Sole checklist: [plan.md](plan.md).
Status: specification/plan/mockups **approved on 27 October 2026**; application implementation and acceptance criteria **pending**.

## Inspected baseline

- Clean local `main` was `8c34c0e`, after accepted BUG-24 merge `84964e2`. Created local `codex/rom-01a` in this checkout. No extra worktree or agent.
- Read AGENTS.md, project brief, workflow, local delivery plan, relevant requirements/architecture/institutional decisions, Summer room placements, seed and migration defaults, room schema/page/loaders/conflict/workbench/manual/automatic mutation seams, role guard and teacher editor/audit/result patterns. Findings and links are in [spec.md](spec.md#problem-and-inspected-baseline).
- Installed Next.js mutation and `revalidatePath` guides inspected. Their server authorization and post-commit refresh guidance informs the proposal; no Next.js application code changed.
- Room facts are source/code observations, not a census or verification of the institutional database. No app server or database command was run. No secrets/dumps/private student data are in the proposal; mockup records and counts are illustrative.

## Planning checks

- Passed: 14 changed/new planning text files checked; 205 local Markdown/HTML/stylesheet/capture references and 14 heading/fragment anchors resolve. Required spec/plan sections, pending approval and exactly one task checklist are present. `git diff --check` and explicit new-file trailing-whitespace checks pass.
- Passed: eight static HTML mockups rendered in headless Edge at 1440×1000, 390×844 and 320×800 (24 page/viewport combinations). No horizontal overflow, unlabelled form input/select/textarea, or page script error. Edit impact precedes Save in DOM order. First keyboard focus on the add screen is Skip to content at each width. These are static design checks, not full application accessibility or mutation tests.
- Captured: 14 full-page desktop/phone PNGs in [output/playwright/ROM-01A](../../../output/playwright/ROM-01A/). Machine observations: [render-review.json](../../../output/playwright/ROM-01A/render-review.json). The [review index](mockups/index.html) links each workflow and its captures. Visually inspected directory, add, edit/blocked impact, protected edit, detail/history and feedback layouts; mobile content wraps and assigned-use checks precede Save.
- Capture tooling: Playwright skill used. The optional CLI package was absent from offline cache; used the already-installed Playwright library and Edge for one-off static capture, without adding test specs/dependencies. Initial sandboxed browser launch failed; permitted unsandboxed static capture succeeded. This is unrelated to the inherited Next.js build defect. No app or database modules are imported by the capture/review scripts.
- Local review: a static, loopback-only preview at `http://127.0.0.1:3175/` serves only this proposal and its captures; it is not a Next.js/dev/database server. Verified HTTP 200 for the index, edit mockup, specification and phone capture from the desktop environment. Browser/spec tabs were queued through the app. If the temporary preview stops, open [mockups/index.html](mockups/index.html) directly in a browser; all files and CSS are local and network-independent.
- Diff review: changes are limited to the ROM-01A documentation/static mockups/captures and brief/delivery-plan pointers. AGENTS.md, application/source/schema/migrations, package files, Next.js configuration and historical issue verification are unchanged. No database was opened, no institutional migration/reset, no remote synchronization and no application suites run.

These checks do not establish passing feature criteria. The separate actual owner approval below satisfies T-03; T-04 remains the next task. Original proposal PNGs retain their review-time “Design proposal” banner as historical design evidence; application functionality is not implied by approval.

## Carried build evidence

[BUG-24 verification](../BUG-24/verification.md) records passed typecheck/lint/domain/UX harness, all 17 safety groups including PostgreSQL, and Webpack production build. The default Turbopack production build failed with the CSS-worker IPC failure. Its acceptance exception was disclosed and accepted; the defect remains unresolved. No successful suite was rerun for this planning handoff, and no bundler/runtime/build policy changed.

## Implementation and acceptance

AC-01–AC-12: pending implementation, verification and owner inspection. No migration or application functionality delivered. The owner replied **“approve.”** on 27 October 2026 after the specification, checklist and desktop/mobile mockups (including D-1–D-6) were presented. Approval is recorded in [plan.md](plan.md#approval-record) and the local checkpoint `docs(ROM-01A): approve room-directory specification and mockups (#5)` before application changes. No amendments; no repeated code/build/safety/browser suites for the approval-only update. Parent #5 remains open; no GitHub activity or local merge performed for this planning delivery.

Approval checkpoint checks: 14 planning text files, 206 local links and 15 anchors pass; actual owner wording and approved boundaries are present, one checklist remains, and `git diff --check` passes. Application/source/schema/dependency/build files remain unchanged. Prior static render evidence is reused because the mockup files did not change during approval recording.
