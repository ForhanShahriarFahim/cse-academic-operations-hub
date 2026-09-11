"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  academicPolicies,
  attendanceRecords,
  attendanceSessions,
  auditEvents,
  batches,
  courseEnrollments,
  extraLoadClasses,
  extraLoadManualSummaries,
  meetingRooms,
  meetings,
  meetingTeachers,
  permittedWindows,
  students,
} from "@/db/schema";
import { parseStudentCsv, ATTENDANCE_STATUSES } from "./attendance";
import { getAttendanceData, getExtraLoadData } from "./academic-operations";
import { getActiveTerm } from "./data";
import { isExtraLoadEligible } from "./extra-load";
import { parseTimeToMinutes } from "./time";
import type { ActionResult } from "./actions";
import { buildAutoSchedulePlan } from "./schedule-automation";

function refresh() {
  revalidatePath("/", "layout");
}

async function audit(action: string, entity: string, entityId: number | null, detail?: unknown) {
  await db.insert(auditEvents).values({
    actor: "coordinator",
    action,
    entity,
    entityId,
    detail: detail === undefined ? null : detail as object,
  });
}

function numberField(formData: FormData, name: string): number | null {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateAcademicPolicyAction(formData: FormData): Promise<ActionResult> {
  const term = await getActiveTerm();
  const values = {
    theoryCreditHours: numberField(formData, "theoryCreditHours"),
    sessionalCreditHours: numberField(formData, "sessionalCreditHours"),
    extraLoadThresholdCredits: numberField(formData, "extraLoadThresholdCredits"),
    extraClassRate: numberField(formData, "extraClassRate"),
    theoryAttendanceMarks: numberField(formData, "theoryAttendanceMarks"),
    sessionalAttendanceMarks: numberField(formData, "sessionalAttendanceMarks"),
  };
  if (Object.values(values).some((value) => value == null || value < 0)) {
    return { ok: false, message: "Enter valid non-negative policy values." };
  }
  const numericValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
  await db.insert(academicPolicies).values({ termId: term.id, ...numericValues })
    .onConflictDoUpdate({ target: academicPolicies.termId, set: { ...numericValues, updatedAt: new Date() } });
  await audit("policy.update", "academic_policy", term.id, values);
  refresh();
  return { ok: true, message: "Academic and payment policy updated for this term." };
}

export async function createPermittedWindowAction(formData: FormData): Promise<ActionResult> {
  const term = await getActiveTerm();
  const stream = String(formData.get("stream") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startMinutes = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
  const endMinutes = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
  const batchId = numberField(formData, "batchId");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!['HSC', 'DIPLOMA'].includes(stream) || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return { ok: false, message: "Choose a stream, day, and valid start/end time." };
  }
  if (batchId) {
    const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!batch || batch.stream !== stream) return { ok: false, message: "The selected batch does not belong to that stream." };
  }
  const [row] = await db.insert(permittedWindows).values({ termId: term.id, batchId, stream, dayOfWeek, startMinutes, endMinutes, requiresExceptionNote: note }).returning();
  await audit("window.create", "permitted_window", row.id, { batchId, stream, dayOfWeek, startMinutes, endMinutes });
  refresh();
  return { ok: true, message: batchId ? "Batch-specific class window added." : "Stream-wide class window added." };
}

export async function deletePermittedWindowAction(id: number): Promise<ActionResult> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Invalid time window." };
  await db.delete(permittedWindows).where(eq(permittedWindows.id, id));
  await audit("window.delete", "permitted_window", id);
  refresh();
  return { ok: true, message: "Class window removed." };
}

export async function createExtraLoadClassAction(formData: FormData): Promise<ActionResult> {
  const teacherId = Number(formData.get("teacherId"));
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const classDate = String(formData.get("classDate") ?? "");
  const startMinutes = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
  const endMinutes = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const source = await getExtraLoadData();
  const group = source.groups.find((row) => row.id === teachingGroupId);
  const assignedCredits = source.loads.get(teacherId) ?? 0;
  if (!Number.isInteger(teacherId) || !group || !group.teacherIds.includes(teacherId)) {
    return { ok: false, message: "Choose a course assigned to that teacher." };
  }
  if (!isExtraLoadEligible(assignedCredits, source.policy.extraLoadThresholdCredits)) {
    return { ok: false, message: `Extra load starts above ${source.policy.extraLoadThresholdCredits} credits; this teacher currently has ${assignedCredits.toFixed(1)}.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate) || classDate < source.data.term.startDate || classDate > source.data.term.endDate) {
    return { ok: false, message: `Choose a date within ${source.data.term.name}.` };
  }
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return { ok: false, message: "Enter a valid class time." };
  const [row] = await db.insert(extraLoadClasses).values({
    termId: source.data.term.id,
    teacherId,
    teachingGroupId,
    classDate,
    startMinutes,
    endMinutes,
    courseCodeSnapshot: group.courseCode,
    courseTitleSnapshot: group.courseTitle,
    batchLabelSnapshot: group.audience,
    notes,
  }).returning();
  await audit("extra_load.create", "extra_load_class", row.id, { teacherId, teachingGroupId, classDate, startMinutes, endMinutes });
  refresh();
  return { ok: true, message: "Extra class recorded. The print copy leaves the signature cell blank." };
}

export async function deleteExtraLoadClassAction(id: number): Promise<ActionResult> {
  await db.delete(extraLoadClasses).where(eq(extraLoadClasses.id, id));
  await audit("extra_load.delete", "extra_load_class", id);
  refresh();
  return { ok: true, message: "Extra class removed." };
}

export async function createManualTopSheetRowAction(formData: FormData): Promise<ActionResult> {
  const term = await getActiveTerm();
  const teacherName = String(formData.get("teacherName") ?? "").trim();
  const classCount = numberField(formData, "classCount");
  const rateOverride = numberField(formData, "rateOverride");
  const amountOverride = numberField(formData, "amountOverride");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!teacherName || classCount == null || !Number.isInteger(classCount) || classCount < 0) return { ok: false, message: "Enter a teacher name and whole-number class count." };
  const [row] = await db.insert(extraLoadManualSummaries).values({
    termId: term.id,
    teacherName,
    classCount,
    rateOverride: rateOverride == null ? null : String(rateOverride),
    amountOverride: amountOverride == null ? null : String(amountOverride),
    notes,
  }).returning();
  await audit("extra_load.manual.create", "extra_load_manual_summary", row.id, { teacherName, classCount });
  refresh();
  return { ok: true, message: "Manual teacher row added to the top sheet." };
}

export async function deleteManualTopSheetRowAction(id: number): Promise<ActionResult> {
  await db.delete(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.id, id));
  await audit("extra_load.manual.delete", "extra_load_manual_summary", id);
  refresh();
  return { ok: true, message: "Manual top-sheet row removed." };
}

export async function upsertStudentAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const studentId = numberField(formData, "studentId");
  const studentCode = String(formData.get("studentCode") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const homeDepartmentLabel = String(formData.get("department") ?? "").trim() || null;
  const audienceType = String(formData.get("audienceType") ?? "local");
  if (!studentCode || !fullName || !Number.isInteger(teachingGroupId) || !["local", "external", "merged"].includes(audienceType)) {
    return { ok: false, message: "Student ID, name, course group, and a valid audience type are required." };
  }
  const source = await getAttendanceData(teachingGroupId);
  if (!source.selectedGroup) return { ok: false, message: "Choose a course group from the active term." };
  const term = source.data.term;
  let id = studentId;
  if (id) {
    const [existing] = await db.select({ id: students.id }).from(students).where(eq(students.id, id)).limit(1);
    if (!existing) return { ok: false, message: "The student record no longer exists." };
    await db.update(students).set({ studentCode, fullName, phone, homeDepartmentLabel, updatedAt: new Date() }).where(eq(students.id, id));
  } else {
    const [row] = await db.insert(students).values({ studentCode, fullName, phone, homeDepartmentLabel })
      .onConflictDoUpdate({ target: students.studentCode, set: { fullName, phone, homeDepartmentLabel, status: "active", updatedAt: new Date() } }).returning();
    id = row.id;
  }
  await db.insert(courseEnrollments).values({ termId: term.id, teachingGroupId, studentId: id, audienceType })
    .onConflictDoUpdate({ target: [courseEnrollments.termId, courseEnrollments.teachingGroupId, courseEnrollments.studentId], set: { audienceType, status: "active" } });
  await audit(studentId ? "student.update" : "student.create", "student", id, { teachingGroupId, audienceType });
  refresh();
  return { ok: true, message: studentId ? "Student updated." : "Student added and enrolled." };
}

export async function importStudentCsvAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const csvText = String(formData.get("csvText") ?? "");
  if (!Number.isInteger(teachingGroupId) || teachingGroupId <= 0) return { ok: false, message: "Choose a course group first." };
  const source = await getAttendanceData(teachingGroupId);
  if (!source.selectedGroup) return { ok: false, message: "Choose a course group from the active term." };
  const term = source.data.term;
  let parsed;
  try { parsed = parseStudentCsv(csvText); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not parse the CSV." }; }
  await db.transaction(async (tx) => {
    for (const row of parsed) {
      const [student] = await tx.insert(students).values({
        studentCode: row.studentCode,
        fullName: row.fullName,
        phone: row.phone,
        homeDepartmentLabel: row.department,
      }).onConflictDoUpdate({ target: students.studentCode, set: {
        fullName: row.fullName,
        phone: row.phone,
        homeDepartmentLabel: row.department,
        status: "active",
        updatedAt: new Date(),
      } }).returning();
      await tx.insert(courseEnrollments).values({ termId: term.id, teachingGroupId, studentId: student.id, audienceType: row.audienceType })
        .onConflictDoUpdate({ target: [courseEnrollments.termId, courseEnrollments.teachingGroupId, courseEnrollments.studentId], set: { audienceType: row.audienceType, status: "active" } });
    }
  });
  await audit("student.csv_import", "teaching_group", teachingGroupId, { count: parsed.length });
  refresh();
  return { ok: true, message: `${parsed.length} student record(s) imported or updated.` };
}

export async function deactivateStudentAction(studentId: number, teachingGroupId: number): Promise<ActionResult> {
  const term = await getActiveTerm();
  await db.update(courseEnrollments).set({ status: "inactive" }).where(and(
    eq(courseEnrollments.termId, term.id),
    eq(courseEnrollments.teachingGroupId, teachingGroupId),
    eq(courseEnrollments.studentId, studentId),
  ));
  await audit("enrollment.deactivate", "student", studentId, { teachingGroupId });
  refresh();
  return { ok: true, message: "Student removed from this roster; attendance history was preserved." };
}

export async function createAttendanceSessionAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const classDate = String(formData.get("classDate") ?? "");
  const phase = String(formData.get("phase") ?? "midterm");
  const startMinutes = formData.get("startTime") ? parseTimeToMinutes(String(formData.get("startTime"))) : null;
  const endMinutes = formData.get("endTime") ? parseTimeToMinutes(String(formData.get("endTime"))) : null;
  const teacherId = numberField(formData, "teacherId");
  const source = await getAttendanceData(teachingGroupId);
  if (!source.selectedGroup || !/^\d{4}-\d{2}-\d{2}$/.test(classDate) || !["midterm", "final"].includes(phase)) return { ok: false, message: "Choose a group, date, and assessment phase." };
  if (classDate < source.data.term.startDate || classDate > source.data.term.endDate) return { ok: false, message: `Choose a date within ${source.data.term.name}.` };
  if (source.roster.length === 0) return { ok: false, message: "Add or import students before creating an attendance session." };
  if ((startMinutes == null) !== (endMinutes == null) || (startMinutes != null && endMinutes != null && endMinutes <= startMinutes)) return { ok: false, message: "Enter both times, with end after start, or leave both blank." };
  if (teacherId != null && !source.selectedGroup.teacherIds.includes(teacherId)) {
    return { ok: false, message: "Choose a teacher assigned to this course group." };
  }
  const [session] = await db.insert(attendanceSessions).values({
    termId: source.data.term.id,
    teachingGroupId,
    classDate,
    phase,
    startMinutes,
    endMinutes,
    teacherId,
  }).returning();
  await db.insert(attendanceRecords).values(source.roster.map((student) => ({ sessionId: session.id, studentId: student.id, status: "absent" })));
  await audit("attendance.session.create", "attendance_session", session.id, { teachingGroupId, classDate, phase, students: source.roster.length });
  refresh();
  return { ok: true, message: "Attendance session created with every student initially marked absent." };
}

export async function saveAttendanceAction(sessionId: number, values: Array<{ studentId: number; status: string }>): Promise<ActionResult> {
  if (!Number.isInteger(sessionId) || values.some((value) => !Number.isInteger(value.studentId) || !ATTENDANCE_STATUSES.includes(value.status as never))) {
    return { ok: false, message: "Attendance payload is invalid." };
  }
  const [session] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1);
  if (!session) return { ok: false, message: "The attendance session no longer exists." };
  const existingRecords = await db.select({ studentId: attendanceRecords.studentId }).from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
  const allowedStudentIds = new Set(existingRecords.map((row) => row.studentId));
  const submittedStudentIds = values.map((value) => value.studentId);
  if (new Set(submittedStudentIds).size !== submittedStudentIds.length || submittedStudentIds.some((id) => !allowedStudentIds.has(id))) {
    return { ok: false, message: "Attendance can only be saved for students captured in this session." };
  }
  await db.transaction(async (tx) => {
    for (const value of values) {
      await tx.insert(attendanceRecords).values({ sessionId, studentId: value.studentId, status: value.status })
        .onConflictDoUpdate({ target: [attendanceRecords.sessionId, attendanceRecords.studentId], set: { status: value.status, updatedAt: new Date() } });
    }
  });
  await audit("attendance.save", "attendance_session", sessionId, { records: values.length });
  refresh();
  return { ok: true, message: `Attendance saved for ${values.length} student(s).` };
}

export async function deleteAttendanceSessionAction(id: number): Promise<ActionResult> {
  await db.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, id));
  await db.delete(attendanceSessions).where(eq(attendanceSessions.id, id));
  await audit("attendance.session.delete", "attendance_session", id);
  refresh();
  return { ok: true, message: "Attendance session removed." };
}

export async function applyAutoScheduleAction(): Promise<ActionResult> {
  // Recompute immediately before commit; suggestions from an earlier page
  // render are never trusted after the draft may have changed.
  const source = await buildAutoSchedulePlan();
  if (source.plan.suggestions.length === 0) return { ok: false, message: "There are no safe automatic placements to apply." };
  await db.transaction(async (tx) => {
    for (const suggestion of source.plan.suggestions) {
      const [meeting] = await tx.insert(meetings).values({
        teachingGroupId: suggestion.teachingGroupId,
        dayOfWeek: suggestion.dayOfWeek,
        startMinutes: suggestion.startMinutes,
        endMinutes: suggestion.endMinutes,
      }).returning();
      await tx.insert(meetingTeachers).values(suggestion.teacherIds.map((teacherId) => ({ meetingId: meeting.id, teacherId })));
      await tx.insert(meetingRooms).values({ meetingId: meeting.id, roomId: suggestion.roomId });
      await tx.insert(auditEvents).values({
        actor: "coordinator",
        action: "meeting.auto_create",
        entity: "meeting",
        entityId: meeting.id,
        detail: suggestion,
      });
    }
  });
  refresh();
  return { ok: true, message: `${source.plan.suggestions.length} clash-free meeting(s) added to the working draft. Review Validation before publishing.` };
}
