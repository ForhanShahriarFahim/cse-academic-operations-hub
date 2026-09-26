/**
 * Query adapters for the attendance and extra-load modules. Pages consume
 * these serialized views instead of depending on Drizzle table shapes.
 */
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  academicPolicies,
  attendanceRecords,
  attendanceSessions,
  courseEnrollments,
  extraLoadClasses,
  extraLoadManualSummaries,
  students,
} from "@/db/schema";
import { getPortalData, type PortalData } from "./data";
import { can, requireActor } from "./auth";
import { hasCapability } from "./auth/policy";
import { redirect } from "next/navigation";
import { attendanceMark, type AttendanceStatus } from "./attendance";
import { DEFAULT_ACADEMIC_POLICY, paymentForClasses, type ExtraLoadPolicy } from "./extra-load";

export interface TeachingGroupOption {
  id: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  audience: string;
  teacherIds: number[];
  assignedCredits: number;
}

export async function getAcademicPolicy(termId: number): Promise<ExtraLoadPolicy> {
  const [row] = await db.select().from(academicPolicies).where(eq(academicPolicies.termId, termId)).limit(1);
  return row ? {
    theoryCreditHours: Number(row.theoryCreditHours),
    sessionalCreditHours: Number(row.sessionalCreditHours),
    extraLoadThresholdCredits: Number(row.extraLoadThresholdCredits),
    extraClassRate: Number(row.extraClassRate),
    theoryAttendanceMarks: Number(row.theoryAttendanceMarks),
    sessionalAttendanceMarks: Number(row.sessionalAttendanceMarks),
  } : DEFAULT_ACADEMIC_POLICY;
}

export function groupOptions(data: PortalData): TeachingGroupOption[] {
  return data.coverage.map((coverage) => {
    const course = data.courses.find((row) => row.code === coverage.courseCode);
    const teacherIds = [...new Set([
      ...data.allocations.filter((allocation) => allocation.teachingGroupId === coverage.teachingGroupId).map((allocation) => allocation.teacherId),
      ...data.meetings.filter((meeting) => meeting.teachingGroupId === coverage.teachingGroupId).flatMap((meeting) => meeting.teachers.map((teacher) => teacher.id)),
    ])];
    return {
      id: coverage.teachingGroupId,
      courseCode: coverage.courseCode,
      courseTitle: coverage.courseTitle,
      courseType: coverage.courseType,
      audience: coverage.audience,
      teacherIds,
      assignedCredits: course?.credits ?? 0,
    };
  }).sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.audience.localeCompare(b.audience));
}

export function teacherCreditLoads(data: PortalData, groups = groupOptions(data)): Map<number, number> {
  const loads = new Map<number, number>();
  for (const group of groups) {
    for (const teacherId of group.teacherIds) {
      loads.set(teacherId, (loads.get(teacherId) ?? 0) + group.assignedCredits);
    }
  }
  for (const external of data.externals) {
    if (external.teacherId && external.credits != null) {
      loads.set(external.teacherId, (loads.get(external.teacherId) ?? 0) + external.credits);
    }
  }
  return loads;
}

export async function getExtraLoadData(from?: string, to?: string) {
  const data = await getPortalData();
  const actor = await requireActor();
  const policy = await getAcademicPolicy(data.term.id);
  const canReview = await can(actor, "review_extra_load") || await can(actor, "view_payment_reports");
  if (!canReview && (actor.teacherId == null || !await can(actor, "submit_extra_load", { kind: "teacher", teacherId: actor.teacherId }))) {
    redirect("/forbidden");
  }
  const groups = groupOptions(data).filter((group) => canReview || actor.teacherId != null && group.teacherIds.includes(actor.teacherId));
  const loads = teacherCreditLoads(data, groups);
  const where = from && to
    ? and(eq(extraLoadClasses.termId, data.term.id), gte(extraLoadClasses.classDate, from), lte(extraLoadClasses.classDate, to))
    : eq(extraLoadClasses.termId, data.term.id);
  const [classRows, manualRows] = await Promise.all([
    db.select().from(extraLoadClasses).where(where).orderBy(asc(extraLoadClasses.classDate), asc(extraLoadClasses.startMinutes)),
    db.select().from(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.termId, data.term.id)).orderBy(asc(extraLoadManualSummaries.teacherName)),
  ]);
  const classes = classRows.filter((row) => canReview || row.teacherId === actor.teacherId).map((row) => {
    const teacher = data.teachers.find((item) => item.id === row.teacherId);
    return {
      ...row,
      teacherName: teacher?.fullName ?? "Unknown teacher",
      teacherDesignation: teacher?.designation ?? null,
      teacherShortCode: teacher?.shortCode ?? "—",
    };
  });
  const teacherSummaries = data.teachers.filter((teacher) => canReview || teacher.id === actor.teacherId).map((teacher) => {
    const entries = classes.filter((row) => row.teacherId === teacher.id);
    return {
      teacher,
      assignedCredits: loads.get(teacher.id) ?? 0,
      classCount: entries.length,
      amount: paymentForClasses(entries.length, policy.extraClassRate),
    };
  }).filter((row) => row.assignedCredits > 0 || row.classCount > 0);
  const manualSummaries = (canReview ? manualRows : []).map((row) => ({
    ...row,
    rateOverride: row.rateOverride == null ? null : Number(row.rateOverride),
    amountOverride: row.amountOverride == null ? null : Number(row.amountOverride),
    amount: paymentForClasses(row.classCount, row.rateOverride == null ? policy.extraClassRate : Number(row.rateOverride), row.amountOverride == null ? null : Number(row.amountOverride)),
  }));
  return { data, policy, groups, loads, classes, teacherSummaries, manualSummaries };
}

export async function getAttendanceData(selectedGroupId?: number) {
  const data = await getPortalData();
  const actor = await requireActor();
  const policy = await getAcademicPolicy(data.term.id);
  const candidates = groupOptions(data);
  const departmentByCode = new Map(data.departments.map((department) => [department.code, department.id]));
  const cseId = departmentByCode.get("CSE") ?? null;
  const courseByCode = new Map(data.courses.map((course) => [course.code, course]));
  const groups = candidates.filter((group) => {
    const course = courseByCode.get(group.courseCode);
    const departmentId = course?.owningDepartmentCode ? departmentByCode.get(course.owningDepartmentCode) ?? null : cseId;
    return hasCapability(actor, "manage_rosters", departmentId)
      || actor.teacherId != null && group.teacherIds.includes(actor.teacherId) && hasCapability(actor, "take_attendance", departmentId);
  });
  if (groups.length === 0 && !await can(actor, "manage_rosters")) redirect("/forbidden");
  const selectedGroup = selectedGroupId == null
    ? groups[0] ?? null
    : groups.find((group) => group.id === selectedGroupId) ?? null;
  if (!selectedGroup) return { data, policy, groups, selectedGroup: null, roster: [], sessions: [], summaries: [] };

  const [enrollmentRows, sessionRows] = await Promise.all([
    db.select().from(courseEnrollments).where(and(
      eq(courseEnrollments.termId, data.term.id),
      eq(courseEnrollments.teachingGroupId, selectedGroup.id),
      eq(courseEnrollments.status, "active"),
    )),
    db.select().from(attendanceSessions).where(and(
      eq(attendanceSessions.termId, data.term.id),
      eq(attendanceSessions.teachingGroupId, selectedGroup.id),
    )).orderBy(asc(attendanceSessions.classDate)),
  ]);
  const enrolledIds = [...new Set(enrollmentRows.map((row) => row.studentId))];
  const studentRows = enrolledIds.length
    ? await db.select().from(students).where(and(inArray(students.id, enrolledIds), eq(students.status, "active")))
    : [];
  const roster = studentRows
    .map((student) => ({
      ...student,
      enrollment: enrollmentRows.find((row) => row.studentId === student.id)!,
      updatedAt: student.updatedAt.toISOString(),
    })).sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  const sessionIds = sessionRows.map((row) => row.id);
  const recordRows = sessionIds.length
    ? await db.select().from(attendanceRecords).where(inArray(attendanceRecords.sessionId, sessionIds))
    : [];
  const sessions = sessionRows.map((session) => ({
    ...session,
    createdAt: session.createdAt.toISOString(),
    records: recordRows.filter((record) => record.sessionId === session.id).map((record) => ({
      ...record,
      updatedAt: record.updatedAt.toISOString(),
    })),
  }));
  const maximum = selectedGroup.courseType === "sessional" ? policy.sessionalAttendanceMarks : policy.theoryAttendanceMarks;
  const summaries = roster.map((student) => {
    const statusesFor = (phase?: "midterm" | "final") => sessions
      .filter((session) => !phase || session.phase === phase)
      .map((session) => session.records.find((record) => record.studentId === student.id)?.status ?? "absent") as AttendanceStatus[];
    const midterm = statusesFor("midterm");
    const final = statusesFor("final");
    const semester = statusesFor();
    const attended = semester.filter((status) => status === "present" || status === "late").length;
    const counted = semester.filter((status) => status !== "excused").length;
    return {
      studentId: student.id,
      midterm: { attended: midterm.filter((s) => s === "present" || s === "late").length, total: midterm.filter((s) => s !== "excused").length },
      final: { attended: final.filter((s) => s === "present" || s === "late").length, total: final.filter((s) => s !== "excused").length },
      semester: { attended, total: counted, percentage: counted ? Math.round(attended / counted * 1000) / 10 : 0 },
      mark: attendanceMark(semester, maximum),
      maximum,
    };
  });
  return { data, policy, groups, selectedGroup, roster, sessions, summaries };
}
