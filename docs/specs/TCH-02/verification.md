# TCH-02 — Verification

Issue: [#35 TCH-02](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35)
Specification: [spec.md](spec.md) · Plan: [plan.md](plan.md)
Status: Accepted by the owner 1 October 2026 ("I accept TCH-02, go ahead and merge"); merged to main.
Updated: 1 October 2026, Asia/Dhaka

## Environment

- Branch `codex/tch-02` from main `4237c0d`. Approval recorded in `6de0fa6`.
- **Databases:** disposable PGlite only (`.tmp/ux-review`, seeded from the Summer 2026 source). The configured database under `.data/` was never opened. There is no schema change and no mutation.
- **Browser:** Microsoft Edge (Playwright channel `msedge`), against `npm run ux:review` on port 3100. The harness now also signs in `ux-teacher@example.test`, a teacher-role account linked to the teacher with the most classes.
- **Publications (owner request, 1 October 2026: change the test data so blockers do not occur).** The review copy is rebuilt with `npm run ux:review -- --fresh --publishable`. This runs `src/db/review-publishable.ts`, which refuses any target except a PGlite directory inside `.tmp/ux-review`.
  - All 13 Summer 2026 blockers were room problems: 9 double-booked rooms, 1 clash with another department's room reservation, and 3 classes in the wrong kind of room. The script moved each affected class to a free room that the conflict engine accepts, keeping the same day, time, teachers and batches.
  - The 13 moves: <ul><li>Room clash with another department: CSE-3200 Sat NB-407 → NB-506.</li><li>Double bookings: CSE-4106 NB-406 → NB-505; CSE-4252 NB-407 → NB-506; CSE-4206 NB-408 → NB-505; PHY-1201 NB-502 → NB-701; CSE-3105 NB-502 → NB-702; BUS-2201 NB-503 → NB-606; CSE-4251 NB-504 → NB-703; CSE-3110 NB-505 → NB-406; BUS-3101 NB-703 → NB-607. All on Saturday.</li><li>Wrong kind of room: CSE-2106 Tue NB-608 → NB-506; ENG-1202 Tue NB-508 → NB-407; ENG-1202 Fri NB-508 → NB-505.</li></ul>
  - The script then published version 2 with 0 blockers (the clean seed already holds an unpublished version 1 row) and wrote an audit entry. It left one later draft change for the linked review teacher (CSE-2202 NB-406 → NB-506), so the draft-differs notice can be reviewed.
  - The Summer 2026 source file and the institutional database are unchanged. These room choices are test data, not proposed institutional fixes.

## Acceptance results, 1 October 2026

| ID | Result | Evidence |
|---|---|---|
| AC-01 | **Pass** | `verify-teacher-routine.ts`: <ul><li>One section per program, with HSC before Diploma; Diploma reads Friday then Saturday.</li><li>A pattern change starts a new table, and a batch's own periods get their own table.</li><li>Consecutive days on one pattern share a table.</li><li>Only batches with classes appear, in batch order.</li></ul> Summer 2026 source: all 38 teachers projected, and every row fills its table. |
| AC-02 | **Pass** | Fixture: <ul><li>Two-period classes span their columns with no time shown.</li><li>An off-grid class shows its exact time.</li><li>A class overlapping no period adds "Other times".</li><li>Overlapping classes share one cell and are both kept.</li><li>Merged batches share one row ("26 B + 25 B").</li><li>Co-teachers appear as "with THR", and "CSE + EEE" is noted.</li><li>An HSC + Diploma class appears in both sections and counts once.</li></ul> Summer 2026 source: every teacher's 173 class rows appear exactly once, and other teachers' classes never appear. |
| AC-03 | **Pass** | No-fixed-time work comes from teacher-managed allocations. Only the teacher's own external commitments are listed, never other departments' room bookings. An empty list says "None" or "None recorded" (fixture and screenshots). |
| AC-04 | **Pass** | The total equals `computeWorkloads(...).workloadUnits`, including the 3 other-department units, and the breakdown rows sum to it. Kinds read "Theory", "Lab", "Theory, shared with THR", "No fixed time" and "Other department". |
| AC-05 | **Pass** | <ul><li>Domain: Published is the default; `?source=draft` gives the draft; with no publication the draft is shown and Published is unavailable; the routine from a publication shows the publication's classes. Draft differences (one moved, one added, one removed) count as 3; other teachers' changes and an identical draft count 0.</li><li>Browser, on the publishable review copy: Published is current by default, with "Publication v2, effective…".</li><li>The notice reads "The working draft changes 1 of these classes".</li><li>The print shows "Effective from" and "Publication v2 · printed …".</li><li>`?source=draft` makes Working draft current with no notice, and the print shows "Draft — not official".</li><li>Before the rebuild, the unpublished state showed "Not published yet".</li></ul> |
| AC-06 | **Pass** | `test:ux` (`teacher-routine.spec.ts`): <ul><li>The linked teacher's `/my-routine` shows their routine, with My routine current in navigation.</li><li>The unlinked administrator sees the not-linked message and has no My routine link.</li><li>Teachers → teacher → **Individual routine** opens `/teachers/[id]/routine`.</li><li>An unknown id shows "That record could not be found". It is a soft 404 (status 200): the page has already started streaming, as on `/teachers/[id]` (Next.js `notFound` docs).</li></ul> |
| AC-07 | **Pass** | At 375 px the agenda replaces the tables and starts with Today, with no page overflow. `/my-routine`, `/teachers/routines` and `/teachers/1/routine` were added to the baseline overflow (360/390/768 px) and axe (desktop/phone) checks. |
| AC-08 | **Pass** | <ul><li>Print emulation shows only the A4 sheet, one PDF page, with the draft box, header and Total Credit Hours present and nothing clipped or outside the frame.</li><li>Domain: rows shrink to 9 mm before spilling. A routine too long for one page continues with the program heading repeated, every row laid out once, and no page past its capacity.</li><li>All 38 Summer 2026 teachers fit one page.</li><li>The capacity (220 mm) was measured from the approved mockup's 224 mm body.</li></ul> |
| AC-09 | **Pass** | Bulk flow: <ul><li>"All ready" off disables the button; search with no match says so.</li><li>Opening all 14 ready CSE teachers gives a print view with one sheet per teacher, no fit problems on screen or in print, and a PDF page count equal to the sheet count.</li><li>Sheets use black, white and greys only.</li></ul> |
| AC-10 | **Pass** | The agenda and tables come from one projection. The domain test matches agenda classes to table classes meeting by meeting, and the browser check compares their counts on screen. |
| AC-11 | **Pass** | See the command results below. |

## Commands, 1 October 2026

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:domain` | Pass: all 8 scripts, including the new `verify-teacher-routine.ts` (fixture plus all 38 Summer 2026 teachers, each fitting one A4 page) |
| `npm run build` | Pass. The new routes are `/my-routine`, `/teachers/[id]/routine`, `/teachers/routines` and `/teachers/routines/print`. |
| `npm run test:safety` with `SAFE01_PG_BIN` | Pass: T-01 isolation, T-02 PGlite recovery, T-03 two-term history, T-04 audit atomicity, T-06 PostgreSQL. The default PGlite directory was never opened. |
| `npm run test:ux`, plain copy (`ux:review -- --fresh`) | **66 passed, 1 skipped.** The skipped test is the published teacher routine, because that copy has nothing published. |
| `npm run test:ux`, publishable copy (`ux:review -- --fresh --publishable`) | **64 passed, 2 skipped, 1 failed**, then fixed and re-run. The skipped tests are RB-01 (needs clashes) and the unpublished teacher check. RB-08 failed because it relied on clash batches opening by default. It now opens the batch itself when there are no clashes, and still checks the open-by-default behaviour when clashes exist. Re-running `routine-builder.spec.ts` on that copy gave 7 passed and 1 skipped (RB-01), and the TCH-02 file gave 4 passed and 1 skipped. |

Between the two copies, every test ran and passed at least once on final code.

## Screenshots

Summer 2026 source data on the publishable review copy, so some rooms differ from the source as described above (teacher names, course codes and rooms; no contact details):
- [My routine, desktop](screenshots/my-routine-desktop.png)
- [My routine, phone](screenshots/my-routine-phone.png)
- [print sheet from Publication v2](screenshots/my-routine-print.png) ([PDF](screenshots/my-routine-print.pdf)) and [the same teacher from the working draft](screenshots/my-routine-print-draft.png)
- [bulk selection](screenshots/bulk-select.png)
- [bulk print view](screenshots/bulk-print-screen.png) ([PDF, 14 pages](screenshots/bulk-print.pdf))

## Notes and limitations

- **Published path in the browser.** This needs the publishable review copy described under Environment. On the plain source copy, which cannot be published, the teacher-routine test stops at its first check and names the `--publishable` option.
- **Credit hours** always come from the current allocation records, even when the routine shown is a publication (B7). The footer of a published print says how they are counted.
- **Audience labels** from the source can be untidy ("CSE+EEE+CE (HSC-DIP"). The routine evens the spacing and closes the bracket. The underlying data is unchanged.
- **Not covered by review data.** The review data is the Summer 2026 source, not the institutional database. Before merging, the owner can review real data with `npm run ux:review -- --from-copy <cold copy>`.
- **Out of scope (D-2, D-3, D-6):** .docx download, the logo and past-term selection.
