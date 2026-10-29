import assert from "node:assert/strict";
import { deletionReasons, dhakaToday, futureOccurrence, futureOD, lifecycleCommand, snapshotRoomEvidence } from "../src/lib/room-lifecycle";
import { commonRoomWindows, intervalMinutes, parseGapFilters, projectRoomOccupancy, roomGapResults, roomPlanningStamp, subtractIntervals, unionIntervals } from "../src/lib/room-occupancy";
import { suitableRooms } from "../src/lib/routine-workbench";
import type { PortalData } from "../src/lib/data";
import type { MeetingView, ExternalCommitmentView } from "../src/lib/serialize";
const bounds = { termStart: "2026-10-01", termEnd: "2026-10-31", dayOfWeek: 4 };
assert.equal(dhakaToday(new Date("2026-10-27T17:59:59Z")), "2026-10-27");
assert.equal(dhakaToday(new Date("2026-10-27T18:00:00Z")), "2026-10-28");
assert.match(roomPlanningStamp(new Date("2026-10-28T18:00:00Z")), /29 Oct 2026.*Asia\/Dhaka/);
assert.deepEqual(futureOccurrence(bounds, "2026-10-28"), { kind: "future", firstDate: "2026-10-28" });
assert.equal(futureOccurrence(bounds, "2026-10-29").kind, "past");
assert.equal(futureOccurrence({ ...bounds, effectiveTo: "2026-10-27" }, "2026-10-28").kind, "past");
assert.equal(futureOccurrence({ ...bounds, effectiveFrom: "2026-10-29" }, "2026-10-28").kind, "past");
assert.equal(futureOccurrence({ ...bounds, effectiveFrom: "2026-11-01" }, "2026-10-28").kind, "past");
assert.equal(futureOccurrence({ ...bounds, effectiveTo: "2026-09-01" }, "2026-10-28").kind, "past");
assert.equal(futureOccurrence({ ...bounds, dayOfWeek: 9 }, "2027-01-01").kind, "uncertain");
assert.equal(futureOccurrence({ termStart: "2028-02-29", termEnd: "2028-02-29", dayOfWeek: 3 }, "2028-02-29").kind, "future");
for (const patch of [{ termStart: null }, { termEnd: "2026-02-30" }, { termStart: "2026-11-01" }, { effectiveFrom: "bad" }, { effectiveFrom: "2026-10-30", effectiveTo: "2026-10-01" }, { dayOfWeek: 7 }]) assert.equal(futureOccurrence({ ...bounds, ...patch }, "2026-10-28").kind, "uncertain");
const od = { ...bounds, kind: "room_reservation", startMinutes: 540, endMinutes: 600 };
assert.equal(futureOD(od, "2026-10-28").kind, "future");
for (const patch of [{ dayOfWeek: null }, { startMinutes: null }, { endMinutes: 530 }, { kind: "unresolved_note" }, { kind: "unknown" }]) {
  assert.equal(futureOD({ ...od, ...patch }, "2026-10-28").kind, "uncertain");
  assert.equal(futureOD({ ...od, ...patch }, "2026-11-01").kind, "past");
}
assert.equal(futureOD({ ...od, termStart: "2026-11-01" }, "2026-11-02").kind, "uncertain");
const command = { roomId: "1", revision: "2", action: "delete", reason: " Necessary ", confirmation: "SX-1" };
assert.equal(lifecycleCommand(command)?.reason, "Necessary");
for (const patch of [{ action: ["delete"] }, { action: "DELETE" }, { action: "" }, { revision: 2 }, { roomId: "1e1" }, { reason: " " }, { reason: "x".repeat(301) }, { reason: new File(["x"], "x") }, { confirmation: [] }]) assert.equal(lifecycleCommand({ ...command, ...patch }), null);
const snapshot = (rooms: unknown[]) => ({ generatedAt: "2026-10-28T00:00:00Z", versionNumber: 1, effectiveFrom: null, termName: "Legacy", meetings: [{ rooms }] });
assert.equal(snapshotRoomEvidence(snapshot([{ id: 10, code: "ROOM-10" }]), 1, ["ROOM-1"]), "clear");
assert.equal(snapshotRoomEvidence(snapshot([{ id: 10, code: " room-1 " }]), 1, ["ROOM-1"]), "reference");
assert.equal(snapshotRoomEvidence(snapshot([{ id: 1, code: "Older code" }]), 1, ["ROOM-1"]), "reference");
for (const value of [{}, { meetings: [] }, { schemaVersion: 99, meetings: [] }, snapshot([{}]), { termName: "Legacy", meetings: [{}] }]) assert.equal(snapshotRoomEvidence(value, 1, ["X"]), "uncertain");
assert.equal(snapshotRoomEvidence(null, 1, ["X"]), "clear");
assert.equal(snapshotRoomEvidence({ ...snapshot([]), schemaVersion: 2, term: {}, batches: [], breaks: [], issues: [], meetings: [], externalCommitments: [{ roomId: 1, roomCode: "X" }] }, 1, ["Y"]), "reference");
const zero = { meetings: 0, externals: 0, snapshots: 0, uncertainSnapshots: 0 };
assert.equal(deletionReasons({ code: "X", isDraft: true }, zero).length, 0);
for (const field of Object.keys(zero)) assert.ok(deletionReasons({ code: "X", isDraft: true }, { ...zero, [field]: 1 }).length);
assert.ok(deletionReasons({ code: "X", isDraft: false }, zero).length);
assert.ok(deletionReasons({ code: "NB-505", isDraft: true }, zero).length);
assert.deepEqual(unionIntervals([{ start: 600, end: 660 }, { start: 540, end: 600 }, { start: 580, end: 620 }]), [{ start: 540, end: 660 }]);
assert.deepEqual(subtractIntervals([{ start: 540, end: 720 }], [{ start: 570, end: 600 }, { start: 660, end: 700 }]), [{ start: 540, end: 570 }, { start: 600, end: 660 }, { start: 700, end: 720 }]);
// Independent minute-set oracle for overlapping/touching/clipped union and subtraction.
for (let seed = 0; seed < 50; seed++) {
  const windows = Array.from({ length: 5 }, (_, i) => ({ start: (seed * 7 + i * 13) % 100, end: 110 + i }));
  const cuts = [{ start: seed, end: seed + 20 }, { start: 100, end: 120 }];
  const occupied = new Set(Array.from({ length: 1440 }, (_, m) => m).filter((m) => windows.some((iv) => m >= iv.start && m < iv.end)));
  assert.equal(intervalMinutes(unionIntervals(windows)), occupied.size);
  assert.equal(intervalMinutes(subtractIntervals(windows, cuts)), [...occupied].filter((m) => !cuts.some((iv) => m >= iv.start && m < iv.end)).length);
}
const room = { id: 1, code: "X", building: "Synthetic", roomType: "lab", capabilities: ["computer"], capacity: 50, isActive: true, owningDepartmentCode: null, notes: null };
const data = { term: { id: 1 }, timeGrid: { patterns: [
  { id: 1, name: "HSC", periods: [], breaks: [{ start: 600, end: 660, blocksClasses: true, name: "HSC only" }], updatedAt: null },
  { id: 2, name: "Diploma", periods: [], breaks: [], updatedAt: null },
], dayPlans: [ { id: 1, stream: "HSC", batchId: null, dayOfWeek: 0, patternId: 1, reason: null, updatedAt: null }, { id: 2, stream: "DIPLOMA", batchId: null, dayOfWeek: 0, patternId: 2, reason: null, updatedAt: null } ] }, windows: [
  { termId: null, batchId: null, stream: "HSC", dayOfWeek: 0, startMinutes: 540, endMinutes: 720 },
  { termId: 1, batchId: null, stream: "DIPLOMA", dayOfWeek: 0, startMinutes: 600, endMinutes: 690 },
  { termId: 1, batchId: 9, stream: "HSC", dayOfWeek: 0, startMinutes: 400, endMinutes: 800 },
], meetings: [], externals: [] } as unknown as PortalData;
assert.deepEqual(commonRoomWindows(data, 0).windows, [{ start: 540, end: 720 }], "stream-specific break does not close Diploma");
const meeting = { id: 1, dayOfWeek: 0, startMinutes: 520, endMinutes: 600, rooms: [{ id: 1 }, { id: 1 }], courseCode: "SYN", courseType: "sessional", requiredRoomCapability: "networking", audiences: [], externalAudienceLabel: null } as unknown as MeetingView;
data.meetings = [meeting, meeting, { ...meeting, id: 2, startMinutes: 580, endMinutes: 640 }];
data.externals = [{ id: 1, roomId: 1, kind: "combined", dayOfWeek: 0, startMinutes: 640, endMinutes: 660, verificationStatus: "pending" }, { id: 2, roomId: 1, kind: "unresolved_note", dayOfWeek: null }, { id: 3, roomId: 1, kind: "teaching", dayOfWeek: 0, startMinutes: 700, endMinutes: 720 }] as ExternalCommitmentView[];
const p = projectRoomOccupancy(data, room);
assert.deepEqual(p.totals, { booked: 140, within: 120, usable: 180, outside: 20 });
assert.equal(p.eventCount, 3); assert.equal(p.utilization, 67);
assert.deepEqual(p.days[0].gaps, [{ start: 660, end: 720 }]);
assert.ok(p.days.every((d) => d.uncertain));
assert.ok(p.days[0].events[0].alerts.includes("Requires networking"));
assert.equal(p.information.length, 1);
assert.equal(roomGapResults(p, room, parseGapFilters({ duration: "60" })).gaps.length, 1);
assert.equal(roomGapResults(p, room, parseGapFilters({ duration: "61" })).gaps.length, 0);
assert.equal(roomGapResults(p, room, parseGapFilters({ day: "1" })).gaps.length, 0);
assert.equal(roomGapResults(p, { ...room, isActive: false }, parseGapFilters({})).gaps.length, 0);
assert.match(roomGapResults(p, { ...room, capacity: null }, parseGapFilters({ seats: "1" })).reason, /unknown/);
for (const raw of [{ day: "7" }, { duration: "0" }, { duration: "1441" }, { duration: "1.5" }, { seats: "0" }, { capability: "invented" }]) assert.equal(roomGapResults(p, room, parseGapFilters(raw)).gaps.length, 0);
assert.equal(suitableRooms([room, { ...room, id: 2, isActive: false }], "computer", "sessional").length, 1);
assert.equal(suitableRooms([{ ...room, roomType: "classroom" }], "computer", "sessional").length, 0);
assert.equal(suitableRooms([{ ...room, capabilities: [] }], "computer", "sessional").length, 0);
console.log("ROM-01B domain: inclusive Dhaka calendar, ambiguous OD, lifecycle payloads, exact snapshot aliases, retention/delete rules, interval oracle, stream breaks, unions/uncertainty/gaps and independent picker fit passed.");
