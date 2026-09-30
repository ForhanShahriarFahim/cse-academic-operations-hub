# UI review checklist

Established by [UX-01 / #18](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18) on 30 September 2026. Use it for every change that alters a screen, print view or export. Record results in the issue's verification file.

## How to review safely

1. Start the disposable review server:

   ```bash
   npm run ux:review
   ```

   It runs on `http://localhost:3100` against `.tmp/ux-review`, with a synthetic signed-in reviewer. It never opens `.data/` and refuses `DATABASE_URL`.
2. Run the automated baseline while that server is running:

   ```bash
   npm run test:ux
   ```

   Add new routes to `tests/ux/baseline.spec.ts`. The check never starts a server itself.
3. If the server stops abruptly, the embedded review database can become unreadable. It is disposable, so rebuild it:

   ```bash
   npm run ux:review -- --fresh
   ```

4. For manual browsing, `npm run ux:review -- --print-cookie` prints a one-line snippet that signs the browser in as the reviewer. Use `--role <role>` to review another role.

Never review against the institutional database with `npm run dev`. Keep screenshots with staff contacts or student data out of Git.

## Automated (must pass)

- [ ] No page-wide horizontal overflow at 360, 390 and 768 px.
- [ ] axe WCAG 2 A/AA: no violations at 1366 and 390 px, except documented deferrals in `tests/ux/baseline.spec.ts`, each with an owner issue or reason.
- [ ] The skip link is the first tab stop and focuses `main`.
- [ ] The navigation drawer opens and closes by keyboard and returns focus.
- [ ] No native `confirm()` in `src/`.

## Manual review

**Layout and navigation**
- [ ] Desktop (≥ 1024 px): the sidebar marks the current page with `aria-current` and the gold bar.
- [ ] Narrow (< 1024 px): the top bar shows the page name and term state, and the drawer covers the page with the page behind inert.
- [ ] The page context line, title, one-sentence description and actions follow `PageHeader`. Actions wrap below the title on phones.

**Text and status**
- [ ] Copy is written for department staff: it names the object and the next action. No spec section numbers, implementation claims or developer asides.
- [ ] Status uses `StatusText` (icon + word + colour) or a badge whose words carry the meaning. Colour is never the only signal.
- [ ] Tones: pine = done/primary, gold = warning or waiting (use `text-gold-text`, never plain gold, for text on light surfaces), clay = blocking or destructive. Advisory limits are warnings, not blockers.
- [ ] No uppercase eyebrow labels, no truncated badges, no card stacks where a ruled row of figures will do.

**Tables and ledgers**
- [ ] Wide tables sit in `TableRegion` (named, focusable, scrolls inside itself).
- [ ] Ledgers use `.ledger`: sticky header and first column, numbers right-aligned with tabular figures, and columns ordered by the decision the reader makes.
- [ ] Empty, loading, error, stale and denied states have plain wording and a way forward.

**Actions and feedback**
- [ ] Destructive or irreversible actions use `useConfirm`. The dialog names the item and the consequence; Cancel has initial focus; Esc cancels.
- [ ] Results appear next to the action with `Notice` (`role="status"`, or `role="alert"` for errors). Context is preserved after saving.
- [ ] Icon-only buttons have an accessible name.

**Print (A4)**
- [ ] App chrome, filters, actions and notices are hidden.
- [ ] Ledgers show `PrintHeader`: institution, page, term, working-draft/published state and print time (Asia/Dhaka).
- [ ] Headings are not clipped, table headers repeat, and rows do not split.
- [ ] The official routine package and extra-load templates match their institutional layouts. Compare them with the previous screenshots.

**Evidence**
- [ ] Before/after screenshots at desktop, 390 px and print for each changed screen are kept locally, or committed only when they contain no private data.
- [ ] Results are mapped to the issue's acceptance criteria. Anything not checked is recorded as pending, not passed.
