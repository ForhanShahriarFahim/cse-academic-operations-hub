/**
 * Synthetic SAFE-01 fixture. Every name, code and phone number is invented;
 * counts are fixture counts, never institutional counts. The Summer term
 * covers each relationship family the recovery and history checks compare:
 * merged/cross-department teaching, attendance, extra load, access, audit,
 * provider state and an immutable published snapshot.
 */
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { backfillTimeGrids } from "../../src/db/time-grid-backfill";
import type { SafetyDb } from "./database";

type Db = SafetyDb;
const at = (iso: string) => new Date(iso);

export interface SummerFixture {
  termId: number;
  departmentIds: { cse: number; eee: number };
  teacherIds: number[];
  batchIds: { hsc: number; diploma: number; graduating: number };
  mergedGroupId: number;
  sessionalGroupId: number;
  studentIds: number[];
  adminUserId: number;
  teacherUserId: number;
}

export async function populateSummerFixture(db: Db): Promise<SummerFixture> {
  const [cse, eee] = await db.insert(schema.departments).values([
    { code: "CSE", name: "Synthetic Computing" },
    { code: "EEE", name: "Synthetic Electrical" },
  ]).returning();
  const teachers = await db.insert(schema.teachers).values([
    { shortCode: "SYA", fullName: "Synthetic Teacher A", homeDepartmentId: cse.id, phonePrivate: "+000-0000-0001" },
    { shortCode: "SYB", fullName: "Synthetic Teacher B", homeDepartmentId: cse.id, employmentType: "part_time" },
    { shortCode: "SYC", fullName: "Synthetic Teacher C", homeDepartmentId: eee.id, status: "inactive" },
  ]).returning();
  const [lab, classroom] = await db.insert(schema.rooms).values([
    { code: "SX-406", building: "Synthetic Block", roomType: "lab", capabilities: ["computer", "theory"], owningDepartmentId: cse.id },
    { code: "SX-101", building: "Synthetic Block", capabilities: ["theory"], capacity: 40 },
  ]).returning();

  const [term] = await db.insert(schema.academicTerms).values({
    name: "Summer 2026", academicYear: 2026, startDate: "2026-06-01", endDate: "2026-09-30", effectiveFrom: "2026-06-07",
  }).returning();
  await db.insert(schema.academicPolicies).values({ termId: term.id, extraClassRate: "200.00", updatedAt: at("2026-06-01T00:00:00Z") });
  const [hsc, diploma, graduating] = await db.insert(schema.batches).values([
    { stream: "HSC", label: "22B", studentCount: 30, sortOrder: 1 },
    { stream: "DIPLOMA", label: "22B", studentCount: null, sortOrder: 2 },
    { stream: "HSC", label: "21B", studentCount: 25, sortOrder: 0 },
  ]).returning();
  await db.insert(schema.batchTermPlacements).values([
    { batchId: hsc.id, termId: term.id, semester: 7 },
    { batchId: diploma.id, termId: term.id, semester: 3 },
    { batchId: graduating.id, termId: term.id, semester: 8 },
  ]);
  await db.insert(schema.classRepresentatives).values({ termId: term.id, batchId: hsc.id, fullName: "Synthetic Representative", phone: "+000-0000-0101" });
  await db.insert(schema.departmentContacts).values({ termId: term.id, fullName: "Synthetic Coordinator", designation: "Coordinator", phone: "+000-0000-0201" });
  await db.insert(schema.routineSourceReconciliations).values({ termId: term.id, sourceLabel: "Synthetic source v1", detail: "Synthetic open question", createdAt: at("2026-06-01T00:00:00Z") });

  const [theory, sessional] = await db.insert(schema.courses).values([
    { code: "SYN-4101", title: "Synthetic Theory", credits: "3.0", owningDepartmentId: cse.id, semester: 7 },
    { code: "SYN-4102", title: "Synthetic Sessional", credits: "1.0", courseType: "sessional", semester: 7, needsLab: true, requiredRoomCapability: "computer" },
  ]).returning();
  const [hscTheory, diplomaTheory, hscSessional] = await db.insert(schema.courseOfferings).values([
    { courseId: theory.id, batchId: hsc.id, termId: term.id },
    { courseId: theory.id, batchId: diploma.id, termId: term.id },
    { courseId: sessional.id, batchId: hsc.id, termId: term.id },
  ]).returning();
  const [merged, sessionalGroup] = await db.insert(schema.teachingGroups).values([
    { termId: term.id, courseId: theory.id, externalAudienceLabel: "EEE-22B", externalStudentCount: null },
    { termId: term.id, courseId: sessional.id },
  ]).returning();
  await db.insert(schema.teachingGroupOfferings).values([
    { teachingGroupId: merged.id, offeringId: hscTheory.id },
    { teachingGroupId: merged.id, offeringId: diplomaTheory.id },
    { teachingGroupId: sessionalGroup.id, offeringId: hscSessional.id },
  ]);
  await db.insert(schema.teachingRequirements).values([
    { teachingGroupId: merged.id, expectedWeeklyMinutes: 150 },
    { teachingGroupId: sessionalGroup.id, expectedWeeklyMinutes: 150, requiredMeetingsPerWeek: 1 },
  ]);
  const [theoryMeeting, labMeeting] = await db.insert(schema.meetings).values([
    { teachingGroupId: merged.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 615, createdAt: at("2026-06-02T00:00:00Z") },
    { teachingGroupId: sessionalGroup.id, dayOfWeek: 1, startMinutes: 600, endMinutes: 750, createdAt: at("2026-06-02T00:00:00Z") },
  ]).returning();
  await db.insert(schema.meetingTeachers).values([
    { meetingId: theoryMeeting.id, teacherId: teachers[0].id },
    { meetingId: labMeeting.id, teacherId: teachers[0].id },
    { meetingId: labMeeting.id, teacherId: teachers[1].id, role: "co_teacher" },
  ]);
  await db.insert(schema.meetingRooms).values([
    { meetingId: theoryMeeting.id, roomId: classroom.id },
    { meetingId: labMeeting.id, roomId: lab.id },
  ]);
  await db.insert(schema.breakRules).values({ name: "Synthetic prayer break", startMinutes: 780, endMinutes: 840 });
  await db.insert(schema.permittedWindows).values([
    { termId: term.id, batchId: diploma.id, stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 540, endMinutes: 720 },
    { termId: term.id, batchId: diploma.id, stream: "DIPLOMA", dayOfWeek: 0, startMinutes: 480, endMinutes: 900 },
    { termId: term.id, batchId: hsc.id, stream: "HSC", dayOfWeek: 0, startMinutes: 480, endMinutes: 900 },
    { termId: term.id, batchId: hsc.id, stream: "HSC", dayOfWeek: 1, startMinutes: 480, endMinutes: 900 },
  ]);

  const students = await db.insert(schema.students).values([
    { studentCode: "SYN-0001", fullName: "Synthetic Student One", homeDepartmentId: cse.id, homeBatchId: hsc.id, updatedAt: at("2026-06-03T00:00:00Z") },
    { studentCode: "SYN-0002", fullName: "Synthetic Student Two", homeDepartmentId: cse.id, homeBatchId: diploma.id, updatedAt: at("2026-06-03T00:00:00Z") },
    { studentCode: "SYN-9001", fullName: "Synthetic Visiting Student", homeDepartmentId: eee.id, homeDepartmentLabel: "EEE", updatedAt: at("2026-06-03T00:00:00Z") },
  ]).returning();
  await db.insert(schema.courseEnrollments).values([
    { termId: term.id, teachingGroupId: merged.id, studentId: students[0].id, createdAt: at("2026-06-03T00:00:00Z") },
    { termId: term.id, teachingGroupId: merged.id, studentId: students[1].id, audienceType: "merged", createdAt: at("2026-06-03T00:00:00Z") },
    { termId: term.id, teachingGroupId: merged.id, studentId: students[2].id, audienceType: "external", createdAt: at("2026-06-03T00:00:00Z") },
    { termId: term.id, teachingGroupId: sessionalGroup.id, studentId: students[0].id, createdAt: at("2026-06-03T00:00:00Z") },
  ]);
  const [session] = await db.insert(schema.attendanceSessions).values({
    termId: term.id, teachingGroupId: merged.id, teacherId: teachers[0].id, meetingId: theoryMeeting.id,
    classDate: "2026-06-13", startMinutes: 540, endMinutes: 615, createdAt: at("2026-06-13T04:00:00Z"),
  }).returning();
  await db.insert(schema.attendanceRecords).values(students.map((student, index) => ({
    sessionId: session.id, studentId: student.id, status: index === 1 ? "absent" : "present", updatedAt: at("2026-06-13T04:30:00Z"),
  })));

  await db.insert(schema.extraLoadClasses).values({
    termId: term.id, teacherId: teachers[0].id, teachingGroupId: merged.id, classDate: "2026-07-04", startMinutes: 900, endMinutes: 975,
    courseCodeSnapshot: theory.code, courseTitleSnapshot: theory.title, batchLabelSnapshot: "HSC 22B + DIPLOMA 22B", createdAt: at("2026-07-04T10:00:00Z"),
  });
  await db.insert(schema.extraLoadManualSummaries).values({ termId: term.id, teacherName: "Synthetic Visiting Teacher", classCount: 4, rateOverride: "250.00", createdAt: at("2026-07-05T00:00:00Z") });
  const [external] = await db.insert(schema.externalCommitments).values({
    termId: term.id, kind: "teaching", completenessLevel: "B", counterpartDepartment: "EEE", teacherId: teachers[1].id,
    roomId: classroom.id, courseLabel: "SYN-EEE-2201", dayOfWeek: 2, startMinutes: 600, endMinutes: 675, credits: "3.0",
    verificationStatus: "verified", lastVerifiedAt: at("2026-06-04T00:00:00Z"),
  }).returning();
  await db.insert(schema.workloadAllocations).values([
    { teacherId: teachers[0].id, termId: term.id, teachingGroupId: merged.id, units: "3.00" },
    { teacherId: teachers[0].id, termId: term.id, teachingGroupId: sessionalGroup.id, units: "1.00", allocationMethod: "split", policyNote: "Synthetic split" },
    { teacherId: teachers[1].id, termId: term.id, teachingGroupId: sessionalGroup.id, units: "1.00", allocationMethod: "split" },
    { teacherId: teachers[1].id, termId: term.id, externalCommitmentId: external.id, units: "3.00", allocationMethod: "external" },
  ]);

  const [admin, teacherUser] = await db.insert(schema.portalUsers).values([
    { email: "admin@example.invalid", displayName: "Synthetic Admin", status: "active", createdAt: at("2026-05-01T00:00:00Z"), updatedAt: at("2026-05-01T00:00:00Z") },
    { email: "teacher-a@example.invalid", displayName: "Synthetic Teacher A", teacherId: teachers[0].id, status: "invited", createdAt: at("2026-05-02T00:00:00Z"), updatedAt: at("2026-05-02T00:00:00Z") },
  ]).returning();
  await db.insert(schema.roleAssignments).values([
    { userId: admin.id, role: "system_administrator", activeFrom: at("2026-05-01T00:00:00Z"), grantedAt: at("2026-05-01T00:00:00Z") },
    { userId: teacherUser.id, role: "teacher", grantedByUserId: admin.id, activeFrom: at("2026-05-02T00:00:00Z"), grantedAt: at("2026-05-02T00:00:00Z") },
    { userId: teacherUser.id, role: "routine_coordinator", departmentId: cse.id, grantedByUserId: admin.id,
      activeFrom: at("2026-05-02T00:00:00Z"), activeTo: at("2026-05-20T00:00:00Z"), grantedAt: at("2026-05-02T00:00:00Z") },
  ]);
  await db.insert(schema.authUser).values({ id: "synthetic-auth-user", name: "Synthetic Admin", email: "admin@example.invalid", emailVerified: true, createdAt: at("2026-05-01T00:00:00Z"), updatedAt: at("2026-05-01T00:00:00Z") });
  await db.insert(schema.authSession).values({ id: "synthetic-session", token: "synthetic-not-a-real-token", userId: "synthetic-auth-user", expiresAt: at("2026-12-31T00:00:00Z"), createdAt: at("2026-05-01T00:00:00Z"), updatedAt: at("2026-05-01T00:00:00Z") });

  await db.insert(schema.scheduleVersions).values({
    termId: term.id, versionNumber: 1, state: "published", effectiveFrom: "2026-06-07", publishedAt: at("2026-06-06T00:00:00Z"),
    publishedBy: "Synthetic Admin", changeSummary: "Synthetic v1",
    snapshot: { term: { name: "Summer 2026" }, versionNumber: 1, meetings: [{ id: theoryMeeting.id, course: theory.code, day: 0, start: 540, end: 615 }] },
  });
  await db.insert(schema.auditEvents).values([
    { at: at("2026-05-01T00:00:00Z"), actor: "system", actorKind: "system", action: "fixture.seed", entity: "academic_term", entityId: term.id, detail: { synthetic: true } },
    { at: at("2026-06-06T00:00:00Z"), actor: admin.displayName, actorUserId: admin.id, actorDisplayName: admin.displayName, actorKind: "user", action: "publish", entity: "schedule_version", entityId: 1, after: { versionNumber: 1 } },
  ]);

  // Summer uses the grid it was drawn with before term grids (RUT-04 backfill).
  await backfillTimeGrids(db);
  return {
    termId: term.id,
    departmentIds: { cse: cse.id, eee: eee.id },
    teacherIds: teachers.map((row) => row.id),
    batchIds: { hsc: hsc.id, diploma: diploma.id, graduating: graduating.id },
    mergedGroupId: merged.id,
    sessionalGroupId: sessionalGroup.id,
    studentIds: students.map((row) => row.id),
    adminUserId: admin.id,
    teacherUserId: teacherUser.id,
  };
}

export interface SpringFixture {
  termId: number;
  mergedGroupId: number;
  repeatGroupId: number;
}

/**
 * A later synthetic Spring 2027 term entered directly (rollover UI/policy is
 * BAT-01): HSC 22B progresses, DIPLOMA 22B repeats semester 3, HSC 21B has no
 * placement (graduated), and the visiting EEE student joins a new merged group.
 * The fixture marks Summer "completed" and Spring "active"; that status value
 * is fixture-only, not an institutional lifecycle decision.
 */
export async function populateSpringFixture(db: Db, summer: SummerFixture): Promise<SpringFixture> {
  const [teacherA, teacherB] = summer.teacherIds;
  const [studentOne, studentTwo, visiting] = summer.studentIds;
  const rooms = await db.select().from(schema.rooms);
  const classroom = rooms.find((room) => room.code === "SX-101")!;
  const lab = rooms.find((room) => room.code === "SX-406")!;
  const repeated = (await db.select().from(schema.courses)).find((course) => course.code === "SYN-4101")!;

  const [term] = await db.insert(schema.academicTerms).values({
    name: "Spring 2027", academicYear: 2027, startDate: "2027-01-02", endDate: "2027-04-30", effectiveFrom: "2027-01-09", status: "draft",
  }).returning();
  await db.insert(schema.academicPolicies).values({ termId: term.id, extraClassRate: "250.00", updatedAt: at("2026-12-20T00:00:00Z") });
  await db.insert(schema.batchTermPlacements).values([
    { batchId: summer.batchIds.hsc, termId: term.id, semester: 8 },
    { batchId: summer.batchIds.diploma, termId: term.id, semester: 3 },
  ]);
  await db.insert(schema.classRepresentatives).values({ termId: term.id, batchId: summer.batchIds.hsc, fullName: "Synthetic Spring Representative", phone: "+000-0000-0102" });
  await db.insert(schema.departmentContacts).values({ termId: term.id, fullName: "Synthetic Spring Coordinator", designation: "Coordinator", phone: "+000-0000-0202" });

  const [advanced] = await db.insert(schema.courses).values({
    code: "SYN-4201", title: "Synthetic Advanced Theory", credits: "3.0", owningDepartmentId: summer.departmentIds.cse, semester: 8,
  }).returning();
  const [hscAdvanced, diplomaAdvanced, diplomaRepeat] = await db.insert(schema.courseOfferings).values([
    { courseId: advanced.id, batchId: summer.batchIds.hsc, termId: term.id },
    { courseId: advanced.id, batchId: summer.batchIds.diploma, termId: term.id },
    { courseId: repeated.id, batchId: summer.batchIds.diploma, termId: term.id },
  ]).returning();
  const [merged, repeat] = await db.insert(schema.teachingGroups).values([
    { termId: term.id, courseId: advanced.id, externalAudienceLabel: "EEE-23B" },
    { termId: term.id, courseId: repeated.id },
  ]).returning();
  await db.insert(schema.teachingGroupOfferings).values([
    { teachingGroupId: merged.id, offeringId: hscAdvanced.id },
    { teachingGroupId: merged.id, offeringId: diplomaAdvanced.id },
    { teachingGroupId: repeat.id, offeringId: diplomaRepeat.id },
  ]);
  await db.insert(schema.teachingRequirements).values([
    { teachingGroupId: merged.id, expectedWeeklyMinutes: 75, requiredMeetingsPerWeek: 1 },
    { teachingGroupId: repeat.id, expectedWeeklyMinutes: 75, requiredMeetingsPerWeek: 1 },
  ]);
  const [mergedMeeting, repeatMeeting] = await db.insert(schema.meetings).values([
    { teachingGroupId: merged.id, dayOfWeek: 0, startMinutes: 630, endMinutes: 705, createdAt: at("2027-01-03T00:00:00Z") },
    { teachingGroupId: repeat.id, dayOfWeek: 6, startMinutes: 540, endMinutes: 615, createdAt: at("2027-01-03T00:00:00Z") },
  ]).returning();
  await db.insert(schema.meetingTeachers).values([
    { meetingId: mergedMeeting.id, teacherId: teacherA },
    { meetingId: repeatMeeting.id, teacherId: teacherB },
  ]);
  await db.insert(schema.meetingRooms).values([
    { meetingId: mergedMeeting.id, roomId: classroom.id },
    { meetingId: repeatMeeting.id, roomId: lab.id },
  ]);
  await db.insert(schema.permittedWindows).values([
    { termId: term.id, batchId: summer.batchIds.diploma, stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 540, endMinutes: 780 },
    { termId: term.id, batchId: summer.batchIds.diploma, stream: "DIPLOMA", dayOfWeek: 0, startMinutes: 480, endMinutes: 900 },
    { termId: term.id, batchId: summer.batchIds.hsc, stream: "HSC", dayOfWeek: 0, startMinutes: 480, endMinutes: 900 },
  ]);

  await db.insert(schema.courseEnrollments).values([
    { termId: term.id, teachingGroupId: merged.id, studentId: studentOne, createdAt: at("2027-01-04T00:00:00Z") },
    { termId: term.id, teachingGroupId: merged.id, studentId: visiting, audienceType: "external", createdAt: at("2027-01-04T00:00:00Z") },
    { termId: term.id, teachingGroupId: repeat.id, studentId: studentTwo, createdAt: at("2027-01-04T00:00:00Z") },
  ]);
  const [session] = await db.insert(schema.attendanceSessions).values({
    termId: term.id, teachingGroupId: merged.id, teacherId: teacherA, meetingId: mergedMeeting.id,
    classDate: "2027-01-09", startMinutes: 630, endMinutes: 705, createdAt: at("2027-01-09T05:00:00Z"),
  }).returning();
  await db.insert(schema.attendanceRecords).values([
    { sessionId: session.id, studentId: studentOne, status: "late", updatedAt: at("2027-01-09T05:30:00Z") },
    { sessionId: session.id, studentId: visiting, status: "present", updatedAt: at("2027-01-09T05:30:00Z") },
  ]);
  await db.insert(schema.extraLoadClasses).values({
    termId: term.id, teacherId: teacherA, teachingGroupId: merged.id, classDate: "2027-02-06", startMinutes: 900, endMinutes: 975,
    courseCodeSnapshot: advanced.code, courseTitleSnapshot: advanced.title, batchLabelSnapshot: "HSC 22B + DIPLOMA 22B", createdAt: at("2027-02-06T10:00:00Z"),
  });
  const [external] = await db.insert(schema.externalCommitments).values({
    termId: term.id, kind: "teaching", completenessLevel: "C", counterpartDepartment: "EEE", teacherId: teacherB,
    courseLabel: "SYN-EEE-2301", dayOfWeek: 3, startMinutes: 600, endMinutes: 675, credits: "3.0",
  }).returning();
  await db.insert(schema.workloadAllocations).values([
    { teacherId: teacherA, termId: term.id, teachingGroupId: merged.id, units: "3.00" },
    { teacherId: teacherB, termId: term.id, teachingGroupId: repeat.id, units: "3.00" },
    { teacherId: teacherB, termId: term.id, externalCommitmentId: external.id, units: "3.00", allocationMethod: "external" },
  ]);
  await db.insert(schema.auditEvents).values({ at: at("2026-12-20T00:00:00Z"), actor: "system", actorKind: "system", action: "fixture.spring_term", entity: "academic_term", entityId: term.id, detail: { synthetic: true } });
  // Spring has its own, different periods (RUT-04): 75-minute HSC periods and a Diploma Friday prayer break.
  const [springHsc, springDiploma] = await db.insert(schema.periodPatterns).values([
    { termId: term.id, name: "Spring HSC", periods: [{ start: 540, end: 615 }, { start: 630, end: 705 }, { start: 720, end: 795 }], breaks: [], updatedAt: at("2026-12-20T00:00:00Z"), createdAt: at("2026-12-20T00:00:00Z") },
    { termId: term.id, name: "Spring Diploma", periods: [{ start: 540, end: 615 }, { start: 630, end: 705 }, { start: 870, end: 945 }], breaks: [{ name: "Prayer", start: 780, end: 840, blocksClasses: true }], updatedAt: at("2026-12-20T00:00:00Z"), createdAt: at("2026-12-20T00:00:00Z") },
  ]).returning();
  await db.insert(schema.dayPlans).values([
    ...[0, 1, 2, 3].map((dayOfWeek) => ({ termId: term.id, stream: "HSC", dayOfWeek, patternId: springHsc.id, updatedAt: at("2026-12-20T00:00:00Z"), createdAt: at("2026-12-20T00:00:00Z") })),
    ...[6, 0].map((dayOfWeek) => ({ termId: term.id, stream: "DIPLOMA", dayOfWeek, patternId: springDiploma.id, updatedAt: at("2026-12-20T00:00:00Z"), createdAt: at("2026-12-20T00:00:00Z") })),
  ]);
  await activateTerm(db, term.id);
  return { termId: term.id, mergedGroupId: merged.id, repeatGroupId: repeat.id };
}

/** Fixture-only active-term switch: exactly one term is "active", the rest "completed". */
export async function activateTerm(db: Db, termId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(schema.academicTerms).set({ status: "completed" });
    await tx.update(schema.academicTerms).set({ status: "active" }).where(eq(schema.academicTerms.id, termId));
  });
}
