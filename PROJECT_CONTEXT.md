# Pundra CSE Academic Portal — Consolidated Context

## Purpose and operating model

This coordinator-facing portal manages Pundra University of Science & Technology CSE academic operations: course delivery, editable routines, validation, attendance, workload, extra-class honorarium, cross-department commitments, and immutable public routine publication. The public page reads a published snapshot; working-draft edits never leak into it.

All development seed records are synthetic. Authentication is not yet implemented, so mutation screens must be deployed only behind an institutional access boundary until roles and sign-in are added.

## Academic calendar and cohort progression

- The university runs two sessions each year: Spring and Summer.
- Each session is an immutable `academic_terms` row; one is active for current operations.
- A batch keeps a stable `(stream, label)` identity. Its semester in each session is a separate `batch_term_placements` record, so yearly progression never rewrites history.
- Offerings, groups, requirements, policies, rosters, attendance, extra load, external commitments, and publications are term-scoped.
- HSC and Diploma are explicit streams. Per-stream teaching windows are defaults; per-batch windows override them, enabling cases such as Friday classes for one HSC batch without enabling Friday for all HSC cohorts.
- Days and exact start/end times are data, not hard-coded UI grid positions.

## Domain rules implemented

- Theory defaults to 3 credit hours; sessional defaults to 2. These are editable per term.
- Extra-load eligibility is strictly above 15 assigned credits by default. A teacher records each claimed class by assigned course, date, and exact time. Payment defaults to Tk 200 per class. Rate, threshold, and print date range are configurable.
- Teacher and top-sheet print views leave signature cells blank. The combined top sheet includes portal totals and optional manual teacher rows.
- Attendance rosters are course-group enrollments, independent of a student's home department. Local, external, and merged audience types are supported; deactivation preserves history.
- CSV roster import accepts common aliases for student ID, name, phone, department, and audience type.
- Attendance statuses are Present, Absent, Late, and Excused. Late counts as attended; Excused is removed from the denominator. Theory attendance defaults to 10 marks and sessional attendance to 5, both editable per term. Midterm, Final, and semester totals are shown.
- Meetings are canonical physical events. A merged/shared class is stored once and related to all audiences.
- Exact start/end minutes are authoritative. Conflict validation checks teacher, room, audience, break, allowed window, room capacity, room capability, external commitments, and incomplete source data.
- Rooms 406, 407, and 408 are computer labs. Room 505 is computer-capable and adds microprocessor and networking capabilities. Their `theory` capability permits theory use when free; sessional courses still require a matching lab capability.
- Automatic scheduling is a deterministic first-fit assistant, not an autonomous publisher. It generates safe draft suggestions and recomputes immediately before an explicit apply action. Publication remains blocker-gated.
- External/OD teaching and rooms are first-class commitments. A teacher from another department and a student from another department do not require fake CSE identities.

## Verified Summer 2026 development baseline

- 7 departments, 16 teachers, 14 rooms, 16 batches, 28 courses.
- 56 offerings, 55 teaching groups, 85 canonical meetings.
- Conflict engine: 0 blockers and 9 intentional warnings: 2 pending cross-stream reconciliations, 6 unverified audience sizes, and 1 approved HSC Friday exception.
- Coverage: 48 fully scheduled groups, 2 UT vacancies for CSE-3205 (HSC-24B and DIP-18B), 4 teacher-managed thesis groups, and 1 partial CSE-4101 group for HSC-23B.
- Published routine version 1, effective 14 August 2026.

## Application map

- `/` — operations dashboard.
- `/routine` — editable exact-time Day view plus URL-addressed Day/Week review, batch filtering, Print/PDF, and labeled draft CSV export.
- `/routine/auto` — automatic safe-placement suggestions and explicit apply.
- `/conflicts` — blockers and warnings.
- `/attendance` — roster CRUD, CSV import, daily attendance, phase and semester summaries.
- `/extra-load` — eligibility, daily claims, print center, and manual top-sheet rows.
- `/extra-load/teacher/[id]/print` — per-teacher printable sheet.
- `/extra-load/top-sheet/print` — combined printable top sheet.
- `/teachers`, `/teachers/[id]`, `/workload` — faculty schedule and allocation views.
- `/rooms`, `/batches`, `/courses` — resource, placement, catalog, and coverage views.
- `/od` — structured cross-department teaching and room commitments.
- `/publications` — validation-gated immutable publication.
- `/settings` — term policy, day/window management, and 21 currently visible pending decisions. Earlier context reported 31; the missing specification prevents safely reconstructing the difference.
- `/public/routine` — immutable published Day/Week viewer with batch filtering, Print/PDF, and snapshot CSV export.
- `/api/health` — database health and mode.

## Architecture and extension seams

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.
- Dynamic server-rendered data pages and validated server actions.
- Drizzle ORM with PostgreSQL semantics. `DATABASE_URL` uses node-postgres; otherwise development uses persistent PGlite at `.data/pglite`.
- Schema and migrations: `src/db/schema.ts`, `drizzle/`.
- Seed and startup preparation: `src/db/seed.ts`, `src/db/prepare.ts`.
- Core read model and validation: `src/lib/data.ts`, `src/lib/serialize.ts`, `src/lib/conflicts.ts`.
- Attendance and extra-load modules: `src/lib/attendance.ts`, `src/lib/extra-load.ts`, `src/lib/academic-operations.ts`, `src/lib/academic-actions.ts`.
- Automatic scheduling: pure engine in `src/lib/auto-schedule.ts`, database adapter in `src/lib/schedule-automation.ts`.
- Architecture decisions: `docs/architecture/ADR-001-academic-operations-boundaries.md`.

## Source-of-truth limits

The referenced `pundra-cse-academic-portal-specification.md` is missing from this checkout. Restore it before calling this repository the complete institutional source of truth. Settings currently surfaces 12 blocking and 9 operational decisions (21 total), while earlier context claimed 31; the difference cannot be reconstructed safely without the specification. Current values are operational defaults, not silent claims of final institutional approval.
