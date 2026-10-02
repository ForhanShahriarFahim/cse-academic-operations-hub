/**
 * TCH-01 (#4) pure rules: validation (AC-03), the phone kept out of change
 * lists (AC-05), status transitions and placeholders (AC-06, AC-08), lifecycle
 * blockers and deletion refusals (AC-06, AC-07), and the effective limit (AC-09).
 */
import assert from "node:assert/strict";
import {
  allowedFrom, deactivationBlockers, deactivationNotes, deletionRefusals, effectiveLimit, isAssignable, isPlaceholder,
  normalizeTeacher, shortCodeClash, snapshotMentionsCode, teacherChanges, transitionRefusal, type TeacherReferences,
} from "../src/lib/teacher-records";
import { ROLES, hasCapability, type Actor } from "../src/lib/auth/policy";

const departmentIds = new Set([1, 2]);
const valid = { shortCode: " kah ", fullName: "  Kazi   Ahsan Habib ", designation: "Associate Professor", employmentType: "full_time", homeDepartmentId: "1", email: "KAH@Example.edu", phonePrivate: "01700-000000", advisoryLoadUnits: "12", notes: "" };

// AC-03: normalisation and every field rule.
const ok = normalizeTeacher(valid, { departmentIds, includePhone: true });
assert.ok(ok.ok);
assert.deepEqual(ok.fields, { shortCode: "KAH", fullName: "Kazi Ahsan Habib", designation: "Associate Professor", employmentType: "full_time", homeDepartmentId: 1, email: "kah@example.edu", phonePrivate: "01700-000000", advisoryLoadUnits: "12.0", notes: null });
const errorsFor = (patch: Record<string, unknown>) => {
  const result = normalizeTeacher({ ...valid, ...patch }, { departmentIds, includePhone: true });
  assert.equal(result.ok, false, JSON.stringify(patch));
  return Object.keys((result as { errors: object }).errors);
};
assert.deepEqual(errorsFor({ shortCode: "" }), ["shortCode"]);
assert.deepEqual(errorsFor({ shortCode: "K-AH" }), ["shortCode"]);
assert.deepEqual(errorsFor({ shortCode: "ABCDEFGHI" }), ["shortCode"]);
assert.deepEqual(errorsFor({ fullName: "K" }), ["fullName"]);
assert.deepEqual(errorsFor({ employmentType: "vacancy" }), ["employmentType"]);
assert.deepEqual(errorsFor({ homeDepartmentId: "9" }), ["homeDepartmentId"]);
assert.deepEqual(errorsFor({ email: "kah@example" }), ["email"]);
assert.deepEqual(errorsFor({ phonePrivate: "call me" }), ["phonePrivate"]);
for (const limit of ["0.5", "41", "12.3", "x"]) assert.deepEqual(errorsFor({ advisoryLoadUnits: limit }), ["advisoryLoadUnits"], limit);
assert.equal((normalizeTeacher({ ...valid, advisoryLoadUnits: "" }, { departmentIds, includePhone: true }) as { fields: { advisoryLoadUnits: unknown } }).fields.advisoryLoadUnits, null);
assert.deepEqual(errorsFor({ shortCode: "", fullName: "", email: "x" }).sort(), ["email", "fullName", "shortCode"]);

// AC-05: without private-contact access the phone is neither read nor written.
const noPhone = normalizeTeacher({ ...valid, phonePrivate: "not even valid" }, { departmentIds, includePhone: false });
assert.ok(noPhone.ok && !("phonePrivate" in noPhone.fields));

// AC-03: codes clash in upper case only; exact codes stay distinct (IM is not IMN).
const others = [{ id: 1, shortCode: "IM" }, { id: 2, shortCode: "IMN" }];
assert.equal(shortCodeClash("im", others, null)?.id, 1);
assert.equal(shortCodeClash("IM", others, 1), null, "a record does not clash with itself");
assert.equal(shortCodeClash("IMK", others, null), null);

// AC-04, AC-05: only changed fields; the phone appears only as a flag.
const before = { shortCode: "KAH", fullName: "Kazi Ahsan Habib", phonePrivate: "01700-000000", advisoryLoadUnits: null, homeDepartmentId: 1 };
const change = teacherChanges(before, { shortCode: "KAH", fullName: "Kazi A. Habib", phonePrivate: "01800-111111", advisoryLoadUnits: "12.0", homeDepartmentId: 1 });
assert.deepEqual(change.fields, ["fullName", "phonePrivate", "advisoryLoadUnits"]);
assert.deepEqual(change.before, { fullName: "Kazi Ahsan Habib", advisoryLoadUnits: null });
assert.deepEqual(change.after, { fullName: "Kazi A. Habib", advisoryLoadUnits: "12.0" });
assert.equal(change.phoneChanged, true);
assert.ok(!JSON.stringify(change).includes("01800") && !JSON.stringify(change).includes("01700"), "no phone digits in a change");
assert.deepEqual(teacherChanges(before, { ...before, phonePrivate: undefined }).fields, [], "an omitted phone is unchanged");
assert.deepEqual(teacherChanges({ homeDepartmentId: 1 }, { homeDepartmentId: "1" as unknown as number }).fields, [], "1 and '1' are the same value");

// AC-06, AC-08: transitions and placeholders.
assert.ok(allowedFrom("set_on_leave", "active") && !allowedFrom("set_on_leave", "on_leave"));
assert.ok(allowedFrom("deactivate", "on_leave") && !allowedFrom("deactivate", "inactive") && !allowedFrom("deactivate", "vacancy"));
assert.ok(allowedFrom("reactivate", "inactive") && !allowedFrom("reactivate", "active"));
assert.ok(allowedFrom("resolve", "unresolved") && !allowedFrom("resolve", "vacancy") && !allowedFrom("resolve", "active"));
assert.ok(!allowedFrom("edit", "vacancy") && !allowedFrom("edit", "unresolved") && allowedFrom("edit", "inactive"));
assert.match(transitionRefusal("edit", "vacancy"), /vacancy marker/);
assert.match(transitionRefusal("deactivate", "unresolved"), /Resolve it first/);
assert.ok(isPlaceholder("vacancy") && isPlaceholder("unresolved") && !isPlaceholder("inactive"));
assert.ok(isAssignable("active") && isAssignable("on_leave") && !isAssignable("inactive") && !isAssignable("vacancy"));

// AC-09: the effective limit.
assert.equal(effectiveLimit(null), 15);
assert.equal(effectiveLimit(""), 15);
assert.equal(effectiveLimit("12.5"), 12.5);

// AC-06, AC-07: blockers, notes and deletion refusals.
const empty: TeacherReferences = {
  termName: "Summer 2026",
  activeTerm: { classes: [], allocations: [], extraLoad: [], externals: [] },
  anyTerm: { classes: 0, allocations: 0, extraLoad: 0, externals: 0, attendanceSessions: 0, terms: 0 },
  portalAccount: null, publishedVersions: [],
};
assert.deepEqual(deactivationBlockers(empty), []);
assert.deepEqual(deletionRefusals(empty), []);
const busy: TeacherReferences = {
  ...empty,
  activeTerm: {
    classes: [1, 2, 3, 4, 5].map((n) => ({ courseCode: `CSE-220${n}`, day: "Sat", time: "9:00" })),
    allocations: [{ courseCode: "CSE-2201", method: "sole", externalDepartment: null }],
    extraLoad: [{ classDate: "2026-09-12", courseCode: "CSE-2201" }],
    externals: [{ counterpartDepartment: "EEE", courseLabel: "EEE-1101" }],
  },
  anyTerm: { classes: 9, allocations: 2, extraLoad: 1, externals: 1, attendanceSessions: 214, terms: 2 },
  portalAccount: { email: "kah@example.edu" },
  publishedVersions: [{ termName: "Summer 2026", versionNumber: 3 }],
};
const blockers = deactivationBlockers(busy);
assert.deepEqual(blockers.map((b) => b.kind), ["classes", "allocations", "externals"], "extra load never blocks");
assert.equal(blockers[0].label, "5 classes in the working routine");
assert.match(blockers[0].detail, /and 1 more$/);
assert.deepEqual(deactivationNotes(busy).map((n) => n.kind), ["extra_load"]);
const refusals = deletionRefusals(busy);
assert.equal(refusals.length, 3);
assert.match(refusals[0], /Summer 2026 publication v3/);
assert.match(refusals[1], /214 attendance sessions across 2 terms/);
assert.match(refusals[2], /kah@example\.edu/);

// AC-07: snapshot search by exact code, in nested meetings and metadata.
const snapshot = { meetings: [{ teachers: [{ id: 3, shortCode: "IMN" }] }], metadata: { teachers: [{ shortCode: "KAH" }] } };
assert.ok(snapshotMentionsCode(snapshot, "kah"));
assert.ok(snapshotMentionsCode(snapshot, "IMN"));
assert.ok(!snapshotMentionsCode(snapshot, "IM"), "IM is not IMN");
assert.ok(!snapshotMentionsCode(null, "KAH"));

// D-1: only the three editor roles hold manage_teachers.
const editors = ROLES.filter((role) => {
  const actor: Actor = { id: 1, email: "x@example.edu", displayName: "X", teacherId: null, assignments: [{ role, departmentId: null, activeFrom: new Date(0), activeTo: null }] };
  return hasCapability(actor, "manage_teachers", 1, new Date());
});
assert.deepEqual([...editors].sort(), ["academic_administrator", "routine_coordinator", "system_administrator"]);

console.log("Teacher record verification passed: fields, phone privacy, transitions, placeholders, blockers, deletion, snapshots, limit, editor roles.");
