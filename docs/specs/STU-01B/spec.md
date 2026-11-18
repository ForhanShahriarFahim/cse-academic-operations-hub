# STU-01B — Excel import, roster downloads and printable roll-call

Issue [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · Approved · 18 November 2026 (Asia/Dhaka)

## Problem and outcome

Administrators can review and confirm CSV imports from Students and Manage roster. A workbook needs a manual conversion, and staff have no dedicated download or paper roll-call for the selected teaching group. This slice adds Excel to both import destinations, private CSV and Excel downloads of one current roster, and a blank A4 roll-call from the selected group. The accepted directory, enrollment and captured-attendance rules remain the basis for all three workflows. [Inspection](verification.md) · [STU-01A](../STU-01A/spec.md)

## Decisions for owner review

### D-1 — Authorization and entry points

| Operation | Entry point and authority |
| --- | --- |
| Import CSV or Excel to Students | **Import students** on Students. Requires the existing unscoped `manage_students` check. |
| Import CSV or Excel to a roster | **Import students** on Manage roster. Requires `manage_rosters` for the exact active-term group. Phone mapping follows the existing directory permission. |
| Download roster CSV or Excel | **Download roster** on Manage roster. Requires `manage_rosters` for the exact active-term group, including a scoped administrator for an authorized group. |
| Open printable roll-call | **Printable roll-call** on Attendance for users with `take_attendance` on the exact group, and on Manage roster for users with `manage_rosters` on it. Assigned teachers receive the paper roll-call through their existing group assignment. |

Reauthorize and resolve term and group on every direct request. Check Excel permissions before reading workbook contents. Bind downloads and print to the displayed term generation and group. An outdated term link, missing group, or lost assignment yields generic feedback and no roster bytes. Require sign-in and apply private, no-store delivery to both files and printable views. Keep student fields and uploaded data out of URLs, filenames, shared caches, and public surfaces.

### D-2 — Excel intake

- Accept plain `.xlsx` up to 256 KiB, alongside the existing UTF-8 CSV option and its existing limits. Offer labeled CSV and Excel samples for both destinations. Give the user a clear error for an unsupported, unreadable, encrypted, or malformed file. Support workbooks saved with ordinary text headers and cells. Identify formats from parsed content on the server and reject macros and external links.
- After upload, list visible worksheets by name. Preselect the only visible sheet. For multiple visible sheets, require a selection. Treat the first nonblank row in that sheet as headings and display column letters alongside headings so identical headings can be mapped explicitly. A sheet change clears mapping and review. Hidden worksheets are unavailable. Within the chosen worksheet, include nonblank source rows even when hidden or filtered by Excel, and say so beside the sheet selector. Keep original Excel row numbers in feedback.
- Bound processing before materializing cells, including ZIP entry count, total expanded bytes, XML work, and worksheet coordinates. Proposed caps are 100 archive entries, 8 MiB total expanded data, 64 columns, coordinates through row 2,000, and 500 nonblank data rows in the chosen sheet. Use a bounded parser configuration and enforce the limits on the server, including while decompressing. Provide a file-level recovery message when caps are exceeded. Ignore formatting-only cells for heading and data detection.
- Require text in mapped fields. Give row and field errors for formulas (including cached results), dates, numeric values, booleans, and error cells in mapped columns. Show how to recover Student IDs and phones as text using the original source values. Preserve leading zeroes, case and existing normalization for actual text. Never evaluate workbook formulas or follow links. A blank sheet or missing or malformed headings blocks preview. Ignore unmapped data under the same mapping rules as CSV.

### D-3 — Shared preview and confirmation

Reuse the accepted mapping fields, aliases, row validation, duplicate handling, identity-match rules, outcome counts and transactional write path. A roster Excel import can restore an enrollment or update its audience only when that disposition was reviewed. Phone follows the existing directory authority and preview redaction rules. The workbook stays in page memory and the server receives uploads in request bodies. Return sanitized headings plus row references and safe outcomes to the client. Never echo workbook rows or stored conflicting values.

Bind the proof to the exact uploaded bytes, format, sheet, mapping, actor, destination, reviewed state, and roster term context when applicable. Reparse and reauthorize on confirm. A stale, changed, expired, or replayed review applies zero changes. Keep the original workbook available to retry after a correctable error. Keep the existing CSV event names and semantics. Record successful Excel import using format-specific import events with existing safe counts, actor and target identifiers and no workbook name, sheet name, or raw fields. A failed import audit rolls back all attempted changes. Preview and no-op requests write nothing.

### D-4 — One current roster for CSV, Excel and paper

- Use the same active membership rule as new attendance sessions. Include each student with both an active group enrollment and active identity once, using stable Student ID order with an internal tie-break. Include local, external and merged audience members of the selected group, regardless of home department or batch. Limit this slice to the current roster. Attendance captured in prior sessions remains available through Attendance.
- CSV and Excel have **Student ID**, **Student Name**, **Audience Type** in the same order. Use accepted import audience keys in files. Use a single Excel sheet with explicit text cells and no formulas or hyperlinks. Use properly quoted UTF-8 CSV with a BOM and formula-safe escaping for cells that a spreadsheet could interpret as formulas. Document the marker used for those CSV cells and use Excel for lossless spreadsheet round-tripping, including Student IDs with leading zeroes. Use only safe term/group identifiers in filenames. An empty roster downloads headers only. The roster page explains that downloads cover active members.
- Paper uses the same rows and order, with Student ID, Student Name, Audience and a blank **Mark** column. Print the term, course code/title, group and audience context, page number, and generation date in Asia/Dhaka. Leave **Class date** blank for handwriting. Use A4 portrait, repeat context and column headings, reserve writing space, wrap long names and IDs, and keep each row together. With zero members, show an empty state in the preview and omit the Print action.
- Allowlist only the declared fields throughout. Exclude phone, department, batch, notes, internal student IDs, marks and captured-session history from all three outputs. Printed audience labels may use the same human-readable labels as Manage roster.

### D-5 — Audit and interaction

Record a read audit when a download is prepared or a roll-call sheet is generated for display. Record actor, format, term/group IDs and row count. Use explicit user navigation for print and downloads without prefetch. A reload can generate another sheet and audit. The audit describes generation and cannot attest that the user printed or saved the file. If audit recording fails, withhold the output and present an actionable error. Denials, stale links and empty print previews emit no output audit. Open roll-call with a return path to the original authorized group and an explicit **Print roll-call** button. Use the portal's existing form feedback, labels, and focus behavior for upload, review and download errors. [Workflow sketches](mockups/index.html)

## Acceptance criteria

| ID | Observable condition | Verification |
| --- | --- | --- |
| AC-01 | Direct upload, download and print requests enforce the permission matrix before private data is returned. Scoped admins, assigned or reassigned teachers, expired sessions, anonymous and wrong-group callers receive only authorized output. Stale term/group requests fail safely. | Permission matrix on both adapters and compiled browser, with response and cache-header inspection. |
| AC-02 | An Excel file can be mapped and previewed at either destination. A multi-sheet file preserves the selected sheet and Excel row references. Invalid workbook formats, bounds, unsafe structures and mapped cell types show recoverable errors without writes. Existing CSV aliases, caps and sample behavior still work. | Focused parser fixtures and browser uploads. |
| AC-03 | CSV and Excel implement matching preview/commit dispositions. Changed proof inputs, roster/term changes, expiry and concurrent/repeated confirmation cannot add unreviewed changes. Audit failure rolls back. | Both adapters, independent confirmation race, receipt and audit inspection. |
| AC-04 | CSV/Excel and paper agree on scope, ordering and membership. Verify a mixed roster, removed and inactive members, cross-department membership, empty roster, Unicode, leading-zero IDs and formula-like text. Each format exposes only its declared fields. | File readback, browser parity, audit failure check and serialized output inspection. |
| AC-05 | Import and roster output controls work with keyboard at desktop, 390 px and 320 px. A4 preview prints usable single- and multi-page roll-calls with repeat headings and blanks for marks. The flow never creates attendance sessions or changes captured records. | Compiled browser, axe, native A4 PDF review and captured-attendance regression. |

## Scope and sources

The parent issue remains open during local review. This proposal covers roster files, Excel import and blank roll-call. Directory-wide downloads, historical roster exports, dated attendance/marks reports, attendance selection or lifecycle redesign, and institutional rollout are outside this slice. The proposed workbook limits, assigned-teacher printable access, active-member output fields and read audit are explicit owner decisions. [Delivery sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md) · [Attendance terms](../../../CONTEXT.md#attendance-and-workload) · [Approval record and checklist](plan.md)
