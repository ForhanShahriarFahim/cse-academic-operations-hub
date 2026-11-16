import assert from "node:assert/strict";
import { cohortName, compareCohort, newOfferingStatus, offeringInteger, offeringLive, offeringReason, offeringStatusLabel, offeringTermEditable, parsePick, proposeCohort, slotBasis, slotKey, type OfferingCohort, type OfferingCourse, type OfferingFact } from "../src/lib/offering-records";
import { hasCapability, type Actor } from "../src/lib/auth/policy";

// Source term: two HSC cohorts at semester 5, one Diploma cohort at semester 5, one HSC cohort at semester 2 with nothing offered.
const cohorts: OfferingCohort[] = [
  { batchId: 1, stream: "HSC", label: "22A", semester: 5 }, { batchId: 2, stream: "HSC", label: "22B", semester: 5 },
  { batchId: 3, stream: "DIPLOMA", label: "23A", semester: 5 }, { batchId: 4, stream: "HSC", label: "24A", semester: 2 },
];
const fact = (id: number, courseId: number, batchId: number, status = "open"): OfferingFact => ({ id, courseId, batchId, status });
const source = [
  fact(1, 10, 1), fact(2, 10, 2),              // both HSC semester-5 cohorts
  fact(3, 11, 2),                              // only one of them
  fact(4, 12, 1, "cancelled"), fact(5, 12, 2, "cancelled"), // cancelled is not a basis
  fact(6, 13, 1, "completed"), fact(7, 13, 2, "planned"),   // completed/planned count as offered
  fact(8, 14, 1), fact(9, 14, 2),              // inactive course below
  fact(10, 20, 3),                             // Diploma slot is separate
  fact(11, 15, 1, "mystery"),                  // unknown status is not a basis
  fact(12, 16, 99),                            // cohort without a placement is ignored
];
const basis = slotBasis(cohorts, source);
assert.deepEqual([...basis.keys()].sort(), ["DIPLOMA|5", "HSC|2", "HSC|5"]);
const hsc5 = basis.get(slotKey({ stream: "HSC", semester: 5 }))!;
assert.deepEqual([...hsc5.courses.keys()].sort(), [10, 11, 13, 14]);
assert.deepEqual(hsc5.courses.get(11), [2]);
assert.equal(basis.get("HSC|2")!.courses.size, 0, "a placed cohort with no offerings still makes the slot exist");
assert.deepEqual([...basis.get("DIPLOMA|5")!.courses.keys()], [20], "streams never share a basis");

const courses = new Map<number, OfferingCourse>([10, 11, 12, 13, 14, 20, 30].map(id => [id, { id, code: `CSE-${3000 + id}`, isActive: id !== 14, semester: 5 }]));
// Fresh destination cohort.
const fresh = proposeCohort(hsc5, [], courses);
assert.deepEqual(fresh.map(item => [item.courseId, item.reason, item.selectable, item.ticked]), [[10, "carried", true, true], [11, "partial", true, false], [13, "carried", true, true], [14, "inactive", false, false]]);
assert.deepEqual(fresh[1].sourceCohorts, ["HSC-22B"]);
// Additive and repeatable: existing and cancelled rows are never proposed again.
const partlyStarted = [fact(100, 10, 7, "planned"), fact(101, 13, 7, "cancelled")];
assert.deepEqual(proposeCohort(hsc5, partlyStarted, courses).map(item => [item.courseId, item.reason, item.selectable]), [[10, "existing", false], [11, "partial", true], [13, "cancelled_here", false], [14, "inactive", false]]);
assert.deepEqual(proposeCohort(null, [], courses), [], "no basis proposes nothing");
assert.deepEqual(proposeCohort(basis.get("HSC|2")!, [], courses), [], "an empty slot proposes nothing");
// A missing catalog record is never selectable.
assert.equal(proposeCohort(slotBasis(cohorts.slice(0, 1), [fact(1, 777, 1)]).get("HSC|5")!, [], courses)[0].selectable, false);

// Comparison.
const here = [fact(100, 10, 7, "planned"), fact(101, 13, 7, "cancelled"), fact(102, 30, 7, "open"), fact(103, 12, 7, "cancelled"), fact(104, 11, 7, "mystery")];
const compared = compareCohort(hsc5, here);
assert.equal(compared.labels.get(100), "carried"); assert.equal(compared.labels.get(101), "changed"); assert.equal(compared.labels.get(102), "added");
assert.equal(compared.labels.get(103), null, "cancelled here and never in the basis has no label");
assert.equal(compared.labels.get(104), null, "unsupported status has no label");
assert.deepEqual(compared.dropped, [14]);
assert.deepEqual(compared.counts, { carried: 1, added: 1, dropped: 1, changed: 1 });
const none = compareCohort(null, here);
assert.equal(none.available, false); assert.deepEqual(none.dropped, []); assert.deepEqual(none.counts, { carried: 0, added: 0, dropped: 0, changed: 0 });
// A repeating cohort (same slot again) compares as fully carried.
assert.deepEqual(compareCohort(hsc5, [fact(1, 10, 1), fact(2, 11, 1), fact(3, 13, 1), fact(4, 14, 1)]).counts, { carried: 4, added: 0, dropped: 0, changed: 0 });

// Vocabulary and parsing.
assert.equal(cohortName({ stream: "DIPLOMA", label: "23A" }), "DIP-23A"); assert.equal(cohortName({ stream: "HSC", label: "22B" }), "HSC-22B");
assert.equal(newOfferingStatus("draft"), "planned"); assert.equal(newOfferingStatus("active"), "open");
assert.deepEqual(["draft", "active", "completed", "archived", ""].map(offeringTermEditable), [true, true, false, false, false]);
assert.deepEqual(["planned", "open", "cancelled", "completed", "mystery"].map(offeringLive), [true, true, false, false, false]);
assert.equal(offeringStatusLabel("open"), "Open"); assert.equal(offeringStatusLabel("mystery"), "mystery (unsupported)");
for (const value of ["0", "-1", "1.5", "1e2", " 1", "2147483648", "", undefined, 1]) assert.equal(offeringInteger(value), null, String(value));
assert.equal(offeringInteger("42"), 42);
for (const value of ["", "   ", "x".repeat(301), "line\nbreak", undefined, 5]) assert.equal(offeringReason(value), null);
assert.equal(offeringReason("  Preparing next term  "), "Preparing next term");
assert.deepEqual(parsePick("3:17"), { batchId: 3, courseId: 17 });
for (const value of ["3", "3:17:1", "a:1", "3:-1", ":", "", undefined, 3]) assert.equal(parsePick(value), null, String(value));

// D-1: only the two administrator roles hold the capability.
const actor = (role: Actor["assignments"][number]["role"]): Actor => ({ id: 1, email: "x@example.invalid", displayName: "X", teacherId: null, assignments: [{ role, departmentId: null, activeFrom: new Date(0), activeTo: null }] });
assert.deepEqual((["system_administrator", "academic_administrator", "routine_coordinator", "department_approver", "teacher", "accounts_officer", "read_only_viewer"] as const).map(role => hasCapability(actor(role), "manage_offerings", 1)), [true, true, false, false, false, false, false]);

console.log("Offering records verification passed: slot basis, additive proposal, live comparison, vocabulary, parsing and capability.");
