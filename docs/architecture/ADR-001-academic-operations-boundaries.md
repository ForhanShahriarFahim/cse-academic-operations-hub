# ADR-001: Boundaries for academic operations

Status: Accepted for the current implementation

## Context

Routine slots, course credit policy, extra-load claims, attendance, cohorts, and external-department participation change at different rates. Coupling them to a single routine grid would make historical sessions hard to preserve and exceptions such as one HSC batch meeting on Friday unsafe to express.

## Decision

1. A Spring or Summer session is a term boundary. Policy and operational records carry `term_id`; cohort semester progression is recorded in `batch_term_placements`.
2. A batch-wide timetable exception is a `permitted_windows` override scoped to that batch. If overrides exist for a batch/day, they replace the stream default for that batch/day.
3. A room exposes capabilities and a course may require one. Theory-capable labs remain usable for theory; sessional placement requires lab type and any declared specialist capability.
4. A student's identity is independent of enrollment. `course_enrollments` joins any student to any teaching group and labels participation local, external, or merged. Deactivating enrollment does not delete attendance history.
5. Attendance sessions capture their roster as records at creation time. Later saves may update only those captured students.
6. Extra-load entries snapshot course and audience labels so printed historical claims remain readable after catalog edits. Eligibility and payment calculations live in a pure policy module.
7. Automatic scheduling is split into a pure planning engine and a database adapter. Suggestions are deterministic, produce reasons for unplaced groups, and are recomputed within the apply action. They modify only the working draft and never publish.
8. Print views are HTML/CSS projections of application data. Signature fields deliberately remain blank for physical signing.

## Consequences

- Routine, attendance, and extra-load modules can evolve independently while sharing term, teacher, course-group, and audit identities.
- Cross-department students and teachers are represented without duplicating or pretending they belong to CSE.
- Operational exceptions are visible data and participate in validation.
- Future authentication can enforce coordinator, teacher, and read-only roles at server-action boundaries without redesigning domain tables.
