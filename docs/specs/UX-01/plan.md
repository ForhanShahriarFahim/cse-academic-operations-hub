# UX-01 — Implementation plan

Issue: [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)
Specification: [spec.md](spec.md)
Verification: [verification.md](verification.md)
Status: Approved — implementation in progress
Branch / base: `codex/ux-01` from `main` at `2d3ca21`
Updated: 30 September 2026, Asia/Dhaka

## Inspection and proposed approach

**Code seams.**

| Area | Where it lives today |
|---|---|
| Portal shell | `src/app/(portal)/layout.tsx` (server; fixed aside and main margin) and `src/components/nav.tsx` (client; flat item list with capability filter) |
| Shared UI | `src/components/ui.tsx` (`PageHeader` with kicker, `Badge`, `StatCard`, `Panel`, `EmptyNote`) |
| Tokens and print rules | `src/app/globals.css` (Tailwind v4 `@theme` tokens) |
| Pages | Mostly server components with Tailwind classes and inline hex colours; client managers in `src/components/*-manager.tsx` |
| Destructive actions | Seven `confirm()` calls across five client components |

**Approach.**
- Work in layers so every page benefits before any page-specific change:
  1. tokens and base styles;
  2. the shell;
  3. shared components;
  4. route states;
  5. mechanical application (table wrappers, dialog, header copy);
  6. reference screens (Dashboard, Workload, Teachers);
  7. print;
  8. the automated check.
- Keep existing component names where possible (`PageHeader`, `Panel`, `Badge`) and change their internals, so page diffs stay small. `Badge` becomes a thin wrapper over the new status text/tag.
- Drawer: a small client component using `inert` on the page behind, focus return and Esc. No new UI dependency; `lucide-react` icons are already installed.
- Confirmation: one `ConfirmDialog` client component on native `<dialog>`, plus a `useConfirm()` helper so each of the seven call sites changes by a few lines. Server actions and their results are unchanged.
- Review harness: `scripts/ux-review.ts`.
  - It builds a disposable PGlite database under `.tmp/ux-review/` from the committed source fixture (the existing seed pointed at that directory). With `--from-copy <dir>` it copies an existing database instead.
  - It then seeds a synthetic reviewer session with generated test secrets stored in `.tmp/ux-review/`, and starts `next dev` on port 3100 with those variables.
  - Guards: it refuses when `DATABASE_URL` is set, when the target resolves outside `.tmp/`, or when the source is the active dev server's directory while the server is running.
- UX check: a separate `playwright.ux.config.ts` with **no `webServer`** (so it can never start `npm run dev` on institutional data) and `tests/ux/baseline.spec.ts` against port 3100. It covers overflow at 360/390/768, axe AA rules, skip link and drawer keyboard flow. If the harness is not running, the check fails with a clear message instead of starting a server.
- Before editing Next.js files (`loading.tsx`, `error.tsx`, `not-found.tsx`, layouts), read the installed guides in `node_modules/next/dist/docs/` per AGENTS.md.
- **Migration and recovery:** none. There are no schema or data changes.

**Tradeoffs.**
- Fonts keep loading from Google Fonts (the existing intentional choice). Moving to `next/font` is a separate, optional improvement.
- The Routine builder grid keeps its own structure. Only its header, shell and print chrome change here, because a grid redesign is a larger workflow change.

## Approval record

- Owner authorization: Approved by the owner (Forhan Shahriar Fahim).
- Date and evidence: 30 September 2026, in the Claude Code session. After reviewing the spec, plan and mockups, the owner answered the three decisions ("1. yes 2. Ok select according to your recommendation 3. Ok do it.") and wrote "Approved."
- Approved scope: [spec.md](spec.md) as of this commit, with these decisions:
  - D1: #30 is folded into UX-01; the dashboard redesign fixes it and it closes with UX-01.
  - D2: navigation groups Routine / Planning records / Classes / Administration, and "External / OD" is renamed "External commitments".
  - D3: commit the disposable review harness `npm run ux:review` with its synthetic reviewer session and guards.
- Material amendments: [amendment A — Routine builder workbench](amendment-a-routine-builder.md), requested by the owner on 30 September 2026 and **proposed; not yet approved**.
- Minor implementation notes (within approved scope, no new behavior):
  - The Validation blocker count was left out of the sidebar. Computing it needs the full term data and the conflict engine on every page, roughly doubling load time. The term block's publication state and the dashboard carry that signal instead.
  - The Publications figures are corrected under the #30 decision (D1).
  - The official routine package is a recorded contrast exception because its institutional print template is kept unchanged.

Commit the approved plan before implementation. Unchanged approved scope survives agent handoff; do not infer acceptance or expanded authorization from it.

## Tasks

- [x] T-01 — Review harness `npm run ux:review` with guards and a README note; covers AC-10.
- [x] T-02 — Tokens and base styles: contrast-safe text tokens, gold-text and clay values, focus-visible ring, skip-link style, reduced-motion kept. Replace hex literals in shared components; covers AC-03, AC-04.
- [x] T-03 — Shell: grouped navigation with `aria-current`, truthful term state, Validation blocker count, account block, narrow top bar and drawer, skip link; covers AC-01–AC-03, AC-09.
- [x] T-04 — Shared components: `PageHeader` (no kicker, optional context line), `StatusText`, `Tag`, `Notice`, `ConfirmDialog`/`useConfirm`, `TableRegion`, `EmptyState`, `PrintHeader`; covers AC-04–AC-06, AC-08.
- [x] T-05 — Portal `loading.tsx`, `error.tsx` and `not-found.tsx`, after reading the installed Next.js docs; covers AC-07.
- [x] T-06 — Apply across pages: wrap wide tables in `TableRegion`, replace the seven `confirm()` calls, give icon-only buttons accessible names, and rewrite page-header copy in plain language; covers AC-01, AC-04, AC-06, AC-09.
- [x] T-07 — Reference screens:
  - Dashboard readiness band and figures row (and #30 if approved).
  - Workload and Teachers ledgers with column order, sticky header and first column, and warn/block tones.
  - Covers AC-05, AC-09.
- [x] T-08 — Print: `PrintHeader` on Workload, Teachers, Validation, Rooms and Courses; hide chrome, filters and notices; check A4. Regression screenshots of the official package and extra-load sheets; covers AC-08.
- [x] T-09 — UX baseline check (`npm run test:ux`) and a durable UI review checklist in `docs/operations/UI_REVIEW_CHECKLIST.md`; covers AC-01–AC-04.
- [ ] T-10 — Final verification:
  - `typecheck`, `lint`, `test:domain`, `build`, `test:ux`.
  - Manual keyboard pass and before/after screenshots at desktop, 390 px and print.
  - Diff review for domain changes.
  - Owner visual review.
  - Covers AC-01–AC-11.

## Verification and delivery

- Focused checks during development: `npm run test:ux` against the harness, plus screenshots.
- Final checks as in T-10. `test:safety` is unaffected (no database-code changes) and will be run once to confirm.
- Commit checkpoints by layer with the issue ID. Push after the shell and patterns (T-01–T-05) and again after final verification. Merge and closure wait for owner acceptance of the visual review.

## Current checkpoint / handoff

- Approved scope: see Approval record (30 September 2026, decisions D1–D3).
- Commits: `35ea10d` (plan), `41d94ae` (T-01), `6d14cad` (T-02/T-03), `1954f4e` (T-04–T-07), `d21eab7` (T-08 and fixes), plus the final verification/docs commit on `codex/ux-01`.
- Completed tasks: T-01–T-09. T-10 automated checks pass; see [verification](verification.md#acceptance-results-30-september-2026).
- Next action: owner decision on [amendment A](amendment-a-routine-builder.md) (Routine builder), then implementation of T-11–T-19 if approved; owner review; then PR, merge, and close #18 and #30.
- Verification: AC-01–AC-06 and AC-08–AC-11 pass. AC-07 is partial because the error boundary was not exercised live. AC-03 still needs a manual keyboard walk-through during owner review.
- Blockers/capabilities: permission-aware states wait for AUTH-01 (#1). Follow-up findings are listed in the verification record.
