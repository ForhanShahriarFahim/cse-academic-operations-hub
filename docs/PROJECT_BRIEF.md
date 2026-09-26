# Project brief — start here

Updated: 26 September 2026. This is the short current-state handover for a new maintainer or coding agent. Read the [README](../README.md) for installation, routes and operator workflows; the [execution plan](plans/PROJECT_EXECUTION_PLAN_2026-09-26.md) for ordered issues, acceptance gates and decisions; the [implementation roadmap](IMPLEMENTATION_SOLUTION_ROADMAP.md) for feature rationale; and [CONTEXT.md](../CONTEXT.md) for domain language. [GitHub issue #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16) is the live index. Prefer these current documents over old chat summaries.

Superseded handover/context and completed feature plans were removed from the working tree because they contradicted the current auth/source state. They remain recoverable in Git history; do not use them as live instructions.

## What the application does

This Next.js 16/React 19/TypeScript/Drizzle portal coordinates CSE academic terms, HSC and Diploma cohorts, courses and merged teaching groups, exact-time routines, conflict checks, attendance, teacher workload, extra-load claims, and published print/CSV routines. Local development uses a persistent PGlite database; deployment requires PostgreSQL. Source lives in `src/app`, `src/components`, `src/lib` and `src/db`; SQL migrations live in `drizzle/`.

- Internal pages require an invited Google account and server-enforced roles. A teacher record is not automatically a portal user. Real OAuth and hosted-PostgreSQL verification are still pending.
- Coordinators edit a working routine; only a validated, approved immutable snapshot belongs on the public route. The Summer 2026 source import currently has 13 blockers, so a clean seed has no published routine.
- Attendance records dated Midterm/Final sessions for an enrolled teaching group. Students may come from another department; roster import is CSV-based. Current navigation and feedback need improvement.
- Extra load is determined from assigned workload credit-hours, not merely catalog credits. A one-credit sessional course currently counts as two workload credit-hours; eligibility is strictly above 15. The default rate is Tk 200 per claimed class and is configurable.
- Rooms 406–408 are computer labs; room 505 also supports microprocessor/networking. A capable free lab can host theory. Day/time windows can be stream- or cohort-specific; do not turn a one-batch Friday exception into a stream rule.

## Data and source status

The checked-in [Summer 2026 routine transcription](source/CSE_SUMMER_2026_ROUTINE_V1_6.md) supports the import and contact appendices. It parses 185 source entries; two thesis/project entries are teacher-managed without fixed slots, so a fresh seed creates 183 scheduled meetings, 42 teacher records and 78 courses. Four teacher codes and other source facts still need reconciliation in [RUT-03](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/3). The original specification is missing from this checkout; do not infer institutional decisions from older notes. The owner has selected source §§4–6 as the public teacher, HSC/Diploma CR and query contact scope, including listed personal mobiles. Current code still redacts those fields until the approved source-bounded projection is implemented and publication blockers are cleared. Do not expose the full private directory or invent missing contacts.

## Work protocol

The next implementation issue is [SAFE-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2): backup/restore, second-term preservation and mutation/audit inventory. Its detailed proposal is in the execution plan and must be reviewed before behavior changes. Work one issue at a time: inspect, plan, obtain approval, implement, verify, make a focused commit, update the issue, and close only after acceptance criteria pass. RUT-01 is completed; AUTH-01 has pushed code but remains open for integration verification and public-contact work. Do not mark partial work complete.

Never run `npm run db:reset` on institutional data. Use disposable copies for restore and migration tests; preserve Spring/Summer history, published snapshots and attendance. Keep secrets, database dumps and student private data out of Git. Test typecheck, lint, domain checks and build for code changes, then browser/mobile/print paths appropriate to the issue. Before writing Next.js code, follow [AGENTS.md](../AGENTS.md) and the installed Next.js documentation.

## Fast commands

`npm install` → `npm run dev` starts a fresh local PGlite development copy; see README for Google setup. `npm run typecheck`, `npm run lint`, `npm run test:domain` and `npm run build` are the basic code checks. The real production path needs hosted PostgreSQL, OAuth, tested backups, migration/rollback procedures and separate staging; this repository is not yet production-verified.
