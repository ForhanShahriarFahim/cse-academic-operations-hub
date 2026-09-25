# RUT-01 — Weekly Routine View and Export: Implementation Plan

Status: **Proposed for review — do not implement until approved**  
Roadmap source: `docs/IMPLEMENTATION_SOLUTION_ROADMAP.md`  
Prepared: 23 September 2026

## 1. Outcome and scope

Add a URL-addressable Day/Week routine experience for HSC and Diploma to both the editable draft routine and the public published routine. Add browser Print/PDF and CSV exports that use the same pure projection as the screen.

This slice will:

- preserve the existing exact-minute day view and meeting-edit workflow;
- add Week mode as stacked day sections, not one extremely wide all-week grid;
- add an optional single-batch filter;
- keep shared meetings canonical and expose their full audience membership;
- give draft and published outputs visibly different status treatment;
- make published rendering/export derive from an immutable publication payload; and
- add focused projection, snapshot-compatibility, CSV, route and browser tests.

This slice will not:

- add authentication or roles (`AUTH-01`);
- add a generated server-side PDF library—the existing HTML/CSS + browser Print/Save as PDF decision remains authoritative;
- add a compact days-by-time matrix for a single batch (the roadmap marks it optional);
- change meeting editing, conflict rules, automatic scheduling, or publication approval workflow; or
- add master-data CRUD.

## 2. Verified current behavior

### Draft routine

- `/routine` is dynamic and loads the active-term draft through `getPortalData()`.
- `RoutineBuilder` keeps `stream` and `day` only in client state. Refresh resets to HSC/Saturday.
- The existing table supports exact-minute/off-grid meetings, shared audiences, breaks, external commitments, search, density, create, move and delete.
- Validation runs on the server page, but the builder receives only aggregate blocker/warning counts.
- There is no Week mode, batch filter, dedicated print document or CSV export.

### Public routine

- `/public/routine?stream=...&day=...` already persists stream/day in the URL.
- It renders the published meeting snapshot, a desktop day table, a mobile agenda and browser print controls.
- There is no Week mode, batch filter or CSV export.
- Day projection logic is duplicated between the public page and `RoutineBuilder`.

### Publication integrity gap discovered during exploration

`PublicationSnapshot` currently stores only:

- generated time;
- term name and effective date;
- version number; and
- canonical meetings.

The public page reads batches, breaks and verified external commitments from the current live database. Therefore the current public document is immutable for meeting rows but not for all display context. RUT-01 must correct this before claiming published screen/print/CSV parity.

### Additional term-scoping defect relevant to this feature

`publishAction()` calculates the next version and supersedes published versions without a `termId` predicate. Before multi-term export is trusted, publication version selection and superseding must be scoped to the active academic term. This is a narrow data-integrity correction inside RUT-01, not a new governance workflow.

## 3. User journeys

### Coordinator — draft Day view

1. Open `/routine`.
2. Choose HSC or Diploma.
3. Choose Day and a permitted day.
4. Optionally select one batch.
5. Continue to create/edit meetings exactly as today.
6. Copy or refresh the URL and retain the same selection.

### Coordinator — draft Week view

1. Choose Week.
2. See one stacked section per applicable day for the selected stream.
3. Optionally narrow to one batch.
4. See exact custom times, shared labels, OD rows and validation states.
5. Print/Save as PDF with `DRAFT — NOT OFFICIAL`, blocker/warning totals and generation metadata on every printed day.
6. Download CSV from the same projected meeting set.

### Public reader — published Week view

1. Open `/public/routine`.
2. Choose stream, Day/Week and optional batch.
3. Refresh/share the URL without losing state.
4. Print the immutable publication, one day per printed page.
5. Download a versioned CSV matching the selected published projection.

### Invalid/stale link

- Unknown stream/view/day/batch values fall back to a valid page selection.
- Export endpoints reject invalid query values with a clear `400` response rather than silently exporting unexpected data.
- A batch outside the selected stream is rejected for export and removed from page selection.

## 4. Permissions and exposure

- Published page, print and CSV remain public and may read only a published snapshot.
- Draft screen, print and CSV remain under the existing coordinator portal boundary.
- Until `AUTH-01`, deployment must keep the entire coordinator portal behind the institutional access boundary documented in `PROJECT_CONTEXT.md`.
- The future authorization seam must be called by the draft CSV route; do not design a public `/api` URL that accidentally exposes draft data.

## 5. Domain invariants

1. One physical event remains one canonical `MeetingView` identified by `meeting.id`.
2. Stream inclusion means at least one local audience belongs to that stream.
3. Batch inclusion means the canonical meeting contains that batch audience.
4. A shared meeting appears in every relevant audience view, while CSV emits one row per canonical meeting.
5. The CSV audience column lists the meeting's full audience membership, including audiences outside the selected stream, so a cross-stream event is not misrepresented.
6. Exact `startMinutes`/`endMinutes` are authoritative; grid slots are presentation aids only.
7. Off-grid/custom-time meetings remain visible in Day and Week modes.
8. Week days come from the same stream/day policy used by the current Day view, including the HSC Friday exception surface.
9. Draft issues are calculated from current canonical data at request time.
10. Published issue/status metadata comes from the publication snapshot, not from revalidation against future live policy.
11. Published exports never read draft meetings.
12. Draft outputs always say `DRAFT — NOT OFFICIAL`.
13. Unknown counts remain unknown; they never render as zero.
14. Page, print and CSV callers cross the same routine-projection interface.

## 6. URL contract

Use the same query names on draft and public pages:

```text
stream=HSC|DIPLOMA
view=day|week
day=0..6                 # meaningful in Day mode
batch=all|<numeric-id>
```

Canonical defaults:

- `stream=HSC`
- `view=day`
- first valid day returned by `daysForStream(stream)`
- `batch=all`

The server page awaits Next.js 16 `searchParams`, parses them once, and passes a validated selection to the client/rendering modules. Client controls update the URL through links or router navigation; the URL is the selection source of truth, not duplicated React state.

Week mode may retain `day` in the URL for a predictable return to Day mode, but it does not filter the weekly projection.

## 7. Deep routine-projection module

### Seam

Add `src/lib/routine-projection.ts` as a pure in-process module. Its external interface should stay small:

```ts
type RoutineSelection = {
  stream: "HSC" | "DIPLOMA";
  view: "day" | "week";
  day?: number;
  batchId?: number;
};

type RoutineSource = DraftRoutineSource | PublishedRoutineSource;

function projectRoutine(input: {
  source: RoutineSource;
  selection: RoutineSelection;
}): RoutineProjection;
```

The implementation hides:

- selection validation/defaulting;
- stream and batch membership;
- canonical meeting deduplication;
- complete shared-audience labels;
- deterministic day/batch/time ordering;
- exact-time and off-grid classification;
- slot overlap and continuation placement;
- applicable break columns;
- verified external/OD display rows;
- meeting-level blocker/warning summaries; and
- source/version/disclosure metadata.

`RoutineProjection` should expose render-ready day sections and one canonical `exportMeetings` list. Renderers must not refilter raw meetings or recompute membership.

### Why this seam is deep

Deleting it would force the same filtering, deduplication, issue association, ordering and source-status rules back into the draft screen, public screen, print document and CSV route. Its interface is the test surface; callers receive a stable projection and do not learn its implementation details.

### Supporting interfaces

Keep these helpers inside the same module unless a second caller proves a separate seam is needed:

- `parseRoutineSelection(searchParams, availableBatches)`
- filename construction;
- display metadata construction.

Add `src/lib/routine-csv.ts` only because CSV serialization is a genuinely different adapter. It accepts `RoutineProjection`, performs RFC 4180-style quoting, and returns `{ body, filename }`.

## 8. Publication snapshot v2

Version the JSON payload rather than changing the database column:

```ts
type PublicationSnapshotV2 = {
  schemaVersion: 2;
  generatedAt: string;
  term: {
    id: number;
    name: string;
    academicYear: number;
    effectiveFrom: string | null;
  };
  versionNumber: number;
  meetings: MeetingView[];
  batches: BatchView[];
  breaks: BreakRule[];
  externalCommitments: ExternalCommitmentView[];
  issues: Issue[];
};
```

Only verified external commitments should enter the published display payload. The exact publication-time break rules, batch labels/semesters/counts, and validation warnings must be captured with the meetings.

Add a snapshot parser/normalizer that accepts v1 and v2 payloads and rejects malformed unknown data safely. Do not cast arbitrary JSON directly to `PublicationSnapshot` in the page.

No Drizzle migration is required because `schedule_versions.snapshot` is already JSONB. Existing rows remain unchanged.

### Legacy v1 decision

The existing published version cannot be made fully immutable retroactively because its non-meeting context was never captured. Recommended behavior:

1. keep v1 untouched;
2. support it through an explicit legacy adapter;
3. display/export a `Legacy publication context` disclosure when live context must be used; and
4. create snapshot v2 only on the next normal publication.

Alternative: create a new publication version immediately after deployment to establish a fully immutable v2 baseline. This is operationally cleaner, but it is a publication event and requires coordinator approval.

## 9. Screen design

### Shared controls

Controls appear in this order:

```text
Stream: HSC | Diploma
View: Day | Week
Day: Sat | Sun | Mon ...      # hidden/disabled in Week mode
Batch: All batches | HSC-29B ...
Export: Print / Save PDF | CSV
```

- Use real labels/fieldsets and visible focus states.
- Use links for public filters so the page works without client JavaScript.
- Draft controls may use `router.replace()` to preserve the editing experience, but must remain URL-driven.
- Keep existing search/density controls local because they are transient display preferences, not report selection.

### Day mode

- Preserve the existing desktop grid and editing interactions.
- Apply the optional batch filter to rows.
- Keep the existing mobile agenda behavior.
- Avoid visual redesign beyond integrating the shared controls and projected data.

### Week mode

- Render one semantic section per applicable day.
- Each section reuses the same projected day data as Day mode.
- Desktop uses compact day tables; mobile uses agenda cards.
- Empty days remain visible with an explicit “No classes” state so users can distinguish absence from loading failure.
- With one batch selected, show only that batch in every day section. Do not add the optional compact matrix in this slice.

### Draft status

- Persistent `DRAFT — NOT OFFICIAL` badge on screen.
- Print watermark/header on every day page.
- Blocker and warning totals plus a short disclosure in print output.
- CSV repeats source status and issue summary fields per meeting.

### Published status

- Show term, version, effective date, publication time and snapshot generation time.
- If normalized from v1, show the legacy-context disclosure.
- Never include current draft counts or warnings.

## 10. Print/PDF design

Continue ADR-001's HTML/CSS projection approach and browser `window.print()`.

- Introduce a reusable read-only routine document renderer driven by `RoutineProjection`.
- In Week mode, each day is a `.routine-print-day` with `break-after: page` except the last.
- In Day mode, print one day.
- Hide portal navigation, editing controls, search and dialogs.
- Repeat institution, term, stream, source status, version/effective date and generation metadata on each printed page.
- Keep signature lines and disclosure footnotes.
- Ensure custom times are printed even when they do not align with a standard slot.
- Use portrait/landscape CSS deliberately based on the retained day-table width; verify Chrome/Edge print preview at A4.

Suggested filenames shown to the user:

- `routine-summer-2026-hsc-week-draft.pdf`
- `routine-summer-2026-hsc-week-v2.pdf`

Browsers control the final PDF filename, so the UI should display/copy the suggestion rather than claim it can force the print-dialog name.

## 11. CSV contract

Create separate route handlers so draft data cannot be confused with public data:

- `src/app/(portal)/routine/export/route.ts` → `/routine/export`
- `src/app/public/routine/export/route.ts` → `/public/routine/export`

Both are dynamic `GET` handlers, parse the same query contract, call the same projection, and return:

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="...csv"
Cache-Control: no-store
```

Emit a UTF-8 BOM for reliable Excel opening. Use CRLF records and quote commas, quotes and newlines correctly.

One row represents one canonical meeting. Proposed columns:

```text
source_status
term
publication_version
effective_date
snapshot_generated_at
selected_stream
selected_batch
day
start_time
end_time
course_code
course_title
course_type
teachers
rooms
audiences
shared_status
is_exception
exception_note
validation_status
warning_codes
```

`validation_status` is `blocker`, `warning`, or `clear`; draft export may contain blockers, while a published export should never contain publication blockers.

External commitments remain print/screen disclosure rows and are not emitted as canonical meeting rows in the first CSV contract. Adding them would require a `record_type` union and should be approved separately.

## 12. File-level change map

### New files

- `src/lib/routine-projection.ts` — selection parsing and the deep pure projection.
- `src/lib/routine-csv.ts` — CSV adapter over `RoutineProjection`.
- `src/components/routine-view-controls.tsx` — URL-driven controls and export actions.
- `src/components/routine-document.tsx` — shared read-only screen/print document.
- `src/app/(portal)/routine/export/route.ts` — draft CSV route.
- `src/app/public/routine/export/route.ts` — published CSV route.
- `scripts/verify-routine-projection.ts` — focused pure-domain regression suite.
- `tests/routine-view.spec.ts` — Playwright Day/Week/filter/export smoke coverage, if Playwright is approved as a dev dependency.

### Existing files

- `src/app/(portal)/routine/page.tsx` — await/parse query state; construct draft source; pass projection and initial selection.
- `src/components/routine-builder.tsx` — consume projected day/week sections; preserve mutation dialogs; remove duplicate filtering.
- `src/app/public/routine/page.tsx` — consume normalized published source and shared document renderer.
- `src/lib/serialize.ts` — introduce versioned snapshot types/build/parse functions.
- `src/lib/actions.ts` — build snapshot v2; scope version lookup and superseding by active `termId`.
- `src/lib/data.ts` — stop unsafe snapshot casting; expose normalized publication data.
- `src/app/globals.css` — week print page breaks, draft watermark and print-only helpers.
- `src/components/print-button.tsx` — accept accessible label/filename hint if needed.
- `scripts/verify-domain.ts` or `package.json` — run the new routine verification suite.
- `README.md`, `HANDOVER_GUIDE.md` and screenshots — update only after behavior and tests pass.

## 13. Test plan

### Pure projection tests

- HSC and Diploma valid day sets and deterministic ordering.
- Day versus Week selection.
- Batch filter includes only matching meetings/rows.
- Cross-stream shared meeting appears in each relevant projection but once in `exportMeetings`.
- Full audience label survives a stream/batch filter.
- Exact custom/off-grid times remain visible.
- Friday HSC exception remains included and marked.
- Break columns and verified external rows are placed on the correct day.
- Unknown counts remain `null`/Not verified.
- Issue association produces blocker > warning > clear precedence.
- Empty days are retained in Week mode.

### Snapshot tests

- Build/parse v2 round trip.
- v1 is recognized and marked legacy without mutating it.
- malformed JSON fails closed with a user-safe no-publication state.
- publication captures only verified external commitments.
- active-term publication versioning does not supersede another term.

### CSV parity tests

- Projection meeting IDs exactly equal CSV meeting IDs.
- Shared meeting produces one data row.
- commas, quotes, newlines and non-ASCII names are escaped.
- CRLF and UTF-8 BOM are present.
- draft/published labels and filenames are correct.
- blockers/warnings are represented from the selected source.
- invalid stream/day/batch returns `400`.

### Database integration tests

- Run against populated PGlite without resetting Summer 2026 data.
- Add a second-term fixture to prove publication selection/versioning is term-scoped.
- Confirm v1 and v2 snapshot rows coexist.
- Repeat critical test against PostgreSQL before deployment.

### Browser tests

- Draft and public Day defaults remain usable.
- View/stream/day/batch state survives refresh.
- Week mode renders all applicable day headings.
- Mobile viewport uses agenda layout without a page-wide horizontal overflow.
- CSV link has the selected query and downloads a file.
- Print CSS shows one day per page and hides controls.
- Existing draft meeting edit opens from Day mode and remains unchanged.

### Required verification

```text
npm run typecheck
npm run lint
npm run test:domain
npm run test:ui        # if Playwright dependency is approved
npm run build
```

## 14. Implementation sequence after approval

1. Add failing pure tests for selection, shared meetings, exact times and CSV parity.
2. Implement `routine-projection.ts` until those tests pass.
3. Add versioned snapshot parser/builder tests and snapshot v2 implementation.
4. Correct publication queries to scope versioning/superseding by `termId`.
5. Convert the public Day renderer to the projection without visual change.
6. Convert the draft Day renderer while preserving all edit actions.
7. Add URL-driven controls and batch filter.
8. Add stacked Week rendering and responsive states.
9. Add the shared print document and week page-break CSS.
10. Add draft/public CSV handlers and parity tests.
11. Add PGlite second-term integration fixture and browser tests.
12. Run all verification commands, then update documentation and screenshots.

Each step should leave Day mode operational. Do not combine this with authentication or CRUD work.

## 15. Rollout and backward-compatibility risks

| Risk | Mitigation |
|---|---|
| Existing v1 snapshot lacks context | Versioned parser, visible legacy disclosure, no mutation of v1 |
| Live public page changes while refactoring | Convert Day mode to projection first and add parity tests before Week mode |
| Shared meeting duplicated in CSV | Export from canonical projection list keyed by meeting ID |
| Draft route accidentally exposed | Separate portal/public handlers; later add AUTH-01 guard at draft handler seam |
| Cross-term publication superseded | Add `termId` predicates and a second-term integration test |
| Week print is too wide | Stacked day documents; one day per printed page |
| Browser PDF filename cannot be forced | Display a suggested filename and document browser behavior |
| Hard-coded slot layout diverges from editable windows | Keep exact times authoritative; record a follow-up to derive display bands from policy when SET-01 versions them |

No destructive migration, reset or historical rewrite is planned.

## 16. Acceptance criteria

- Both `/routine` and `/public/routine` support HSC/Diploma and Day/Week.
- Stream/view/day/batch selection is URL-addressable and survives refresh.
- Existing Day editing behavior remains intact.
- Week mode uses stacked day sections and remains usable on mobile.
- Shared meetings retain one canonical identity, appear in relevant audience views, and export once.
- Exact custom times are visible on screen, print and CSV.
- Draft print/CSV is unmistakably unofficial and contains current issue status.
- Published screen/print/CSV use the same selected immutable snapshot projection.
- Published v2 includes publication-time batches, breaks, verified external commitments and issues.
- Legacy v1 remains readable without mutation and is disclosed as legacy context.
- Print produces one day per page for a Week selection.
- CSV is UTF-8/Excel-friendly, correctly quoted and uses the documented columns.
- Publication versioning/superseding is scoped to the active term.
- Projection/CSV/snapshot/integration/browser tests pass.
- Typecheck, lint, domain tests and production build pass.
- Summer 2026 data remains unchanged.

## 17. Decisions requiring approval

1. **Legacy v1 strategy — recommended:** keep v1 immutable, disclose its live-context fallback, and create v2 at the next normal publication. Alternative: authorize an immediate new publication after deployment.
2. **CSV external commitments — recommended:** export canonical meetings only, as the roadmap states. Alternative: add OD rows with a `record_type` column.
3. **UI test dependency — recommended:** add `@playwright/test` as a dev dependency and a `test:ui` script.
4. **Single-batch compact matrix — recommended:** defer it; stacked day sections with one filtered batch meet the required acceptance criteria with lower risk.
5. **Draft CSV access before AUTH-01 — recommended:** expose it only wherever the existing coordinator portal is already access-restricted; do not make it a public endpoint.

Implementation must not begin until these choices and the overall plan are approved.
