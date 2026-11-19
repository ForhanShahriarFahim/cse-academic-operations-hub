# ATT-04 — Inspection and verification

19 November 2026, Asia/Dhaka · [Specification](spec.md) · [Plan](plan.md)

- Inspected local `main` at `fcb342c`, the attendance route, loader, working summary and SET-01B effective-policy helpers. The dated local issue snapshot lists #11 as open on 11 November.
- The active loader uses the active roster and applies one term policy maximum. The phase totals appear without phase percentages or mark explanations. The current roll-call summary excludes voided sessions and includes other states. The term workspace has policy history without a marks report.
- The proposed completed report uses end-date policy and retained term evidence. This is a design proposal. Actual archive behavior, permissions and layout remain to be verified after implementation.
- Static checks passed for relative links, section anchors, sketch anchor targets and the example calculations. The sketch is illustrative and has no production data or server behavior.

## Application evidence

- Standalone typecheck, repository lint and the domain checks passed. The attendance domain assertions cover fractional calculations, a representable half-step, a missing maximum and a recorded zero.
- The focused ATT-04 group passed on PGlite and PostgreSQL 17.11. It compared active semester results with the earlier summary, checked phase totals and the dated contributions, distinguished missing and zero policies, and verified theory and sessional maxima. The first run expected an out-of-department administrator to reach the group refusal. This account is refused earlier by the existing portal access guard. The corrected expectations passed.
- Completed results used the end-date Version 2 maximum and retained marks after removal and deactivation. A read overlapping an exclusive completion transaction loaded the completed term, its end date and retained roster together. These are synthetic term operations. There is no new migration or persisted release snapshot.
- Anonymous users, read-only viewers, out-of-department administrators and mismatched identifiers did not receive marks. The assigned teacher and in-department administrator passed the group check. ATT-03A and SET-01B regression checks passed on both adapters.
- The focused marks run reported unchanged default PGlite directory metadata and never opened the institutional database.

## Production review

- The guarded default build failed when the Turbopack CSS worker exited while compiling `/_not-found/page`. The first direct Webpack attempt failed with the Windows worker error `kill EPERM`. Both builds used an unused loopback database endpoint and an in-memory PGlite fallback.
- The guarded Webpack retry passed compilation, TypeScript, page generation and tracing. Compiled Edge passed at 1440, 390 and 320 px on disposable PostgreSQL. It checked the three phase views, keyboard selection, student evidence and return to the same phase, return to roll-call, completed-term navigation and the Settings calculation text. Axe and page-width checks passed on the five captured views. The desktop semester and 320 px student explanation were visually inspected.
- The Edge review used a synthetic administrator. The broader authorization and missing-policy cases were exercised through the report loader on both adapters. No institutional migration was needed for ATT-04.

## Owner review

With the production bundle built, run `node node_modules/tsx/dist/cli.mjs scripts/review-attendance.ts --att-04 --serve` and open the [local review launcher](http://localhost:3181/). “Open Attendance as administrator” starts in the working Spring term. Follow **Attendance marks** from the selected group. “Open completed term as administrator” starts in the completed Summer term's workspace. Follow **Attendance marks** and choose the group. The launcher seeds disposable PostgreSQL on loopback. Use `--check` in place of `--serve` to run the browser assertions and save screenshots to `.tmp/att-04/browser`.
