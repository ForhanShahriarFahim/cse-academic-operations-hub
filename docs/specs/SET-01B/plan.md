# SET-01B — Implementation plan

[Issue #14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14) · Approved · 19 November 2026, Asia/Dhaka

Branch `codex/set-01b` from local `main` at `26f1414`. [Specification and decisions](spec.md) · [Workflow sketches](mockups/index.html)

## Implementation approach

- **Storage.** Migration `0021` adds `academic_policy_versions` with status, value and decision constraints, partial unique indexes for one open proposal per term and one approved version per effective date, and a trigger that protects proposal content and decided rows. Existing tables retain their data and schema.
- **Rules.** A database-free module resolves the effective value for a date (D-2), validates a proposal and computes the impact and its fingerprint (D-4). Domain tests cover boundaries, backdating, future dates, mixed rates and clamping.
- **Authority.** Add `approve_policy` to system and academic administrators and to the access summary. Server actions: propose, approve, reject, withdraw. The old update action refuses.
- **Writes.** Policy writes recheck the actor, term generation and proposal status in a transaction. Decisions take the exclusive term-context lock while they recompute the fingerprint and write the decision and audit. Activation marks open proposals of the outgoing term `stale`.
- **Reads.** Replace `getAcademicPolicy` with a term policy timeline loader. Extra-load pricing per class date, manual rows by recording date, attendance maximum by today or term end. Outputs carry version labels.
- **Interface.** Rebuild the Settings policy section (current values, timeline, open proposal with impact, propose form, approve/reject dialog). Read-only timeline on `/terms/[id]`. Per-line rates on extra-load screens and teacher sheet; top-sheet footer.

## Approval record

- 19 November 2026, owner: “Go for the next task.” This starts SET-01B / #14 inspection and specification from local `main`, following the ATT-03A handoff. It does not approve implementation.
- 19 November 2026, owner answered three design questions: payment rate by class date; second-person approval; attendance marks allowed with impact preview. Recorded in the [specification](spec.md#owner-choices-recorded-during-inspection). Not implementation approval.
- 19 November 2026, owner: “Approve D-1–D-6”. D-1–D-6 are accepted unchanged and implementation of T-03–T-06 is authorized. Institutional migration, D-06 resolution and merge before acceptance are not authorized.
- 19 November 2026, owner: “Reviewed baseline (Recommended)”. A term without a baseline recovers through a baseline proposal effective on the term start, approved by a second person; nothing is priced or marked from defaults. Recorded as a [D-6 addendum](spec.md#d-6--migration-preservation-and-usable-states).

## Tasks

- [x] T-01 — Inspect #14, SET-01A and policy consumers. Present this specification, decisions and sketches.
- [x] T-02 — Record and commit the owner's decisions and implementation approval.
- [x] T-03 — Migration `0021`, resolution and impact module, authority and audited actions. Covers AC-01–AC-05, AC-07.
- [x] T-04 — Consumers and outputs: extra-load pricing, threshold, attendance maximum, version labels and print. Covers AC-03, AC-06, AC-08.
- [x] T-05 — Settings and term workspace interface. Covers AC-08, AC-09.
- [ ] T-06 — Verify on disposable data: both adapters, migration fingerprints, races, rollback, compiled review; record evidence and owner review path. Covers AC-01–AC-10.
- [ ] T-07 — Record delivery acceptance and merge into local `main`. Keep #14 open.

## Verification and delivery

Run typecheck, lint, domain tests and the default build with disposable configuration. Add a SAFE-01 group for both adapters: migration from a populated database with payment and attendance fingerprints unchanged, propose/approve/reject/withdraw, self-approval refusal, stale impact, activation staling, PostgreSQL two-connection races, audit-fault rollback, backup/restore/reapply. Re-run the ATT-03A, CAL-01 and SET-01A groups. Compiled Edge review at 1440, 390 and 320 px plus A4 top sheet. No institutional database command.

## Current checkpoint and exact handoff

Implementation is on `codex/set-01b`. See [verification](verification.md) for the checks and review command.
