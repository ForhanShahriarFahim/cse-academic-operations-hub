import assert from "node:assert/strict";
import {
  parseRoutineSelection,
  projectRoutine,
  type RoutineBatch,
  type RoutineSource,
} from "../src/lib/routine-projection";
import { serializeRoutineCsv } from "../src/lib/routine-csv";
import {
  buildSnapshot,
  normalizePublicationSnapshot,
  type MeetingView,
} from "../src/lib/serialize";
import { buildOfficialRoutinePackage } from "../src/lib/official-routine-package";

const batches: RoutineBatch[] = [
  { id: 1, stream: "HSC", label: "29B", semester: 1, studentCount: 30, sortOrder: 20 },
  { id: 2, stream: "HSC", label: "28B", semester: 3, studentCount: null, sortOrder: 10 },
  { id: 3, stream: "DIPLOMA", label: "24B", semester: 3, studentCount: 20, sortOrder: 5 },
];

function meeting(overrides: Partial<MeetingView> & Pick<MeetingView, "id" | "dayOfWeek" | "startMinutes" | "endMinutes">): MeetingView {
  const { id, dayOfWeek, startMinutes, endMinutes, ...rest } = overrides;
  return {
    id,
    teachingGroupId: id,
    dayOfWeek,
    startMinutes,
    endMinutes,
    courseCode: "CSE-1001",
    courseTitle: "Computing Fundamentals",
    courseType: "theory",
    courseCredits: 3,
    requiredRoomCapability: null,
    owningDepartmentCode: "CSE",
    deliveryMode: "fixed",
    isException: false,
    exceptionNote: null,
    customTimeLabel: null,
    highlightColor: null,
    pendingReconciliation: false,
    teachers: [],
    rooms: [],
    audiences: [{ batchId: 1, batchLabel: "29B", stream: "HSC", semester: 1, studentCount: 30 }],
    externalAudienceLabel: null,
    externalStudentCount: null,
    ...rest,
  };
}

const shared = meeting({
  id: 10,
  dayOfWeek: 0,
  startMinutes: 570,
  endMinutes: 645,
  courseCode: "CSE-2201",
  courseTitle: "Systems, \"Advanced\"",
  audiences: [
    { batchId: 1, batchLabel: "29B", stream: "HSC", semester: 1, studentCount: 30 },
    { batchId: 3, batchLabel: "24B", stream: "DIPLOMA", semester: 3, studentCount: 20 },
  ],
});
const custom = meeting({
  id: 11,
  dayOfWeek: 6,
  startMinutes: 1020,
  endMinutes: 1080,
  courseCode: "CSE-4101",
  customTimeLabel: "5:00–6:00 PM",
  isException: true,
});

const source: RoutineSource = {
  kind: "draft",
  termName: "Summer 2026",
  effectiveFrom: "2026-08-14",
  generatedAt: "2026-09-23T00:00:00.000Z",
  versionNumber: null,
  legacyContext: false,
  meetings: [shared, custom],
  batches,
  breaks: [],
  externals: [],
  issues: [{
    id: "warn-10",
    severity: "warning",
    type: "capacity_unverified",
    title: "Capacity unverified",
    detail: "Audience size is unknown.",
    dayOfWeek: 0,
    meetingIds: [10],
  }],
};

const parsed = parseRoutineSelection(
  { stream: "HSC", view: "week", batch: "1", day: "6" },
  batches,
);
assert.deepEqual(parsed.errors, []);
assert.deepEqual(parsed.selection, { stream: "HSC", view: "week", day: 0, batchId: 1 });

const projection = projectRoutine({ source, selection: parsed.selection });
assert.deepEqual(projection.days.map((day) => day.dayOfWeek), [0, 1, 2, 3]);
assert.deepEqual(projection.days[1].slots.map((slot) => [slot.start, slot.end]), [[540, 600], [600, 660], [660, 720], [720, 795]]);
assert.deepEqual(projection.days[3].slots.at(-1), { start: 810, end: 885 });
assert.deepEqual(projection.exportMeetings.map((item) => item.meeting.id), [10]);
assert.equal(projection.exportMeetings[0].validationStatus, "warning");
assert.deepEqual(projection.exportMeetings[0].warningCodes, ["capacity_unverified"]);
assert.equal(projection.days[0].rows.length, 1);
assert.equal(projection.days[0].rows[0].batch.id, 1);
assert.equal(projection.days[0].rows[0].slots[0].meetings[0].meeting.id, 10);

const diplomaProjection = projectRoutine({
  source,
  selection: { stream: "DIPLOMA", view: "week", day: 6 },
});
assert.deepEqual(diplomaProjection.days.map((day) => day.dayOfWeek), [6, 0]);
assert.deepEqual(diplomaProjection.exportMeetings.map((item) => item.meeting.id), [10]);

const csv = serializeRoutineCsv(projection);
assert.equal(csv.filename, "routine-summer-2026-hsc-week-draft.csv");
assert.equal(csv.body.charCodeAt(0), 0xfeff);
assert.equal(csv.body.split("\r\n").filter(Boolean).length, 2);
assert.match(csv.body, /"Systems, ""Advanced"""/);
assert.equal((csv.body.match(/CSE-2201/g) ?? []).length, 1);
assert.match(csv.body, /DRAFT — NOT OFFICIAL/);

const invalid = parseRoutineSelection(
  { stream: "UNKNOWN", view: "month", day: "99", batch: "3" },
  batches,
  { strict: true },
);
assert.equal(invalid.errors.length, 4);

const metadata = {
  teachers: [], courses: [], classRepresentatives: [], queryContacts: [], sourceReconciliations: [],
};

const snapshot = buildSnapshot({
  meetings: source.meetings,
  term: { id: 1, name: source.termName, academicYear: 2026, effectiveFrom: source.effectiveFrom },
  versionNumber: 2,
  batches,
  breaks: [],
  externals: [
    {
      id: 1,
      kind: "teaching",
      completenessLevel: "D",
      counterpartDepartment: "EEE",
      teacherId: null,
      teacherShortCode: null,
      teacherName: null,
      roomId: null,
      roomCode: null,
      courseLabel: null,
      audienceLabel: null,
      dayOfWeek: 0,
      startMinutes: 570,
      endMinutes: 645,
      credits: null,
      verificationStatus: "verified",
      source: null,
      lastVerifiedAt: null,
      notes: null,
    },
    {
      id: 2,
      kind: "teaching",
      completenessLevel: "D",
      counterpartDepartment: "CE",
      teacherId: null,
      teacherShortCode: null,
      teacherName: null,
      roomId: null,
      roomCode: null,
      courseLabel: null,
      audienceLabel: null,
      dayOfWeek: 0,
      startMinutes: 645,
      endMinutes: 720,
      credits: null,
      verificationStatus: "pending",
      source: null,
      lastVerifiedAt: null,
      notes: null,
    },
  ],
  issues: source.issues,
  metadata,
  generatedAt: "2026-09-23T00:00:00.000Z",
});
assert.equal(snapshot.schemaVersion, 3);
assert.equal(snapshot.externalCommitments.length, 1);
assert.equal(snapshot.issues.length, 1);

const legacy = normalizePublicationSnapshot({
  generatedAt: "2026-08-14T00:00:00.000Z",
  termName: "Summer 2026",
  effectiveFrom: "2026-08-14",
  versionNumber: 1,
  meetings: [shared],
}, {
  term: { id: 1, name: "Summer 2026", academicYear: 2026, effectiveFrom: "2026-08-14" },
  batches,
  breaks: [],
  externals: [],
  issues: [],
  metadata,
});
assert.equal(legacy?.legacyContext, true);
assert.equal(legacy?.snapshot.schemaVersion, 3);
assert.equal(legacy?.snapshot.versionNumber, 1);

const officialPackage = buildOfficialRoutinePackage({ source, metadata });
assert.equal(officialPackage.routinePages.length, 2);
assert.deepEqual(officialPackage.routinePages.map((page) => page.stream), ["HSC", "DIPLOMA"]);
assert.equal(officialPackage.appendixPages.map((page) => page.kind).join(","), "courses,directory");

console.log("Routine projection verification passed.");
