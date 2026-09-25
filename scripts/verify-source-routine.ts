import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSummer2026Routine } from "../src/lib/source-routine";

const source = readFileSync(
  resolve(process.cwd(), "docs/source/CSE_SUMMER_2026_ROUTINE_V1_6.md"),
  "utf8",
);
const manifest = parseSummer2026Routine(source);

assert.equal(manifest.teachers.length, 38, "all source teachers should be parsed");
assert.deepEqual(
  manifest.teachers.find((teacher) => teacher.shortCode === "FSF"),
  {
    shortCode: "FSF",
    fullName: "Md. Forhan Shahriar Fahim",
    phone: "01318-486103",
    email: "forhan.shahriar.fahim@gmail.com",
    designation: null,
    departmentCode: "CSE",
    status: "active",
  },
);

assert.equal(manifest.courses.length, 78, "all eight semester course lists should be parsed");
const programmingLab = manifest.courses.find((course) => course.code === "CSE-1102");
assert.equal(programmingLab?.catalogCredits, 1);
assert.equal(programmingLab?.workloadCreditHours, 2);
assert.equal(programmingLab?.courseType, "sessional");

assert.equal(manifest.classRepresentatives.filter((item) => item.stream === "HSC").length, 8);
assert.equal(manifest.classRepresentatives.filter((item) => item.stream === "DIPLOMA").length, 8);
assert.equal(manifest.queryContacts.length, 3);

const hscSaturdayMath = manifest.meetings.find((meeting) =>
  meeting.stream === "HSC"
  && meeting.batchLabel === "29B"
  && meeting.dayOfWeek === 0
  && meeting.courseCode === "MTH-1101"
);
assert.deepEqual(
  hscSaturdayMath && {
    start: hscSaturdayMath.startMinutes,
    end: hscSaturdayMath.endMinutes,
    teachers: hscSaturdayMath.teacherCodes,
    rooms: hscSaturdayMath.roomCodes,
  },
  { start: 570, end: 645, teachers: ["MJ"], rooms: ["NB-508"] },
);

const diplomaFridayProgramming = manifest.meetings.find((meeting) =>
  meeting.stream === "DIPLOMA"
  && meeting.batchLabel === "23B"
  && meeting.dayOfWeek === 6
  && meeting.courseCode === "CSE-1101"
);

assert.equal(
  manifest.meetings.some((meeting) => meeting.stream === "DIPLOMA" && meeting.batchLabel === "23B" && meeting.dayOfWeek === 6 && meeting.startMinutes === 540),
  false,
  "the PDF shows Diploma-23B Friday 9:00 AM as blank",
);
assert.ok(
  manifest.meetings.some((meeting) => meeting.stream === "DIPLOMA" && meeting.batchLabel === "22B" && meeting.dayOfWeek === 6 && meeting.startMinutes === 540 && meeting.courseCode === "PHY-1202"),
  "the PDF places PHY-1202 in Diploma-22B Friday 9:00 AM",
);
assert.deepEqual(
  diplomaFridayProgramming && {
    start: diplomaFridayProgramming.startMinutes,
    end: diplomaFridayProgramming.endMinutes,
    teachers: diplomaFridayProgramming.teacherCodes,
    rooms: diplomaFridayProgramming.roomCodes,
  },
  { start: 720, end: 780, teachers: ["NR"], rooms: ["NB-508"] },
);

const hsc25 = manifest.meetings.filter((meeting) => meeting.stream === "HSC" && meeting.batchLabel === "25B");
assert.equal(hsc25.some((meeting) => meeting.dayOfWeek === 6), false, "HSC-25B must not retain Friday meetings");
for (const code of ["LAW-3201", "CSE-3103", "CSE-2205", "CSE-2206"]) {
  assert.ok(hsc25.some((meeting) => meeting.courseCode === code), `${code} should be scheduled Saturday-Tuesday`);
}
assert.deepEqual(
  hsc25
    .filter((meeting) => meeting.sourceException)
    .map((meeting) => ({
      courseCode: meeting.courseCode,
      dayOfWeek: meeting.dayOfWeek,
      startMinutes: meeting.startMinutes,
      endMinutes: meeting.endMinutes,
      roomCodes: meeting.roomCodes,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes),
  [
    { courseCode: "LAW-3201", dayOfWeek: 3, startMinutes: 540, endMinutes: 600, roomCodes: ["NB-505"] },
    { courseCode: "CSE-3103", dayOfWeek: 3, startMinutes: 600, endMinutes: 660, roomCodes: ["NB-502"] },
    { courseCode: "CSE-2205", dayOfWeek: 3, startMinutes: 720, endMinutes: 795, roomCodes: ["NB-501"] },
    { courseCode: "CSE-2206", dayOfWeek: 3, startMinutes: 810, endMinutes: 885, roomCodes: ["NB-407"] },
  ],
  "the approved HSC-25B replacements should avoid known teacher and room collisions",
);

assert.ok(
  manifest.reconciliations.some((item) => item.includes("HSC 23B sunday 9:00 AM")),
  "the room-only source cell should remain visible as a reconciliation",
);

console.log(
  `Summer-2026 source verification passed: ${manifest.teachers.length} teachers, ${manifest.courses.length} courses, ${manifest.meetings.length} meetings.`,
);
