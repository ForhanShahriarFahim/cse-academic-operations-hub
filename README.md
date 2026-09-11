# CSE Academic Operations Hub

An academic operations platform for the Department of Computer Science & Engineering at Pundra University of Science & Technology. It combines routine planning, exact-time conflict validation, attendance, teacher workload, extra-class honorarium, external commitments, and immutable routine publication in one portal.

![CSE Academic Operations Hub dashboard](docs/screenshots/dashboard.png)

## Why this project exists

Academic operations are connected: moving one class can affect a teacher, a room, several merged batches, an external commitment, and the published routine. CSE Academic Operations Hub models those relationships directly instead of keeping disconnected spreadsheets and manually reconciling conflicts.

The application supports Spring and Summer sessions, preserves historical batch-semester placements, and keeps the editable working draft separate from the public routine.

## Highlights

- Exact-time routine builder for HSC and Diploma streams.
- Batch-specific class days and time windows, including approved Friday exceptions.
- Deterministic automatic scheduler for safe initial placements.
- Conflict detection for teachers, rooms, audiences, breaks, capacity, external commitments, and room capabilities.
- Course-group attendance with CSV roster import and Midterm, Final, and semester summaries.
- External and merged students without coupling enrollment to home department.
- Teacher extra-load eligibility, daily class ledger, configurable payment rate, and printable university-style sheets.
- Manual top-sheet entries for teachers who maintain their detailed records offline.
- Separate catalog credits, approved workload units, and scheduled contact minutes.
- Immutable routine publication with an independent public/print viewer.
- PostgreSQL production mode and zero-configuration PGlite development mode.

## Product tour

| Routine planning | Automatic scheduling |
|---|---|
| ![Exact-time routine builder](docs/screenshots/routine-builder.png) | ![Automatic scheduling assistant](docs/screenshots/automatic-scheduler.png) |

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
6. Share or print the approved snapshot from the **Public routine viewer**.

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

The default policy is 3 credits for theory, 2 credits for sessional, extra load above 15 assigned credits, and Tk 200 per class. All values are term-configurable. Signature cells remain blank for signing after printing.

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

### Zero-configuration local setup

```bash
git clone https://github.com/ForhanShahriarFahim/cse-academic-operations-hub.git
cd cse-academic-operations-hub
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `DATABASE_URL`, the first development start creates `.data/pglite`, applies the checked-in migrations, and loads the verified synthetic Summer 2026 dataset. Later starts preserve changes.

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

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Prepare and run the development server |
| `npm run build` | Create an optimized production build |
| `npm start` | Prepare and run the production server |
| `npm run db:migrate` | Apply checked-in migrations |
| `npm run db:prepare` | Migrate and seed only when the database is empty |
| `npm run db:reset` | Destructively replace current data with the development seed |
| `npm run typecheck` | Run TypeScript validation |
| `npm run lint` | Run ESLint |
| `npm run test:domain` | Verify CSV, attendance, eligibility, payment, and amount-wording rules |

## Project structure

```text
cse-academic-operations-hub/
├── drizzle/                       # SQL migrations and migration metadata
├── docs/
│   ├── architecture/              # Architecture decision records
│   ├── screenshots/               # README product screenshots
│   └── templates/                 # Extra-load template analysis
├── scripts/
│   └── verify-domain.ts           # Pure domain smoke checks
├── src/
│   ├── app/
│   │   ├── (portal)/              # Coordinator-facing pages
│   │   ├── api/health/            # Database health endpoint
│   │   └── public/routine/        # Published routine viewer
│   ├── components/                # Interactive UI modules
│   ├── db/
│   │   ├── index.ts               # PostgreSQL/PGlite connection selection
│   │   ├── schema.ts              # Relational domain schema
│   │   ├── prepare.ts             # Migrate and seed-if-empty startup
│   │   └── seed.ts                # Verified synthetic development data
│   └── lib/
│       ├── academic-actions.ts     # Attendance, policy, and extra-load mutations
│       ├── academic-operations.ts  # Attendance/extra-load read adapters
│       ├── actions.ts              # Routine, OD, and publication mutations
│       ├── attendance.ts           # CSV parsing and attendance calculations
│       ├── auto-schedule.ts        # Pure deterministic scheduling engine
│       ├── conflicts.ts            # Pure exact-time validation engine
│       ├── data.ts                 # Main portal read model
│       ├── extra-load.ts           # Eligibility and payment calculations
│       ├── schedule-automation.ts  # Scheduler database adapter
│       ├── serialize.ts            # Meeting views and immutable snapshots
│       └── workload.ts             # Workload calculations
├── HANDOVER_GUIDE.md               # Complete operational and technical guide
├── PROJECT_CONTEXT.md              # Consolidated project context
└── README.md
```

## Application routes

| Route | Purpose |
|---|---|
| `/` | Coordinator dashboard |
| `/routine` | Manual exact-time routine builder |
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
| `/public/routine` | Public and printable published routine |
| `/api/health` | Database health and mode |

## Verified development baseline

- 7 departments
- 16 teachers
- 14 rooms
- 16 batches
- 28 courses
- 55 teaching groups
- 85 canonical meetings
- 0 validation blockers
- 9 intentional advisories
- Published routine version 1, effective 14 August 2026

All seed records are synthetic and intended for development/demo use.

## Documentation

- [Complete handover and user guide](HANDOVER_GUIDE.md)
- [Consolidated project context](PROJECT_CONTEXT.md)
- [Academic-operations architecture decision](docs/architecture/ADR-001-academic-operations-boundaries.md)
- [Extra-load print-template analysis](docs/templates/extra-load-print-templates.md)

## Production readiness notes

The application is runnable and functionally verified, but production rollout still requires:

- Authentication and coordinator/teacher/approver authorization.
- Authoritative university data import and institutional policy sign-off.
- A managed PostgreSQL database, encrypted backups, and restore testing.
- HTTPS, secrets management, monitoring, and named audit actors.
- A coordinator workflow for creating the next Spring/Summer term.

The referenced full v2.0 specification file is not present in this checkout. Settings currently displays 21 pending institutional decisions; earlier context claimed 31, so the difference must be reconciled from the original specification rather than inferred.

## Contact

For project handover questions: [dfahim432@gmail.com](mailto:dfahim432@gmail.com)
