import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { parseSummer2026Routine } from "../lib/source-routine";
import { buildSnapshot } from "../lib/serialize";
import { analyzeSchedule } from "../lib/conflicts";
import { getPortalData } from "../lib/data";

const SOURCE_LABEL = "CSE Summer-2026 Class Routine v1.6";
const SOURCE_PATH = path.join(process.cwd(), "docs", "source", "CSE_SUMMER_2026_ROUTINE_V1_6.md");
const DEPARTMENTS: Record<string, string> = {
  CSE: "Computer Science & Engineering", MATH: "Mathematics", PHY: "Physics",
  CHEM: "Chemistry", EEE: "Electrical & Electronic Engineering", CE: "Civil Engineering",
  ENG: "English", BA: "Business Administration", BAN: "Bangla", EDU: "Education", LAW: "Law",
};
const HSC: Record<string, number> = { "29B": 1, "28B": 2, "27B": 3, "26B": 4, "25B": 5, "24B": 6, "23B": 7, "22B": 8 };
const DIP: Record<string, number> = { "23B": 1, "22B": 2, "21B": 3, "20B": 4, "19B": 5, "18B": 6, "17B": 7, "16B": 8 };

function courseDepartment(code: string) {
  const prefix = code.split("-")[0];
  return ({ MTH: "MATH", CHM: "CHEM", BUS: "BA", SS: "EDU", HUM: "EDU", BAN: "BAN" } as Record<string, string>)[prefix]
    ?? (prefix in DEPARTMENTS ? prefix : "CSE");
}

function roomValue(code: string, cseId: number) {
  const computer = ["NB-406", "NB-407", "NB-408", "NB-505", "NB-506"].includes(code);
  const laboratory = computer || ["NB-606", "NB-607", "NB-608"].includes(code);
  return {
    code,
    building: "New Building",
    roomType: laboratory ? "lab" : "classroom",
    capabilities: code === "NB-505"
      ? ["computer", "microprocessor", "networking", "theory"]
      : computer ? ["computer", "theory"] : laboratory ? ["laboratory", "theory"] : ["theory"],
    capacity: null,
    owningDepartmentId: ["NB-406", "NB-407", "NB-408", "NB-505"].includes(code) ? cseId : null,
    notes: computer
      ? "Computer laboratory; theory classes may use it when free. Capacity pending verification."
      : "Imported from the Summer-2026 routine; capacity pending verification.",
  };
}

export async function seedSummer2026Database() {
  const source = parseSummer2026Routine(readFileSync(SOURCE_PATH, "utf8"));
  console.log("Replacing development data with the Summer-2026 source routine...");
  await db.execute(sql`
    TRUNCATE TABLE
      audit_events, schedule_versions, attendance_records, attendance_sessions,
      course_enrollments, extra_load_classes, extra_load_manual_summaries, students,
      class_representatives, department_contacts, routine_source_reconciliations,
      academic_policies, workload_allocations, meeting_rooms, meeting_teachers, meetings,
      teaching_requirements, teaching_group_offerings, teaching_groups,
      course_offerings, batch_term_placements, courses, batches,
      permitted_windows, break_rules, external_commitments,
      academic_terms, rooms, teachers, departments RESTART IDENTITY CASCADE
  `);

  const departmentRows = await db.insert(schema.departments).values(
    Object.entries(DEPARTMENTS).map(([code, name]) => ({ code, name })),
  ).returning();
  const dept = Object.fromEntries(departmentRows.map((row) => [row.code, row.id]));

  const listedCodes = new Set(source.teachers.map((teacher) => teacher.shortCode));
  const unresolvedCodes = [...new Set(source.meetings.flatMap((meeting) => meeting.teacherCodes).filter((code) => !listedCodes.has(code)))];
  const teacherRows = await db.insert(schema.teachers).values([
    ...source.teachers.map((teacher) => ({
      shortCode: teacher.shortCode,
      fullName: teacher.fullName,
      designation: teacher.designation,
      employmentType: teacher.status === "vacancy" ? "vacancy" : "full_time",
      homeDepartmentId: dept[teacher.departmentCode] ?? dept.CSE,
      email: teacher.email,
      phonePrivate: teacher.phone,
      status: teacher.status,
      notes: `Imported from ${SOURCE_LABEL}.`,
    })),
    ...unresolvedCodes.map((shortCode) => ({
      shortCode,
      fullName: `Unresolved teacher (${shortCode})`,
      designation: null,
      employmentType: "unresolved",
      homeDepartmentId: dept[shortCode === "SI" ? "MATH" : shortCode === "HUH" ? "EEE" : shortCode === "MNI" ? "BAN" : "EDU"],
      email: null,
      phonePrivate: null,
      status: "unresolved",
      notes: `${shortCode} appears in ${SOURCE_LABEL}, but the supplied teacher list has no matching identity.`,
    })),
  ]).returning();
  const teacherId = Object.fromEntries(teacherRows.map((row) => [row.shortCode, row.id]));

  const roomCodes = [...new Set([
    ...source.meetings.flatMap((meeting) => meeting.roomCodes),
    ...source.externalCommitments.flatMap((item) => item.roomCodes),
    "NB-406", "NB-407", "NB-408", "NB-505",
  ])].sort();
  const roomRows = await db.insert(schema.rooms).values(roomCodes.map((code) => roomValue(code, dept.CSE))).returning();
  const roomId = Object.fromEntries(roomRows.map((row) => [row.code, row.id]));

  const [term] = await db.insert(schema.academicTerms).values({
    name: "Summer 2026", academicYear: 2026, startDate: "2026-05-01", endDate: "2026-10-31",
    effectiveFrom: "2026-08-14", status: "active",
  }).returning();
  await db.insert(schema.academicPolicies).values({
    termId: term.id, theoryCreditHours: "3.0", sessionalCreditHours: "2.0",
    extraLoadThresholdCredits: "15.0", extraClassRate: "200.00",
    theoryAttendanceMarks: "10.0", sessionalAttendanceMarks: "5.0",
  });

  const batchRows = await db.insert(schema.batches).values([
    ...Object.keys(HSC).map((label, index) => ({ stream: "HSC", label, intake: `HSC ${label}`, studentCount: null, sortOrder: 100 - index })),
    ...Object.keys(DIP).map((label, index) => ({ stream: "DIPLOMA", label, intake: `Diploma ${label}`, studentCount: null, sortOrder: 100 - index })),
  ]).returning();
  const batchId = Object.fromEntries(batchRows.map((row) => [`${row.stream}|${row.label}`, row.id]));
  await db.insert(schema.batchTermPlacements).values(batchRows.map((batch) => ({
    batchId: batch.id, termId: term.id, semester: batch.stream === "HSC" ? HSC[batch.label] : DIP[batch.label],
  })));
  await db.insert(schema.classRepresentatives).values(source.classRepresentatives.map((item, index) => ({
    termId: term.id, batchId: batchId[`${item.stream}|${item.batchLabel}`], fullName: item.name,
    phone: item.phone, isActive: true, sortOrder: index,
  })));
  await db.insert(schema.departmentContacts).values(source.queryContacts.map((contact, index) => ({
    termId: term.id, fullName: contact.name, designation: contact.designation,
    phone: contact.phone, purpose: "routine_query", sortOrder: index,
  })));
  await db.insert(schema.routineSourceReconciliations).values(source.reconciliations.map((detail) => ({
    termId: term.id, sourceLabel: SOURCE_LABEL, detail,
    status: detail.includes("moved from Friday") ? "resolved" : "open",
  })));

  const courseRows = await db.insert(schema.courses).values(source.courses.map((course) => ({
    code: course.code, title: course.title, credits: course.catalogCredits.toFixed(1), courseType: course.courseType,
    owningDepartmentId: dept[courseDepartment(course.code)] ?? dept.CSE, semester: course.semester,
    needsLab: course.courseType === "sessional",
    requiredRoomCapability: course.courseType === "sessional" && course.code.startsWith("CSE-") ? "computer" : null,
    isActive: true,
  }))).returning();
  const courseByCode = new Map(courseRows.map((row) => [row.code, row]));
  const offeringRows = await db.insert(schema.courseOfferings).values(batchRows.flatMap((batch) => {
    const semester = batch.stream === "HSC" ? HSC[batch.label] : DIP[batch.label];
    return courseRows.filter((course) => course.semester === semester).map((course) => ({
      courseId: course.id, batchId: batch.id, termId: term.id, status: "open",
    }));
  })).returning();
  const offeringId = new Map(offeringRows.map((row) => [`${row.batchId}|${row.courseId}`, row.id]));

  const byGroup = new Map<string, typeof source.meetings>();
  for (const meeting of source.meetings) {
    const key = `${meeting.stream}|${meeting.batchLabel}|${meeting.courseCode}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), meeting]);
  }
  for (const [key, sourceMeetings] of byGroup) {
    const [stream, label, courseCode] = key.split("|");
    const course = courseByCode.get(courseCode);
    const targetBatchId = batchId[`${stream}|${label}`];
    if (!course || !targetBatchId) continue;
    const teacherManaged = course.courseType === "thesis";
    const [group] = await db.insert(schema.teachingGroups).values({
      termId: term.id, courseId: course.id, deliveryMode: teacherManaged ? "teacher_managed" : "fixed",
      externalAudienceLabel: sourceMeetings.map((meeting) => meeting.externalAudienceLabel).find(Boolean) ?? null,
      externalStudentCount: null,
      pendingReconciliation: sourceMeetings.some((meeting) => meeting.roomCodes.length === 0 && !teacherManaged),
      notes: `Imported from ${SOURCE_LABEL}.`,
    }).returning();
    await db.insert(schema.teachingGroupOfferings).values({
      teachingGroupId: group.id, offeringId: offeringId.get(`${targetBatchId}|${course.id}`)!,
    });
    const fixedMeetings = teacherManaged ? [] : sourceMeetings;
    await db.insert(schema.teachingRequirements).values({
      teachingGroupId: group.id,
      expectedWeeklyMinutes: teacherManaged ? null : fixedMeetings.reduce((sum, meeting) => sum + meeting.endMinutes - meeting.startMinutes, 0),
      requiredMeetingsPerWeek: Math.max(1, fixedMeetings.length), status: "approved",
      notes: teacherManaged ? "Teacher-managed thesis/project work; no fixed routine slot." : `Derived from ${SOURCE_LABEL}.`,
    });
    for (const sourceMeeting of fixedMeetings) {
      const [meeting] = await db.insert(schema.meetings).values({
        teachingGroupId: group.id, dayOfWeek: sourceMeeting.dayOfWeek,
        startMinutes: sourceMeeting.startMinutes, endMinutes: sourceMeeting.endMinutes,
        effectiveFrom: "2026-08-14", isException: sourceMeeting.sourceException,
        exceptionNote: sourceMeeting.sourceException ? "HSC-25B Friday source class reassigned to Saturday-Tuesday." : null,
        customTimeLabel: sourceMeeting.customTimeLabel, status: "active",
      }).returning();
      if (sourceMeeting.teacherCodes.length) await db.insert(schema.meetingTeachers).values(sourceMeeting.teacherCodes.map((code) => ({
        meetingId: meeting.id, teacherId: teacherId[code], role: "instructor",
      })));
      if (sourceMeeting.roomCodes.length) await db.insert(schema.meetingRooms).values(sourceMeeting.roomCodes.map((code, index) => ({
        meetingId: meeting.id, roomId: roomId[code], roomRole: index ? "alternative" : "primary",
      })));
    }
    const groupTeachers = [...new Set(sourceMeetings.flatMap((meeting) => meeting.teacherCodes))];
    const sourceCourse = source.courses.find((item) => item.code === courseCode)!;
    for (const code of groupTeachers) await db.insert(schema.workloadAllocations).values({
      teacherId: teacherId[code], termId: term.id, teachingGroupId: group.id,
      units: sourceCourse.workloadCreditHours.toFixed(2), allocationMethod: groupTeachers.length > 1 ? "shared_policy" : "sole",
      policyNote: sourceCourse.courseType === "sessional"
        ? "Catalog credit 1.0; approved workload credit-hours 2.0." : `Imported from ${SOURCE_LABEL}.`,
    });
  }

  const externalKeys = new Set<string>();
  for (const item of source.externalCommitments) for (const roomCode of item.roomCodes) {
    const key = `${item.dayOfWeek}|${item.startMinutes}|${item.endMinutes}|${roomCode}|${item.counterpartLabel}`;
    if (externalKeys.has(key)) continue;
    externalKeys.add(key);
    await db.insert(schema.externalCommitments).values({
      termId: term.id, kind: "room_reservation", completenessLevel: "C",
      counterpartDepartment: item.counterpartLabel, roomId: roomId[roomCode],
      dayOfWeek: item.dayOfWeek, startMinutes: item.startMinutes, endMinutes: item.endMinutes,
      verificationStatus: "verified", source: SOURCE_LABEL,
      lastVerifiedAt: new Date("2026-08-14T00:00:00+06:00"), notes: item.sourceCell,
    });
  }
  await db.insert(schema.breakRules).values({
    name: "Friday prayer break", scope: "stream", stream: "DIPLOMA", dayOfWeek: 6,
    startMinutes: 780, endMinutes: 840,
  });
  await db.insert(schema.permittedWindows).values([
    { termId: term.id, stream: "HSC", dayOfWeek: 0, startMinutes: 570, endMinutes: 945 },
    { termId: term.id, stream: "HSC", dayOfWeek: 1, startMinutes: 540, endMinutes: 795 },
    { termId: term.id, stream: "HSC", dayOfWeek: 2, startMinutes: 540, endMinutes: 795 },
    { termId: term.id, stream: "HSC", dayOfWeek: 3, startMinutes: 540, endMinutes: 885, requiresExceptionNote: "Extended for the approved HSC-25B Friday reassignment." },
    { termId: term.id, stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 540, endMinutes: 960 },
    { termId: term.id, stream: "DIPLOMA", dayOfWeek: 0, startMinutes: 720, endMinutes: 1020 },
  ]);

  const data = await getPortalData();
  const issues = analyzeSchedule({ meetings: data.meetings, externals: data.externals, breaks: data.breaks, windows: data.windows });
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const publish = blockers.length === 0;
  await db.insert(schema.scheduleVersions).values({
    termId: term.id, versionNumber: 1, state: publish ? "published" : "draft", effectiveFrom: "2026-08-14",
    publishedAt: publish ? new Date("2026-08-14T09:00:00+06:00") : null,
    publishedBy: publish ? "CSE routine source import" : null,
    changeSummary: `${SOURCE_LABEL} imported; HSC-25B Friday entries reassigned to Saturday-Tuesday.`,
    snapshot: publish ? buildSnapshot({
      meetings: data.meetings,
      term: { id: term.id, name: term.name, academicYear: term.academicYear, effectiveFrom: term.effectiveFrom },
      versionNumber: 1, batches: data.batches, breaks: data.breaks, externals: data.externals, issues,
      metadata: data.publicationMetadata,
      generatedAt: "2026-08-14T09:00:00+06:00",
    }) : null,
  });
  await db.insert(schema.auditEvents).values({
    actor: "source-import", action: "summer_2026_imported", entity: "academic_term", entityId: term.id,
    detail: { source: SOURCE_LABEL, teachers: teacherRows.length, courses: courseRows.length, meetings: data.meetings.length, blockers: blockers.length },
  });
  console.log(`Summer-2026 source imported: ${teacherRows.length} teachers, ${courseRows.length} courses, ${data.meetings.length} meetings, ${blockers.length} blockers.`);
}
