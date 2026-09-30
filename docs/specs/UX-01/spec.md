# UX-01 — Responsive, accessible and plain-spoken portal baseline

Issue: [#18 UX-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)
Status: Approved 30 September 2026 (see [plan approval record](plan.md#approval-record))
Updated: 30 September 2026, Asia/Dhaka

## Problem and inspected baseline

Staff use the portal on office desktops, and increasingly on phones between classes. Inspection on 30 September 2026 covered all 17 internal routes and the public/login screens. It used a disposable copy of the local database and a synthetic administrator session. Evidence: [baseline screenshots and measurements](verification.md#baseline-30-september-2026).

- **No narrow layout.** The sidebar is fixed at 228 px and `main` has a fixed `ml-[228px]` (`src/app/(portal)/layout.tsx`). At 390 px, 15 of 17 internal routes overflow the page horizontally by 5–280 px, and the sidebar covers about 60% of the screen. The public viewer and login already fit.
- **Contrast.** Every internal route fails WCAG 2 AA `color-contrast` (axe; 4 nodes on the least-affected route, 310 on Courses). Main causes: `.micro-label` `#75806f` (3.7:1 on paper), sidebar inactive text at `white/40–60` (3.8:1 at 40%), gold used as text (3.6:1), and 126 hard-coded hex colours outside the token set.
- **Keyboard.** Only 2 elements style focus, and there is no skip link. Two scrollable regions are not keyboard-focusable (`scrollable-region-focusable`). Icon-only delete buttons rely on `title`.
- **Feedback and states.** 2 live regions in the whole app. No `loading.tsx`, `error.tsx` or `not-found.tsx`. Seven consequential actions use native `confirm()`: delete attendance session, remove roster student, remove extra class, remove external commitment, remove permitted class window, publish a version, and delete a draft meeting.
- **Status and density.** Status is usually a coloured uppercase pill. Several pills truncate (for example "WORKLOAD 18 UNITS EXCEEDS THE ADVISORY THR…"). Advisory and blocking states use similar reds.
- **Print.** Internal pages print their app actions (for example "Auto-schedule gaps", "Review & publish a revision"). Ledgers print without an institution heading, term, draft/published state or print date. The official routine package and extra-load templates have their own print design and are not part of this problem.
- **Copy.** Interface text addresses developers rather than staff: "no fabricated figures", "(spec §17.5)", "never hidden behind a fake total", "Drag-free, click-to-edit builder". Every page opens with an uppercase eyebrow. Together with card-heavy layouts, this reads as generic generated UI rather than a department tool.
- **Review capability.** Internal screens cannot be reviewed locally without Google OAuth, and `npm run test:ui` starts `npm run dev`, which prepares the configured (institutional) database. This makes safe visual/UI verification impossible for this and later UI issues.

Related defects found during inspection are tracked separately: [#29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29) (time zone), [#30](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/30) (dashboard publication state), [#31](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/31) (People & Access confirmations), [#32](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/32) (public viewer dead-end actions).

## Outcome and scope

- **Outcome:** every internal screen is usable by keyboard and at phone width without page-wide sideways scrolling. Text meets AA contrast. Status is never colour-only. Destructive actions confirm clearly. Ledgers print with an honest heading. Screens speak plainly to department staff. The shared patterns are documented and checked, so later issues reuse them.
- **Included:**
  - Design tokens and base styles.
  - The portal shell: grouped navigation, truthful term state, narrow-screen top bar and drawer, skip link, account block.
  - Shared components: page header, status text, tag, notice, confirmation dialog, scroll-region table wrapper, empty state, print header.
  - Portal loading, error and not-found states.
  - The confirmation dialog replacing the seven `confirm()` calls.
  - Wrapping every existing wide table in the table wrapper.
  - A plain-language pass on the shell and page headers.
  - Dashboard redesign (see the decision on #30).
  - Workload and Teachers as the reference ledgers.
  - Print header on ledger pages.
  - A committed disposable review harness.
  - An automated UX baseline check.
  - A written UI review checklist.
- **Excluded:**
  - Routine builder grid redesign (it only gains the new shell and header).
  - Layout of the official routine package and extra-load templates (regression screenshots only).
  - People & Access (#31).
  - Attendance save/import feedback (#9).
  - Permission-aware states (after #1).
  - Time-zone correction (#29).
  - Public viewer actions (#32).
  - Any schema, migration, server-action or domain-rule change.
- **Dependencies:** none blocking. Permission-aware review of denied/limited roles waits for AUTH-01 (#1). ATT-02 (#9) consumes the notice/dialog patterns.

## Design direction

Mockups: [dashboard](mockups/dashboard.html), [workload](mockups/workload.html); rendered screenshots are in [verification](verification.md#proposal-mockups).

- **Keep the identity; drop the tells.** Paper, ink, pine and gold remain, and so do Fraunces (titles only), Inter (interface) and IBM Plex Mono (codes and times, which carry meaning). Removed: eyebrow kickers on every page, stacks of identical stat cards, uppercase pill badges, and decorative gradients.
- **One characteristic element per screen.** Dashboard: a publication-readiness statement written as a sentence ("The Summer 2026 routine is not published yet"), with its checklist. Ledgers: the table itself. Figures sit in one ruled row, not six cards.
- **Tone rules.** Pine = done/primary action. Gold = advisory or waiting (text uses `#7a5212`, 6.4:1). Clay = blocking or destructive (`#a3341b`). Status always pairs an icon and a word with the colour. Advisory workload over 15 units is a warning, not a blocker.
- **Plain language.** Write for department staff: name the object and the next action ("13 blocking conflicts must be resolved before the routine can be published"). No spec section numbers or implementation claims in the interface.
- **Navigation.** Dashboard, then groups: *Routine* (Routine builder, Validation with blocker count, Publications); *Planning records* (Teachers, Workload, Courses & offerings, Batches, Rooms, External commitments); *Classes* (Attendance, Extra class load); *Administration* (Decisions & settings, People & access, Public routine). "External / OD" becomes "External commitments" per the [glossary](../../../CONTEXT.md). The term block shows the actual draft/published state from data.

## Required behavior

- **Shell ≥ 1024 px.** Sticky sidebar with grouped navigation. The current page is marked with `aria-current` and a gold bar, not colour alone. Term block and account block (name, role, sign-out button).
- **Shell < 1024 px.** A sticky ink top bar with a labelled menu button, the page title and the term state. The drawer opens over a dimmed page. While it is open, focus moves into it, the page behind is inert, and Esc or the backdrop closes it with focus returning to the menu button. Following a link closes it.
- **Skip link** is the first focusable element and targets `main`.
- **Focus.** Every interactive element shows a 2 px pine outline on `:focus-visible`. Scrollable regions are focusable and labelled.
- **Tables.** Wide tables scroll inside a labelled region and never widen the page. Header row sticky, first column sticky, numbers right-aligned with tabular figures. Columns ordered by decision importance, so on narrow screens the deciding column stays close to the identifier.
- **Status text.** Shared component with tones `ok`, `warn`, `block`, `muted`, `pending`. Icon plus visible word, sentence case, no truncation.
- **Notice.** `role="status"` for success/info, `role="alert"` for errors. Placed next to the action it reports. Attendance-specific behavior stays in #9.
- **Confirmation dialog.** Native `<dialog>` with a title naming the item and a sentence stating the consequence. Cancel is the default focus; the destructive button is clay. Esc cancels. After confirmation the triggering control reports the result, or focus moves to a sensible target if the item disappeared. Pending state disables the buttons and says so.
- **Route states.** Loading: a quiet skeleton of the page header and content area, with no spinner-only screens. Error: a plain explanation, a retry action and a link to the dashboard, without leaking internals. Not found: a plain message and navigation back.
- **Print.** Chrome, filters and notices are hidden. Ledger pages print an institution heading with the page title, term, draft or published state (with version when published) and the print date/time in Asia/Dhaka, repeated table headers, and no row splitting. Headings are not clipped on A4. The official package and extra-load sheets are unchanged.
- **Data truthfulness.** The shell and dashboard never imply a publication that does not exist. With no published version they say so, and they show a version number and effective date only when one exists.
- **No domain change.** Counts, rules and server behavior are unchanged; only presentation and copy change.

## Acceptance criteria

| ID | Observable condition | Verification method |
|---|---|---|
| AC-01 | At 360, 390 and 768 px, no reviewed route has page-wide horizontal overflow (`scrollWidth − clientWidth = 0`). | UX baseline check over the route list |
| AC-02 | Below 1024 px the drawer opens from the menu button, traps focus, closes on Esc/backdrop/navigation and returns focus. | Keyboard flow in UX check + manual review |
| AC-03 | The skip link is the first tab stop and moves focus to main content. Every interactive element shows visible focus. | UX check + manual keyboard pass |
| AC-04 | axe WCAG 2 A/AA reports zero `color-contrast`, `scrollable-region-focusable`, `button-name` and `select-name` violations on reviewed routes. People & access is excluded only for its `select-name` issue owned by #31. | UX baseline check (desktop and 390 px) |
| AC-05 | Status on reviewed screens uses the shared status text (icon plus word). No status pill is truncated, and advisory and blocking states are visually distinct. | Screenshot review against the checklist |
| AC-06 | Each of the seven former `confirm()` actions opens the shared dialog, names the item and consequence, cancels on Esc/Cancel without effect, and reports the result. | Manual flow on the disposable copy + code search shows no `confirm(` |
| AC-07 | Portal loading, error and not-found states render inside the shell with plain copy and a way forward. | Forced error/unknown route in review harness |
| AC-08 | Printing a ledger page (Workload, Teachers, Validation, Rooms, Courses) shows the heading, term, draft/published state and print time, with no app actions and no clipped headings. The official package and extra-load templates are unchanged. | A4 print screenshots before/after |
| AC-09 | Shell and page headers contain no eyebrow kickers, spec references or developer claims. The dashboard states publication readiness truthfully for the no-publication state. | Copy review + screenshots |
| AC-10 | `npm run ux:review` prepares only a `.tmp/` database. It refuses `DATABASE_URL` and any path outside `.tmp/`, and never opens `.data/`. | Script guard test + code review |
| AC-11 | No schema, migration, server-action or domain-rule changes. `typecheck`, `lint`, `test:domain` and `build` pass. | Diff review + required checks |

## Decisions and sources

- Design language and review rules: [WORKFLOW.md § Verification and data rules](../../WORKFLOW.md#verification-and-data-rules).
- Glossary term "External commitment": [CONTEXT.md](../../../CONTEXT.md).
- Design guidance consulted: Anthropic's public `frontend-design` skill (read-only reference). Its warnings about eyebrow labels, card kits and decorative defaults informed the direction above.
- **Owner decisions (approved 30 September 2026):**
  1. Fold #30 (dashboard publication state) into UX-01, because the dashboard redesign replaces that panel. Approved: yes, and #30 closes with UX-01.
  2. The navigation grouping and the "External commitments" rename are approved.
  3. Committing the disposable review harness is approved: (`npm run ux:review`) and the synthetic reviewer session. The session never runs against `.data/` or `DATABASE_URL`.
