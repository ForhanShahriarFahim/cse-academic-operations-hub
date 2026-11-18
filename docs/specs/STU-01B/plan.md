# STU-01B — Implementation plan

Issue [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · Approved · 18 November 2026 (Asia/Dhaka)

Branch `codex/stu-01b` · Base `70c9aa1` · [Specification](spec.md) · [Inspection and verification](verification.md) · [Workflow sketches](mockups/index.html)

## Approach

Adapt Excel into the same validated row representation as CSV and keep the existing database planner and transaction. Use a write-free workbook inspection action for worksheet names and headings. Keep workbook code on the Node server. Evaluate a maintained XLSX reader and writer with a locked version, compatible license and audited ZIP processing before introducing a dependency. Require bounded extraction and decoded workbook inspection. The upload cap fits the existing action body-size baseline. Read the installed Next.js guides when selecting API and cache behavior.

Extract a small authorized roster projection that shares the active membership rule with attendance capture. Keep group metadata and roster reads bound to the same term context. Apply output field allowlists before serialization, and reuse the existing portal print affordance and layout conventions. Keep print/attachment response caching and auditing explicit. Reuse existing audit storage. No schema migration is proposed.

## Approval record

- On 18 November 2026 (Asia/Dhaka), the owner replied “Approved and go for that.” after reviewing proposal `c2936e2`.
- D-1–D-5 are approved as written. Material amendments return for owner review.

## Delivery acceptance

On 18 November 2026 (Asia/Dhaka), the owner replied “accepted.” after delivery `023f8df`, which disclosed the failed default Turbopack build and passing isolated Webpack build. The acceptance covers the reviewed STU-01B delivery.

## Tasks

- [x] T-01 — Inspect STU-01A, group and auth paths, existing exports and print, and document proposed permissions, workflow and proof boundaries.
- [x] T-02 — Record the owner's approval and commit the approved plan.
- [x] T-03 — Implement workbook inspection and bounded parsing, shared mapping and confirmation, samples, and safe receipts. Covers AC-01–AC-03.
- [x] T-04 — Implement the roster projection, authenticated CSV and Excel download, printable roll-call and output audit. Covers AC-01 and AC-04–AC-05.
- [x] T-05 — Verify with focused parser checks, both synthetic adapters, compiled Edge and A4 output. Typecheck, lint, domain and isolated Webpack pass. Default Turbopack fails at the CSS worker. See [verification](verification.md).
- [x] T-06 — Commit verified delivery, provide the owner a reproducible synthetic review, record acceptance, and merge locally. Record parent issue completeness for the next owner-directed synchronization.

## Current checkpoint and exact handoff

The owner approved D-1–D-5 at `6edfc81` and accepted delivery `023f8df` at `26326c5`. The retained `codex/stu-01b` branch merged into local `main` at `754d142`. The merge tree matched the accepted branch exactly, so the existing [verification](verification.md) carries forward. The two accepted slices cover the planned #37 workflows. The parent was last checked on 18 November and was open. GitHub reconciliation remains for the next owner-directed synchronization, after the 11 November sync.

> Start the next owner-authorized session from local `main`. Inspect and specify ATT-01 / #8, including the selected course and teaching group, teacher entry to roll-call, and how the teacher-first flow should fit with the original cascading selectors. Use the local delivery sequence to draw the boundaries with the remaining attendance issues. Present a specification and workflow sketches for approval before implementing.
