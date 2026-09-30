# CSE Academic Operations Hub

An academic operations platform for the Department of Computer Science & Engineering at Pundra University of Science & Technology. It combines routine planning, exact-time conflict validation, attendance, teacher workload, extra-class honorarium, external commitments, and immutable routine publication in one portal.

![CSE Academic Operations Hub dashboard](docs/screenshots/dashboard.png)

## Why this project exists

Academic operations are connected: moving one class can affect a teacher, a room, several merged batches, an external commitment, and the published routine. CSE Academic Operations Hub models those relationships directly instead of keeping disconnected spreadsheets and manually reconciling conflicts.

The application supports Spring and Summer sessions, preserves historical batch-semester placements, and keeps the editable working draft separate from the public routine.

## Highlights

- Exact-time Day and Week routine views for HSC and Diploma streams, with optional batch filtering.
- Batch-specific class days and time windows, including approved Friday exceptions.
- Deterministic automatic scheduler for safe initial placements.
- Conflict detection for teachers, rooms, audiences, breaks, capacity, external commitments, and room capabilities.
- Course-group attendance with CSV roster import and Midterm, Final, and semester summaries.
- External and merged students without coupling enrollment to home department.
- Teacher extra-load eligibility, daily class ledger, configurable payment rate, and printable university-style sheets.
- Manual top-sheet entries for teachers who maintain their detailed records offline.
- Separate catalog credits, approved workload units, and scheduled contact minutes.
- Draft and immutable published routine CSV exports generated from the same projection shown on screen.
- Immutable routine publication with an independent public/print viewer and browser Print/PDF output.
- PostgreSQL production mode and zero-configuration PGlite development mode.
- Invite-only Google sign-in, department-scoped roles, teacher-owned attendance/extra-load actions, and real-user audit attribution.

## Project status and next work

The Summer 2026 source routine is imported as a draft. Its remaining source conflicts are visible in **Validation** and must be resolved before a new official publication. New maintainers should start with the concise [project brief](docs/PROJECT_BRIEF.md), then the [current execution plan](docs/plans/PROJECT_EXECUTION_PLAN_2026-09-26.md) and [GitHub project roadmap](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16). The longer feature rationale remains in [IMPLEMENTATION_SOLUTION_ROADMAP.md](docs/IMPLEMENTATION_SOLUTION_ROADMAP.md).

## Product tour

These screenshots illustrate an earlier demo dataset; they do not certify the current imported Summer 2026 draft or a published routine.

| Routine planning | Automatic scheduling |
|---|---|
| ![Exact-time routine builder](docs/screenshots/routine-builder.png) | ![Automatic scheduling assistant](docs/screenshots/automatic-scheduler.png) |

### Weekly published routine

![Published HSC weekly routine with Print/PDF and CSV export](docs/screenshots/weekly-routine.png)

| Attendance | Extra-class honorarium |
|---|---|
| ![Attendance and roster management](docs/screenshots/attendance.png) | ![Extra-class load ledger](docs/screenshots/extra-load.png) |

### Validation before publication

![Conflict and validation report](docs/screenshots/validation.png)

## Core workflows

### Build and publish a routine

1. Confirm academic policy, permitted days, batch overrides, and breaks in **Settings**.
2. Add or move classes in **Routine Builder**, or preview safe suggestions in **Auto-schedule gaps**.
3. Review blockers and advisories in **Validation**.
4. Resolve every blocker.
5. Publish a new immutable version from **Publications**.
6. Open the **Public routine viewer**, choose HSC or Diploma and Day or Week, then optionally narrow to one batch.
7. Share, print/save as PDF, or download the approved CSV snapshot. The draft export is always labeled `DRAFT — NOT OFFICIAL`.

### Take attendance

1. Select a course/teaching group.
2. Add students individually or import a CSV roster.
3. Create a Midterm-phase or Final-phase attendance session.
4. Mark everyone present, then adjust individual exceptions.
5. Save and review Midterm, Final, semester percentage, and attendance marks.

Attendance supports Present, Absent, Late, and Excused. Late counts as attended; Excused is excluded from the denominator. Defaults are 10 attendance marks for theory and 5 for sessional/lab courses.

### Record extra class load

1. Select a teacher whose assigned credits are above the configured threshold.
2. Select one of that teacher's assigned course groups.
3. Enter the class date and exact time.
4. Print the detailed teacher sheet for a selected period.
5. Add offline/manual teacher totals when needed.
6. Print the combined departmental top sheet.

The default policy is 3 catalog credits for theory and 1 catalog credit for sessional. A sessional course counts as 2 workload credit-hours; extra load begins above 15 assigned workload credit-hours, at Tk 200 per class. Policy values are term-configurable. Signature cells remain blank for signing after printing.

## Conflict engine

The server validates half-open minute intervals, `[start, end)`. A class ending at 11:00 does not conflict with one beginning at 11:00.

Publication blockers include:

- Teacher, room, or student-audience double-booking.
- Duplicate overlapping physical events for one teaching group.
- External teacher or room conflicts.
- Break overlap.
- Class outside its stream/batch permitted window.
- Sessional placement in a non-lab room.
- Missing room capability.
- Known room-capacity violation.

Advisories include approved exceptions, unknown audience sizes, tight cross-building transitions, and source-reconciliation items.

## Room model

- Rooms 406, 407, and 408 are computer labs and may host theory when free.
- Room 505 is computer-capable and adds microprocessor and networking capabilities; it may also host theory.
- Sessional courses still require a lab and any specialist capability declared by the course.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Drizzle ORM
- PostgreSQL / node-postgres
- PGlite for persistent local development
- Lucide React icons

## Installation

### Requirements

- Node.js
- npm
- Optional: PostgreSQL for a shared or deployed environment

### Local setup

```bash
git clone https://github.com/ForhanShahriarFahim/cse-academic-operations-hub.git
cd cse-academic-operations-hub
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The public routine is available without a login. Internal pages require an invited Google account.

Without `DATABASE_URL`, the first development start creates `.data/pglite-summer-2026`, applies the checked-in migrations, and loads the verified Summer 2026 source dataset. Later starts preserve changes.

### Enable Google sign-in

1. Copy `.env.example` to `.env.local` and uncomment/set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (at least 32 random characters), `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Keep secrets out of Git.
2. Create a Google OAuth **Web application** client and authorize `http://localhost:3000/api/auth/callback/google` as a redirect URI. See [Google's server-side OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).
3. Set `PORTAL_BOOTSTRAP_ADMIN_EMAIL` to the owner's chosen Google address (and optionally `PORTAL_BOOTSTRAP_ADMIN_NAME`) in `.env.local`, then run `npm run auth:bootstrap` **once**. This is idempotent for the same first administrator and refuses to silently replace an existing administrator.
4. Run `npm run dev` and sign in at `/login` with that Google account. Use **People & Access** to invite staff, assign roles, link a teacher short code, suspend users, or revoke roles.

No public sign-up is enabled. An invited address must be verified by Google before it can access the portal. Without the four auth settings, internal access stays closed and `/login` shows a setup notice.

> Important: run only one database-using project process against `.data/pglite` at a time. Stop the development server before running a separate migration, preparation, or reset command.

### PostgreSQL setup

Create `.env.local` from `.env.example` and provide a real connection string:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Then run:

```bash
npm run db:prepare
npm run dev
```

Do not commit database credentials.

### Vercel deployment path

The Next.js application can run on Vercel, but **the local PGlite file cannot be the production database**. Set up a persistent PostgreSQL service (for example a [Vercel Marketplace Postgres integration](https://vercel.com/docs/marketplace-storage)), then set `DATABASE_URL` in Vercel. The app intentionally refuses to start on Vercel without it. Use a pooled Postgres connection string and place the database near the Functions region.

Before sending users to the deployment:

1. Set `DATABASE_URL`, `BETTER_AUTH_URL` (the final HTTPS origin), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` as Vercel environment variables. The Google OAuth Web client must authorize `https://YOUR_DOMAIN/api/auth/callback/google` exactly. A separate fixed preview domain/client is easiest for preview login.
2. From a trusted local terminal pointing at that hosted database, run `npm run db:prepare` once, then `npm run auth:bootstrap` with the approved administrator email. Vercel's build does not run these database setup commands. Do not use `db:reset` on the hosted database.
3. Deploy the repository as a Next.js project, then verify `/api/health`, anonymous public routine pages, Google sign-in, staff permissions, and sign-out against the production domain.
4. Review the remaining institutional decisions and source-routine blockers before treating the public routine as official. No routine is automatically published by this deployment.

This repository is **Vercel-compatible but not deployed or production-verified yet**. In particular, the Google callback cannot be tested without real OAuth credentials, and the local PGlite data is not automatically copied to hosted PostgreSQL.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Prepare and run the development server |
| `npm run build` | Create an optimized production build |
| `npm start` | Prepare and run the production server |
| `npm run db:migrate` | Apply checked-in migrations |
| `npm run db:prepare` | Migrate and seed only when the database is empty |
| `npm run auth:bootstrap` | Create the first invited administrator (explicit email required) |
| `npm run db:reset` | Destructively replace current data with the development seed |
| `npm run typecheck` | Run TypeScript validation |
| `npm run lint` | Run ESLint |
| `npm run test:domain` | Verify academic rules, routine projection, source data, and role policy |
| `npm run test:routine` | Run focused routine projection and CSV regression checks |
| `npm run test:ui` | Run Playwright routine view/export/print browser tests (Microsoft Edge on Windows) |

## Project structure

```text
cse-academic-operations-hub/
├── drizzle/                       # SQL migrations and migration metadata
├── docs/
│   ├── architecture/              # Architecture decision records
│   ├── plans/                     # Current execution plan
│   ├── source/                    # Summer 2026 routine transcription
│   ├── screenshots/               # README product screenshots
│   ├── templates/                 # Issue planning and extra-load print references
│   ├── WORKFLOW.md                # Shared development lifecycle and Git practices
│   ├── PROJECT_BRIEF.md           # Current-state agent/operator handoff
│   └── IMPLEMENTATION_SOLUTION_ROADMAP.md # Feature rationale
├── scripts/
│   ├── verify-domain.ts           # Academic-operations domain smoke checks
│   └── verify-routine-projection.ts # Routine projection/export regression checks
├── tests/                         # Playwright browser acceptance tests
├── src/
│   ├── app/
│   │   ├── (portal)/              # Authenticated staff pages, including Access
│   │   ├── api/auth/              # Google sign-in/session routes
│   │   ├── login/                 # Invited-account sign-in
│   │   ├── api/health/            # Database health endpoint
│   │   └── public/routine/        # Published routine viewer
│   ├── components/                # Interactive UI modules
│   ├── db/
│   │   ├── index.ts               # PostgreSQL/PGlite connection selection
│   │   ├── schema.ts              # Relational domain schema
│   │   ├── prepare.ts             # Migrate and seed-if-empty startup
│   │   └── seed.ts                # Summer 2026 source-routine development import
│   └── lib/
│       ├── academic-actions.ts     # Attendance, policy, and extra-load mutations
│       ├── auth/                  # Session provider, roles, resource checks, admin actions
│       ├── academic-operations.ts  # Attendance/extra-load read adapters
│       ├── actions.ts              # Routine, OD, and publication mutations
│       ├── attendance.ts           # CSV parsing and attendance calculations
│       ├── auto-schedule.ts        # Pure deterministic scheduling engine
│       ├── conflicts.ts            # Pure exact-time validation engine
│       ├── data.ts                 # Main portal read model
│       ├── public-routine.ts       # Snapshot-only public read model and contact redaction
│       ├── extra-load.ts           # Eligibility and payment calculations
│       ├── routine-projection.ts   # Shared Day/Week screen, print, and export projection
│       ├── routine-csv.ts          # Deterministic CSV serialization
│       ├── routine-sources.ts      # Draft/published source adapters
│       ├── schedule-automation.ts  # Scheduler database adapter
│       ├── serialize.ts            # Meeting views and immutable snapshots
│       └── workload.ts             # Workload calculations
├── AGENTS.md                       # Agent entry point and Next.js rule
├── CONTEXT.md                      # Domain glossary
└── README.md
```

## Application routes

| Route | Purpose |
|---|---|
| `/login` | Invited-account Google sign-in and setup notice |
| `/access` | Administrator-managed invitations, roles, teacher links, and suspension |
| `/` | Coordinator dashboard |
| `/routine` | Manual exact-time builder plus Day/Week, batch filter, print, and draft CSV |
| `/routine/export` | URL-addressed draft routine CSV export |
| `/routine/auto` | Safe automatic placement suggestions |
| `/conflicts` | Blockers and advisory warnings |
| `/attendance` | Roster, CSV import, attendance, and summaries |
| `/extra-load` | Extra-class ledger, honorarium, and print center |
| `/teachers` | Teacher directory and operational overview |
| `/workload` | Credits, workload units, and contact minutes |
| `/rooms` | Room capabilities and occupancy |
| `/batches` | Batch and term-semester placements |
| `/courses` | Catalog, offerings, and coverage |
| `/od` | External teaching and room commitments |
| `/publications` | Immutable version publication and history |
| `/settings` | Term policy, class windows, and pending decisions |
| `/routine/official` | Internal compact official routine/appendix print package |
| `/public/routine` | Public Day/Week viewer, batch filter, and printable immutable routine |
| `/public/routine/official` | Published compact official routine/appendix print package |
| `/public/routine/export` | URL-addressed published-snapshot CSV export |
| `/api/health` | Database health and mode |

## Current development baseline

A fresh `db:prepare` imports the Summer 2026 source routine: 42 teacher records,
78 courses, and 183 meetings. Validation currently reports 13 blockers; no
routine is published automatically. The public page therefore shows “No
published routine” until those blockers are resolved and an approver publishes
a version. The imported routine reflects source material, while inferred or
incomplete details still require institutional verification. Treat the seed as
development data, not as an approved official schedule.

## Documentation

- [Project brief — fastest current-state handoff](docs/PROJECT_BRIEF.md)
- [Shared development workflow — approval, branches and verification](docs/WORKFLOW.md)
- [Workflow setup — approved plan and delivery checkpoint](docs/plans/WORKFLOW-01.md)
- [Execution plan — order, gates and next issue](docs/plans/PROJECT_EXECUTION_PLAN_2026-09-26.md)
- [Implementation roadmap — feature rationale and issue codes](docs/IMPLEMENTATION_SOLUTION_ROADMAP.md)
- [Domain glossary](CONTEXT.md)
- [Academic-operations architecture decision](docs/architecture/ADR-001-academic-operations-boundaries.md)
- [Extra-load print-template analysis](docs/templates/extra-load-print-templates.md)
- [Summer 2026 source transcription](docs/source/CSE_SUMMER_2026_ROUTINE_V1_6.md)

## Production readiness notes

The application is runnable and its local checks pass, but production rollout still requires:

- Real Google OAuth callback and hosted-PostgreSQL authorization testing; the local authentication implementation is not yet production-verified.
- Reconciliation of the imported university routine's 13 blockers and institutional policy sign-off before public publication.
- A managed PostgreSQL database, encrypted backups, and restore testing.
- HTTPS, secrets management, monitoring, and a verified first administrator.
- A coordinator workflow for creating the next Spring/Summer term.

The referenced full v2.0 specification file is not present in this checkout. Settings currently displays 21 pending institutional decisions; earlier context claimed 31, so the difference must be reconciled from the original specification rather than inferred.

## Contact

For project handover questions: [dfahim432@gmail.com](mailto:dfahim432@gmail.com)
