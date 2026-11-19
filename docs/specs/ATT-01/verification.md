# ATT-01 — Inspection and verification

[Issue #8](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8) · [Specification](spec.md) · [Plan](plan.md)

Inspected local `main` at `dec448e` on 19 November 2026, Asia/Dhaka. GitHub #8 was read on that date and was open. The owner's 30 September comment described the teacher-first routine and phone roll-call direction as brainstorm input. [Issue and owner comment](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/8#issuecomment-5915263547)

## Inspection evidence

- The page parses only `group`. The query adapter chooses the first authorized group on bare entry and returns no selected group for an invalid ID. The manager renders a single group selector and uses local state to select the latest dated session. The current no-group label covers both a bad link and an empty term. [Attendance page](../../../src/app/(portal)/attendance/page.tsx) · [Query and group options](../../../src/lib/academic-operations.ts) · [Attendance manager](../../../src/components/attendance-manager.tsx)
- The page's candidate filter uses course ownership, roster capability, and assigned teacher IDs from allocations and working meeting views. Its empty-access check falls back to CSE-scoped roster authority. The resource gate uses the course's owner or CSE fallback and existing allocation or persisted meeting assignment for teacher access. Session create also calls the query adapter after the action guard and roster locks. Keep both entry points in the implementation review. [Resource authorization](../../../src/lib/auth/index.ts) · [Role policy](../../../src/lib/auth/policy.ts) · [Attendance actions](../../../src/lib/academic-actions.ts)
- The group binds a catalog course to one or more offerings. Batch placements provide the term's curriculum semester, and batches have stream/label fields without a department FK. A group's external label is descriptive. External commitments are separate. The routine source includes HSC and Diploma classes and Other Departments entries. Student enrollment is independent of group audience filtering. [Schema](../../../src/db/schema.ts) · [Class-group reads](../../../src/lib/class-group-store.ts) · [Institutional routine source](../../source/CSE_SUMMER_2026_ROUTINE_V1_6.md) · [Architecture](../../architecture/ADR-001-academic-operations-boundaries.md)
- My routine already chooses a published weekly snapshot or working draft and calculates today's weekday in Dhaka. The active roster helper includes active students with active enrollments. Dated session records retain students captured at creation, and creation currently records them as absent. The printable roster separately checks active term, role and group before reading and auditing current roster output. [Routine selection](../../../src/lib/teacher-routine-data.ts) · [Current roster](../../../src/lib/current-roster.ts) · [Roster output](../../../src/lib/roster-output.ts)
- Consulted the installed Next.js App Router Page, URL search parameters and Link guides. Page-level search parameters are asynchronous and can contain repeated values as arrays.

## Acceptance evidence

AC-01–AC-06 are pending implementation. This checkpoint covers repository and issue inspection and a static workflow sketch. No application, test fixture, schema or institutional database changes were made. Runtime checks, owner implementation approval, delivery acceptance and local merge are pending.

## Proposal checks

- Verified 41 Markdown links and 22 sketch links, including local fragments and the existing STU-01B print sketch. Checked the decision and criterion IDs, the single checklist and proposal whitespace.
- Opened the static sketch in Edge through a temporary loopback server. No page-wide overflow at 1440, 390 and 320 px. At 320 px, the course finder, group and roll-call links reached their intended sections. These checks exercised the sketch only.
