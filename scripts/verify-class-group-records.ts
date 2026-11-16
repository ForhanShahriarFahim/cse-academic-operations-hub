import assert from "node:assert/strict";
import { allocationMethod, classGroupFilters, classGroupQuery, creditingOf, externalCount, formatUnits, groupStates, groupUsed, optionalText, parseDelivery, parseRequirement, parseTeachers, parseUnits, scheduleState, storedUnits, suggestUnits, usageText, type GroupFacts } from "../src/lib/class-group-records";
import { hasCapability, type Actor } from "../src/lib/auth/policy";

// Units: whole hundredths, 0.25–20.00, at most two decimals, text only.
assert.equal(parseUnits("3"), 300); assert.equal(parseUnits("3.5"), 350); assert.equal(parseUnits("0.25"), 25); assert.equal(parseUnits("20.00"), 2000); assert.equal(parseUnits(" 1.50 "), 150);
for (const bad of ["0", "0.24", "20.01", "3.125", "-1", "1e1", "three", "", " ", "3,5", "003.5", ".5", "3."]) assert.equal(parseUnits(bad), null, bad);
for (const bad of [3, null, undefined, ["3"], { units: "3" }]) assert.equal(parseUnits(bad), null);
assert.equal(formatUnits(150), "1.50"); assert.equal(formatUnits(2000), "20.00");
assert.equal(storedUnits("14.90"), 1490); assert.equal(storedUnits("0.10"), 10); assert.equal(storedUnits("abc"), null); assert.equal(storedUnits(null), null);
// 14.9 + 0.1 stays exactly 15 in hundredths (the extra-load threshold must not drift).
assert.equal(storedUnits("14.90")! + storedUnits("0.10")!, 1500);

// Crediting: one teacher is sole; several need an explicit choice; none has no method.
assert.equal(allocationMethod(0, "full"), null); assert.equal(allocationMethod(1, undefined), "sole"); assert.equal(allocationMethod(1, "split"), "sole");
assert.equal(allocationMethod(2, "full"), "shared_policy"); assert.equal(allocationMethod(3, "split"), "split");
for (const bad of [undefined, "", "sole", "shared_policy", "each"]) assert.equal(allocationMethod(2, bad), null);
assert.equal(creditingOf("shared_policy"), "full"); assert.equal(creditingOf("split"), "split"); assert.equal(creditingOf("sole"), ""); assert.equal(creditingOf(null), "");

// Teacher rows: parallel lists, unique teachers, valid units, bounded length.
assert.deepEqual(parseTeachers(["4", "9"], ["3.00", "1.5"]), { ok: true, rows: [{ teacherId: 4, units: 300 }, { teacherId: 9, units: 150 }] });
assert.deepEqual(parseTeachers([], []), { ok: true, rows: [] }, "a vacancy is accepted");
for (const [ids, units] of [[["4"], []], [["4", "4"], ["1", "1"]], [["x"], ["1"]], [["4"], ["99"]], [["4"], [""]], [["0"], ["1"]], [["4 or 1=1"], ["1"]]] as Array<[unknown[], unknown[]]>) assert.equal(parseTeachers(ids, units).ok, false);
assert.equal(parseTeachers(Array.from({ length: 13 }, (_, index) => String(index + 1)), Array.from({ length: 13 }, () => "1")).ok, false);

// Weekly requirement: fixed needs both numbers in range; teacher-managed has neither.
assert.deepEqual(parseRequirement("fixed", "2", "150", undefined), { ok: true, requirement: { meetings: 2, minutes: 150, provisional: false } });
assert.deepEqual(parseRequirement("fixed", "1", "30", "on"), { ok: true, requirement: { meetings: 1, minutes: 30, provisional: true } });
assert.deepEqual(parseRequirement("teacher_managed", "9", "9999", undefined), { ok: true, requirement: { meetings: 1, minutes: null, provisional: false } }, "numbers are ignored for teacher-managed work");
for (const [meetings, minutes] of [["0", "150"], ["15", "150"], ["2", "29"], ["2", "1501"], ["", "150"], ["2", ""], ["2.5", "150"], ["two", "150"]]) assert.equal(parseRequirement("fixed", meetings, minutes, undefined).ok, false, `${meetings}/${minutes}`);
const both = parseRequirement("fixed", "", "", undefined); assert.ok(!both.ok && both.errors.meetings && both.errors.minutes);
assert.equal(parseDelivery("fixed"), "fixed"); assert.equal(parseDelivery("teacher_managed"), "teacher_managed"); assert.equal(parseDelivery("online"), null);

// Optional text and outside count.
assert.equal(optionalText("", 40), null); assert.equal(optionalText("  ", 40), null); assert.equal(optionalText(" EEE-22B ", 40), "EEE-22B");
assert.equal(optionalText("x".repeat(41), 40), undefined); assert.equal(optionalText("a\nb", 40), undefined); assert.equal(optionalText(5, 40), undefined);
assert.equal(externalCount(""), null); assert.equal(externalCount("0"), 0); assert.equal(externalCount("35"), 35); assert.equal(externalCount("5001"), undefined); assert.equal(externalCount("-1"), undefined); assert.equal(externalCount("3.5"), undefined);

// Suggestions always name their source and are never invented beyond recorded practice.
assert.deepEqual(suggestUnits({ credits: "3.0", courseType: "theory" }, 250), { units: 250, source: "previous" });
assert.deepEqual(suggestUnits({ credits: "3.0", courseType: "theory" }, null), { units: 300, source: "catalog" });
assert.deepEqual(suggestUnits({ credits: "1.0", courseType: "sessional" }, null), { units: 200, source: "sessional" });
assert.equal(suggestUnits({ credits: "1.5", courseType: "sessional" }, null), null, "no rule is asserted for other sessionals");
assert.equal(suggestUnits({ credits: "3.0", courseType: "thesis" }, null), null);
assert.deepEqual(suggestUnits({ credits: "3.0", courseType: "theory" }, 5000), { units: 300, source: "catalog" }, "an out-of-range previous value is not suggested");

// States and scheduling status.
const facts = (changes: Partial<GroupFacts> = {}): GroupFacts => ({ deliveryMode: "fixed", teacherCount: 1, hasMeetingTeacher: false, requirement: { minutes: 150, provisional: false }, scheduledMeetings: 0, scheduledMinutes: 0, problems: 0, ...changes });
assert.deepEqual(groupStates(facts()), ["ready"]);
assert.deepEqual(groupStates(facts({ teacherCount: 0 })), ["vacancy"]);
assert.deepEqual(groupStates(facts({ teacherCount: 0, hasMeetingTeacher: true })), ["ready"], "a teacher on a scheduled class is an assignment");
assert.deepEqual(groupStates(facts({ requirement: null })), ["no_requirement"]);
assert.deepEqual(groupStates(facts({ requirement: { minutes: null, provisional: false } })), ["no_requirement"]);
assert.deepEqual(groupStates(facts({ requirement: { minutes: 150, provisional: true } })), ["provisional", "ready"]);
assert.deepEqual(groupStates(facts({ deliveryMode: "teacher_managed", requirement: { minutes: null, provisional: false } })), ["teacher_managed", "ready"]);
assert.deepEqual(groupStates(facts({ problems: 2, teacherCount: 0 })), ["reconcile", "vacancy"]);
assert.equal(scheduleState(facts({ deliveryMode: "teacher_managed" })), "teacher_managed");
assert.equal(scheduleState(facts({ teacherCount: 0 })), "vacancy");
assert.equal(scheduleState(facts()), "unscheduled");
assert.equal(scheduleState(facts({ scheduledMeetings: 1, scheduledMinutes: 75 })), "partial");
assert.equal(scheduleState(facts({ scheduledMeetings: 3, scheduledMinutes: 225 })), "over_scheduled");
assert.equal(scheduleState(facts({ scheduledMeetings: 2, scheduledMinutes: 150 })), "scheduled");
assert.equal(scheduleState(facts({ scheduledMeetings: 1, scheduledMinutes: 75, requirement: null })), "scheduled", "no requirement to compare with, as in the existing report");

// Usage decides whether the audience may change and whether the group may be removed.
assert.equal(groupUsed({ meetings: 0, enrollments: 0, sessions: 0, claims: 0 }), false);
for (const key of ["meetings", "enrollments", "sessions", "claims"] as const) assert.equal(groupUsed({ meetings: 0, enrollments: 0, sessions: 0, claims: 0, [key]: 1 }), true);
assert.equal(usageText({ meetings: 2, enrollments: 0, sessions: 1, claims: 0 }), "2 scheduled classes, 1 attendance session");

// Filters never pass unknown values on.
assert.deepEqual(classGroupFilters({ q: "cse", stream: "HSC", state: "vacancy", cohort: "4", teacher: "9" }), { q: "cse", stream: "HSC", state: "vacancy", cohort: 4, teacher: 9 });
assert.deepEqual(classGroupFilters({ stream: "x", state: "drop table", cohort: "1e3", teacher: ["1", "2"] }), { q: "", stream: "all", state: "any", cohort: null, teacher: null });
assert.equal(classGroupQuery({ state: "vacancy", q: "a b" }), "?q=a+b&state=vacancy"); assert.equal(classGroupQuery({}), ""); assert.equal(classGroupQuery({}, { done: "Saved" }), "?done=Saved");

// D-2 capability: system and academic administrators and routine coordinators; nobody else.
const actor = (role: Actor["assignments"][number]["role"]): Actor => ({ id: 1, email: "x@example.invalid", displayName: "Synthetic", teacherId: null, assignments: [{ role, departmentId: null, activeFrom: new Date(0), activeTo: null }] });
for (const role of ["system_administrator", "academic_administrator", "routine_coordinator"] as const) assert.equal(hasCapability(actor(role), "manage_class_groups", 1), true, role);
for (const role of ["department_approver", "teacher", "accounts_officer", "read_only_viewer"] as const) assert.equal(hasCapability(actor(role), "manage_class_groups", 1), false, role);
assert.equal(hasCapability(actor("routine_coordinator"), "manage_offerings", 1), false, "coordinators still cannot decide what is offered");

console.log("Class groups: units in hundredths, crediting choice, teacher rows, weekly requirement, suggestions with their source, states, scheduling status, usage and filters pass.");
