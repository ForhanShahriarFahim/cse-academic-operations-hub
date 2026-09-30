import assert from "node:assert/strict";
import {
  conflicted, denied, invalid, outcomeOf, partial, stale, succeeded,
  type ActionResult, type OutcomeKind,
} from "../src/lib/action-result";

// Every builder: the ok flag follows the outcome, and results survive serialization unchanged.
const issueWithExtras = { id: "x", type: "teacher_double_booking", meetingIds: [1], severity: "blocker" as const, title: "Clash", detail: "Teacher double-booked" };
const cases: Array<[OutcomeKind, ActionResult]> = [
  ["success", succeeded("Saved.", { entityId: 7 })],
  ["validation", invalid("Enter a name.", { fullName: ["Required"] })],
  ["conflict", conflicted("1 blocking conflict.", [issueWithExtras, { severity: "warning", title: "Note", detail: "Advisory" }])],
  ["permission", denied("Sign in before making changes.", "unauthenticated")],
  ["stale", stale("Reload the page.", "not_active_term")],
  ["partial", partial("2 of 3 rows imported; 1 rejected.", { total: 3, applied: 2, rejected: [{ row: 3, message: "Missing student ID" }] })],
];
for (const [kind, result] of cases) {
  assert.equal(outcomeOf(result), kind);
  assert.equal(result.ok, kind === "success", `${kind}: ok is true only for success`);
  assert.equal(typeof result.message, "string");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, `${kind}: plain serializable data`);
  assert.deepEqual(structuredClone(result), result);
}
assert.equal(new Set(cases.map(([kind]) => kind)).size, 6);

// Conflicts keep only the display fields of issues and count blockers/warnings from them.
const conflict = cases[2][1];
assert.deepEqual(conflict.outcome, { kind: "conflict", blockers: 1, warnings: 1 });
assert.deepEqual(Object.keys(conflict.issues![0]).sort(), ["detail", "severity", "title"]);
assert.throws(() => conflicted("No blockers", [{ severity: "warning", title: "Note", detail: "Advisory" }]), /at least one blocking issue/);

// Partial imports: counts must reconcile and both sides must be present; rows are copied.
const rejected = [{ row: 2, message: "Bad row" }];
const partialResult = partial("1 of 2 rows imported.", { total: 2, applied: 1, rejected });
rejected[0].message = "mutated";
assert.equal(partialResult.outcome?.kind === "partial" && partialResult.outcome.rejected[0].message, "Bad row");
assert.throws(() => partial("x", { total: 3, applied: 1, rejected }), /applied \+ rejected rows = total/);
assert.throws(() => partial("x", { total: 1, applied: 0, rejected }), /both applied and rejected/);
assert.throws(() => partial("x", { total: 2, applied: 2, rejected: [] }), /both applied and rejected/);
assert.throws(() => partial("x", { total: -1, applied: -2, rejected: [{ row: 1, message: "" }] }), /= total/);

// Success options are optional; an empty issue list is omitted.
assert.deepEqual(succeeded("Done."), { ok: true, message: "Done.", outcome: { kind: "success" } });
assert.equal(succeeded("Done.", { issues: [] }).issues, undefined);
assert.deepEqual(succeeded("Moved.", { issues: [issueWithExtras] }).issues, [{ severity: "blocker", title: "Clash", detail: "Teacher double-booked" }]);

// Legacy results (no outcome), exactly as existing actions still return them, remain valid and classifiable.
const legacy: ActionResult[] = [
  { ok: true, message: "Meeting moved.", issues: [{ severity: "warning", title: "w", detail: "d" }] },
  { ok: false, message: "2 blocking conflict(s) — placement rejected.", issues: [{ severity: "blocker", title: "b", detail: "d" }] },
  { ok: false, message: "Enter valid times." },
  { ok: false, message: "Advisory only", issues: [{ severity: "warning", title: "w", detail: "d" }] },
];
assert.deepEqual(legacy.map(outcomeOf), ["success", "conflict", "validation", "validation"]);

console.log("Action result contract verification passed: six outcome categories, ok/outcome invariants, serialization, legacy compatibility.");
