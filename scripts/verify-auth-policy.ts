import assert from "node:assert/strict";
import { hasCapability, type Actor } from "../src/lib/auth/policy";

const now = new Date("2026-09-25T00:00:00Z");
const base: Actor = { id: 1, email: "teacher@example.edu", displayName: "Example Teacher", teacherId: 10, assignments: [] };
const teacher: Actor = { ...base, assignments: [{ role: "teacher", departmentId: 2, activeFrom: new Date("2026-01-01"), activeTo: null }] };
assert.equal(hasCapability(teacher, "take_attendance", 2, now), true);
assert.equal(hasCapability(teacher, "manage_routine", 2, now), false);
assert.equal(hasCapability(teacher, "take_attendance", 3, now), false);

const combined: Actor = { ...teacher, assignments: [...teacher.assignments, { role: "routine_coordinator", departmentId: 2, activeFrom: new Date("2026-01-01"), activeTo: null }] };
assert.equal(hasCapability(combined, "manage_routine", 2, now), true);
assert.equal(hasCapability(combined, "approve_publication", 2, now), false);

const expired: Actor = { ...base, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date("2025-01-01"), activeTo: new Date("2026-01-01") }] };
assert.equal(hasCapability(expired, "manage_users", 2, now), false);
const future: Actor = { ...base, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date("2027-01-01"), activeTo: null }] };
assert.equal(hasCapability(future, "manage_users", 2, now), false);

const admin: Actor = { ...base, assignments: [{ role: "system_administrator", departmentId: null, activeFrom: new Date("2026-01-01"), activeTo: null }] };
assert.equal(hasCapability(admin, "manage_users", 2, now), true);
assert.equal(hasCapability(admin, "manage_users", 99, now), true);

console.log("Auth policy verification passed: roles, multi-role union, department scope, time bounds.");
