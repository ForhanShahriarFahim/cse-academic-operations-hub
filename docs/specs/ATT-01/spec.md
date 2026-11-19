# ATT-01 — Find a class and open attendance

[Issue #8](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8) · Approved for implementation · 19 November 2026, Asia/Dhaka

## Problem and outcome

Attendance opens the first permitted group when the URL has no selection. Its single selector mixes courses and audiences. A teacher arriving from the routine must find the same group again and then locate the dated session. An invalid link gives the same message as a term with no groups. The current roster and the students captured by a dated session are already separate.

A teacher can open a scheduled class from Attendance and reach the correct roll-call, or find any assigned group when the day has no scheduled classes. A roster administrator can find a course or teaching group in at most four selections. Both routes land in one active-term workspace for a canonical teaching group. [Inspection](verification.md) · [Desktop and phone sketches](mockups/index.html)

## Proposed decisions

### D-1 — Start with the teacher's classes

- For a linked teacher with attendance access, `/attendance` opens **My classes**, beginning with **Today's classes** in Asia/Dhaka. Show local date, course code and title, full audience, exact scheduled time and room when known. List separate slots separately, even when they share a group. Follow with **All my classes**, including authorized assignments with no fixed time or no class today. An empty today list leaves the assigned groups available. A teacher with no eligible group sees an explanation.
- Use the active term's applicable published weekly routine when available, or its working draft with a visible **Working draft** label. Respect the term date range and available effective bounds. Today's classes are recurring timetable entries. Display that basis so a teacher can account for holidays and changes. Keep the assignments list usable outside the term date range. A qualifying class must be a real active-term teaching group the teacher can open, with a scheduled slot assigned to the teacher. External commitments and room-only bookings do not create attendance cards.
- **Find a course** is the default for roster administrators without an eligible teacher identity. A linked account with both paths can switch between them. Teachers can also use Find a course within their own authorized groups. Opening a class always requires an explicit choice. There is one Attendance navigation item.

### D-2 — Find a course within the active term

- Use **Department → Stream → Batch → Course / teaching group**. Each choice scopes the controls to its right. Department is the catalog course's owning department, with the same CSE fallback as attendance authorization. HSC and Diploma paths come from valid same-term links to offerings for the group's own course and their cohort placements. Use the batch ID, stream and term-specific semester for display and matching. A CSE roster administrator may also see its active placed batches with no offerings. In other departments, derive batch choices from that department's term offerings, since batch records do not have department ownership. A teacher's choices derive from authorized assigned groups.
- A group with an external audience label can also be found through **External / other** and the recorded label. An authorized group with no usable local link or recorded external label remains discoverable through **External / other → No batch linked**. Cancelled offerings and invalid or out-of-term links do not create local filter paths. Retained groups remain reachable by authorized direct link and the fallback if needed. External labels are descriptive and create no department, cohort or enrollment records.
- Each final option names the course code, title and complete configured audience, with a direct link that completes the fourth selection. A merged group appears once within any matching branch and opens the same group regardless of the branch. Distinguish otherwise identical options with their stable group reference. A sole valid department, stream or batch can preselect visibly. Opening the final group always takes a deliberate selection.
- In an authorized batch, distinguish **No course offerings in this batch** from **No teaching groups with attendance access for this selection** using authorized offering context. Treat missing, inaccessible and stale direct groups alike in the recovery message. Provide a way to change the filter or return to My classes.

### D-3 — Keep selection and roll-call entry stable

- The URL holds the view and valid selections, including the group ID. Use stable IDs for real records and bounded keys for external branches. Reload, shared internal links and browser Back/Forward restore valid choices. Upstream changes clear incompatible downstream choices. Validate repeated, malformed and mismatched values on the server. A bad filter restores the longest valid prefix with a recovery message. An explicitly invalid or incompatible group opens no group. Support existing `/attendance?group=<id>` links and return links from roster and print. Direct access to a group with no unique browse branch still shows the group and its full audience.
- A Today card can open an existing dated roll-call when exactly one session for that group matches today's local date and the slot's exact start and end. The link targets that session explicitly. With no unique exact match, open the same group's dated-session controls and show the originating slot time as context. The teacher can open an existing session or use the current create form. Opening a class creates no session and fills in no form fields.
- Resolve an explicit session ID inside the selected active-term group. An unavailable session keeps the permitted group open and asks the user to choose a session before marking. A group-only link retains the current latest-session default. The group header identifies term, course and audience while the teacher works. Keep **Manage roster** and **Printable roll-call** links where permitted. The printable roll-call is the blank current-roster sheet delivered by STU-01B.
- Use labeled controls and expose focus and pending state during navigation. Keep controls and group identity readable at phone widths. Announce empty and unavailable states, and put focus at the workspace heading or intended section when the user opens a class. Within an open group the existing create, select, mark, save, delete, feedback and roster workflows retain their behavior.

### D-4 — Apply the existing resource authority

- Gate actor, active term, role scope and assignment on the server. The page, browse options and direct targets follow the existing group-level `take_attendance` or `manage_rosters` decision. Roster management and digital roll-call controls retain their individual checks. A linked teacher can find and open only assigned groups unless a current broader role grants access. Administrators see only the departments their role permits. A signed-in actor without attendance or roster authority sees the portal's forbidden state. A valid teacher with zero groups sees the teacher landing empty state.
- Authorize selection before loading or returning student data. Send only authorized group metadata to the chooser. Read roster and session data only for a successfully opened group. Reuse term-generation checks and existing mutation guards, including when the term or an assignment changes after a page opens. Group and session choices never filter, copy or reassign enrollment by student home department.

## Boundaries and later designs

ATT-01 covers navigation and entry to the current attendance workspace. The second half of the sketches shows the rest of the attendance workflow for design review. Future behavior needs its own issue specification and approval. [Owner's design notes](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8#issuecomment-5915263547) · [Local sequence](../../plans/LOCAL_DELIVERY_2026-10-26.md)

| Part | Boundary |
| --- | --- |
| ATT-02 / #9 | Keep the accepted inline messages, draft behavior and action feedback in the workspace. |
| STU-01 / #37 | Reuse enrollment, import, downloads and the A4 blank roll-call as delivered. |
| CAL-01 / #38 and ATT-03 / #10 | Date/time suggestions, calendar exceptions, draft/submission/locking and corrections. Review mobile marking, Present-by-default, search, roll-number ordering and live counts here. Current defaults and storage form part of the existing session behavior. |
| SET-01B / #14 and ATT-04 / #11 | Effective policy history, Midterm/Final/Semester explanations, denominator, rounding and awarded marks. |
| ATT-05 / #12 | Term history, dated ledger, student matrix and reports with matching exports. Reuse group identity and session links. |

ATT-01 proposes no schema migration, historical-term browser, new role, publication change or institutional operation. AUTH-01's external integration checks remain tracked separately. Current term offering and class-group data are available through the accepted CRS-01 slices.

## Acceptance criteria

| ID | Observable condition | Verification |
| --- | --- | --- |
| AC-01 | A linked teacher lands on their own classes and opens a Today card in one action. Exact dated match opens that session. Unmatched, ambiguous and outside-term cases lead to the appropriate controls or empty state without creating data. | Fixed Dhaka dates, published/draft, dual slots, unscheduled assignments and one-tap compiled browser review. |
| AC-02 | An authorized user can reach a group through no more than four selections. HSC and Diploma branches for a merged group use the same group and complete audience. External and fallback groups are discoverable. Empty states explain the selected stage. | Synthetic offering/placement data on both adapters and desktop/phone browser review. |
| AC-03 | Refresh and Back/Forward restore valid filters and group links. Tampered, repeated, cross-group or stale targets show recovery without opening a substitute group or explicit session. Legacy, roster and print return links open their intended group. | URL resolution checks and compiled navigation review, including a term switch. |
| AC-04 | Assigned-teacher, dual-role, scoped administrator, unassigned teacher, revoked assignment, viewer and anonymous cases expose only permitted options and private data. Unselected or refused groups load no student data. | Both synthetic adapters, server projection assertions, role-specific browser requests and existing attendance/roster authorization checks. |
| AC-05 | In the opened group, a cross-department student remains enrolled. A removed student can still appear in the captured session. Creation, marking, feedback, roster and A4 output continue to work under current rules. | Both adapters and focused compiled attendance/roster regression on disposable data. |
| AC-06 | A keyboard or phone user can choose a class, correct a filter and reach the intended roll-call. Pending, empty and unavailable states are accessible, and long audiences do not cause page overflow. | Edge at desktop, 390 px and 320 px, keyboard, accessibility scan and focused captures. |

[Sole checklist and approval record](plan.md) · [Verification](verification.md) · [Product requirements](../../PRODUCT_REQUIREMENTS.md#att-01--cascading-course-selection)
