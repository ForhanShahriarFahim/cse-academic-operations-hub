# Code and plan review — 11 November 2026

Reviewer: Claude (senior-engineer review requested by the owner). Branch reviewed: `codex/bat-01b` at `a0f1833` (5 commits ahead of local `main` `10e3485`).

Status of this document: **review findings and proposals only.** Nothing here is approved scope. Under [WORKFLOW.md](../WORKFLOW.md) each item still needs its own specification and owner approval before implementation. No code was changed by this review.

## How to use this document (for the next agent)

1. Read [AGENTS.md](../../AGENTS.md), [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) and [WORKFLOW.md](../WORKFLOW.md) first. Their rules win over anything here.
2. Pick **one** work package from section 5. Do not combine packages.
3. Re-verify the finding against current code (line numbers are from `a0f1833`), write the spec with acceptance criteria, get owner approval, then implement.
4. Never open the institutional database (`.data/pglite-summer-2026`). Never run `dev`, `start`, `db:*` or `test:ui` casually; use the owned synthetic targets the safety and review scripts create.

## 1. What was reviewed and how

| Area | Method |
|---|---|
| Workflow, brief, roadmap, local delivery plan, BAT-01B spec/plan | Read in full |
| Schema, DB bootstrap, auth, term context, all server-action files, data loaders, rollover/batch/term modules, attendance, workload, extra-load, CSV/public routes | Read in full |
| Conflict engine, time-grid, room and teacher modules, UI components, safety scripts | Skimmed or guard-audited only — **not reviewed line by line** |
| `npm run typecheck`, `npm run lint`, `npm run test:domain` | Run on this branch: **all pass** |
| `npm run build` (default Turbopack) | Run once on this branch as plain `npm run build` (no flags, so Next 16's default bundler): **passed, exit 0, full route table printed.** Only the last 40 output lines were captured, so the bundler banner was not recorded. This contradicts the failure recorded in `docs/specs/BAT-01B/verification.md`; see P-01 |
| `npm run test:safety`, browser/UX suites, any app run | **Not run** (they need owned disposable databases and a server; recorded evidence in `docs/specs/BAT-01B/verification.md` was not re-executed) |

All code findings below are **confirmed by reading the code, not reproduced at runtime.** Each should be reproduced on a synthetic database as the first step of its fix.

## 2. Verdict

The engineering discipline is unusually strong for a project this size: every mutation goes through a server-side permission guard, writes and audits commit in one transaction, term changes are serialized through a context lock, publications are immutable, and each slice has an approval record. I found no missing authorization check on any server action I read.

The main risks are not in the newest work. They are:

1. **Older money- and marks-affecting logic** (attendance, extra-load, workload) that predates the current rigor and contains real bugs (F-01 to F-04).
2. **A production build recorded as failing in seven of the last eight deliveries** and accepted as an exception each time, with no issue tracking the cause — yet it passed when run once during this review (P-01).
3. **58 commits (761 files, about 15,500 added lines) that exist only on this machine** since the 26 October sync (P-02).
4. **Handoff documents that have grown too dense** to serve their stated purpose of fast resumption (P-03).

BAT-01B itself: no blocking defect found by reading. Two small items should be settled before acceptance (F-10, Q-1).

## 3. Code findings

Severity: **High** = wrong money, marks or data for real users; **Medium** = correctness or safety gap with a plausible trigger; **Low** = hardening, crafted-input or cosmetic.

### High

**F-01 — Late-enrolled students are counted absent for sessions held before they joined.**
`src/lib/academic-operations.ts:180-182`. `statusesFor` maps every session of the group and uses `?? "absent"` when the student has no record in that session. A session only records the roster that existed when it was created (`academic-actions.ts:290`), so a student added afterwards gets an absent for every earlier session, lowering their percentage and attendance mark.
Fix direction: count only sessions in which the student has a record (or define the rule explicitly with the owner). Add a domain test with a student enrolled after session 1.

**F-02 — Extra-load eligibility uses catalog credits, while workload uses credit-hours; the two pages can disagree and the policy fields are dead.**
`src/lib/academic-operations.ts:60` and `:65-78` sum `course.credits` (catalog; a sessional is 1). Workload allocations store `workloadCreditHours` (sessional = 2, hard-coded at `src/lib/source-routine.ts:187`). The brief states a one-credit sessional counts as two and extra load starts above 15. `theoryCreditHours` and `sessionalCreditHours` in `academic_policies` are stored, shown and editable but **never read by any calculation** (grep confirms). A teacher above 15 by workload units can be refused an extra-load claim, and editing those two policy values changes nothing.
Fix direction: decide the single basis for the threshold (owner decision, belongs with the CRS-01A "academic credits versus workload" gate), compute eligibility from it, and either use or remove the two policy fields.

**F-03 — Roster actions overwrite global student identity.**
`src/lib/academic-actions.ts:190-201` updates any `students` row by `studentId` without checking the student is enrolled in the authorized group. `:200` and `:227-238` upsert on `student_code` and overwrite name, phone, department and force `status = active` for a student that may belong to other groups or departments. A CSV with a wrong or reused ID silently renames an existing student everywhere. A changed `studentCode` that collides with another row raises an unhandled unique violation.
Fix direction: separate student identity from enrolment (this is STU-01A's stated gate); until then, refuse to change identity fields of an existing student from a roster import and report those rows instead.

**F-04 — Workload "catalog credits" are guessed from the course code.**
`src/lib/workload.ts:96-100`. When an allocated course has no meeting, credits fall back to `code.includes("(A)") ? 2 : code.includes("(B)") ? 4 : 3`. This contradicts the project rule that nothing is derived from code text, and is wrong for any unscheduled sessional or non-3-credit course.
Fix direction: pass the course catalog (already in `PortalData.courses`) and look credits up by course.

### Medium

**F-05 — Publication version numbers can collide under concurrency.** `src/lib/actions.ts:523-526` reads the latest version outside any exclusive lock, and `schedule_versions` has no unique index on `(term_id, version_number)` nor a one-published-per-term guard (`schema.ts:699-710`). Two approvers publishing together both hold the shared term lock and can both insert version N+1 as `published`. Already tracked as BUG-25 / #25 but scheduled at position 21; see P-04.
Also at `:548`: a superseded version gets `effectiveTo = term.effectiveFrom` (the term's printed start date), not the date it was replaced. Confirm the intended meaning.

**F-06 — Active-term policy is edited in place and silently recomputes history.** `src/lib/academic-actions.ts:51-75`. Changing the rate or attendance marks immediately changes every displayed payment and mark for the term, with weaker validation than `validateStartingPolicy` (no upper bound, so a large number raises a numeric-overflow error). Tracked as SET-01B at position 18. Interim hardening: reuse `validateStartingPolicy` and require a reason.

**F-07 — CSV export is open to spreadsheet formula injection.** `src/lib/routine-csv.ts:29-32` quotes but does not neutralize cells starting with `=`, `+`, `-`, `@`, tab or CR. Course titles, exception notes and audience labels are user-entered and the public CSV is opened in Excel. Fix: prefix such cells with `'` (and keep the quoting).

**F-08 — Attendance sessions can be duplicated and hard-deleted.** `academic-actions.ts:285-289` allows any number of sessions for the same group, date and phase (double-counted in marks). `:331-344` lets any assigned teacher permanently delete a session and all its records (the audit row keeps a copy, but there is no restore path). Tracked as ATT-03 at position 17. A unique guard or confirmation is a cheap interim step.

**F-09 — `prestart` and `predev` migrate and may seed whatever database is configured.** `package.json` `prestart` → `src/db/prepare.ts:8-13`. A production start against an empty PostgreSQL would load the Summer-2026 development dataset; multiple instances starting together would race migrations. `src/db/index.ts:42` protects the build only when it is launched through `npm run build` (it checks `npm_lifecycle_event`), so `npx next build` opens the configured store. Belongs to DEP-01, but the seed-on-empty behaviour should be refused when `NODE_ENV=production` now.

**F-10 — Unexpected errors are swallowed without logging in the two newest actions.** `src/lib/rollover-actions.ts:41-44` and `src/lib/batch-actions.ts:34-37` convert every non-domain exception (database fault, programming error) into a generic "could not be saved" result with no `console.error`. The user-facing message is right; the missing server log makes a real fault undiagnosable. Add logging before BAT-01B is accepted (small, inside approved scope as a correction).

**F-11 — Every page and action loads all terms' meetings.** `src/lib/data.ts:290-294` selects `teaching_group_offerings`, `teaching_requirements`, `meetings`, `meeting_teachers`, `meeting_rooms` with no term filter, and one action can call `getPortalData()` two or three times (`actions.ts:53`, `:118`). `batch-store.ts:33` loads every enrolment in the database and `:43-46` SHA-256-hashes every stored snapshot for each cohort inspected, inside the exclusive rollover lock. Harmless with one term; cost grows with every term now that rollover exists. Scope these reads by term before CRS-01B clones offerings.

**F-12 — `schema.ts` is not the full schema.** Constraints exist only in hand-written SQL, for example the two `day_plans` unique indexes and checks in `drizzle/0006_term-time-grids.sql:23-32` that `schema.ts:505-519` does not declare. `drizzle-kit generate` would therefore propose dropping them. Document "migrations are authoritative, never run generate/push blindly" in the brief, or declare the constraints in `schema.ts`.

### Low

- **F-13 — Unvalidated ids reach the database before validation.** `Number(formData.get(...))` is passed to the permission guard first (`actions.ts:98-99`, `academic-actions.ts:83-85`, `:175-176`); `NaN` becomes an integer cast error and an unhandled 500. Validate, then guard.
- **F-14 — `createExternalAction` weak validation.** `actions.ts:379-394`: a non-numeric or out-of-range day passes the `== null` check; a missing teacher id raises a foreign-key error; `credits` is an unchecked string. `createMeetingAction` (`:104-116`) does not de-duplicate teacher/room ids and does not require a note for an exception, unlike `updateMeetingAction` (`:245-255`).
- **F-15 — `deactivateStudentAction` reports success when nothing matched** (`academic-actions.ts:251-262`).
- **F-16 — Extra-load print accepts raw `from`/`to`** (`extra-load/teacher/[id]/print/page.tsx:26-27` → `academic-operations.ts:90-92`); a malformed date is a database error.
- **F-17 — Manual top-sheet rows accept negative or huge rate/amount** (`academic-actions.ts:139-143`).
- **F-18 — Sign-in throttle trusts `x-forwarded-for`** and shares one `"unknown"` bucket when it is absent (`auth/throttle.ts:39-41`). Already noted in code for DEP-01. `changeOwnPasswordAction` wrong-current-password attempts do not count toward account lockout (`account-actions.ts:108-109`).
- **F-19 — Documentation drift.** `.env.example:2` and `README.md:160` say `.data/pglite`; the real default is `.data/pglite-summer-2026`.
- **F-20 — `npm run test:ui` starts `npm run dev` against the configured (institutional) database** (`playwright.config.ts:18-23`). Known and warned about in the brief; the config itself should refuse the default directory the way `db:reset` does.
- **F-21 — Readability of the newest modules.** `batch-actions.ts`, `batch-store.ts`, `batch-data.ts`, `rollover-store.ts` and some route files are written as unformatted one-line statements up to 300+ characters, with an import at the bottom of `batch-actions.ts`. Logic is sound but review and safe editing by another agent are much harder. There is no formatter in the repository.

## 4. Plan and process review

**P-01 — The failing default build needs its own issue now.** `npm run build` is recorded as failing in the Turbopack CSS worker for BUG-24, ROM-01A, ROM-01C, BUG-28, SET-01A, BAT-01A and now BAT-01B (ROM-01B's final builds passed), and each delivery records "AC partial, exception accepted, no build-policy change". That many accepted exceptions is a policy change in practice. Nothing tracks root cause, and `npm run build -- --webpack` is not even forwarded on this host, so the passing evidence depends on a hand-typed command. Proposal: a small `BUG-BUILD` slice before any further feature — reproduce, capture the worker error, decide between fixing Turbopack/Tailwind-PostCSS interplay or formally adopting `next build --webpack` with a `build:webpack` script. Until then the "required checks" list in the brief is not truthful.
**Update from this review:** one plain `npm run build` on `a0f1833` passed in this session. The failure is therefore intermittent or specific to the environment the delivering agent ran in (its record mentions a sandbox and a worker that exits before connecting), not a deterministic defect in the code. ROM-01B's record also notes intermittent failures followed by passes. `BUG-BUILD` should start by re-running the build several times in the owner's normal shell and comparing with the agent sandbox; if it passes reliably outside the sandbox, the fix is to the verification procedure, and BAT-01B's AC-11 may be completable without any exception.

**P-02 — Sixteen days of work exist on one disk.** Local `main` is 58 commits ahead of `origin/main`; this branch 63. Local-first reduces GitHub noise, but it should not mean no off-machine copy. Proposal (owner decision): push `main` and retained branches now as a synchronization boundary, or at minimum write a `git bundle` next to the database cold backups after every accepted merge.

**P-03 — The handoff documents no longer do their job.** `PROJECT_BRIEF.md` is 21 KB; "Current work" is a stack of single paragraphs carrying a dozen commit hashes each, and the same status is restated in the brief, the roadmap, the delivery plan (twice), the spec header and the plan. `WORKFLOW.md` itself asks for a concise brief. Proposal: brief = at most about 60 lines (current pointer, exact next action, hard safety rules, required checks, links); move accepted-delivery history to one append-only `docs/DELIVERY_LOG.md` (one line per delivery: id, date, merge hash, link, carried limitations); state status in exactly one place per slice (its `plan.md`).

**P-04 — Re-order the sequence around live defects.** The current order is dependency-sound for features but leaves known defects in production paths for many slices:

| Change | Reason |
|---|---|
| Insert `BUG-BUILD` first | P-01 |
| Move BUG-25 (publication uniqueness) from 21 to right after BAT-01B | F-05; small, self-contained, protects an existing write path |
| Add a small attendance/extra-load correctness bug slice before CRS-01A | F-01, F-02 (decision), F-04 — wrong marks and eligibility today |
| Fold ATT-02's import half into STU-01A | Both rewrite the same import path (F-03); doing ATT-02 first means rework. Keep ATT-02 for save feedback only |
| Split AUTH-01 into a local part now | The adversarial permission/session matrix needs only password accounts on synthetic data, not OAuth credentials. Each new slice widens the untested surface |
| Add `PERF-01` before CRS-01B | F-11; term-scope the loaders before a second term's offerings exist |
| Pull SET-01B's "no silent recompute" guard earlier, or harden F-06 | Policy edit is live today |

**P-05 — No continuous integration.** `.github` contains only templates. A single workflow running typecheck, lint, `test:domain` and build on push would have flagged P-01 immediately and costs nothing while work is local (it runs only at sync).

**P-06 — Evidence in Git is bloating the repository.** `output/` is 57 MB and `docs/specs` 21 MB (118 binary captures). Every clone and every agent search pays for this. Proposal: keep a hash manifest and a few representative captures in Git; store the rest beside the database backups.

**P-07 — Ceremony is drifting above risk.** BAT-01B is about 1,500 changed lines supported by 39 captures, 16 PDF pages and 31 safety groups, re-described in five documents. The workflow says "scale specs/tests/review to risk". Keep the both-adapter and race tests (they are the valuable part); cut repeated prose and full-suite re-runs for unchanged areas.

**P-08 — Add a formatter as a tooling slice** (Prettier or ESLint stylistic, plus `max-len`), applied in one dedicated commit on `main` between feature slices so it never mixes with behaviour changes (F-21).

**What is good and should not change:** approval-before-code with the commit recorded; one slice, one branch, one writer; forward-only migrations tested on both adapters; refusing `db:reset` on the institutional directory; honest "partial/pending" reporting; pure domain modules kept free of database imports.

## 5. Proposed work packages (ready to pick up)

Each is sized for one session. IDs are suggestions; reuse existing GitHub issue numbers where they exist.

| # | Package | Findings | Done when |
|---|---|---|---|
| 0 | **BAT-01B acceptance** (current) | F-10, Q-1 | Server logging added to the two catch-alls; owner answers Q-1; owner accepts; local merge; #6 stays open |
| 1 | **BUG-BUILD** | P-01 | `npm run build` passes, or the owner formally adopts a named Webpack build script and the brief/workflow say so; no more "partial" build criteria |
| 2 | **SYNC-01** (owner action) | P-02, P-05 | `main` and retained branches exist off-machine; optional CI workflow green |
| 3 | **BUG-25 / #25** | F-05 | Unique `(term_id, version_number)`; at most one `published` per term; publish takes an exclusive lock; both-adapter race test; populated migration rehearsed |
| 4 | **BUG-ATT-MARKS** | F-01, F-08 (duplicate guard only) | Domain test for late enrolment passes; duplicate session refused or confirmed; no change to stored records |
| 5 | **BUG-LOAD-BASIS** | F-02, F-04 | Owner decision recorded; extra-load and workload use one documented basis; no code-text guessing; dead policy fields used or removed |
| 6 | **HARDEN-01** | F-06 (validation), F-07, F-13 to F-17, F-19, F-20 | Each has a failing-then-passing check; no schema change |
| 7 | **DOC-02** | P-03, P-06, F-12 | Brief at or under about 60 lines; delivery log exists; evidence policy written; "migrations are authoritative" rule recorded |
| 8 | **TOOL-01** | P-08, F-21 | Formatter configured; one format-only commit; lint enforces it |
| 9 | **PERF-01** | F-11 | Loaders term-scoped; one `getPortalData` per action; output parity proven by existing projection tests |
| 10 | **CRS-01A** onward | — | Continue the existing sequence; STU-01A absorbs F-03 and ATT-02's import half |

## 6. Questions for the owner

- **Q-1 (BAT-01B).** The rollover lets an administrator choose **Graduate** for a cohort in any semester 1–8, not only semester 8 (`src/lib/rollover.ts:39-48`). The spec requires an explicit choice at semester 8 but does not forbid graduating earlier. Intended, or should Graduate be limited to semester 8?
- **Q-2.** Which basis decides extra-load eligibility: catalog credits or workload credit-hours (F-02)?
- **Q-3.** May work be pushed to GitHub now as a backup boundary, or do you prefer local bundles (P-02)?
- **Q-4.** For the build: fix Turbopack, or formally adopt the Webpack build (P-01)?
- **Q-5.** Should a student who joins a group late be excluded from earlier sessions, or is "absent" the intended rule (F-01)?
