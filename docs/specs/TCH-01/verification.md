# TCH-01: Verification

Issue: [#4](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/4). Records: [spec](spec.md), [plan and approval](plan.md), [mockups](mockups/).
Verified: 2 October 2026, Asia/Dhaka, on branch `codex/tch-01`, Windows 11, Node 22.11.0, Edge (Playwright channel), PostgreSQL 17.11 tools (`SAFE01_PG_BIN=F:\AI\tools\pgsql-17.11\pgsql\bin`).
Status: **Accepted by the owner on 2 October 2026** ("accepted, nothing is running on .data"). The institutional database was backed up and migrated to 0009 the same day (see [Institutional migration](#institutional-migration-2-october-2026)).

## What changed

- **Migration [0009_teacher-records](../../../drizzle/0009_teacher-records.sql)**, forward-only. It adds `updated_at` and `advisory_load_units`, and makes `employment_type` nullable (placeholders lose their pseudo employment type). It also adds checks on status, employment type and the limit, and a unique index on `upper(short_code)`. The [schema](../../../src/db/schema.ts) and the Summer 2026 seed match.
- **Permission:** `manage_teachers` for system administrator, academic administrator and routine coordinator ([policy.ts](../../../src/lib/auth/policy.ts)).
- **Rules:** [teacher-records.ts](../../../src/lib/teacher-records.ts) holds the pure rules: validation, change lists with the phone masked, transitions, placeholders, the effective limit, deactivation blockers and notes, deletion refusals and the snapshot search. They are tested by [verify-teacher-records.ts](../../../scripts/verify-teacher-records.ts) in `test:domain`.
- **Server:**
  - [teacher-actions.ts](../../../src/lib/teacher-actions.ts) has save (add, edit, resolve), status changes (on leave, back, deactivate, reactivate) and delete. Each one checks the permission, refuses stale edits, re-checks references in its transaction and writes one audit event.
  - [teacher-data.ts](../../../src/lib/teacher-data.ts) reads a record, its references and its change log.
- **Screens:**
  - `/teachers` has filters (Active, On leave, Inactive, Placeholders), search, the Add button, and a stacked layout on phones.
  - `/teachers/new` and `/teachers/[id]/edit` share one form, which also resolves placeholder codes (`?resolve=1`).
  - `/teachers/[id]` has the profile, the More menu, the Changes list and status notices.
  - `/teachers/[id]/deactivate` and `/teachers/[id]/delete` are confirmation pages.
- **Elsewhere:**
  - The per-teacher limit is used on Teachers, the teacher page and Workload (`computeWorkloads` takes a limit per teacher).
  - Inactive teachers are left out of the routine class panel, External commitments and account-link pickers. The server refuses a newly added inactive teacher in create class, edit class and record external commitment.
  - Account links refuse placeholder codes.
- **Tests:**
  - A new `test:safety` group, "TCH-01 teacher records" ([teacher.check.ts](../../../scripts/safety/teacher.check.ts), [child](../../../scripts/safety/children/teacher-scenarios.ts)), runs on PGlite and PostgreSQL.
  - A new UX spec, [teacher-records.spec.ts](../../../tests/ux/teacher-records.spec.ts).
  - Six teacher routes were added to the UX baseline (overflow and axe).

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| AC-01 | Pass | A coordinator (safety child) and an administrator (UX spec, review copy) add a teacher. It appears on the list and its page, with one `teacher.create` event. |
| AC-02 | Pass | Safety: with no session (unauthenticated) and as the teacher role (forbidden), add, edit, status change and delete are all denied, with no change and no teacher audit event. UX: the teacher role sees no Add, Edit or Changes, and `/teachers/1/edit` goes to the forbidden page. |
| AC-03 | Pass | One save reports a taken code (`sya` against `SYA`, any case), a bad email, an out-of-range limit and an unknown department together (safety). Domain: every field rule. UX: the error summary takes focus, its links move to the field, and typed values are kept. |
| AC-04 | Pass | An edit audits only the changed fields (the phone as a flag). A stale `updated_at` is refused with nothing changed, and a no-op save writes nothing (safety). |
| AC-05 | Pass | The teacher role's portal data carries no phone. No phone digits appear in any of the 6 teacher audit events or any action result (safety, both adapters). The editor shows the phone only with `view_private_contacts`. |
| AC-06 | Pass | Deactivating SYA is refused, listing its active-term classes and allocations. An unused teacher is deactivated and reactivated. Adding an inactive teacher to a class is refused (safety). UX: the blocked page lists the work with links; deactivate, then "Undo — reactivate". Extra-load classes are shown as information (spec note N-1). |
| AC-07 | Pass | Delete is refused for a used teacher and for a code in a publication snapshot. A wrong typed code is a field error. An unused record is deleted with its audit event (safety and UX). |
| AC-08 | Pass | An unresolved code is resolved into an active teacher with its class kept and its code fixed. A vacancy can't be edited, deactivated or set on leave (safety). UX: the Placeholders filter, Resolve, and the UT notice. |
| AC-09 | Pass | The domain test covers the effective limit. The screens show "own limit" and "x over limit" on Teachers, the teacher page and Workload (screenshots). |
| AC-10 | Pass | The Changes list shows when, who and before → after, newest first, with the reason and "Private phone: changed" (UX spec, screenshot). |
| AC-11 | Pass | Published `schedule_versions` rows are byte-identical after every teacher action (safety). Live screens show the new values. |
| AC-12 | Pass | Upgrade 0008 → 0009 on a populated database: every teacher field is unchanged, placeholders lose only the pseudo employment type, and the new checks and the case-twin index are enforced (PGlite and PostgreSQL). T-06 backup and restore reproduce the 0009 schema exactly. The institutional database was migrated after acceptance, as described below. |
| AC-13 | Pass | No page-wide overflow at 1440 and 390 px on 10 routes. axe WCAG 2 A/AA on the six new routes is in the UX baseline. The phone list is stacked; labelled fields, a linked error summary, visible focus, and status in words with icons. |

## Required checks

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run test:domain`: pass (ten verifiers, including the new teacher-records verifier).
- `npm run build`: pass. All six new teacher routes build as dynamic routes.
- `npm run test:safety` with `SAFE01_PG_BIN`: pass, exit 0. All 14 groups passed, including TCH-01 on PGlite and PostgreSQL. The default PGlite directory was never opened.
- `npm run test:ux` on a fresh review copy (`npm run ux:review -- --fresh`): 93 passed, 1 skipped. The skip is the existing TCH-02 published-state test, which needs a `--publishable` copy. The run includes the four new teacher-record tests and axe plus overflow on the six new routes.

## Screenshots

[screenshots/](screenshots/) holds only views without contact details. Teacher pages and edit forms show real emails and private phones from the seeded source, so they were reviewed but not committed.
- `list-desktop`, `list-phone`, `placeholders-desktop`, `placeholders-phone`, `workload-desktop`, `deactivate-blocked-desktop`
- `add-errors-desktop`, `teacher-after-deactivate-desktop` and `resolve-desktop`, all with synthetic records

## Findings fixed during review

- The More menu stayed open after a status change, so the next click closed it. It now re-mounts when the record changes.
- Success navigation now runs from the submit handler. Before, a resolved code's form, or a status button whose status no longer applied, unmounted before it could navigate.
- A taken short code is now reported together with the other field errors, not after them.
- The 0009 limit check now uses a flat AND. A BETWEEN failed T-06's exact schema comparison after dump and restore.
- A dev-server stylesheet went stale after the CSS change; it was fixed by restarting the review server. This was not a code defect.

## Acceptance steps (done)

1. The owner reviews the screens on the disposable review server, `npm run ux:review`. Rebuild it with `-- --fresh` for clean data.
2. With every writer stopped, take a cold backup of `.data/pglite-summer-2026` to `F:\AI\backups\academic-operations-portal` with a SHA-256 manifest.
3. Rehearse 0009 on a copy (`npm run ux:review -- --from-copy <backup copy>`) and check that every teacher is unchanged.
4. Then run the migration on the institutional database (`npm run db:migrate`).

## Institutional migration (2 October 2026)

The owner accepted TCH-01 and confirmed that nothing was running on `.data`.

1. **No writer.** No process referred to the repository, and ports 3000 and 3100 were free. The newest file in `.data/pglite-summer-2026` was dated 2:57 am. `.env.local` sets only `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, and `.env` is absent, so the target was the default folder.
2. **Cold backup.**
   - It is at `F:\AIackupscademic-operations-portal\pglite-summer-2026-pre-TCH-01-20261002-1437`, outside the repository, with `….sha256.csv` beside it (manifest SHA-256 `BB406560…A632C2`).
   - It holds 1,226 files (57.6 MB). Every file is identical to the source by SHA-256.
3. **Rehearsal.** Two throwaway copies of the backup were made under `.tmp`, and 0009 was applied to one of them. Then every table of the two copies was compared (counts and digests only).
   - All 42 teachers are unchanged in every existing field, and all 39 tables are otherwise identical.
   - The only change is the employment type of the 5 placeholders (UT and the four unresolved codes), which moved from `vacancy`/`unresolved` to null.
   - The copies were then deleted.
4. **Migration.** `npm run db:migrate`, with no `DATABASE_URL` or `PGLITE_DATA_DIR`, applied 0009 to `.data/pglite-summer-2026`. The migration count went from 9 to 10.
5. **After.** The same comparison against the pre-migration copy matched the rehearsal exactly: 42 teachers unchanged, statuses unchanged, 37 full-time, 5 placeholders with no employment type, and no other table changed.

The local review screenshots that showed real contact details (`.tmp/tch01-review`, not committed) were deleted.

## Notes

- **Watch: the official package teacher list fits tightly.** In one earlier review copy, two placeholder codes had been resolved with long synthetic names. There, the official package's page 5 (the teacher list) overflowed by 20 px in `official-package.spec.ts`. On a fresh copy it passes. Resolving codes with long real names could do the same. That is a print-fit limit of the RUT-04 package, not of TCH-01, so it is offered as a follow-up rather than changed here.

- `favicon.ico` returns 404 on every page. This predates TCH-01 and is not part of this issue.
- The PostgreSQL cluster sweep still skips the stale BUG-48 run folder, whose recorded PID is reused (see [BUG-26 verification](../BUG-26/verification.md#notes)).
