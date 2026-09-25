# AUTH-01 — Identity, Roles and Action Guards

Status: proposed for review; no authentication code has been implemented  
Prepared: 23 September 2026  
Depends on: completed RUT-01 routine projection/export work

## 1. Outcome

Require a verified identity for every internal portal route and enforce permissions at the server-side data/action seam. Keep only the effective published routine public. Replace placeholder audit actors with the real user while retaining system/import audit events.

AUTH-01 is complete only when direct Server Action calls, direct route requests, and hidden-button bypass attempts are all rejected consistently.

## 2. Decisions required before implementation

1. **Login provider** — choose one:
   - local email/password accounts managed by the portal;
   - Google sign-in restricted to approved email accounts/domains; or
   - Microsoft/Entra ID if the university already manages Microsoft identities.
2. **Initial administrator** — confirm the email address that receives the first `system_administrator` assignment. Proposed: `dfahim432@gmail.com`.
3. **Public directory privacy** — decide whether the published routine appendix may expose teacher/CR phone numbers and email addresses. Recommended default: public output shows names/codes and an approved public contact only; private numbers remain internal.
4. **Department scope** — confirm whether the first release is CSE-only while preserving department scope in the schema. Recommended: yes.

The authorization model below does not depend on the selected login provider.

## 3. Scope

### Included

- sign in, sign out, session verification, expired/revoked-session handling;
- active/inactive portal users;
- multiple roles per user;
- optional department scope and teacher-account linkage;
- one capability-based authorization module;
- guards on every existing mutation;
- secure checks for internal pages and data access;
- authenticated user identity in audit records;
- user menu and permission-aware navigation/actions;
- forbidden/not-authenticated results and tests;
- a bootstrap path for the first administrator.

### Explicitly deferred

- self-service public registration;
- password reset/email delivery unless local credentials are approved;
- MFA beyond what the selected provider supplies;
- fine-grained role editor UI;
- teacher/room/batch/course CRUD (later roadmap phases);
- extra-load approval workflow and publication two-person approval;
- student or guardian login.

## 4. Domain model

### Portal user

A person allowed to enter the internal portal. A user can link to one teacher row, but teachers remain academic master data and do not automatically become login accounts.

Suggested fields:

- `id`
- normalized unique `email`
- `display_name`
- nullable unique `teacher_id`
- `status`: `invited | active | suspended | archived`
- `last_login_at`, `created_at`, `updated_at`

### Auth identity

Provider-specific identity attached to a portal user. Keeping this separate allows Google/Microsoft/local credentials to change without rewriting authorization.

- `user_id`
- `provider`
- `provider_subject`
- provider email snapshot
- unique `(provider, provider_subject)`

### Role assignment

A time-bounded assignment of one role to one user, optionally scoped to a department.

- `user_id`
- `role`
- nullable `department_id` (`null` means institution-wide)
- `active_from`, nullable `active_to`
- `granted_by_user_id`, `granted_at`

Roles are stable business labels. Capabilities remain code-owned so a typo or arbitrary database row cannot silently grant power.

### Session

If the approved provider/library uses database sessions, store only a hashed opaque token, `user_id`, expiry, revocation timestamp, and minimal device metadata. The browser receives an HttpOnly, SameSite=Lax, Secure-in-production cookie. Do not put phone numbers, roles, or other mutable permissions in a long-lived cookie.

### Audit event

Extend existing audit rows without deleting history:

- nullable `actor_user_id` for real users;
- `actor_display_name` snapshot;
- `actor_kind`: `user | system | import`;
- optional `request_id`;
- `before` and `after` JSON summaries for mutations;
- retain the current textual `actor` during migration for historical compatibility.

## 5. Roles and capabilities

| Role | Capabilities in AUTH-01 |
|---|---|
| `system_administrator` | all capabilities, user/role administration, recovery |
| `academic_administrator` | academic policy, rosters, catalog/term administration |
| `routine_coordinator` | draft meetings, rooms/teachers on meetings, OD constraints, auto-schedule |
| `department_approver` | publish routine and later approve governed changes |
| `teacher` | view own workload; take attendance and submit extra load only for assigned teaching groups |
| `accounts_officer` | read workload/extra-load payment reports; no academic schedule mutation |
| `read_only_viewer` | internal read access with private fields filtered by policy |

Initial capability vocabulary:

```text
view_internal_portal
view_private_contacts
manage_users
manage_policy
manage_routine
approve_publication
manage_external_commitments
run_auto_schedule
manage_rosters
take_attendance
submit_extra_load
review_extra_load
view_payment_reports
```

Resource checks supplement capabilities:

- a teacher may `take_attendance` only when assigned to the teaching group;
- a teacher may `submit_extra_load` only for their linked teacher record;
- a department-scoped assignment applies only to that department's resource;
- publication requires `approve_publication`, not merely `manage_routine`.

## 6. Deep authorization module

Place the seam under `src/lib/auth/`. Callers should learn a small interface while session, role, scope, ownership, and error details stay inside the implementation.

```ts
type Capability = /* closed union */;
type Resource =
  | { kind: "department"; departmentId: number }
  | { kind: "teaching_group"; teachingGroupId: number }
  | { kind: "teacher"; teacherId: number }
  | { kind: "publication"; termId: number };

getOptionalActor(): Promise<Actor | null>
requireActor(): Promise<Actor>
authorize(capability: Capability, resource?: Resource): Promise<Actor>
can(actor: Actor, capability: Capability, resource?: Resource): Promise<boolean>
```

`authorize` performs the secure database-backed check and throws/returns one typed forbidden outcome. Server Actions, route handlers, and protected data functions all cross this seam. UI visibility may use `can`, but never replaces `authorize`.

Provider/session details sit behind a separate internal adapter. There is no reason to expose provider tokens or provider-specific user objects to portal code.

## 7. Route and data policy

### Public without login

- `/login`
- `/public/routine`
- `/public/routine/export`
- `/public/routine/official`
- minimal `/api/health`
- framework/static assets

Public routine routes must read an effective immutable publication snapshot only. They must never fall back to draft data.

### Authenticated

All routes in the `(portal)` group and all other internal data. A route-group layout may provide an early redirect and user shell, but it is not the security seam. Each protected data loader and every Server Action still verifies the session/permission close to the database operation.

Private fields such as teacher phone numbers are returned through explicit internal DTOs; public snapshot DTOs apply the approved redaction policy.

## 8. Existing action guard matrix

| Existing mutation | Required capability/resource |
|---|---|
| create/move/delete meeting | `manage_routine` + department |
| run auto-schedule | `run_auto_schedule` + department |
| create/verify/delete external commitment | `manage_external_commitments` + department |
| publish schedule | `approve_publication` + term |
| update policy/permitted windows | `manage_policy` + department/term |
| add/delete extra-load class | `submit_extra_load` + teacher ownership, or admin override |
| add/delete manual top-sheet row | `review_extra_load` |
| add/import/deactivate student roster | `manage_rosters` + teaching group |
| create/save/delete attendance session | `take_attendance` + assigned teaching group, or admin override |

Audit writing should be part of the same database transaction as each successful mutation. Rejected requests may be recorded in a separate security event stream without logging passwords, tokens, CSV contents, or sensitive form data.

## 9. Schema and migration plan

Create one forward-only migration containing:

- `portal_users`
- `auth_identities`
- `role_assignments`
- provider-dependent session/account tables only after provider approval
- nullable audit columns and indexes
- indexes on normalized email, provider subject, active role lookup, teacher linkage, and session expiry

Migration rules:

- never truncate Summer 2026 academic data;
- preserve old audit actor text;
- bootstrap the first administrator through an explicit one-time script/environment value, not a public sign-up form;
- support PostgreSQL and PGlite;
- make seed/reset create a development administrator only when an explicit development credential flag is present.

## 10. Implementation slices

### Slice A — provider decision and threat model

- approve the four decisions in section 2;
- document cookie/session lifetime, revocation, brute-force/rate-limit behavior, and deployment HTTPS assumptions;
- define public/private contact policy.

### Slice B — schema and pure authorization tests

- add the migration and schema;
- define roles, capabilities, resources, and ownership rules;
- write table-driven `can` tests before integration;
- test multi-role union and department-scope denial.

### Slice C — session adapter and login flow

- integrate the approved provider/library;
- add login/logout/session expiry/revocation;
- add first-admin bootstrap;
- keep the session cookie minimal and secure.

### Slice D — protected data and route entry

- protect every `(portal)` page/data loader;
- keep public snapshot pages functional anonymously;
- add internal/public DTO separation for contact data;
- add the user menu and clear forbidden/not-authenticated pages.

### Slice E — guard every mutation and repair audit trails

- map every current Server Action through `authorize`;
- replace `actor: "coordinator"` with the authenticated user snapshot;
- add before/after audit summaries inside mutation transactions;
- verify ownership rules for attendance and extra load.

### Slice F — adversarial integration and UI verification

- direct-call each action as anonymous, wrong-role, wrong-department, wrong-teacher, and authorized user;
- verify suspended users and revoked/expired sessions;
- verify public routes never expose draft data/private DTOs;
- run keyboard/mobile login and permission-aware navigation checks.

## 11. Test plan

### Pure domain tests

- role-to-capability mapping;
- multiple roles combine capabilities;
- department scope allows matching resources and denies others;
- teacher ownership permits only linked teacher/group resources;
- inactive/expired assignments grant nothing;
- `system_administrator` behavior is explicit and tested.

### Database/integration tests

- active, expired, revoked, suspended-user sessions;
- all existing Server Actions return forbidden without mutation;
- action plus audit record commit atomically;
- anonymous public snapshot works while internal draft access fails;
- private phone/email never appears in a public response when redaction is enabled.

### Browser tests

- anonymous internal URL redirects to login and preserves safe return URL;
- successful login returns to the requested internal page;
- sign-out invalidates the session;
- navigation/actions reflect capabilities;
- hiding a button is not the only guard (direct request is denied).

## 12. Acceptance criteria

- Anonymous users cannot read internal portal data or execute mutations.
- Every current Server Action uses the shared authorization seam.
- Teachers cannot edit another teacher's attendance or extra-load claims.
- Routine coordinators cannot publish without `approve_publication`.
- Department scope is enforced server-side.
- Effective published routine pages remain anonymously available.
- Private contact handling matches the approved policy.
- Every successful mutation records the real actor and before/after summary.
- Revoked/suspended users lose access immediately through database-backed checks.
- PostgreSQL and PGlite migrations/tests pass.
- `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, and focused browser tests pass.

## 13. Likely code seams

- `src/db/schema.ts` and a new Drizzle migration
- new `src/lib/auth/` module
- new login/logout routes and forms
- `src/app/(portal)/layout.tsx` for user shell/early redirect only
- protected data functions under `src/lib/data.ts`
- `src/lib/actions.ts`
- `src/lib/academic-actions.ts`
- `src/db/seed-summer-2026.ts` (explicit development bootstrap only)
- public routine snapshot DTO/metadata serialization
- focused auth and authorization verification scripts/tests

## 14. Rollout and recovery

1. Back up the production database.
2. Apply schema additions with internal routes still unavailable externally.
3. Bootstrap and verify the first administrator.
4. Verify login/session revocation and public routine behavior.
5. Enable protected internal routes.
6. Review audit events and forbidden-request telemetry.
7. Keep a documented recovery procedure that can revoke all sessions and restore an administrator without altering academic records.

Rollback disables internal access and revokes sessions; it must not drop auth or audit tables automatically.
