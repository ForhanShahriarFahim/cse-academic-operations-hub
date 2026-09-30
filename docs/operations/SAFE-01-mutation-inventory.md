# SAFE-01 — Mutation inventory

Issue: [#2](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/2) · Spec: [AC-05](../specs/SAFE-01/spec.md#acceptance-criteria) · Plan task: T-01 (tests are added in T-04).
Inventoried: 30 September 2026 (Asia/Dhaka) by static inspection of `src/`, `scripts/` and `src/app/api/` at `a0d7fe8`. This is the list of every code path that writes to the database; it is not evidence that any path behaves correctly.

## Classifications

| Code | Meaning |
|---|---|
| **A-shared** | `auditedChange` ([audit.ts](../../src/lib/auth/audit.ts)): the domain write and its `audit_events` row share one transaction, attributed to the signed-in actor. |
| **A-manual** | An explicit `db.transaction` that inserts its own `audit_events` row with the actor. |
| **GAP** | A write with no audit record in the same transaction. SAFE-01 T-04 fixes these. |
| **P-provider** | Tables owned by the Better Auth adapter (`auth_user`, `auth_session`, `auth_account`, `auth_verification`). They hold provider state, not academic records, and are deliberately not in `audit_events`. |
| **M-maintenance** | Trusted operator commands that are not user actions. Destructive ones must only run on disposable data. |

The **Guard** column names the capability checked before the write (`guardAction`/`actionActor` return a denial result; `authorize` throws). All guards go through [`authorize` in auth/index.ts](../../src/lib/auth/index.ts). Production-path tests use owned PGlite children (`scripts/safety/app-env.ts`); they start in T-04.

## Server actions (25)

| # | Action | Component owner | Guard (capability, resource) | Writes | Class | Test (T-04) |
|---|---|---|---|---|---|---|
| 1 | `createMeetingAction` [actions.ts:83](../../src/lib/actions.ts#L83) | Routine | `manage_routine`, teaching group | meetings, meeting_teachers, meeting_rooms | A-shared | shared-helper sample |
| 2 | `moveMeetingAction` [:147](../../src/lib/actions.ts#L147) | Routine | `manage_routine`, meeting | meetings | A-shared | shared-helper sample |
| 3 | `deleteMeetingAction` [:183](../../src/lib/actions.ts#L183) | Routine | `manage_routine`, meeting | meeting_teachers, meeting_rooms, meetings | A-shared | shared-helper sample |
| 4 | `createExternalAction` [:201](../../src/lib/actions.ts#L201) | External commitments | `manage_external_commitments` | external_commitments | A-shared | category |
| 5 | `verifyExternalAction` [:250](../../src/lib/actions.ts#L250) | External commitments | `manage_external_commitments` | external_commitments | A-shared | category |
| 6 | `deleteExternalAction` [:264](../../src/lib/actions.ts#L264) | External commitments | `manage_external_commitments` | external_commitments (hard delete; before-image audited) | A-shared | category |
| 7 | `publishAction` [:279](../../src/lib/actions.ts#L279) | Publication | `approve_publication` via `actionActor` | schedule_versions (supersede + insert), audit | A-manual | required: success, audit-failure rollback, denial |
| 8 | `updateAcademicPolicyAction` [academic-actions.ts:42](../../src/lib/academic-actions.ts#L42) | Policy | `manage_policy` | academic_policies (upsert by term) | A-shared | category |
| 9 | `createPermittedWindowAction` [:68](../../src/lib/academic-actions.ts#L68) | Policy | `manage_policy` | permitted_windows | A-shared | category |
| 10 | `deletePermittedWindowAction` [:93](../../src/lib/academic-actions.ts#L93) | Policy | `manage_policy` | permitted_windows (hard delete) | A-shared | category |
| 11 | `createExtraLoadClassAction` [:105](../../src/lib/academic-actions.ts#L105) | Extra load | `submit_extra_load`, teacher | extra_load_classes | A-shared | category |
| 12 | `deleteExtraLoadClassAction` [:139](../../src/lib/academic-actions.ts#L139) | Extra load | `submit_extra_load`, extra-load class | extra_load_classes (hard delete) | A-shared | category |
| 13 | `createManualTopSheetRowAction` [:150](../../src/lib/academic-actions.ts#L150) | Extra load | `review_extra_load` | extra_load_manual_summaries | A-shared | category |
| 14 | `deleteManualTopSheetRowAction` [:172](../../src/lib/academic-actions.ts#L172) | Extra load | `review_extra_load` | extra_load_manual_summaries (hard delete) | A-shared | category |
| 15 | `upsertStudentAction` [:183](../../src/lib/academic-actions.ts#L183) | Rosters | `manage_rosters`, teaching group | students (shared identity), course_enrollments | A-shared | required: shared-helper success/rollback/denial |
| 16 | `importStudentCsvAction` [:219](../../src/lib/academic-actions.ts#L219) | Rosters | `manage_rosters`, teaching group | students (upsert by code), course_enrollments | A-shared | category |
| 17 | `deactivateStudentAction` [:254](../../src/lib/academic-actions.ts#L254) | Rosters | `manage_rosters`, teaching group | course_enrollments (status) | A-shared | category |
| 18 | `createAttendanceSessionAction` [:268](../../src/lib/academic-actions.ts#L268) | Attendance | `take_attendance`, teaching group | attendance_sessions, attendance_records | A-shared | category |
| 19 | `saveAttendanceAction` [:297](../../src/lib/academic-actions.ts#L297) | Attendance | `take_attendance`, attendance session | attendance_records (upsert) | A-shared | category |
| 20 | `deleteAttendanceSessionAction` [:324](../../src/lib/academic-actions.ts#L324) | Attendance | `take_attendance`, attendance session | attendance_records, attendance_sessions (hard delete) | A-shared | category |
| 21 | `applyAutoScheduleAction` [:338](../../src/lib/academic-actions.ts#L338) | Routine automation | `run_auto_schedule` via `actionActor` | meetings, meeting_teachers, meeting_rooms, audit per meeting | A-manual | required: success, audit-failure rollback, denial |
| 22 | `inviteUserAction` [auth/admin-actions.ts:16](../../src/lib/auth/admin-actions.ts#L16) | Access | `manage_users` (throws) | portal_users, role_assignments, audit | A-manual | required: success, audit-failure rollback, denial |
| 23 | `setUserStatusAction` [:45](../../src/lib/auth/admin-actions.ts#L45) | Access | `manage_users` (throws) | portal_users.status, audit | A-manual | category |
| 24 | `grantRoleAction` [:63](../../src/lib/auth/admin-actions.ts#L63) | Access | `manage_users` (throws) | role_assignments, audit | A-manual | category |
| 25 | `revokeRoleAction` [:85](../../src/lib/auth/admin-actions.ts#L85) | Access | `manage_users` (throws) | role_assignments.active_to, audit | A-manual | category |

"Required" rows are the ones AC-05 requires tests for: the shared helper and each manual transaction category (publication, auto-placement, access). "Category" means the path is covered by the category test for its mechanism rather than by its own test. The full denied/allowed matrix for all actions, with real sessions, stays in AUTH-01.

## Writes outside server actions

| # | Path | Owner | Authorization | Writes | Class | SAFE-01 disposition |
|---|---|---|---|---|---|---|
| 26 | First-admin bootstrap [scripts/bootstrap-admin.ts:19–25](../../scripts/bootstrap-admin.ts#L19) | Access / operator | Operator shell plus `PORTAL_BOOTSTRAP_ADMIN_EMAIL`; refuses if another admin exists | runs migrations; portal_users insert, role_assignments insert — **two separate statements, no transaction, no audit** | **GAP** | T-04: one transaction with a `system`-kind audit event; idempotent rerun writes nothing new |
| 27 | Invited-user activation [src/lib/auth/index.ts:54–57](../../src/lib/auth/index.ts#L54) inside `getOptionalActor` | Access | Verified Google session for an invited email | portal_users.status `invited`→`active`, last_login_at — **no audit**; runs on the first request from that user, including page renders | **GAP** | T-04: atomic, audited, idempotent under concurrent first requests; the audit event names the user as the actor |
| 28 | Better Auth handler [src/app/api/auth/[...all]/route.ts](../../src/app/api/auth/%5B...all%5D/route.ts) via [provider.ts](../../src/lib/auth/provider.ts) | Access / provider | Google OAuth; `validateUserInfo` admits invited/active emails only; returns 503 when unconfigured | auth_user, auth_session, auth_account, auth_verification | P-provider | Classified, not audited. Session/revocation behaviour is verified in AUTH-01 |
| 29 | Migrations [src/db/migrate.ts](../../src/db/migrate.ts) (`db:migrate`; also inside `db:prepare`, `predev`, `prestart`, bootstrap) | Operations | Operator shell / npm lifecycle | schema DDL, `drizzle.__drizzle_migrations` | M-maintenance | Forward-only; reapplication checked on owned fixtures (T-01, T-03) |
| 30 | Preparation [src/db/prepare.ts](../../src/db/prepare.ts) (`predev`, `prestart`, `db:prepare`) | Operations | Operator shell / npm lifecycle | migrations, then the full Summer seed **only when `academic_terms` is empty** | M-maintenance | Not run by SAFE-01. Runs automatically before `dev`/`start` against whatever target the environment selects (see finding F-01) |
| 31 | Seed / reset [src/db/seed-summer-2026.ts:49](../../src/db/seed-summer-2026.ts#L49) (`db:reset`; called by prepare) | Operations | Operator shell | `TRUNCATE … RESTART IDENTITY CASCADE` of 30 academic tables (audit history included), then source import plus one seed audit event. `portal_users.teacher_id` references `teachers`, so `CASCADE` also empties `portal_users` and, through it, `role_assignments`; every invitation and role is lost (F-07) | M-maintenance, **destructive** | Never on institutional data. Harness imports are blocked by the T-01 import-boundary check |
| 32 | Health check [src/app/api/health/route.ts](../../src/app/api/health/route.ts) | Operations | Public | `select 1` only (read) | read-only | Listed so the inventory is complete; it does not write |

**Untracked local file (not an application component):** `.tmp/cleanup-smoke.ts` (ignored by Git) deletes test students, enrollments and attendance directly from the default database with no audit. It predates SAFE-01, which does not run or modify it. The owner should remove it, or treat it as a destructive maintenance script.

## Findings for follow-up (not SAFE-01 fixes unless stated)

- **F-01 — environment precedence (characterised by the T-01 check).**
  - Next.js and `src/db/index.ts` alone give `.env.local` precedence over `.env`.
  - CLI entry points that `import "dotenv/config"` before `src/db` load `.env` first, so `.env` wins: `migrate.ts`, `prepare.ts`, `seed-summer-2026.ts` and `bootstrap-admin.ts`.
  - A developer can therefore migrate, seed or bootstrap a different database from the one the dev server uses. `prepare` running on `predev`/`prestart` makes this easy to trigger.
  - Candidate backlog item: remove the early `dotenv/config` imports and add a target banner or confirmation before destructive commands.
- **F-02 — audit before-images.** The CSV import audit records only a row count, not previous student values. The manual extra-load summary and the attendance before-images are partial. Enough for attribution; not enough to reconstruct a row. Coordinate with ATT-02/ATT-03.
- **F-03 — stale reads outside transactions.** `publishAction` computes the next version number before its transaction, and `schedule_versions` has no unique `(term_id, version_number)` constraint. Two concurrent publications could insert the same number. The access actions also validate before their transactions. Stale/concurrency handling belongs to the result contract's `stale` outcome and to GOV-01. A schema constraint would need an amended plan.
- **F-04 — authorization evaluated twice.** `guardAction` authorizes, then `auditedChange` calls `requireActor` again but does not re-check the capability. The window is small; recorded for AUTH-01's revocation tests.
- **F-05 — shared student identity.** Students are shared across terms. Editing a student's name, phone or department in one term changes how historical terms display that student. T-03 records this as the current model; whether history should keep old values is a policy question, not a SAFE-01 change.
- **F-06 — hard deletes.** Meetings, external commitments, permitted windows, extra-load rows and attendance sessions are hard-deleted; only the audit before-image remains. The attendance void/lock behaviour is ATT-03.
- **F-07 — `db:reset` erases access control.** This follows from the schema's foreign keys and PostgreSQL `TRUNCATE … CASCADE` semantics (static reading, not executed). Truncating `teachers` cascades to `portal_users` and `role_assignments`, even though neither table is listed. After a reset, nobody can sign in until the admin is bootstrapped again. Record this in the T-02 recovery runbook; changing the seed belongs in a separate issue.
