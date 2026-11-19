# SET-01B — Verification

19 November 2026, Asia/Dhaka · [Specification](spec.md) · [Plan](plan.md)

## Corrections found in review

- Review evidence includes each repriced class's before and after rate and each affected student's before and after mark. Only the fingerprint and summary reach the browser. The attendance projection uses the same active enrollment and student filters as the roll-call summary.
- Policy decisions hold the term-context lock exclusively while they recompute the impact and commit the decision and audit. This protects the evidence from concurrent changes to attendance, rosters, workloads and payments made through the portal.
- The Settings panel retains receipts when the proposal form or decision controls are replaced. Updated proposal evidence clears the previous acknowledgement. A recovered Version 1 has a single timeline entry with its approval details.
- The impact table shows the full after amount in the After column and the difference below it.

## Disposable database and domain checks

`npm run test:domain` passed. The focused SET-01B safety groups passed on disposable PGlite and PostgreSQL 17.11. They verified:

- Populated `0020` → `0021` migration and repeated migration keep every existing table's fingerprint. Baseline-era payments and marks agree with the preceding policy. Cold PGlite and encrypted PostgreSQL backups restore into separate targets with identical fingerprints and survive migration reapply.
- Preview writes nothing. Proposer and approver are different accounts, teachers are denied, rejection requires a note, and only the proposer can withdraw. An injected audit failure rolls the approval back. Decided versions cannot be edited or deleted.
- Class-date eligibility and mixed-rate payment, manual override preservation, matched preview and approved totals, and whole-term attendance maximum. A new claim or a swap of the affected students under identical course totals makes the decision stale without writes.
- A term switch closes its open proposal as stale. An active term missing a baseline stays unpriced until a second person approves the term-start proposal as Version 1.
- Simultaneous proposals leave one open. Simultaneous approvals commit and audit once. PostgreSQL used independent connections with an observed lock wait, and PGlite exercised queued requests. The activation scenario was sequential in the policy group.

CAL-01, ATT-03A and SET-01A passed on both adapters. The first PostgreSQL SET-01A run timed out because its race fixture still paused an update. With the trigger corrected to pause a proposal insert, PostgreSQL observed a blocked writer and both orderings of proposal versus activation passed. The focused policy run reported unchanged institutional PGlite directory metadata and never opened it.

## Build and Edge review

- The default `npm run build` failed at the Turbopack CSS worker while compiling `/_not-found/page`, both under the sandbox and on a host retry. The PowerShell npm wrapper dropped `--webpack` when forwarded, so that invocation also ran Turbopack. The direct Next CLI Webpack attempt hit a Windows `kill EPERM`; the retry set `npm_lifecycle_event=build`. Every build used an unused loopback database endpoint and an in-memory PGlite fallback.
- The guarded Webpack retry (`node node_modules/next/dist/bin/next build --webpack`) passed compilation, TypeScript, static generation and build tracing. Whole-repository lint and a final lint pass on the review script, policy history and policy scenario passed.
- The compiled Edge review passed on synthetic PostgreSQL. At 1440, 390 and 320 px the baseline, impact preview, own proposal, second-administrator review, approved history, extra-load records and term history passed axe and page-width checks. The check verified the approval checkbox by keyboard, rejection-note validation, success feedback, per-date rates and versions, and the attendance version label. The preview server logged one early stream close during the run. The scenario completed all assertions after that message.
- The payment sheet lists two classes at Tk 200 and Tk 300, a Tk 1,000 manual override, a Tk 1,500 total, and both policy versions in the footer. The official Letter layout and A4 export each fit one page. The rendered A4 page showed the full table, signature line and rate trace. The review retained 22 browser screenshots and two PDFs in `.tmp/set-01b/browser`.
- Browser coverage focused on the two-administrator path. The no-baseline recovery, stale decisions and broader denied actor cases were exercised at the action layer. Pending timing and the remaining permission states lack separate Edge captures. The unfiltered cross-project suite was stopped after the named policy, calendar, attendance and workspace checks passed.

## Owner review

With a production bundle built, run `node node_modules/tsx/dist/cli.mjs scripts/review-policy.ts --serve` and open [the local review launcher](http://localhost:3171/). Open the proposing administrator and second administrator in separate browser profiles. The launcher starts a disposable PostgreSQL database on loopback and seeds synthetic users, attendance and payment rows. Use `--check` in place of `--serve` to run the compiled Edge checks and save captures in `.tmp/set-01b/browser`.

## Operations boundary

Migration `0021` was exercised only on disposable databases. An institutional migration needs a separate operations decision and cold backup. Institutional decision D-06 and the remaining scope of parent #14 stay open.
