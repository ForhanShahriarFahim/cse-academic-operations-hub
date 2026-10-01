import assert from "node:assert/strict";
import { dayTable, routineSheets, SHEET_MM } from "../src/lib/official-routine-sheets";
import type { ProjectedBatchRow, ProjectedMeeting, RoutineBatch, RoutineDayGroup, RoutineDayProjection, SlotDef } from "../src/lib/routine-projection";
import type { ExternalCommitmentView, MeetingView } from "../src/lib/serialize";
import { overlaps } from "../src/lib/time";

let nextId = 1;
const batch = (label: string, sortOrder: number): RoutineBatch => ({ id: sortOrder, stream: "HSC", label, semester: 1, studentCount: null, sortOrder });

function item(code: string, start: number, end: number, extra: Partial<MeetingView> = {}): ProjectedMeeting {
  const meeting = {
    id: nextId++, teachingGroupId: 1, dayOfWeek: 0, startMinutes: start, endMinutes: end,
    courseCode: code, courseTitle: code, courseType: "theory", courseCredits: 3, requiredRoomCapability: null,
    owningDepartmentCode: "CSE", deliveryMode: "fixed", isException: false, exceptionNote: null, customTimeLabel: null,
    highlightColor: null, pendingReconciliation: false,
    teachers: [{ id: 1, shortCode: "AB" }], rooms: [{ id: 1, code: "NB-501" }], audiences: [],
    externalAudienceLabel: null, externalStudentCount: null, ...extra,
  } as unknown as MeetingView;
  // Validation status is deliberately "blocker": nothing about it may reach the print model.
  return { meeting, validationStatus: "blocker", warningCodes: ["teacher_overlap" as never] };
}

/** Mirrors routine-projection's batchRow: a class sits in its first overlapping slot and continues into later ones. */
function row(b: RoutineBatch, slots: SlotDef[], items: ProjectedMeeting[], unplanned = false): ProjectedBatchRow {
  const on = (m: ProjectedMeeting, slot: SlotDef) => overlaps(m.meeting.startMinutes, m.meeting.endMinutes, slot.start, slot.end);
  if (unplanned) return { batch: b, offGrid: items, slots: slots.map((slot) => ({ ...slot, meetings: [], continuations: [] })), unplanned: true };
  return {
    batch: b,
    offGrid: items.filter((m) => !slots.some((slot) => on(m, slot))),
    slots: slots.map((slot) => {
      const overlapping = items.filter((m) => on(m, slot));
      const meetings = overlapping.filter((m) => slots.find((candidate) => on(m, candidate))?.start === slot.start);
      return { ...slot, meetings, continuations: overlapping.filter((m) => !meetings.includes(m)) };
    }),
    ...(unplanned ? { unplanned: true } : {}),
  };
}

const group = (name: string, slots: SlotDef[], rows: ProjectedBatchRow[], breaks: RoutineDayGroup["breaks"] = []): RoutineDayGroup =>
  ({ key: name, name, isStreamDefault: name === "main", slots, breaks, rows });
const day = (dayOfWeek: number, groups: RoutineDayGroup[], externals: ExternalCommitmentView[] = []): RoutineDayProjection =>
  ({ dayOfWeek, groups, exceptionOnly: false, externals });

const main: SlotDef[] = [{ start: 570, end: 645 }, { start: 645, end: 720 }, { start: 720, end: 795 }, { start: 870, end: 945 }];
const lunch = [{ id: 1, name: "Lunch", scope: "stream", stream: "HSC", dayOfWeek: 0, startMinutes: 795, endMinutes: 870, afterSlot: 2 }] as RoutineDayGroup["breaks"];
const b29 = batch("29B", 29), b28 = batch("28B", 28), b24 = batch("24B", 24), b22 = batch("22B", 22);

// Merged cells, exact-time labels, off-grid times and breaks.
const lab = item("CSE-1102", 570, 720, { customTimeLabel: "9:30 AM – 12:00 PM", externalAudienceLabel: "CSE + EEE" });
const late = item("CSE-2203", 720, 870);
const afterLunch = item("CSE-2101", 870, 945);
const labBlock: SlotDef[] = [{ start: 540, end: 690 }, { start: 690, end: 840 }];
const table = dayTable(day(0, [
  group("main", main, [row(b29, main, [lab]), row(b28, main, [late, afterLunch]), row(b22, main, [])], lunch),
  group("lab", labBlock, [row(b24, labBlock, [item("CSE-3202", 540, 690), item("CSE-3204", 540, 690), item("CSE-3206", 690, 840)])]),
], [{ id: 1, roomCode: "NB-407", teacherShortCode: null, counterpartDepartment: "EEE", startMinutes: 645, endMinutes: 720, dayOfWeek: 0 } as ExternalCommitmentView]));

assert.deepEqual(table.slots, ["9:30 – 10:45 AM", "10:45 AM – 12:00 PM", "12:00 – 1:15 PM", "2:30 – 3:45 PM"]);
assert.deepEqual(table.breaks, [{ afterSlot: 2, label: "Lunch 1:15 – 2:30 PM" }]);
assert.deepEqual(table.rows.map((r) => r.batchLabel), ["29B", "28B", "24B", "22B"], "rows follow batch order across groups");

const [r29, r28, r24, r22] = table.rows;
assert.deepEqual(r29.cells.map((c) => c.span), [2, 1, 1], "a class running into an empty slot is merged");
assert.equal(r29.cells[0].kind === "classes" && r29.cells[0].classes[0].time, null, "a label equal to the merged range is not repeated");
assert.equal(r29.cells[0].kind === "classes" && r29.cells[0].classes[0].note, "CSE + EEE");
assert.deepEqual(r28.cells.map((c) => c.span), [1, 1, 1, 1], "merging never crosses a break");
assert.equal(r28.cells[2].kind === "classes" && r28.cells[2].classes[0].time, "12:00 – 2:30 PM", "a class not matching its cell shows its own time");
assert.deepEqual(r22.cells.map((c) => c.kind === "classes" && c.classes.length), [0, 0, 0, 0]);

assert.deepEqual(r24.cells.map((c) => [c.kind, c.span]), [["own", 3], ["classes", 1]], "own-period rows are split at the break by start time");
const own = r24.cells[0].kind === "own" ? r24.cells[0].segments : [];
assert.deepEqual(own.map((s) => [s.time, s.classes.map((c) => c.code)]), [["9:00 – 11:30 AM", ["CSE-3202", "CSE-3204"]], ["11:30 AM – 2:00 PM", ["CSE-3206"]]]);
assert.ok(r24.height > SHEET_MM.rowMin, "an own-period row is taller than a plain row");

assert.deepEqual(table.od, [[], ["NB-407 (EEE)"], [], []]);
const printed = JSON.stringify(table);
assert.ok(!/blocker|warning|teacher_overlap/.test(printed), "validation status never reaches the print model");

// Classes outside the day's periods go in an "Other times" column with their exact times; nothing is dropped.
const evening = dayTable(day(0, [group("main", main, [row(b29, main, [item("CSE-1101", 570, 645), item("ENG-1101", 960, 1020)]), row(b28, main, [])], lunch)]));
assert.deepEqual(evening.slots.at(-1), "Other times");
assert.deepEqual(evening.rows.map((r) => r.cells.at(-1)), [
  { kind: "classes", span: 1, classes: [{ code: "ENG-1101", teachers: "AB", rooms: "NB-501", note: null, time: "4:00 – 5:00 PM" }] },
  { kind: "classes", span: 1, classes: [] },
]);
assert.equal(evening.od?.length, evening.slots.length, "the OD row covers the extra column");
assert.equal(table.slots.includes("Other times"), false, "the column appears only when needed");

// A batch with classes but no periods that day is drawn at its exact times.
const unplannedTable = dayTable(day(6, [group("main", main, [row(b29, main, [item("CSE-1101", 600, 700)], true)])]));
assert.equal(unplannedTable.rows[0].cells[0].kind, "own");
assert.equal(unplannedTable.rows[0].cells[0].kind === "own" && unplannedTable.rows[0].cells[0].segments[0].time, "10:00 – 11:40 AM");

// Four eight-batch days fill two sheets, two days each; nothing exceeds a sheet.
const hscSlots: SlotDef[] = [{ start: 540, end: 600 }, { start: 600, end: 660 }, { start: 660, end: 720 }, { start: 720, end: 795 }];
const eight = Array.from({ length: 8 }, (_, index) => batch(`${29 - index}B`, 29 - index));
const fullDay = (dayOfWeek: number) => day(dayOfWeek, [group("main", hscSlots, eight.map((b) => row(b, hscSlots, hscSlots.map((slot, index) =>
  item(`CSE-${b.sortOrder}0${index}`, slot.start, slot.end, { externalAudienceLabel: index % 2 ? "CSE + EEE + CE" : null })))))]);
const sheets = routineSheets([0, 1, 2, 3].map(fullDay));
assert.deepEqual(sheets.map((s) => s.days), [[0, 1], [2, 3]]);
for (const sheet of sheets) {
  const used = sheet.tables.reduce((sum, t) => sum + t.height, 0) + SHEET_MM.tableGap * (sheet.tables.length - 1);
  assert.ok(used <= SHEET_MM.capacity, `sheet uses ${used.toFixed(1)} of ${SHEET_MM.capacity} mm`);
}

// A day too tall for one sheet is split into parts that repeat the header; OD stays on the last part.
const many = Array.from({ length: 30 }, (_, index) => batch(`${60 - index}B`, 60 - index));
const tall = routineSheets([day(1, [group("main", hscSlots, many.map((b) => row(b, hscSlots, [item("CSE-1101", 540, 600)])))],
  [{ id: 2, roomCode: "NB-405", teacherShortCode: null, counterpartDepartment: "CE", startMinutes: 540, endMinutes: 600, dayOfWeek: 1 } as ExternalCommitmentView])]);
const parts = tall.flatMap((s) => s.tables);
assert.ok(parts.length >= 2, "the tall day is split");
assert.equal(parts.reduce((sum, t) => sum + t.rows.length, 0), 30, "no row is lost or repeated");
assert.deepEqual(parts.map((t) => t.continued), parts.map((_, index) => index > 0));
assert.deepEqual(parts.map((t) => t.od !== null), parts.map((_, index) => index === parts.length - 1));
assert.ok(parts.every((t) => t.height <= SHEET_MM.capacity));

assert.deepEqual(routineSheets([]), [{ tables: [], days: [] }], "a program with no days still gets one sheet");

console.log("Official routine sheet verification passed.");
