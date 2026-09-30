# Project brief — start here

Updated: 30 September 2026 (Asia/Dhaka). Implementation/data baseline below was documented on 26 September; this documentation migration did not rerun the seed or certify production. GitHub #1, #2, #16, #17 and #20 were inspected on 30 September; SAFE-01 (#2) was accepted, merged (PR #23) and closed the same day.

Read [WORKFLOW.md](WORKFLOW.md) for delivery/Git rules, [ROADMAP.md](ROADMAP.md) for issue order, [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) for behavior, [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for approved answers/open gates, [CONTEXT.md](../CONTEXT.md) for terms and [README](../README.md) for setup/operators. [Issue #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16) is the GitHub index.

## Current work

**State on 30 September 2026: UX-01 ([#18](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/18)) is in progress on branch `codex/ux-01`.**

- **Current issue:** UX-01, the responsive, accessible and plain-spoken portal baseline. The owner approved it on 30 September 2026.
  - Records: [spec](specs/UX-01/spec.md), [plan and checkpoint](specs/UX-01/plan.md), [verification](specs/UX-01/verification.md), [mockups](specs/UX-01/mockups/).
  - It also closes #30.
  - State: the base scope is implemented and verified. The owner requested a Routine builder redesign before merge; [amendment A](specs/UX-01/amendment-a-routine-builder.md) was approved on 30 September 2026 and is being implemented.
  - Resume from the plan's "Current checkpoint / handoff" section.
  - Review screens safely with `npm run ux:review` and `npm run test:ux`; see the [UI review checklist](operations/UI_REVIEW_CHECKLIST.md).
- **Bugs found during UX-01 inspection:** #29 (database-stamped times are 6 hours ahead; fix before AUTH-01), #31 (People & Access confirmations), #32 (public viewer actions).
- **Other candidates after UX-01:** AUTH-01 (#1, needs OAuth credentials and hosted PostgreSQL), ATT-02 (#9), SAFE-01 follow-ups #24–#28.
- **Last completed:** [SAFE-01 / #2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2). The owner accepted it on 30 September 2026, and it was merged through PR #23 and closed.
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
