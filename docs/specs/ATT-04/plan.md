# ATT-04 — Implementation plan

[Issue #11](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/11) · Approved · 19 November 2026, Asia/Dhaka

Branch `codex/att-04` from local `main` at `fcb342c`. [Specification](spec.md) · [Review sketches](mockups/index.html) · [Inspection record](verification.md)

## Approval record

The owner's “Okay, go for the task that is remaining” started inspection and specification. On 19 November the owner replied “Approved” to the request to approve D-1–D-4 on `2b89594`. This authorizes implementation and verification of D-1–D-4.

## Tasks

- [x] T-01 — Inspect calculation, permissions, historical policy and workflow. Present D-1–D-4 and review sketches.
- [x] T-02 — Record and commit the owner's specification approval and any amendments.
- [ ] T-03 — Share the phase calculation and contribution rules between summaries, student evidence and the existing policy-impact calculation. Preserve semester parity and explicit no-eligible/missing-policy states. Covers AC-01–AC-03.
- [ ] T-04 — Add authorized term-scoped active and completed loaders using the existing policy timeline, captured records and context locks. Keep roster editing and roll call at their existing entry points. Covers AC-02–AC-05.
- [ ] T-05 — Build phase navigation, student explanation, completed-term entry and read-only Settings text. Covers AC-02–AC-04 and AC-06.
- [ ] T-06 — Verify with domain oracles and synthetic fixtures for both adapters. Recheck ATT-03A and SET-01B on both, run typecheck, lint, domain, guarded default build and compiled Edge review. If needed, separately record a Webpack review build. Record exact checks and limits and provide the owner a runnable review. Covers AC-01–AC-06.
- [ ] T-07 — Record owner acceptance and merge into local `main`. Review the next handoff for ATT-05 separately.

## Current checkpoint and exact handoff

D-1–D-4 are approved. Start T-03. Keep development and verification on synthetic disposable targets. The institutional migration and historical publication of official marks are separate decisions.
