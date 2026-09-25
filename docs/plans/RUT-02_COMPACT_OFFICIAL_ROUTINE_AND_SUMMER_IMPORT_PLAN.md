# RUT-02 / DATA-01 — Compact Official Routine Package and Summer-2026 Source Import

## Status

Plan only. No application code, database rows, migrations, or seed data are changed by this document.

The request combines two related outcomes but they should be implemented as two controlled work packages:

1. **RUT-02 — Compact official routine package:** replace the long weekly print view with a PDF-ready package matching the supplied routine format.
2. **DATA-01 — Summer-2026 source import:** replace synthetic Summer-2026 routine/master data with the supplied Markdown/PDF source, after an explicit source reconciliation and backup.

Keeping these packages separate gives the routine renderer a stable contract and prevents a layout change from hiding an import error.

## Source review

Reviewed sources:

- `CSE Summer-2026 Class Routine v1.6.pdf` — five A4 pages; page 1 HSC routine, page 2 Diploma routine, page 3 course offers, page 4 teachers/CR/query contacts, page 5 blank.
- `CSE Summer-2026 Class Routine (Exact PDF Layout).md` — the same routine tables plus readable teacher, course, CR, and contact data.

The source layout is landscape-oriented and dense:

- Page 1: one HSC page containing Friday, Saturday, Sunday, Monday, and Tuesday blocks, with different time bands and a vertical prayer-break separator where needed.
- Page 2: one Diploma page containing Friday and Saturday blocks, also with a prayer-break separator.
- Page 3: course-offer tables grouped by curriculum semester.
- Page 4: 38 teachers, HSC/Diploma CR lists, and three query contacts.

The current application instead renders one full document section per day in Week mode. That is why the existing export is long and unsuitable for sharing as one official routine.

## Proposed official export package

The default **Official routine package** will contain four A4 landscape pages:

1. **HSC routine** — one compact page, all HSC routine blocks.
2. **Diploma routine** — one compact page, Friday and Saturday blocks.
3. **Course offers** — the eight semester-pair tables from the source document.
4. **Directory and help** — teacher list, HSC CRs, Diploma CRs, and “For Any Query” contacts.

The export header on every page will show:

- Pundra University of Science & Technology.
- Department of Computer Science & Engineering.
- `Class Routine, Summer-2026`.
- Effective date: `14 August 2026`.
- Program/page label, publication version, and generated date.

The footer/legend will preserve `NB = New Building`, `OD = Other Departments`, the exact/custom-time note, query note, and page number. A browser Print/Save-as-PDF route remains the first implementation target; it avoids a second server-side PDF renderer while producing a controlled A4 package.

The on-screen Week view can remain useful for review, but the official print/export route will use the compact package. CSV remains a separate canonical-meeting export and will not try to imitate the visual PDF.

## Official routine layout design

### HSC page

- Use the source’s Friday/Saturday 09:30–15:45 band and Sunday–Tuesday 09:00–13:15 band.
- Render Friday, Saturday, Sunday, Monday, and Tuesday as vertically grouped row blocks in one table.
- Keep batch labels as `25 B`, `24 B`, etc. and show the stream in the page heading rather than repeating `HSC-` in every cell.
- Preserve custom times such as `12:00 PM–2:30 PM` and `2:00 PM–3:15 PM` inside their cells.
- Preserve merged/shared audience labels, OD rows, pending/exception highlights, and exact room/teacher abbreviations.
- Render the prayer break as a narrow vertical separator, matching the source’s visual reading order.

### Diploma page

- Render the Friday 09:00–16:00 table and Saturday 12:00–17:00 table on one landscape page.
- Preserve the prayer-break separator and the source’s seven Diploma batches plus OD row.
- Keep the Diploma page independent of HSC filtering so a single package always includes both streams.

### Print safety

- A dedicated print document will contain exactly the package pages; it will not rely on a scrollable weekly DOM.
- `@page { size: A4 landscape; margin: ... }` will be applied to the package route.
- Header metadata, effective date, version, footer notes, and page numbers will be part of the print DOM, not browser chrome.
- Tables will use `break-inside: avoid`, fixed column sizing, controlled font-size tiers, and a print-only overflow check.
- A Playwright print-media test will assert page count/section count, header visibility, and absence of horizontal overflow at the target viewport.

## Data model additions

### Routine metadata

Add term-scoped, editable records for material that is currently only in the PDF:

- `class_representatives`: `termId`, `batchId`, display name, phone, active flag, sort order.
- `department_contacts`: `termId` (or institution scope), name, designation, phone, email if available, contact purpose, sort order.

The publication snapshot v3 (or an additive metadata object within the next snapshot version) will capture the exact teacher directory, CR list, query contacts, course-offer appendix rows, and effective-date labels used for the official package. Historical publications therefore remain reproducible when contacts later change.

### Course and teacher identity

- Import the 38 source teacher codes and names from the Markdown/PDF, including phone/email where present.
- Map source department names to existing department records; create only departments actually represented by the source.
- Normalize source course codes such as `CSE 1101` to the application’s canonical `CSE-1101` format while retaining a source-code note/alias for auditability.
- Import source course titles, semester placement, course type, and source credits into the catalog.
- Apply the approved policy that theory courses are 3 credits and sessional courses are 2 credits for workload/extra-load calculations. The source appendix prints many sessional courses as 1 credit, so this discrepancy must be explicitly recorded rather than silently mixed.

### Rooms and capabilities

- Normalize `NB-406`, `NB-407`, `NB-408`, and `NB-505` as canonical room codes while displaying the same labels as the source.
- Mark 406/407/408 as computer labs; mark 505 as a microprocessor/networking-capable computer lab and theory-capable when free, per the existing institutional rule.
- Import other source rooms used by the routine (`NB-501` through `NB-508`, `NB-606`, `NB-607`, `NB-608`, `NB-701`, `NB-702`, `NB-703`).
- Keep capacity null when the source does not provide it; do not invent capacities. The conflict engine should show an audience-size advisory until authoritative counts are supplied.

### Meetings and exception policy

- Build one canonical meeting per physical class and link every HSC, Diploma, or external audience served by that meeting.
- Import teacher and room assignments from the source abbreviations.
- Preserve exact times and custom labels; never coerce a 75-minute or 150-minute class into a standard slot.
- Keep OD commitments separate from local course meetings but include verified OD rows in the official routine display.
- Apply the user-approved policy that HSC follows Saturday–Tuesday slots. The PDF’s Friday HSC-25B rows will not become normal HSC meetings.

## HSC-25B Friday exception handling

The PDF contains Friday entries for HSC 25B, while the requested operating rule says HSC should use Saturday–Tuesday slots. The import plan therefore treats those Friday rows as **source exceptions requiring reconciliation**, not as active HSC meetings.

Recommended behavior:

- Do not import them as active HSC-25B Friday meetings.
- Keep a source-reconciliation record containing the original course, teacher, room, and time.
- Retain only the Saturday–Tuesday HSC-25B classes unless the user explicitly assigns replacement slots for Friday-only courses.
- Show unresolved Friday-only courses in the coverage/validation report rather than silently deleting their teaching requirement.

This preserves the source evidence and avoids encoding a Friday HSC rule that the user has explicitly rejected.

## Import and rollout sequence

### DATA-01A — Source inventory and mapping report

1. Back up the current PGlite/PostgreSQL database and export the current Summer-2026 state.
2. Parse the Markdown tables into a versioned import manifest: teachers, courses, rooms, HSC meetings, Diploma meetings, course offers, CRs, contacts.
3. Compare every source code against the current schema and emit `matched`, `new`, `ambiguous`, and `missing` rows.
4. Produce a review report before any destructive replacement.

### DATA-01B — Controlled Summer-2026 replacement

1. Keep historical terms/publications immutable.
2. Replace only the synthetic Summer-2026 master/routine records identified in the approved import scope.
3. Preserve attendance, extra-load, audit, and publication history unless the user explicitly approves a clean development reset.
4. Import metadata and source-reconciliation rows.
5. Re-run conflict and coverage analysis; no source row may disappear without a report entry.

### RUT-02A — Compact renderer and metadata appendix

1. Add a deep `OfficialRoutinePackage` projection that accepts one term source plus metadata and returns ordered page sections.
2. Add HSC and Diploma compact adapters over the existing canonical meetings.
3. Add course-offer, teacher, CR, and query appendix adapters.
4. Add a dedicated print route used by both draft preview and published snapshot.
5. Keep CSV driven by the existing canonical meeting projection.

### RUT-02B — Verification and publication

1. Compare the generated HSC and Diploma pages visually against the supplied PDF at A4 landscape.
2. Verify every imported meeting’s day, time, course, teacher, room, and audience.
3. Verify all teachers, CRs, query contacts, and course-offer rows appear in the appendix.
4. Publish only after validation blockers are resolved or explicitly approved.

## Deep module seam

Create one deep `official-routine-package` module with a small interface:

```ts
buildOfficialRoutinePackage({
  source,          // draft or immutable publication snapshot
  metadata,        // course offers, teachers, CRs, query contacts
  policy,          // days, time bands, breaks, exception rules
  generatedAt,
}): OfficialRoutinePackage
```

The returned package owns page ordering, compact row grouping, exact-time labels, shared/OD presentation, footer notes, appendix ordering, and export metadata. React screen rendering and print rendering become adapters over this projection; they do not re-filter raw meetings independently.

The import parser will be a separate adapter over the Markdown source. It will produce a typed manifest and reconciliation diagnostics rather than writing directly to the database.

## Test plan

- Pure parser tests for teacher/course/room/meeting/CR/contact extraction.
- Mapping tests for source codes, HSC/Diploma batches, room normalization, and shared audiences.
- Regression test that HSC-25B Friday rows are excluded from active meetings and reported as reconciliations.
- Policy tests confirming theory=3 credits and sessional=2 credits for workload/extra-load calculations.
- Projection tests asserting exactly two routine pages and the required appendix pages.
- Export parity tests: screen/print package and CSV reference the same canonical meeting set.
- Playwright tests for print media, A4 landscape, headings/effective date, no horizontal overflow, both streams present, and metadata appendix visibility.
- Conflict/coverage tests after import, including room, teacher, audience, break, and custom-time checks.
- Backup/restore smoke test before any Summer-2026 replacement.

## Acceptance criteria

- Official export contains HSC and Diploma together, with one compact routine page per stream.
- The PDF-ready package includes teacher list, both CR lists, query contacts, course offers, effective date, version, legends, and page numbers.
- All header and footer information is visible and not clipped when saved as A4 landscape PDF.
- Source teacher/course/room/meeting data is imported without dummy Summer-2026 identities remaining in the approved scope.
- Missing/ambiguous source values are surfaced in a reconciliation report; nothing is fabricated.
- HSC-25B does not receive an active Friday meeting under the approved policy.
- Historical terms/publications and attendance/extra-load records remain preserved.
- Conflict engine and coverage tracker pass against the imported source.
- The current CSV contract remains canonical and deterministic.

## Decisions required before implementation

1. For Friday HSC-25B courses that have no Saturday–Tuesday replacement in the source, should they remain unscheduled as reconciliation items, or should you provide replacement day/time slots?
2. Confirm that the PDF’s sessional `1.00` credit labels are outdated and the application must import/use `2.00` credits for all sessional courses.
3. Confirm that the official package should include the course-offer appendix as page 3, in addition to the requested teacher/CR/query appendix.
4. Confirm whether the current synthetic Summer-2026 attendance/extra-load/demo records should be archived/preserved or removed from the development database after backup. The supplied source contains no student roster, so student records cannot be replaced from this PDF.
5. Provide authoritative room capacities and any missing room capabilities if capacity blockers should be enforced immediately.
6. Confirm whether browser Print → Save as PDF is acceptable, or whether you require a server-generated downloadable `.pdf` file.

## Roadmap position

`RUT-01` is complete. The next roadmap phase after the routine work is **AUTH-01 — Authentication and role authorization**. The roadmap explicitly recommends completing AUTH-01 before exposing substantial new CRUD functionality in production; after that come teacher, room, batch/term, and course master-data management, followed by attendance improvements.
