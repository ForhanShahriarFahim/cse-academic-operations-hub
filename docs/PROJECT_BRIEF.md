# Project brief — start here

Updated: 30 September 2026 (Asia/Dhaka). Implementation/data baseline below was documented on 26 September; this documentation migration did not rerun the seed or certify production. GitHub #1, #2, #16, #17 and #20 were inspected on 30 September.

Read [WORKFLOW.md](WORKFLOW.md) for delivery/Git rules, [ROADMAP.md](ROADMAP.md) for issue order, [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) for behavior, [institutional decisions](decisions/INSTITUTIONAL_DECISIONS.md) for approved answers/open gates, [CONTEXT.md](../CONTEXT.md) for terms and [README](../README.md) for setup/operators. [Issue #16](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/16) is the GitHub index.

## Current work

[WORKFLOW-01 / #20](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/20) is accepted and closed. PRs #21/#22 merged the shared workflow and final review; `78db43d` is the resulting main baseline. [Review/acceptance evidence](plans/WORKFLOW-01.md#step-4-review-and-acceptance-evidence--30-september-2026) records the owner's approval.

[SAFE-01 / #2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) is now in detailed planning on `codex/safe-01`: [proposed specification](specs/SAFE-01/spec.md) and [implementation plan/checklist](specs/SAFE-01/plan.md). Implementation approval is pending. The plan covers disposable recovery, two-term tests, mutation inventory/audit gaps and a compatible action-result contract. No database was opened; local PGlite is configured and its directory exists. PostgreSQL target/client tools remain unavailable, so that verification gate stays pending. RUT-01 is completed; DOC-01 (#17) is closed; AUTH-01 (#1) remains open for integration/public-contact work.

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
