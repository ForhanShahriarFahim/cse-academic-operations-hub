# Project brief — start here

Updated: 1 October 2026 (Asia/Dhaka). Implementation/data baseline below was documented on 26 September; this documentation migration did not rerun the seed or certify production. GitHub #1, #2, #16, #17 and #20 were inspected on 30 September; SAFE-01 (#2) was accepted, merged (PR #23) and closed the same day.

Read [WORKFLOW.md](WORKFLOW.md) for delivery/Git rules, [ROADMAP.md](ROADMAP.md) for issue order, [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) for behavior, [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for approved answers/open gates, [CONTEXT.md](../CONTEXT.md) for terms and [README](../README.md) for setup/operators. [Issue #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16) is the GitHub index.

## Current work

**State on 2 October 2026: no issue in progress.** The last completed issue is [BUG-54 / #54](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/54): the official package's contacts sheet now fits however many teachers are listed (balanced columns, one compact step, then continued sheets) ([spec and plan](specs/BUG-54/spec.md), [verification](specs/BUG-54/verification.md)); accepted and merged on 2 October 2026. Review long lists with `npm run ux:review -- --fresh --long-teacher-list`. Next: choose with the owner. The recommended order continues with the master data: ROM-01 #5, BAT-01 #6 and CRS-01 #7, with SET-01 #14 (see Other candidates and the brainstorm triage). Before it, [TCH-01 / #4](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4): teacher records with a safe lifecycle ([spec](specs/TCH-01/spec.md), [plan](specs/TCH-01/plan.md), [verification](specs/TCH-01/verification.md)). It was accepted and merged on 2 October 2026, and the institutional database was migrated to 0009 after a cold backup (`F:\AI\backups\academic-operations-portal\pglite-summer-2026-pre-TCH-01-20261002-1437`).

- **Earlier completed:** [BUG-26 / #26](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/26): `db:reset` keeps portal access, names its target and refuses the institutional directory ([record](specs/BUG-26/verification.md)); merged 2 October 2026.

- **Earlier completed:** [BUG-49 / #49](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/49): sign out without Google, and no tokens in the dev log ([record](specs/BUG-49/verification.md)); accepted and merged 2 October 2026.

- **Earlier completed:** [BUG-48 / #48](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/48) (SAFE-01 follow-up F-10). A disposable PostgreSQL cluster from `test:safety` is now stopped even when the run is killed: in-process stop, a detached watchdog, and a sweep of stale cluster runs. Accepted by the owner on 2 October 2026 and merged. Records: [spec/plan](specs/BUG-48/spec.md), [verification](specs/BUG-48/verification.md).

- **Earlier completed:** [AUTH-02 / #36](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36), email/password sign-in with administrator setup and reset links, lockout, session revocation, dated roles and the rebuilt People & Access (also closes #31).
  - **Accepted** by the owner on 2 October 2026 and merged. The institutional database was cold-backed-up (`F:\AI\backups\academic-operations-portal\pglite-summer-2026-pre-AUTH-02-20261002-0119`, with its SHA-256 manifest) and migrated to 0008; all 38 existing tables are unchanged.
  - **To sign in with a password here:** set `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` in `.env.local`, then `npm run auth:bootstrap -- --reset-link <administrator email>` (README, Sign-in). The administrator account is still invited.
  - **Records:** [spec](specs/AUTH-02/spec.md), [plan](specs/AUTH-02/plan.md), [verification/acceptance](specs/AUTH-02/verification.md), [screenshots](specs/AUTH-02/screenshots/). The adversarial account checks run in `npm run test:safety`.

- **Earlier completed:** [BUG-29 / #29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29).
  - **The fix.** Every database time is now `timestamp with time zone`, so a role granted now takes effect at once, and screens show instants in Asia/Dhaka. The owner accepted it on 1 October 2026, and it was merged through PR #46.
  - **The institutional database is migrated** to 0007 (T-08). The pre-migration cold backup and its hash manifest are at `F:\AI\backups\academic-operations-portal\`, outside Git.
  - **Records:** [spec](specs/BUG-29/spec.md), [plan](specs/BUG-29/plan.md), [verification/acceptance](specs/BUG-29/verification.md). The regression groups run in `npm run test:safety`.

- **Earlier completed:** [TCH-02 / #35](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/35), the individual teacher routine: My routine, each teacher's routine, a phone agenda, an A4 portrait print in the department's template, and bulk print. The owner accepted it on 1 October 2026.
  - Records: [spec](specs/TCH-02/spec.md), [plan](specs/TCH-02/plan.md), [verification/acceptance](specs/TCH-02/verification.md). Review published views with `npm run ux:review -- --fresh --publishable`. That clears the 13 room blockers in the disposable copy only, then publishes. The real blockers remain for the owner.
  - Follow-ups not in scope: .docx download, the logo, and past-term selection (D-2, D-3, D-6).
- **Earlier completed:** [RUT-04 / #34](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/34), term time grids (Days & periods) and the redesigned black-and-white official routine package ([amendment B](specs/RUT-04/mockups/official-package.html)). The owner accepted it on 1 October 2026.
  - Records: [spec](specs/RUT-04/spec.md), [plan](specs/RUT-04/plan.md), [verification/acceptance](specs/RUT-04/verification.md). Review with `npm run ux:review`, then open `/routine/periods` and `/routine/official`.
- **Earlier completed:** [UX-01 / #18](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18), the responsive, accessible and plain-spoken portal baseline with the Routine builder workbench ([amendment A](specs/UX-01/amendment-a-routine-builder.md)). The owner accepted it on 30 September 2026; it also closed #30.
  - Records: [spec](specs/UX-01/spec.md), [plan](specs/UX-01/plan.md), [verification/acceptance](specs/UX-01/verification.md), [mockups](specs/UX-01/mockups/). Deferred builder features are in #33.
  - Review screens safely with `npm run ux:review` and `npm run test:ux`; see the [UI review checklist](operations/UI_REVIEW_CHECKLIST.md).
- **Bugs found during UX-01 inspection:** #29 (fixed, BUG-29), #31 (fixed by AUTH-02), #32 (public viewer actions).
- **Other candidates:** AUTH-01 (#1, needs OAuth credentials and hosted PostgreSQL), ATT-02 (#9), SAFE-01 follow-ups #24, #25, #27 and #28 (#26 fixed).
- **Owner brainstorm, 30 September 2026:** new proposals #34–#42 (term time grids, individual teacher routine print, email/password sign-in (done, AUTH-02), student import/export, calendar, dated class changes, leave, teacher agenda, certificates). RUT-04 (#34) and TCH-02 (#35) are done; TCH-01 (#4) from the master-data step is done. See the [triage record](plans/owner-brainstorm-2026-09-30.md); each of the rest still needs a spec and approval.
- **Earlier completed:** [SAFE-01 / #2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2). The owner accepted it on 30 September 2026, and it was merged through PR #23 and closed.
  - Records: [spec](specs/SAFE-01/spec.md), [plan](specs/SAFE-01/plan.md), [verification/acceptance](specs/SAFE-01/verification.md), [mutation inventory](operations/SAFE-01-mutation-inventory.md), [recovery runbook](operations/DATABASE_RECOVERY.md).
  - Operational ownership (D-07) was deferred to DEP-01 (#19) by the owner.
  - Follow-up bugs are #24–#28.
- **Earlier completed:** WORKFLOW-01 (#20, PRs #21/#22), RUT-01 (e6c8fae), DOC-01 (#17). AUTH-01 (#1) remains open for real OAuth, hosted PostgreSQL, the adversarial session/permission matrix and the public-contact projection.

**Verification tooling added by SAFE-01:**
- `npm run test:safety` runs only against synthetic data in the ignored `.tmp/safe-01`. It never opens `.data/pglite-summer-2026`.
- PostgreSQL 17.11 client tools are installed outside the repository at `F:\AI\tools\pgsql-17.11`, with no service and no PATH change. Set `SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin` to include the PostgreSQL group; without it that group reports PENDING.
- Never run `npm run test:ui`, `dev`, `start` or `db:*` casually. They prepare or migrate the configured (institutional) database.

## Application and preserved baseline

- Next.js 16 / React 19 / TypeScript / Drizzle academic portal: terms/cohorts, courses/merged groups, exact-time routines, conflicts, attendance, workload, extra-load claims and published print/CSV.
- Source: `src/app`, `src/components`, `src/lib`, `src/db`; migrations: `drizzle/`. Persistent local PGlite is development storage; deployment needs PostgreSQL.
- Internal access uses invited Google accounts and server roles. A teacher record is distinct from a portal user. OAuth, hosted PostgreSQL and adversarial session/permission verification remain pending.
- [Summer 2026 source](source/CSE_SUMMER_2026_ROUTINE_V1_6.md): 185 parsed entries, two teacher-managed thesis/project entries without fixed slots, 183 scheduled meetings, 42 teacher records, 78 courses. Thirteen blockers prevent official publication; a clean seed has no published routine.
- Only approved immutable snapshots are public. Owner-approved contacts come from source §§4–6, including listed personal mobiles; unrelated directories/drafts remain private. Redaction persists until the allowlist is implemented/tested and publication gates pass. Missing contacts and teacher identities must not be invented.
- Attendance uses dated Midterm/Final sessions and group enrollment independent of student home department. Navigation and result visibility need improvement.
- Catalog credit differs from workload credit-hours: a one-credit sessional currently counts as two; extra load requires strictly more than 15, with a configurable default Tk 200 per class.
- Rooms 406–408 are computer labs; 505 also supports microprocessor/networking. A free capable lab can host theory. Batch-specific day/window exceptions must not become stream-wide rules.
- The original institutional specification is missing; source corrections and policy/operational owners remain [open decisions](decisions/INSTITUTIONAL_DECISIONS.md). Retired documents remain Git history, not live instructions.

## Essential checks and data safety

Preserve populated data and historical terms; never run `db:reset` on institutional data. Use disposable copies for recovery/migration tests and keep secrets, dumps and student private data out of Git. For code changes run `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build` and relevant issue checks. Documentation verification uses links/content/template/diff checks. Read installed Next.js documentation before relevant code changes per [AGENTS.md](../AGENTS.md). Production still requires recovery, hosted database/OAuth, staging and release evidence.
