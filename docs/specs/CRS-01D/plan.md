# CRS-01D — Implementation plan

Parent: CRS-01 / #7. [Specification and decisions](spec.md) · [Verification](verification.md) · [Responsive sketch](mockups/index.html)
Branch/base: `codex/crs-01d` / `75f204e` (local `main`).
Updated 18 November 2026 (Asia/Dhaka). Status: **Implemented on the issue branch.**

## Inspection and proposed approach

| Seam | Intended change |
| --- | --- |
| Offering source and placement rules | Share source eligibility/default selection and course/slot vocabulary with CRS-01B. Keep the existing offering review and its output intact. |
| Class-group records and store | Reuse numeric, requirement and teacher invariants and the validated create write logic. Project source groups and compute comparisons from narrow reads scoped to the two term IDs, without loading meeting detail or invoking the single-create transaction per group. Use stable ordering and canonical facts for review fingerprints. |
| Class-group data, actions and history | Authorize review/apply/history using the existing capability; parse selections and the reason at the server boundary. In apply, take the locks once, validate the entire selection, then write groups and history together. Extend history decoding to handle both the existing per-group events and the batch receipt. |
| Class groups UI | Add an editor entry point and responsive start/review page with blocked-row reasons, before/after teacher facts, projected totals and explicit selection. Reuse the existing notice and submit behavior that preserves input on validation errors. |

The initial source/destination review can race with edits. The reviewed facts are re-read inside apply under the locks specified in [the specification](spec.md#apply-and-history). Keep the source and destination IDs explicit. The proposed delivery has no migration or institutional rollout. Exercise transaction rollback and concurrency on disposable databases.

## Approval record

- The owner opened this session with “Whats next go for it” after acceptance and local merge of CRS-01C. This starts inspection and the next proposal under the shared workflow.
- On 18 November 2026 the owner replied “go for the implementation.” after proposal `5ec2cfc` requested approval of D-1–D-6. The owner approved that scope without amendments.
- The owner replied “Accepted +” on 18 November 2026 after delivery `e41afc3` disclosed the stalled default build, passing isolated Webpack build, and PGlite directory incident with row parity unverified. This records acceptance for the local merge.

## Tasks

- [x] T-01 — Inspect the current handoff, term rollover/offering basis, class-group writes, legacy import and teacher rules. Propose D-1–D-6, AC-01–AC-08 and a responsive sketch.
- [x] T-02 — Record approval of D-1–D-6 before implementation.
- [x] T-03 — Implement and exercise the two-term projection, creation eligibility, comparison and change detection (AC-02–AC-04).
- [x] T-04 — Implement capability checks, atomic guarded apply, audit receipt and existing history integration. Both adapter groups and the concurrent identical-apply race passed (AC-01, AC-05–AC-06). See verification for coverage limits.
- [x] T-05 — Wire the Class groups entry point and editor review flow. Guarded compiled browser, keyboard and three responsive widths passed (AC-01, AC-04, AC-07).
- [x] T-06 — Record criterion evidence, focused regressions, synthetic review command, default-build limit and build-isolation incident (AC-06–AC-08).
- [ ] T-07 — Record acceptance, merge locally into `main` and update this handoff. Keep parent #7 open pending reconciliation of its remaining scope.

## Verification and delivery

Run typecheck, lint, domain checks and the default build. Add focused safety groups on disposable PGlite and PostgreSQL for access, stale state, preserved records, atomic audit rollback and actual PostgreSQL lock races. Rerun the relevant CRS-01C, CRS-01B, BAT-01B, workload/eligibility and T-03 history checks and compare archived CSV/A4 outputs. Use the existing guarded compiled-review pattern with synthetic data for the owner's inspection. Record test evidence and any outstanding result in [verification.md](verification.md). Keep checkpoints local under the shared [workflow](../../WORKFLOW.md).

## Current checkpoint and exact handoff

18 November 2026. Owner approval `e8c25ea`, implementation `4e6ea72`, branch `codex/crs-01d` based on `75f204e`. The older Courses & offerings “UT” display remains tracked in the CRS-01C verification record.

> Resume CRS-01D on codex/crs-01d, base 75f204e. Check Git state and read the brief, workflow, and this issue’s specification, plan and verification. Finish any pending verification, present the synthetic review, record owner acceptance, then merge locally. Use disposable verification and preserve source and historical rows. Institutional migrations 0017/0018 and GitHub synchronization have separate authorization.
