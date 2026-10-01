# Project brief — start here

Updated: 1 October 2026 (Asia/Dhaka). Implementation/data baseline below was documented on 26 September; this documentation migration did not rerun the seed or certify production. GitHub #1, #2, #16, #17 and #20 were inspected on 30 September; SAFE-01 (#2) was accepted, merged (PR #23) and closed the same day.

Read [WORKFLOW.md](WORKFLOW.md) for delivery/Git rules, [ROADMAP.md](ROADMAP.md) for issue order, [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) for behavior, [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for approved answers/open gates, [CONTEXT.md](../CONTEXT.md) for terms and [README](../README.md) for setup/operators. [Issue #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16) is the GitHub index.

## Current work

**State on 1 October 2026: [AUTH-02 / #36](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/36) is approved and in progress** on branch `codex/auth-02`. T-01–T-09 are done; next are the T-10 hardening fix and screenshots, then T-11 final checks and verification. Resume from the [plan checkpoint](specs/AUTH-02/plan.md#current-checkpoint--handoff); see also the [spec](specs/AUTH-02/spec.md) and [mockups](specs/AUTH-02/mockups/).

- **Last completed:** [BUG-29 / #29](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/29).
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
- **Bugs found during UX-01 inspection:** #29 (fixed, BUG-29), #31 (People & Access confirmations), #32 (public viewer actions).
- **Other candidates:** AUTH-01 (#1, needs OAuth credentials and hosted PostgreSQL), ATT-02 (#9), SAFE-01 follow-ups #24–#28.
- **Owner brainstorm, 30 September 2026:** new proposals #34–#42 (term time grids, individual teacher routine print, email/password sign-in, student import/export, calendar, dated class changes, leave, teacher agenda, certificates). RUT-04 (#34) and TCH-02 (#35) are done. See the [triage record](plans/owner-brainstorm-2026-09-30.md); each of the rest still needs a spec and approval.
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
