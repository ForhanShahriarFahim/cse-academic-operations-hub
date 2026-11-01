# BUG-28 — Proposed unavailable-state sketches

[Specification D-3](spec.md#d-3--shared-resolution-and-truthful-consumer-behavior), [sole plan](plan.md). Status: **Design proposal, not implemented UI or browser evidence.** Updated: 1 November 2026, Asia/Dhaka.

These are small changes to existing chrome and error/empty states. Normal one-active-term pages and print layout retain their accepted design. Use paper/ink/pine/gold and the existing notice, heading and button patterns. No activation control or repair wizard is proposed.

## Internal desktop — legacy ambiguity

```text
Existing navigation     Academic term unavailable
Account / Sign out      [configuration notice]
                        More than one academic term is active.
                        Term-based pages and changes are unavailable.
                        Contact the portal administrator.

                        Existing dependent-page error state, or the
                        existing independent page (e.g. My account).
```

Suppress term name, draft/publication/version badge and invented counts. Do not render a routine/attendance/workload result from either term. The authenticated notice contains no IDs, SQL, storage paths or operator instructions. Preserve account/sign-out and navigation; page retry follows the existing error contract.

## Internal phone — zero active, 390/320px

```text
[Menu] Portal        No active term

No academic term is active
Term-based pages and changes are unavailable.
Contact the portal administrator.

[Existing page error / independent page]
```

Wrap status text instead of forcing a single-line mobile badge. No horizontal page overflow, obscured menu or false “Draft” label. Use a semantic alert for the configuration notice, visible heading and existing keyboard focus order. No seed/reset advice. No numeric term choice. Existing independent forms retain values and actions; direct dependent-action refusals announce the safe configuration message and retain entered values, without a false success or audit.

## Public viewer and official page — ambiguity

```text
Official Class Routine

Routine temporarily unavailable
The department's routine is temporarily unavailable.
Please check again later.
```

Keep public branding and a main heading. Hide routine data, version, selection controls, export and print action. No duplicate term names/IDs or administrator-only detail. Public zero-active remains the existing “No published routine” state. No-active and ambiguity must not fall back to a previous term's published snapshot.

If the user invokes browser print directly, print only the unavailable notice on a readable A4 page; do not generate an official package, term/version heading or routine rows. The valid one-active-term official package/CSV remains unchanged. There is no new print document in this slice.

## Action/export behavior

Affected authorized actions: unsuccessful existing ActionResult, for example “Academic term configuration is unavailable. No changes were saved. Contact the portal administrator.” Do not claim success or clear form values. Existing permission failures take precedence. Unrelated failures are not translated into this notice.

CSV ambiguity: HTTP 503, no-store, JSON `{"error":"Routine temporarily unavailable."}`, no attachment header or CSV. Internal zero-active likewise gives 503 after existing authorization. Public zero-active/no-publication retains HTTP 404. Returning the unavailable page does not itself certify an HTTP 503 for streamed page responses; the explicit 503 requirement applies to CSV route handlers. Page body correctness and absence of data/actions are required independently.
