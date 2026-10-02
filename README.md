# CSE Academic Operations Hub

An academic operations platform for the Department of Computer Science & Engineering at Pundra University of Science & Technology. It combines routine planning, exact-time conflict validation, attendance, teacher workload, extra-class honorarium, external commitments, and immutable routine publication in one portal.

![CSE Academic Operations Hub dashboard](docs/screenshots/dashboard.png)

## Why this project exists

Academic operations are connected: moving one class can affect a teacher, a room, several merged batches, an external commitment, and the published routine. CSE Academic Operations Hub models those relationships directly instead of keeping disconnected spreadsheets and manually reconciling conflicts.

The application supports Spring and Summer sessions, preserves historical batch-semester placements, and keeps the editable working draft separate from the public routine.

## Highlights

- Exact-time Day and Week routine views for HSC and Diploma streams, with optional batch filtering.
- Term-specific days and periods per stream (Days & periods), with batch exceptions: an extra day such as Friday, its own periods, or no classes on a day.
- Individual teacher routines in the department's "Individual Class Routine" layout: My routine for a signed-in teacher, any teacher's routine, a phone agenda, A4 portrait print or PDF, and bulk print for many teachers.
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
- Administrator-created accounts with email/password and/or Google sign-in (one-time setup and reset links, lockout, session revocation), department-scoped roles with dates, teacher-owned attendance/extra-load actions, and real-user audit attribution.

## Project status and next work

The Summer 2026 source routine is imported as a draft. Its remaining source conflicts are visible in **Validation** and must be resolved before a new official publication. New maintainers should start with the concise [project brief](docs/PROJECT_BRIEF.md), then the [current roadmap](docs/ROADMAP.md) and [GitHub project roadmap](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16). Product behavior and rationale are recorded in [PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md).

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

1. Set the term's teaching days, periods, breaks, class hours and any batch exceptions in **Days & periods** (copy them from an earlier term to start), and confirm academic policy in **Settings**.
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

Open [http://localhost:3000](http://localhost:3000). The public routine is available without a login. Internal pages require an account created by the portal administrator.

Without `DATABASE_URL`, the first development start creates `.data/pglite-summer-2026`, applies the checked-in migrations, and loads the verified Summer 2026 source dataset. Later starts preserve changes.

### Enable sign-in

Sign-in needs `BETTER_AUTH_URL` (the exact origin of this app) and `BETTER_AUTH_SECRET` (at least 32 random characters) in `.env.local`. Email/password sign-in then works; Google is optional ([AUTH-02](docs/specs/AUTH-02/spec.md)). Keep secrets out of Git.

**First administrator with a password** (no Google needed):

1. Set `PORTAL_BOOTSTRAP_ADMIN_EMAIL` (and optionally `PORTAL_BOOTSTRAP_ADMIN_NAME`), then run `npm run auth:bootstrap -- --password` **once**. It creates the administrator with Password sign-in and prints a one-time setup link (72 hours) to the terminal. The link is not stored or logged anywhere; only its hash is kept.
2. Open the link, choose a password, and you are signed in. Use **People & access** to create accounts. Each new Password account gets its own setup link, which you send to the person yourself.

**Google sign-in** (optional): also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google OAuth **Web application** client that authorizes `http://localhost:3000/api/auth/callback/google` ([Google's server-side OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)). Turn Google on per account in People & access. `npm run auth:bootstrap` without `--password` creates a Google-only first administrator as before.

**Recovery:** if an administrator is locked out or has forgotten the password, run `npm run auth:bootstrap -- --reset-link <administrator email>` from a terminal with access to the database. It turns Password on, clears any lockout, and prints a setup or reset link. It works only for a current, unsuspended system administrator, and writes a system audit event. Other people get reset links from People & access.

No public sign-up is enabled. Without `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, internal access stays closed and `/login` shows a setup notice. Password sign-in locks for 15 minutes after 5 wrong passwords in a row, and is throttled per client address. Behind a proxy, the client address comes from `X-Forwarded-For`; trusting that header is a deployment decision (DEP-01).

> Important: run only one database-using project process against `.data/pglite` at a time. Stop the development server before running a separate migration, preparation, or reset command.

> **Stored times.** Every database time is `timestamp with time zone`, so it is one exact instant whatever the server or session time zone ([BUG-29](docs/specs/BUG-29/spec.md)). Screens and prints show instants in Asia/Dhaka.
>
> Migration 0007 converts the times in an existing database by how each was written. Back up first, and migrate from a session in the zone that stamped the data: the migration refuses, and changes nothing, if old times would land in the future. A PGlite data folder keeps the time zone it was created with (in its `postgresql.conf`).

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
| `npm run auth:bootstrap` | Create the first administrator (explicit email required; `-- --password` prints a setup link; `-- --reset-link <email>` recovers a system administrator) |
| `npm run db:reset` | Replace a development database's academic data with the Summer-2026 seed, keeping portal users, passwords, roles and setup links. It prints its target and runs only with `npm run db:reset -- --confirm "<target>"`. It refuses the default `.data/pglite-summer-2026` directory (the institutional database): point `PGLITE_DATA_DIR` at a disposable copy. See the [recovery runbook](docs/operations/DATABASE_RECOVERY.md). |
| `npm run typecheck` | Run TypeScript validation |
| `npm run lint` | Run ESLint |
| `npm run test:domain` | Verify academic rules, routine projection, source data, role policy, and the action result contract |
| `npm run test:routine` | Run focused routine projection and CSV regression checks |
| `npm run test:ui` | Run Playwright routine view/export/print browser tests (Microsoft Edge on Windows). It starts `npm run dev`, which prepares the configured database. |
| `npm run test:safety` | SAFE-01 checks on synthetic data under `.tmp/safe-01` only: target isolation, PGlite backup/restore, two-term history, and audit atomicity. It never opens the institutional database. Add a task prefix to run one group, e.g. `npm run test:safety -- T-03`. The PostgreSQL groups (T-06 and the BUG-29, AUTH-02 and BUG-48 PostgreSQL groups) run only when `SAFE01_PG_BIN` points at a PostgreSQL bin directory; otherwise they report PENDING. The full suite takes more than ten minutes, so run it in the background or one group at a time rather than under a short `timeout`. Disposable clusters are stopped even when a run is killed (see the [recovery runbook](docs/operations/DATABASE_RECOVERY.md)). |
| `npm run ux:review` | UX-01 review server on `http://localhost:3100` against a disposable PGlite database in `.tmp/ux-review`. It is seeded from the source fixture, or copied with `-- --from-copy <dir>` after stopping that directory's server. A synthetic signed-in reviewer is added, so internal screens can be reviewed without Google OAuth, plus a second account with the teacher role linked to the teacher with the most classes, for My routine. It refuses `DATABASE_URL` and `.data`, and pins database and auth variables so `.env` files cannot redirect it. `-- --role <role>` changes the reviewer role; `-- --print-cookie` prints a browser sign-in snippet. `-- --fresh --publishable` rebuilds the copy, moves the classes behind the 13 Summer 2026 room blockers to free rooms at the same times (review data only), publishes it, and leaves one draft change for the linked teacher, so published views can be reviewed. |
| `npm run test:ux` | UX baseline checks against a running `npm run ux:review` server: no page-wide overflow at 360/390/768 px, WCAG 2 A/AA axe checks at desktop and phone widths, skip link, navigation drawer keyboard flow, and no native `confirm()`. Feature specs add flows for the builder, Days & periods, the official package and teacher routines (print fit and page counts). It never starts a server itself. |

## Project structure

```text
cse-academic-operations-hub/
├── drizzle/                       # SQL migrations and migration metadata
├── docs/
│   ├── architecture/              # Architecture decision records
│   ├── plans/                     # Workflow setup plan and delivery evidence
│   ├── specs/                     # Selected issue specifications and task plans
│   ├── source/                    # Summer 2026 routine transcription
│   ├── screenshots/               # README product screenshots
│   ├── templates/                 # Issue planning and extra-load print references
│   ├── WORKFLOW.md                # Shared development lifecycle and Git practices
│   ├── PROJECT_BRIEF.md           # Current-state agent/operator handoff
│   ├── ROADMAP.md                 # Issue order and dependencies
│   ├── decisions/                # Institutional approvals and unresolved gates
│   └── PRODUCT_REQUIREMENTS.md    # Product behavior and feature rationale
├── scripts/
│   ├── verify-domain.ts           # Academic-operations domain smoke checks
│   └── verify-routine-projection.ts # Routine projection/export regression checks
├── tests/                         # Playwright browser acceptance tests
├── src/
│   ├── app/
│   │   ├── (portal)/              # Authenticated staff pages, including Access
│   │   ├── api/auth/              # Sign-in/session routes (Better Auth)
│   │   ├── login/                 # Email/password and Google sign-in
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
| `/login` | Email/password sign-in, Google when configured, and setup notice |
| `/set-password` | Choose a password from a one-time setup or reset link |
| `/account` | My account: change password, sign-in methods, access, devices |
| `/access` | Administrator-managed invitations, roles, teacher links, and suspension |
| `/` | Coordinator dashboard |
| `/my-routine` | The signed-in teacher's individual routine (accounts linked to a teacher record) |
| `/routine` | Manual exact-time builder plus Day/Week, batch filter, print, and draft CSV |
| `/routine/export` | URL-addressed draft routine CSV export |
| `/routine/periods` | Days & periods: per-term period patterns, stream days, class hours and batch exceptions |
| `/routine/auto` | Safe automatic placement suggestions |
| `/conflicts` | Blockers and advisory warnings |
| `/attendance` | Roster, CSV import, attendance, and summaries |
| `/extra-load` | Extra-class ledger, honorarium, and print center |
| `/teachers` | Teacher directory and operational overview |
| `/teachers/[id]/routine` | One teacher's individual routine: published or working draft, phone agenda, A4 print |
| `/teachers/routines` | Choose teachers and print their individual routines in one run (`/teachers/routines/print`) |
| `/workload` | Credits, workload units, and contact minutes |
| `/rooms` | Room capabilities and occupancy |
| `/batches` | Batch and term-semester placements |
| `/courses` | Catalog, offerings, and coverage |
| `/od` | External teaching and room commitments |
| `/publications` | Immutable version publication and history |
| `/settings` | Term policy and pending decisions |
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
- [SAFE-01 — proposed safety specification and implementation plan](docs/specs/SAFE-01/plan.md)
- [Roadmap — order, gates and next issue](docs/ROADMAP.md)
- [Product requirements — behavior and feature rationale](docs/PRODUCT_REQUIREMENTS.md)
- [Institutional decisions — approved scope and unanswered questions](docs/decisions/INSTITUTIONAL_DECISIONS.md)
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
