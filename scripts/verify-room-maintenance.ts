import assert from "node:assert/strict";
import { academicWeekday, civilDay, civilDate, firstWeekday, maintenanceOverlap, normalizedMaintenance, type MaintenanceEntry } from "../src/lib/room-maintenance";
import { parseOccupancyBasis, projectRoomOccupancy, roomGapResults, parseGapFilters } from "../src/lib/room-occupancy";
import { analyzeSchedule } from "../src/lib/conflicts";
import type { PortalData } from "../src/lib/data";
import type { MeetingView, ExternalCommitmentView } from "../src/lib/serialize";
const raw = { startDate: "2026-10-24", endDate: "2026-10-24", weekdays: ["0"], startMinutes: "570", endMinutes: "660", reason: " Synthetic outage " };
const values = normalizedMaintenance(raw).values!;
assert.equal(values.reason, "Synthetic outage");
for (const patch of [{ startDate: "0000-01-01" }, { startDate: "2026-02-29" }, { endDate: "10000-01-01" }, { endDate: "2026-10-23" }, { weekdays: [] }, { weekdays: ["1"] }, { weekdays: ["0", "0"] }, { weekdays: [0] }, { startMinutes: "660" }, { endMinutes: "1441" }, { reason: " " }, { reason: "x".repeat(301) }, { reason: new File(["x"], "x") }]) assert.ok(Object.keys(normalizedMaintenance({ ...raw, ...patch }).errors).length, JSON.stringify(patch));
for (const date of ["0001-01-01", "9999-12-31", "2000-02-29", "2028-02-29"]) assert.equal(civilDate(civilDay(date)!), date);
assert.equal(civilDay("1900-02-29"), null); assert.equal(civilDay("2026-2-01"), null);
assert.equal(academicWeekday(civilDay("0001-01-01")!), 2); assert.equal(academicWeekday(civilDay("2026-10-24")!), 0);
assert.equal(firstWeekday(civilDay("2026-10-25")!, civilDay("2026-10-30")!, [0]), null);
const entry: MaintenanceEntry = { id: 1, roomId: 1, revision: 1, cancelled: false, ...values };
const use = { termStart: "2026-10-01", termEnd: "2026-10-31", dayOfWeek: 0, startMinutes: 540, endMinutes: 600 };
assert.deepEqual(maintenanceOverlap(entry, use), { kind: "overlap", firstDate: "2026-10-24", lastDate: "2026-10-24", occurrences: 1 });
for (const patch of [{ endMinutes: 570 }, { startMinutes: 660, endMinutes: 700 }, { dayOfWeek: 1 }, { effectiveFrom: "2026-10-25" }, { effectiveTo: "2026-10-23" }, { effectiveFrom: "2027-01-01" }, { effectiveTo: "2025-12-31" }, { termStart: "2027-01-01", termEnd: "2027-12-31" }]) assert.equal(maintenanceOverlap(entry, { ...use, ...patch }).kind, "clear");
assert.equal(maintenanceOverlap({ ...entry, cancelled: true }, use).kind, "clear");
for (const patch of [{ termStart: null }, { effectiveFrom: "bad" }, { effectiveFrom: "2026-10-25", effectiveTo: "2026-10-20" }, { dayOfWeek: null }, { startMinutes: null }]) assert.equal(maintenanceOverlap(entry, { ...use, ...patch }).kind, "unverified");
assert.equal(maintenanceOverlap({ ...entry, startDate: "0001-01-01", endDate: "9999-12-31" }, { ...use, termStart: "0001-01-01", termEnd: "9999-12-31" }).kind, "overlap");
// Independent day-enumeration oracle on small ranges proves O(7) recurrence arithmetic, including pre-epoch dates.
for (const start of ["0001-01-01", "1969-12-20", "2028-02-20"]) for (let length = 0; length < 35; length++) for (let weekday = 0; weekday < 7; weekday++) {
  const a = civilDay(start)!, end = a + length;
  const oracle = Array.from({ length: length + 1 }, (_, i) => a + i).find((d) => academicWeekday(d) === weekday) ?? null;
  assert.equal(firstWeekday(a, end, [weekday]), oracle);
}
const room = { id: 1, isActive: true, roomType: "classroom", capabilities: [], capacity: 50 };
const meeting = { id: 1, teachingGroupId: 1, courseCode: "SYN", courseTitle: "Synthetic", courseType: "theory", courseCredits: 3, owningDepartmentCode: "CSE", deliveryMode: "scheduled", isException: true, exceptionNote: "Exception cannot bypass outages", dayOfWeek: 0, startMinutes: 540, endMinutes: 600, rooms: [{ id: 1, code: "SYN-1", capacity: 50, roomType: "classroom", capabilities: [] }], teachers: [], audiences: [], externalAudienceLabel: "Synthetic merged audience", externalStudentCount: 20, requiredRoomCapability: null } as unknown as MeetingView;
const data = { term: { id: 1, startDate: "2026-10-01", endDate: "2026-10-31" }, timeGrid: { patterns: [], dayPlans: [] }, meetings: [meeting, meeting, { ...meeting, id: 2, startMinutes: 580, endMinutes: 720 }], externals: [], windows: [{ id: 1, termId: 1, batchId: null, stream: "HSC", dayOfWeek: 0, startMinutes: 540, endMinutes: 960 }], maintenance: { ...use, entries: [entry, { ...entry, id: 2, startMinutes: 600, endMinutes: 630 }], meetingDates: { 1: { effectiveFrom: null, effectiveTo: null }, 2: { effectiveFrom: null, effectiveTo: null } } } } as unknown as PortalData;
// Use an explicit break-free stream pattern for an independently calculable 420-minute baseline.
data.timeGrid = { patterns: [{ id: 1, name: "Synthetic", periods: [{ start: 540, end: 960 }], breaks: [], updatedAt: null }], dayPlans: [{ id: 1, stream: "HSC", batchId: null, dayOfWeek: 0, patternId: 1, reason: null, updatedAt: null }] };
const weekly = projectRoomOccupancy(data, room), dated = projectRoomOccupancy(data, room, "2026-10-24");
assert.equal(weekly.totals.usable, 420); assert.equal(weekly.totals.booked, 180); assert.equal(weekly.totals.duringMaintenance, 0);
assert.equal(dated.eventCount, 2); assert.equal(dated.totals.booked, 180); assert.equal(dated.totals.maintenanceMinutes, 90); assert.equal(dated.totals.usable, 330); assert.equal(dated.totals.within, 90); assert.equal(dated.totals.duringMaintenance, 90); assert.equal(dated.utilization, 27);
assert.deepEqual(dated.days[0].gaps, [{ start: 720, end: 960 }]);
assert.equal(projectRoomOccupancy(data, room, "2026-10-17").totals.maintenanceMinutes, 0);
data.maintenance!.entries = [{ ...entry, startMinutes: 0, endMinutes: 1440 }];
const closed = projectRoomOccupancy(data, room, "2026-10-24"); assert.equal(closed.totals.usable, 0); assert.equal(closed.utilization, null); assert.equal(closed.totals.booked, 180); assert.match(roomGapResults(closed, room, parseGapFilters({})).reason, /Closed/);
assert.equal(projectRoomOccupancy(data, { ...room, isActive: false }, "2026-10-24").days[0].gaps.length, 0);
data.externals = [{ id: 5, roomId: 1, kind: "unresolved_note", dayOfWeek: null, startMinutes: null, endMinutes: null }, { id: 6, roomId: 1, kind: "teaching", dayOfWeek: null }] as ExternalCommitmentView[];
const uncertain = projectRoomOccupancy(data, room, "2026-10-24"); assert.ok(uncertain.days[0].uncertain); assert.equal(uncertain.uncertainty.length, 1); assert.equal(uncertain.totals.booked, 180);
const issues = analyzeSchedule({ meetings: data.meetings, externals: data.externals, breaks: [], windows: [], maintenance: data.maintenance });
assert.ok(issues.some((i) => i.type === "room_maintenance" && i.meetingIds.includes(1)));
const unknown = issues.find((i) => i.externalId === 5)!; assert.equal(unknown.dayOfWeek, null); assert.deepEqual(unknown.meetingIds, []); assert.ok(!issues.some((i) => i.externalId === 6));
for (const date of ["bad", "2026-02-30", "2026-09-30", "2026-11-01"]) assert.ok(parseOccupancyBasis({ basis: "date", date }, data.term).error);
assert.equal(parseOccupancyBasis({ basis: "date", date: "2026-10-24" }, data.term).error, null);
console.log("ROM-01C domain passed: civil year/leap/pre-epoch/large-range recurrence, independent day oracle, half-open and effective bounds, no exception bypass, typed uncertain OD, weekly/date union algebra, closed denominator and date validation.");
