# STU-01B — Implementation plan

Issue [#37 STU-01](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/37) · Approved · 18 November 2026 (Asia/Dhaka)

Branch `codex/stu-01b` · Base `70c9aa1` · [Specification](spec.md) · [Inspection and verification](verification.md) · [Workflow sketches](mockups/index.html)

## Approach

Adapt Excel into the same validated row representation as CSV and keep the existing database planner and transaction. Use a write-free workbook inspection action for worksheet names and headings. Keep workbook code on the Node server. Evaluate a maintained XLSX reader and writer with a locked version, compatible license and audited ZIP processing before introducing a dependency. Require bounded extraction and decoded workbook inspection. The upload cap fits the existing action body-size baseline. Read the installed Next.js guides when selecting API and cache behavior.

Extract a small authorized roster projection that shares the active membership rule with attendance capture. Keep group metadata and roster reads bound to the same term context. Apply output field allowlists before serialization, and reuse the existing portal print affordance and layout conventions. Keep print/attachment response caching and auditing explicit. Reuse existing audit storage. No schema migration is proposed.

## Approval record

- On 18 November 2026 (Asia/Dhaka), the owner replied “Approved and go for that.” after reviewing proposal `c2936e2`.
- D-1–D-5 are approved as written. Material amendments return for owner review.

## Tasks

- [x] T-01 — Inspect STU-01A, group and auth paths, existing exports and print, and document proposed permissions, workflow and proof boundaries.
- [x] T-02 — Record the owner's approval and commit the approved plan.
- [x] T-03 — Implement workbook inspection and bounded parsing, shared mapping and confirmation, samples, and safe receipts. Covers AC-01–AC-03.
- [x] T-04 — Implement the roster projection, authenticated CSV and Excel download, printable roll-call and output audit. Covers AC-01 and AC-04–AC-05.
- [x] T-05 — Verify with focused parser checks, both synthetic adapters, compiled Edge and A4 output. Typecheck, lint, domain and isolated Webpack pass. Default Turbopack fails at the CSS worker. See [verification](verification.md).
- [ ] T-06 — Commit verified delivery, provide the owner a reproducible synthetic review, and record acceptance before local merge. Reconcile parent issue completeness for the next owner-directed synchronization.

## Current checkpoint and exact handoff

The owner approved D-1–D-5 at `6edfc81`. Implementation and verification are on `codex/stu-01b`. The [synthetic review](http://localhost:3147/sign-in) is ready for owner inspection. Acceptance and local merge are pending. The parent was last checked on 18 November and was open. The last GitHub synchronization was 11 November.

> Resume STU-01B on `codex/stu-01b` at T-06. Review the [verification record](verification.md), including the default-build failure. Record the owner's actual acceptance before merging into local main and update the delivery records. Keep GitHub synchronization on the owner’s agreed schedule.
