/** ATT-03A database-free lifecycle rules (AC-01, AC-03, AC-05). */
import assert from "node:assert/strict";
import {
  SESSION_COMMANDS, SESSION_STATES, availableCommands, countsInSummary, decideSession, isEditable, isUnsubmitted,
  parseReason, sessionActionLabel, statusChanges, type SessionCommand, type SessionState,
} from "../src/lib/attendance-lifecycle";

const teacher = { taker: true, reviewer: false }, reviewer = { taker: false, reviewer: true }, admin = { taker: true, reviewer: true }, nobody = { taker: false, reviewer: false };

// The approved transition table, exactly: [command, from, who may, result].
const allowed: Array<[SessionCommand, SessionState, "taker" | "reviewer" | "either", SessionState | null]> = [
  ["save", "draft", "taker", "draft"], ["submit", "draft", "taker", "submitted"], ["delete", "draft", "taker", null],
  ["reopen", "submitted", "either", "reopened"], ["lock", "submitted", "reviewer", "locked"],
  ["save", "reopened", "either", "reopened"], ["submit", "reopened", "either", "submitted"],
  ["reopen", "locked", "reviewer", "reopened"],
  ["void", "submitted", "either", "voided"], ["void", "reopened", "either", "voided"], ["void", "locked", "reviewer", "voided"],
  ["restore", "voided", "reviewer", "reopened"],
];
for (const command of SESSION_COMMANDS) for (const state of SESSION_STATES) {
  const rule = allowed.find(([c, s]) => c === command && s === state);
  if (!rule) {
    for (const roles of [teacher, reviewer, admin]) assert.deepEqual(decideSession(command, state, roles), { ok: false, reason: "state" }, `${command} from ${state}`);
    continue;
  }
  const [, , who, to] = rule;
  assert.deepEqual(decideSession(command, state, admin), { ok: true, to });
  assert.equal(decideSession(command, state, teacher).ok, who !== "reviewer", `${command} from ${state} as teacher`);
  assert.equal(decideSession(command, state, reviewer).ok, who !== "taker", `${command} from ${state} as reviewer`);
  assert.deepEqual(decideSession(command, state, nobody), { ok: false, reason: "role" });
}
assert.deepEqual(decideSession("save", "unknown", admin), { ok: false, reason: "state" }, "unknown stored state is never writable");
assert.deepEqual(decideSession("delete", "submitted", admin), { ok: false, reason: "state" }, "a submitted session is never deleted");
assert.deepEqual(decideSession("void", "draft", admin), { ok: false, reason: "state" }, "a draft is deleted, never voided");
assert.deepEqual(availableCommands("submitted", teacher), ["reopen", "void"]);
assert.deepEqual(availableCommands("locked", teacher), []);
assert.deepEqual(availableCommands("locked", admin), ["reopen", "void"]);
assert.deepEqual(availableCommands("voided", admin), ["restore"]);
assert.deepEqual(availableCommands("draft", teacher), ["save", "submit", "delete"]);

assert.deepEqual(SESSION_STATES.filter(isEditable), ["draft", "reopened"]);
assert.deepEqual(SESSION_STATES.filter(isUnsubmitted), ["draft", "reopened"]);
assert.deepEqual(SESSION_STATES.filter(countsInSummary), ["draft", "submitted", "reopened", "locked"], "D-4: every non-voided state counts");

// Reasons: required 3–300 after collapsing whitespace; optional notes may be empty; controls refused.
assert.equal(parseReason("  Student B   arrived late  ", "required"), "Student B arrived late");
assert.equal(parseReason("ok", "required"), undefined);
assert.equal(parseReason("   ", "required"), undefined);
assert.equal(parseReason(undefined, "required"), undefined);
assert.equal(parseReason("x".repeat(300), "required"), "x".repeat(300));
assert.equal(parseReason("x".repeat(301), "required"), undefined);
assert.equal(parseReason("", "optional"), null);
assert.equal(parseReason(null, "optional"), null);
assert.equal(parseReason("ok", "optional"), "ok", "short notes are fine");
assert.equal(parseReason(42, "optional"), undefined);
assert.equal(parseReason("bad\u0000reason", "required"), undefined);
assert.equal(parseReason("anything", "none"), null);

// Only changed students are recorded, in stored roll order.
const existing = [{ studentId: 1, studentCode: "0012", status: "absent" }, { studentId: 2, studentCode: "0015", status: "absent" }, { studentId: 3, studentCode: "0021", status: "late" }];
assert.deepEqual(statusChanges(existing, [{ studentId: 3, status: "present" }, { studentId: 1, status: "absent" }, { studentId: 2, status: "late" }]),
  [{ studentId: 2, studentCode: "0015", from: "absent", to: "late" }, { studentId: 3, studentCode: "0021", from: "late", to: "present" }]);
assert.deepEqual(statusChanges(existing, []), []);
assert.equal(sessionActionLabel("attendance.submit", "reopened"), "Resubmitted");
assert.equal(sessionActionLabel("attendance.submit", "draft"), "Submitted");
assert.equal(sessionActionLabel("attendance.save"), "Marks saved");

console.log("ATT-03A lifecycle: transition table, roles, reasons, counting and change lists verified.");
