import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AllocationView, GroupCoverage, PortalData } from "../src/lib/data";
import { chooseRoutineSource, draftChangesFor, hasRoutineContent, todayIndex } from "../src/lib/teacher-routine-data";
import type { RoutineBatch, RoutineSource } from "../src/lib/routine-projection";
import type { AudienceRef, ExternalCommitmentView, MeetingView } from "../src/lib/serialize";
import { teacherSheetLayout, TEACHER_SHEET_MM } from "../src/lib/teacher-routine-sheet";
import { tidyLabel, audienceText, projectTeacherRoutine, teacherRoutineDiff, unitsText, type TeacherRoutine } from "../src/lib/teacher-routine";
import { parseSummer2026Routine } from "../src/lib/source-routine";
import type { DayPlan, PeriodPattern, TimeGrid } from "../src/lib/time-grid";
import { legacyTimeGrid } from "../src/lib/time-grid-legacy";
import { computeWorkloads } from "../src/lib/workload";

// Days: 0 Saturday, 1 Sunday, 2 Monday, 6 Friday. Minutes since midnight.
const SAT = 0, SUN = 1, MON = 2, TUE = 3, FRI = 6;
const T = { id: 7, fullName: "Tanvir Ahmed Sarker", shortCode: "TAS", designation: "Lecturer", status: "active" };
const THR = { id: 8, shortCode: "THR" };

const batches: RoutineBatch[] = [
  { id: 27, stream: "HSC", label: "27B", semester: 3, studentCount: 40, sortOrder: 27 },
  { id: 26, stream: "HSC", label: "26B", semester: 4, studentCount: 40, sortOrder: 26 },
  { id: 25, stream: "HSC", label: "25B", semester: 5, studentCount: 40, sortOrder: 25 },
  { id: 23, stream: "HSC", label: "23B", semester: 7, studentCount: 40, sortOrder: 23 },
  { id: 22, stream: "HSC", label: "22B", semester: 8, studentCount: 40, sortOrder: 22 },
  { id: 117, stream: "DIPLOMA", label: "17B", semester: 3, studentCount: 30, sortOrder: 17 },
  { id: 116, stream: "DIPLOMA", label: "16B", semester: 4, studentCount: 30, sortOrder: 16 },
];
const byId = new Map(batches.map((batch) => [batch.id, batch]));
const aud = (...ids: number[]): AudienceRef[] => ids.map((id) => {
  const batch = byId.get(id)!;
  return { batchId: id, batchLabel: batch.label, stream: batch.stream, semester: batch.semester, studentCount: batch.studentCount };
});

const pattern = (id: number, name: string, periods: Array<[number, number]>): PeriodPattern =>
  ({ id, name, periods: periods.map(([start, end]) => ({ start, end })), breaks: [], updatedAt: null });
const plan = (id: number, stream: "HSC" | "DIPLOMA", dayOfWeek: number, patternId: number | null, batchId: number | null = null): DayPlan =>
  ({ id, stream, batchId, dayOfWeek, patternId, reason: batchId ? "fixture" : null, updatedAt: null });

const grid: TimeGrid = {
  patterns: [
    pattern(1, "HSC Saturday", [[570, 645], [645, 720], [720, 795], [870, 945]]),
    pattern(2, "HSC Sunday–Monday", [[540, 600], [600, 660], [660, 720], [720, 795]]),
    pattern(3, "Diploma Friday", [[540, 600], [600, 660], [660, 720], [720, 780], [840, 900], [900, 960]]),
    pattern(4, "Diploma Saturday", [[720, 780], [780, 840], [840, 900], [900, 960], [960, 1020]]),
    pattern(5, "HSC 22B own Monday", [[600, 690], [690, 780]]),
  ],
  dayPlans: [
    plan(1, "HSC", SAT, 1), plan(2, "HSC", SUN, 2), plan(3, "HSC", MON, 2), plan(4, "HSC", TUE, 2),
    plan(5, "DIPLOMA", FRI, 3), plan(6, "DIPLOMA", SAT, 4),
    plan(7, "HSC", MON, 5, 22),
  ],
};

let nextId = 100;
function meeting(code: string, day: number, start: number, end: number, extra: Partial<MeetingView> = {}): MeetingView {
  const id = nextId++;
  return {
    id, teachingGroupId: id, dayOfWeek: day, startMinutes: start, endMinutes: end,
    courseCode: code, courseTitle: `${code} title`, courseType: "theory", courseCredits: 3, requiredRoomCapability: null,
    owningDepartmentCode: "CSE", deliveryMode: "fixed", isException: false, exceptionNote: null, customTimeLabel: null,
    highlightColor: null, pendingReconciliation: false,
    teachers: [{ id: T.id, shortCode: "TAS", fullName: T.fullName, homeDepartmentCode: "CSE", designation: null, isExternalCse: false, role: "primary" }],
    rooms: [{ id: 1, code: "NB-402", building: "NB", roomType: "theory", capabilities: [], capacity: null }],
    audiences: aud(25), externalAudienceLabel: null, externalStudentCount: null,
    ...extra,
  };
}
const room = (code: string) => [{ id: 2, code, building: "NB", roomType: "lab", capabilities: [], capacity: null }];

const lab = meeting("CSE-3102", SAT, 570, 720, { rooms: room("NB-604"), courseType: "sessional" });       // two whole periods
const ai = meeting("CSE-4201", SAT, 720, 795, { audiences: aud(22), rooms: room("NB-408") });
const db1 = meeting("CSE-3103", SUN, 540, 600);
const compiler = meeting("CSE-4105", SUN, 660, 720, {
  audiences: aud(23), rooms: room("NB-406"),
  teachers: [...meeting("x", SUN, 0, 1).teachers, { id: THR.id, shortCode: "THR", fullName: "Tasnim Rahman", homeDepartmentCode: "CSE", designation: null, isExternalCse: false, role: "co" }],
});
const dld = meeting("CSE-2104", SUN, 720, 795, { audiences: aud(27), rooms: room("NB-603"), externalAudienceLabel: "CSE + EEE" });
const project = meeting("CSE-3100", MON, 540, 600, { audiences: aud(25, 26), rooms: room("NB-602") }); // merged batches
const db2 = meeting("CSE-3103", MON, 600, 660);
const offGrid = meeting("CSE-3107", MON, 630, 705, { audiences: aud(25) });                            // straddles two periods
const evening = meeting("CSE-3109", TUE, 1080, 1140, { audiences: aud(25) });                          // overlaps no period
const ownMonday = meeting("CSE-4203", MON, 600, 690, { audiences: aud(22), rooms: room("NB-505") });    // 22B on its own periods
const law = meeting("LAW-3101", SAT, 870, 945, { audiences: aud(23, 117), rooms: room("NB-408") });     // HSC + Diploma
const ml = meeting("CSE-4124", FRI, 540, 600, { audiences: aud(116), rooms: room("NB-408") });
const mlTheory = meeting("CSE-4123", FRI, 840, 900, { audiences: aud(116), rooms: room("NB-502") });
const prog = meeting("CSE-1102", SAT, 960, 1020, { audiences: aud(117), rooms: room("NB-407") });
const otherTeacher = meeting("CSE-9999", SUN, 540, 600, { teachers: [{ id: 99, shortCode: "ZZZ", fullName: "Other", homeDepartmentCode: "CSE", designation: null, isExternalCse: false, role: "primary" }] });

const mine = [lab, ai, db1, compiler, dld, project, db2, offGrid, evening, ownMonday, law, ml, mlTheory, prog];
const external: ExternalCommitmentView = {
  id: 1, kind: "teaching", completenessLevel: "complete", counterpartDepartment: "EEE", teacherId: T.id, teacherShortCode: "TAS",
  teacherName: T.fullName, roomId: null, roomCode: "NB-405", courseLabel: "EEE-1101", audienceLabel: "EEE-22B", dayOfWeek: SUN,
  startMinutes: 870, endMinutes: 945, credits: 3, verificationStatus: "verified", source: null, lastVerifiedAt: null, notes: null,
};
const roomBooking: ExternalCommitmentView = { ...external, id: 2, teacherId: null, teacherShortCode: null, teacherName: null, counterpartDepartment: "BA" };

function source(meetings: MeetingView[], kind: "draft" | "published" = "published"): RoutineSource {
  return {
    kind, termName: "Summer 2026", effectiveFrom: "2026-08-14", generatedAt: "2026-10-01T08:00:00.000Z",
    versionNumber: kind === "published" ? 3 : null, publishedAt: null, legacyContext: false,
    meetings, batches, breaks: [], timeGrid: grid, externals: [external, roomBooking], issues: [],
  };
}

const thesisGroup = 900;
const coverage: GroupCoverage[] = [
  ...mine.map((item) => ({
    teachingGroupId: item.teachingGroupId, courseCode: item.courseCode, courseTitle: item.courseTitle, courseType: item.courseType,
    deliveryMode: "fixed", audience: item.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "DIP"}-${a.batchLabel}`).join(" + "),
    teacherCodes: item.teachers.map((t) => t.shortCode), hasTeacherAssignment: true, expectedWeeklyMinutes: null,
    requiredMeetings: 1, scheduledMeetings: 1, scheduledMinutes: 60, status: "scheduled" as const, pendingReconciliation: false, notes: null,
  })),
  {
    teachingGroupId: thesisGroup, courseCode: "CSE-4000", courseTitle: "Project / Thesis", courseType: "theory", deliveryMode: "teacher_managed",
    audience: "HSC-22B", teacherCodes: [], hasTeacherAssignment: true, expectedWeeklyMinutes: null, requiredMeetings: 0,
    scheduledMeetings: 0, scheduledMinutes: 0, status: "teacher_managed", pendingReconciliation: false, notes: null,
  },
];
let allocationId = 1;
const allocation = (teachingGroupId: number | null, units: number, extra: Partial<AllocationView> = {}): AllocationView => ({
  id: allocationId++, teacherId: T.id, units, allocationMethod: "sole", policyNote: null,
  courseCode: coverage.find((group) => group.teachingGroupId === teachingGroupId)?.courseCode ?? null, courseTitle: null,
  teachingGroupId, externalDepartment: null, externalCommitmentId: null, ...extra,
});
const allocations: AllocationView[] = [
  allocation(lab.teachingGroupId, 2),
  allocation(ai.teachingGroupId, 3),
  allocation(compiler.teachingGroupId, 1.5, { allocationMethod: "shared_policy" }),
  allocation(thesisGroup, 1.5),
  allocation(null, 3, { courseCode: "EEE-1101", externalDepartment: "EEE", allocationMethod: "external", externalCommitmentId: 1 }),
  { ...allocation(null, 9), teacherId: 99 }, // someone else's
];

const routine: TeacherRoutine = projectTeacherRoutine({ source: source([...mine, otherTeacher]), teacher: T, allocations, coverage });

// AC-01: one section per program, tables split when the pattern changes, only rows with classes.
assert.deepEqual(routine.programs.map((program) => program.key), ["HSC", "DIPLOMA"]);
const [hsc, dip] = routine.programs;
assert.deepEqual(hsc.tables.map((table) => table.patternName), ["HSC Saturday", "HSC Sunday–Monday", "HSC 22B own Monday", "HSC Sunday–Monday"],
  "a pattern change starts a new table; 22B's own Monday periods get a table of their own; Tuesday follows on its own table");
assert.deepEqual(hsc.tables[1].days.map((day) => day.dayOfWeek), [SUN, MON], "consecutive days on one pattern share a table");
assert.deepEqual(hsc.tables[0].days[0].rows.map((row) => row.batchLabel), ["25 B", "23 B", "22 B"], "rows in batch order, only batches with classes");
assert.deepEqual(dip.tables.map((table) => table.patternName), ["Diploma Friday", "Diploma Saturday"], "Diploma follows its own week: Friday then Saturday");
assert.deepEqual(dip.tables[0].days[0].rows.map((row) => row.batchLabel), ["16 B"]);

const cellsOf = (tableIndex: number, day: number, label: string, program = hsc) =>
  program.tables[tableIndex].days.find((item) => item.dayOfWeek === day)!.rows.find((row) => [row.batchLabel, ...row.moreBatches].join("+") === label)!.cells;

// AC-02: spans, exact times, Other times, co-teachers, merged batches, audience notes, HSC + Diploma.
const sat25 = cellsOf(0, SAT, "25 B");
assert.deepEqual(sat25.map((cell) => cell.span), [2, 1, 1], "a class over two whole periods spans them");
assert.equal(sat25[0].classes[0].time, null, "exact fit shows no time");
assert.equal(sat25.reduce((sum, cell) => sum + cell.span, 0), 4, "row covers every period column");

const mon25 = cellsOf(1, MON, "25 B");
const straddle = mon25.find((cell) => cell.classes.some((item) => item.code === "CSE-3107"))!;
assert.equal(straddle.classes.length, 2, "overlapping classes in one row share a cell (data clash shown, not dropped)");
assert.equal(straddle.span, 2);
assert.equal(straddle.classes.find((item) => item.code === "CSE-3107")!.time, "10:30 – 11:45 AM", "off-grid class shows its exact time");

const merged = cellsOf(1, MON, "26 B+25 B");
assert.equal(merged[0].classes[0].code, "CSE-3100", "merged batches share one row");
assert.equal(cellsOf(1, SUN, "23 B")[2].classes[0].coTeachers.join(), "THR", "co-teacher listed");
assert.equal(cellsOf(1, SUN, "27 B")[3].classes[0].note, "CSE + EEE", "other-department audience noted");

const sat23 = cellsOf(0, SAT, "23 B");
assert.equal(sat23[3].classes[0].note, "HSC + Diploma");
const satDip17 = dip.tables[1].days[0].rows.find((row) => row.batchLabel === "17 B")!;
assert.ok(satDip17.cells.some((cell) => cell.classes.some((item) => item.code === "LAW-3101" && item.note === "HSC + Diploma")),
  "a class shared by HSC and Diploma appears in both sections");

const tuesday = hsc.tables[3];
assert.equal(tuesday.otherTimes, true, "a class overlapping no period adds an Other times column");
const tueRow = tuesday.days[0].rows[0];
assert.equal(tueRow.cells.length, tuesday.periods.length + 1);
assert.equal(tueRow.cells.at(-1)!.classes[0].time, "6:00 – 7:00 PM");
assert.equal(hsc.tables[1].otherTimes, false);

// Every meeting appears exactly once per program section it belongs to; nobody else's classes appear.
function codesIn(program: TeacherRoutine["programs"][number]) {
  return program.tables.flatMap((table) => table.days.flatMap((day) => day.rows.flatMap((row) => row.cells.flatMap((cell) => cell.classes.map((item) => item.meetingId))))).sort();
}
assert.deepEqual(codesIn(hsc), mine.filter((item) => item.audiences.some((a) => a.stream === "HSC")).map((item) => item.id).sort());
assert.deepEqual(codesIn(dip), mine.filter((item) => item.audiences.some((a) => a.stream === "DIPLOMA")).map((item) => item.id).sort());
assert.equal(hsc.classCount + dip.classCount, mine.length + 1, "only the HSC + Diploma class is in two sections");
assert.equal(routine.figures.classes, mine.length, "figures count each class once");
assert.ok(!routine.meetingIds.includes(otherTeacher.id));

// AC-03: lists below the tables.
assert.deepEqual(routine.noFixedTime.map((item) => [item.code, item.audience]), [["CSE-4000", "HSC 22 B"]]);
assert.deepEqual(routine.otherDepartments.map((item) => [item.department, item.course, item.time, item.verified]), [["EEE", "EEE-1101", "2:30 – 3:45 PM", true]],
  "only the teacher's own commitments; room bookings by other departments are not listed");

// AC-04: credit hours equal the Workload total and the breakdown sums to it.
const workload = computeWorkloads([...mine, otherTeacher], allocations, () => false).get(T.id)!;
assert.equal(routine.credits.total, workload.workloadUnits);
assert.equal(routine.credits.total, 11);
assert.equal(routine.credits.items.reduce((sum, item) => sum + item.units, 0), routine.credits.total);
assert.equal(routine.credits.items.find((item) => item.code === "CSE-4105")!.kind, "Theory, shared with THR");
assert.equal(routine.credits.items.find((item) => item.code === "CSE-3102")!.kind, "Lab");
assert.equal(routine.credits.items.find((item) => item.code === "CSE-4000")!.kind, "No fixed time");
assert.equal(routine.credits.items.at(-1)!.kind, "Other department", "other-department units are listed last");
assert.equal(unitsText(13.5), "13.5");
assert.equal(unitsText(30), "30");
assert.equal(audienceText("HSC-25B + DIP-17B + EEE-22B"), "HSC 25 B + Diploma 17 B + EEE-22B");
assert.equal(tidyLabel("CSE+EEE+CE (HSC-DIP"), "CSE + EEE + CE (HSC-DIP)");
assert.equal(audienceText("DIP-23B + CSE+EEE+CE (HSC-DIP"), "Diploma 23 B + CSE + EEE + CE (HSC-DIP)");

// AC-10: the agenda holds the same classes as the tables, once each, plus timed external commitments.
const agendaClasses = routine.agenda.filter((item) => item.kind === "class");
assert.deepEqual(agendaClasses.map((item) => Number(item.key.slice(2))).sort(), [...new Set([...codesIn(hsc), ...codesIn(dip)])].sort());
assert.equal(routine.agenda.filter((item) => item.kind === "external").length, 1);
assert.equal(agendaClasses.find((item) => item.code === "LAW-3101")!.audience, "HSC 23 B + Diploma 17 B");
assert.equal(agendaClasses.find((item) => item.code === "CSE-3100")!.audience, "HSC 26 B + 25 B");
assert.deepEqual(routine.teachingDays, [SAT, SUN, MON, TUE, FRI]);

// AC-05: draft-differs count.
const moved = { ...db2, startMinutes: 660, endMinutes: 720 };
const added = meeting("CSE-3111", TUE, 540, 600);
const draft = [...mine.filter((item) => item !== db2 && item !== ml), moved, added, otherTeacher];
assert.deepEqual(teacherRoutineDiff(draft, [...mine, otherTeacher], T.id), { changed: 1, added: 1, removed: 1, total: 3 });
assert.deepEqual(teacherRoutineDiff(mine, mine, T.id), { changed: 0, added: 0, removed: 0, total: 0 });
assert.equal(teacherRoutineDiff([...mine, { ...otherTeacher, startMinutes: 600 }], [...mine, otherTeacher], T.id).total, 0, "other teachers' changes do not count");

// AC-05: published by default, the draft on request or when nothing is published.
const portal = (published: boolean) => ({
  term: { id: 1, name: "Summer 2026", academicYear: 2026, startDate: "2026-07-19", endDate: "2026-11-30", effectiveFrom: "2026-08-14", status: "active" },
  meetings: draft, externals: [], breaks: [], timeGrid: grid, windows: [], batches,
  versions: published ? [{ id: 1, versionNumber: 3, state: "published", effectiveFrom: "2026-08-14", effectiveTo: null, publishedAt: "2026-08-10T04:00:00.000Z", publishedBy: "x", changeSummary: null, meetingCount: mine.length }] : [],
  publishedSnapshot: published ? {
    schemaVersion: 4, generatedAt: "2026-08-10T04:00:00.000Z", versionNumber: 3,
    term: { id: 1, name: "Summer 2026", academicYear: 2026, effectiveFrom: "2026-08-14" },
    meetings: mine, batches, breaks: [], externalCommitments: [external], issues: [], timeGrid: grid,
  } : null,
  publishedSnapshotLegacy: false,
}) as unknown as PortalData;
assert.equal(chooseRoutineSource(portal(true), undefined).kind, "published");
assert.equal(chooseRoutineSource(portal(true), undefined).source.versionNumber, 3);
assert.equal(chooseRoutineSource(portal(true), "draft").kind, "draft");
assert.equal(chooseRoutineSource(portal(true), ["draft"]).kind, "draft");
assert.deepEqual([chooseRoutineSource(portal(false), "published").kind, chooseRoutineSource(portal(false), undefined).hasPublished], ["draft", false],
  "nothing published: the draft, with Published unavailable");
assert.equal(draftChangesFor(portal(true), chooseRoutineSource(portal(true), undefined), T.id), 3, "draft differs from the publication by 3 classes");
assert.equal(draftChangesFor(portal(true), chooseRoutineSource(portal(true), "draft"), T.id), 0, "no notice when viewing the draft");
const fromPublication = projectTeacherRoutine({ source: chooseRoutineSource(portal(true), undefined).source, teacher: T, allocations, coverage });
assert.deepEqual(fromPublication.meetingIds.slice().sort(), routine.meetingIds.slice().sort(), "the publication's classes are shown, not the draft's");
assert.equal(hasRoutineContent(routine), "classes");
assert.equal(todayIndex(new Date("2026-10-01T10:00:00+06:00")), 5, "1 October 2026 is a Thursday in Dhaka");
assert.equal(todayIndex(new Date("2026-10-02T23:30:00Z")), 0, "late UTC Friday is already Saturday in Dhaka");

// Empty teacher: no sections, empty lists, zero figures.
const empty = projectTeacherRoutine({ source: source([otherTeacher]), teacher: { ...T, id: 55 }, allocations, coverage });
assert.equal(empty.programs.length, 0);
assert.equal(empty.credits.total, 0);
assert.deepEqual(empty.figures, { classes: 0, days: 0, minutes: 0, courses: 0 });
assert.equal(hasRoutineContent(empty), "none");

// AC-08: A4 layout. Rows shrink from the template's height before a routine spills; a very long one
// continues on another page with the program heading repeated. Real routines: see the Summer 2026 check.
const blocksOf = (layout: ReturnType<typeof teacherSheetLayout>) => layout.pages.flatMap((page) => page.blocks);
const oneLayout = teacherSheetLayout(routine);
assert.ok(oneLayout.rowHeight <= TEACHER_SHEET_MM.rowMax && oneLayout.rowHeight >= TEACHER_SHEET_MM.rowMin);
assert.equal(blocksOf(oneLayout).filter((block) => block.kind === "program" && !block.continued).length, 2, "one heading per program");
assert.equal(blocksOf(oneLayout).at(-1)!.kind, "lists");
const rowsShown = (layout: ReturnType<typeof teacherSheetLayout>) =>
  blocksOf(layout).flatMap((block) => block.kind === "table" ? block.part.rows.map((ref) => block.part.table.days[ref.day].rows[ref.row]) : []);
const allRows = routine.programs.flatMap((program) => program.tables.flatMap((table) => table.days.flatMap((day) => day.rows)));
assert.deepEqual(rowsShown(oneLayout), allRows, "every row is laid out once, in order");

const busyMeetings: MeetingView[] = [];
for (const day of [SAT, SUN, MON, TUE]) {
  for (const id of [27, 26, 25, 23, 22]) {
    for (const [start, end] of day === SAT ? [[570, 645], [870, 945]] : [[540, 600], [660, 720]]) {
      busyMeetings.push(meeting(`CSE-${day}${id}${start}`, day, start, end, { audiences: aud(id) }));
    }
  }
}
for (const id of [117, 116]) busyMeetings.push(meeting(`CSE-F${id}`, FRI, 540, 600, { audiences: aud(id) }));
const busy = projectTeacherRoutine({ source: source(busyMeetings), teacher: T, allocations: [], coverage: [] });
const busyLayout = teacherSheetLayout(busy);
assert.equal(busyLayout.rowHeight, TEACHER_SHEET_MM.rowMin, "rows shrink to the minimum before spilling");
assert.ok(busyLayout.pages.length >= 2, "a routine too long for one page continues");
assert.equal(busyLayout.pages[1].blocks[0].kind, "program", "a continuation page repeats the program heading");
assert.ok(busyLayout.pages.slice(1).every((page) => page.blocks[0].kind === "program" && page.blocks[0].continued));
assert.deepEqual(rowsShown(busyLayout), busy.programs.flatMap((program) => program.tables.flatMap((table) => table.days.flatMap((day) => day.rows))));
for (const page of busyLayout.pages) {
  const height = page.blocks.reduce((sum, block) => sum + (block.kind === "program" ? TEACHER_SHEET_MM.programHead
    : block.kind === "table" ? TEACHER_SHEET_MM.tableHead + block.part.rowHeights.reduce((a, b) => a + b, 0) + TEACHER_SHEET_MM.tableGap : 0), 0);
  assert.ok(height <= TEACHER_SHEET_MM.capacity, "no page is filled past its capacity");
}
assert.equal(teacherSheetLayout(empty).pages.length, 1, "an empty routine still prints one page");

// Summer 2026 source: every teacher's classes appear exactly once in each of their program
// sections, on the real periods and times. One class per source row; merging is covered above.
const manifest = parseSummer2026Routine(readFileSync(resolve(process.cwd(), "docs/source/CSE_SUMMER_2026_ROUTINE_V1_6.md"), "utf8"));
const summerBatches = new Map<string, RoutineBatch>();
for (const item of manifest.meetings) {
  const key = `${item.stream}-${item.batchLabel}`;
  if (!summerBatches.has(key)) summerBatches.set(key, { id: summerBatches.size + 1, stream: item.stream, label: item.batchLabel, semester: null, studentCount: null, sortOrder: Number.parseInt(item.batchLabel, 10) || 0 });
}
const summerTeachers = manifest.teachers.map((teacher, index) => ({ ...teacher, id: index + 1 }));
const teacherByCode = new Map(summerTeachers.map((teacher) => [teacher.shortCode, teacher]));
const summerMeetings: MeetingView[] = manifest.meetings.map((item, index) => {
  const batch = summerBatches.get(`${item.stream}-${item.batchLabel}`)!;
  return meeting(item.courseCode, item.dayOfWeek, item.startMinutes, item.endMinutes, {
    id: 10_000 + index, teachingGroupId: 10_000 + index, customTimeLabel: item.customTimeLabel, externalAudienceLabel: item.externalAudienceLabel,
    audiences: [{ batchId: batch.id, batchLabel: batch.label, stream: batch.stream, semester: null, studentCount: null }],
    rooms: item.roomCodes.map((code, roomIndex) => ({ id: roomIndex, code, building: "NB", roomType: "theory", capabilities: [], capacity: null })),
    teachers: item.teacherCodes.flatMap((code) => {
      const teacher = teacherByCode.get(code);
      return teacher ? [{ id: teacher.id, shortCode: code, fullName: teacher.fullName, homeDepartmentCode: teacher.departmentCode, designation: null, isExternalCse: false, role: "primary" }] : [];
    }),
  });
});
const summerSource: RoutineSource = { ...source(summerMeetings), batches: [...summerBatches.values()], timeGrid: legacyTimeGrid([]), externals: [] };
let summerClasses = 0;
let withOtherTimes = 0;
let summerPages = 0;
for (const teacher of summerTeachers) {
  const result = projectTeacherRoutine({ source: summerSource, teacher: { ...teacher, designation: null }, allocations: [], coverage: [] });
  const expected = summerMeetings.filter((item) => item.teachers.some((ref) => ref.id === teacher.id)).map((item) => item.id).sort();
  const shown = result.programs.flatMap(codesIn).sort();
  assert.deepEqual(shown, expected, `${teacher.shortCode}: every class shown exactly once`);
  assert.deepEqual(result.meetingIds.slice().sort(), expected);
  for (const program of result.programs) {
    for (const table of program.tables) {
      for (const day of table.days) {
        for (const row of day.rows) {
          assert.equal(row.cells.reduce((sum, cell) => sum + cell.span, 0), table.periods.length + (table.otherTimes ? 1 : 0), `${teacher.shortCode}: row fills its table`);
        }
      }
      if (table.otherTimes) withOtherTimes++;
    }
  }
  summerClasses += expected.length;
  summerPages = Math.max(summerPages, teacherSheetLayout(result).pages.length);
}
assert.ok(summerClasses > 150, "the source routine's teachers were all projected");

console.log(`teacher routine projection checks passed (Summer 2026: ${summerTeachers.length} teachers, ${summerClasses} teacher-class rows, ${withOtherTimes} tables with Other times, at most ${summerPages} page per teacher)`);
assert.equal(summerPages, 1, "every Summer 2026 teacher fits one A4 page");
