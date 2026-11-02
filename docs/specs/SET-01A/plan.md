# SET-01A — Implementation plan

Parent: [SET-01 / #14](https://github.com/ForhanShahriarFahim/cse-academic-operations-hub/issues/14)

Specification: [D-1–D-6 / AC-01–AC-11](spec.md) · [verification](verification.md) · [sketches](mockups/terms.html)

Status: **Approved; implementation in progress**

Branch/base: `codex/set-01a` / local `main` `6011e0f`

Updated: 2 November 2026, Asia/Dhaka

## Inspection and proposed approach

BUG-28 acceptance `0520887` and merge `649f292` precede this branch; merge receipt `6011e0f`. That foundation enforces at most one active term but does not serialize activation with active-dependent writes. Build a dedicated term workspace independently of `getPortalData`, then introduce one context protocol shared by activation, existing active writers and composed active reads. Do not solve activation by setting a cookie or by retargeting a submitted form to the latest term.

Installed Next guides inspected for planning: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, `01-app/02-guides/server-actions.md`, and `01-app/03-api-reference/04-functions/cookies.md`. Params/searchParams and cookies are async; client action ordering is not database serialization. Recheck relevant installed guidance before implementation, including mutation/revalidation and error handling. No installed dependency files are changed.

Proposed seams:

| Area | Bounded change |
|---|---|
| DB/schema/migration | Add term revision and managed-setup marker, singleton generation; future status default `draft`; retain unique active index. Next journal entry expected `0014`. No inferred legacy normalization. |
| Context helper and audit transactions | Shared/exclusive row-lock helpers, strict context parsing, consistent read capture/recheck; accept an existing transaction reader throughout ownership checks. Context lock is always first. Do not bolt it onto the end of `auditedChange`. |
| Term domain/data/actions | Validation, permissions, protected-reference inventory, revisioned draft metadata/policy, read-only directory/detail, fresh activation evidence and atomic audited switch. Serialize duplicate identity decisions; keep existing legacy duplicates. |
| Existing actions/callers | Inventory all 8 routine/external/publication, 12 academic, 5 grid exports and active-dependent teacher deactivation. Carry explicit context through all forms/drag/drop/import/publish and recheck in the actual transaction. Reconcile inventory against current exports before coding. |
| Active projections | Capture ID/generation together; bind reads and recheck before returning. Keep private `writeContext` out of snapshots/public payloads. Public active selection checks activation interleaving too. |
| Archive | Explicit authenticated term/version lookup, supported frozen snapshot validation and public-equivalent redaction; adapt existing official/teacher projection/export/print without loading current portal data. |
| UI/navigation | `/terms`, selected workspace, metadata/create, initial setup, activation review; menu visible to internal viewers, controls by capability. Settings links to terms; operational pages still name active scope. |
| Tests/docs | Meaningful domain and persisted-action checks, two-connection races, both-adapter migration/recovery, guarded disposable production preview and browser/print evidence. Keep the parent open. |

Implementation detail: the database export routes calls through an `AsyncLocalStorage` transaction scope during active-dependent actions. Existing guards/readers/ownership checks therefore use the same transaction that owns the first context lock; existing nested audit transactions remain real savepoints. Outside the scope the original database is unchanged. Page-scoped client providers capture the context from the same data as their forms, rather than the independently loaded layout. PostgreSQL production-action races and PGlite request-queue checks exercise these actual paths. PGlite has one SQL connection; independent multi-session SQL barriers apply to PostgreSQL, while PGlite is checked through its real serialized transaction/request queue.

Migration preparation must test a pre-0014 populated copy, original legacy no-grid conversion, a wholly empty database, and new managed drafts with no patterns globally. Existing source preparation remains explicit. Record table/row/snapshot preservation, idempotence and recovery. Do not start dev/start/prepare/migrate against the configured institutional target. Use the existing guarded disposable harness/owned target, with target proof before each runner that can prepare data.

Activation review fingerprints only the evidence displayed to the administrator; define its canonical representation in code and tests. Metadata/create needs exclusive context serialization for duplicate decisions; setup can take shared context then target-row lock/revision. Ordinary active writers take shared context before their current locks; activation takes exclusive context and never upgrades from shared. Check the teacher-deactivation path especially: its teacher lock currently precedes active-reference lookup and must move behind context acquisition. Tests must expose deadlock/order errors, not merely call two promises serially.

## Approval record

- Planning authorization: owner's 1 November “ok go for that”, after the proposed BUG-28 merge and SET-01A inspection/specification next step.
- Implementation authorization: **Approved**, 1 November 2026. Owner replied **“Approve.”** to the explicit request to approve D-1–D-6 after presentation of specification, plan and responsive sketches.
- Approved scope: D-1–D-6 / AC-01–AC-11 at proposal commit `de43546`, unchanged. This approval record is committed before T-03; it does not authorize institutional rollout, remote synchronization or merge before delivery acceptance.
- Material amendments: none; any lifecycle, authority, historic-editing, empty-activation or policy-governance expansion needs a decision.

## Tasks — sole checklist

- [x] T-01 — Inspect current code/requirements and record the bounded proposal, risks and six owner decisions; AC-01–AC-11.
- [x] T-02 — Review responsive sketches/documentation and obtain actual unchanged D-1–D-6 approval (“Approve.”, 1 November); commit this approval before implementation. Static review evidence is in verification.
- [ ] T-03 — Implement schema/context/read capture and forward migration/backfill guard; verify populated preservation, zero-active setup and both-adapter recovery; AC-03/08/09. Depends on T-02.
- [x] T-04 — Implement permissions, identity/protected references, explicit starting policy and atomic activation with fresh evidence/audit; focused raw-action checks pass on both adapters. AC-01/02/03/06; broader verification remains T-07/T-08.
- [x] T-05 — Migrate all 25 active-dependent actions plus teacher deactivation, every client caller and composed active/public loader to strict context; focused missing/stale/ABA/refusal and real race/queue checks pass. AC-07/08/10; regression/UI checks remain T-07/T-08.
- [x] T-06 — Implement directory/workspaces/forms, redacted frozen archive and existing print/export adaptation. Historical teacher sheets explicitly mark absent workload allocations instead of substituting live totals. AC-01/04/05/10; browser/native print verification remains T-08.
- [ ] T-07 — Run focused domain/persisted-action/permission/migration/real-race regressions and correct findings; AC-01–AC-10. Exercise historical preservation and private sentinels on both adapters.
- [ ] T-08 — Run final required suites/default build, production browser/mobile/keyboard/native A4/output checks and diff review; record criterion results and guarded owner preview; AC-05/10/11. Commit coherent verified delivery.
- [ ] T-09 — Present bounded delivery for actual owner inspection/acceptance, resolve required failures or record an explicit owner exception; merge locally only after acceptance, record receipt and exact next-session handoff. Leave #14 open; no routine remote sync.

## Verification and delivery

Planning uses source/link/anchor/template/whitespace/diff checks and static sketch captures at 1440/390/320px; it does not require application or database suites. Static sketches are not an operational term-management preview. Do not reuse BUG-28's synthetic control UI as evidence that SET-01A is implemented.

Implementation requires `npm run typecheck`, `npm run lint`, `npm run test:domain`, `npm run build`, appropriate `npm run test:safety` groups and focused UI checks. A failed default build is failed/partial even if a separately labelled Webpack review build works. Prior accepted exceptions do not transfer to this slice. Map evidence to every AC in [verification](verification.md); keep required unavailable checks pending. No production/staging/rollout certification.

Owner review after implementation: isolated authenticated administrator and viewer journeys; create draft → metadata conflict → explicit policy → fresh activation → old-page stale refusal → completed-term archive/print; compare public view before/after. Cover zero-active/unavailable/denied variants using the harness only. Publish no unverified institutional data. After acceptance merge the bounded issue branch into local `main`; suggest the next ready slice without starting it. GitHub last reconciliation remains 26 October `0b1e055`.

## Current checkpoint / exact handoff

- Branch/base: `codex/set-01a` from `6011e0f`; BUG-28 is already accepted and merged. One writer/checklist, no worktree or remote changes.
- Scope: [D-1–D-6](spec.md) approved unchanged by owner's “Approve.” on 1 November; T-01/T-02 complete.
- Changes: proposal `de43546`; approval `c6c7bdc` precedes implementation `0928e4a`. Corrective checkpoint adds keyed form scopes/reviews, strict malformed-field handling, ordered transaction reads, retained-context replacement epochs, narrow print preview and explicit/legacy fixture boundaries. Inspect actual Git log/status for its hash and later evidence.
- Next action: finish T-03 recovery evidence and T-07/T-08 regression/browser/native A4 checks, correct findings and present a guarded synthetic preview. No repeated implementation approval is needed. T-09 owner acceptance still precedes local merge.
- Checks: [verification](verification.md). Focused PGlite/PostgreSQL workspace checks, domain, typecheck and initial lint pass. Full safety suite is running. Default Turbopack build fails in CSS-worker process/IPC startup; separately labelled Webpack review build is finishing. No default-build exception is inferred.
- No institutional command, worktree or remote sync. Owner delivery acceptance and SET-01A merge remain pending. Static proposal at port 3112 is separate from the upcoming production review preview.

Pasteable continuation: “Continue approved SET-01A on `codex/set-01a`. Read the brief, workflow and `docs/specs/SET-01A/{spec,plan,verification}.md`. Owner approved unchanged D-1–D-6 (‘Approve.’, 1 November) after proposal `de43546`; inspect its committed approval and actual Git/code state. Complete the sole checklist without re-requesting unchanged scope. No worktrees, institutional preparation/reset, automatic next part or remote synchronization. Delivery acceptance still precedes local-main merge.”
