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
  students,
} from "@/db/schema";
import { parseStudentCsv, ATTENDANCE_STATUSES } from "./attendance";
import { getAttendanceData, getExtraLoadData } from "./academic-operations";
import { getActiveTerm } from "./data";
import { isExtraLoadEligible } from "./extra-load";
import { parseTimeToMinutes } from "./time";
import type { ActionResult } from "./actions";
import { buildAutoSchedulePlan } from "./schedule-automation";
import { auditedChange } from "./auth/audit";
import { actionActor, guardAction } from "./auth/action-guard";
import { OUTSIDE_ACTIVE_TERM, isInActiveTerm } from "./term-scope";

function refresh() {
  revalidatePath("/", "layout");
}

function numberField(formData: FormData, name: string): number | null {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateAcademicPolicyAction(formData: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_policy");
  if (denied) return denied;
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
  await auditedChange("policy.update", "academic_policy", async (tx) => {
    const [previous] = await tx.select().from(academicPolicies).where(eq(academicPolicies.termId, term.id)).limit(1);
    const [updated] = await tx.insert(academicPolicies).values({ termId: term.id, ...numericValues })
      .onConflictDoUpdate({ target: academicPolicies.termId, set: { ...numericValues, updatedAt: new Date() } }).returning();
    return { result: null, entityId: term.id, before: previous ?? null, after: updated };
  });
  refresh();
  return { ok: true, message: "Academic and payment policy updated for this term." };
}

// Class days, periods and class hours are edited in Days & periods (RUT-04, time-grid-actions.ts).

export async function createExtraLoadClassAction(formData: FormData): Promise<ActionResult> {
  const teacherId = Number(formData.get("teacherId"));
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("submit_extra_load", { kind: "teacher", teacherId });
  if (denied) return denied;
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
  await auditedChange("extra_load.create", "extra_load_class", async (tx) => {
    const [row] = await tx.insert(extraLoadClasses).values({
      termId: source.data.term.id, teacherId, teachingGroupId, classDate,
      startMinutes, endMinutes, courseCodeSnapshot: group.courseCode,
      courseTitleSnapshot: group.courseTitle, batchLabelSnapshot: group.audience, notes,
    }).returning();
    return { result: null, entityId: row.id, after: row };
  });
  refresh();
  return { ok: true, message: "Extra class recorded. The print copy leaves the signature cell blank." };
}

export async function deleteExtraLoadClassAction(id: number): Promise<ActionResult> {
  const denied = await guardAction("submit_extra_load", { kind: "extra_load_class", classId: id });
  if (denied) return denied;
  if (!await isInActiveTerm("extra_load_class", id)) return { ...OUTSIDE_ACTIVE_TERM };
  await auditedChange("extra_load.delete", "extra_load_class", async (tx) => {
    const [previous] = await tx.delete(extraLoadClasses).where(eq(extraLoadClasses.id, id)).returning();
    return { result: null, entityId: id, before: previous ?? null };
  });
  refresh();
  return { ok: true, message: "Extra class removed." };
}

export async function createManualTopSheetRowAction(formData: FormData): Promise<ActionResult> {
  const denied = await guardAction("review_extra_load");
  if (denied) return denied;
  const term = await getActiveTerm();
  const teacherName = String(formData.get("teacherName") ?? "").trim();
  const classCount = numberField(formData, "classCount");
  const rateOverride = numberField(formData, "rateOverride");
  const amountOverride = numberField(formData, "amountOverride");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!teacherName || classCount == null || !Number.isInteger(classCount) || classCount < 0) return { ok: false, message: "Enter a teacher name and whole-number class count." };
  await auditedChange("extra_load.manual.create", "extra_load_manual_summary", async (tx) => {
    const [row] = await tx.insert(extraLoadManualSummaries).values({
      termId: term.id, teacherName, classCount,
      rateOverride: rateOverride == null ? null : String(rateOverride),
      amountOverride: amountOverride == null ? null : String(amountOverride), notes,
    }).returning();
    return { result: null, entityId: row.id, after: row };
  });
  refresh();
  return { ok: true, message: "Manual teacher row added to the top sheet." };
}

export async function deleteManualTopSheetRowAction(id: number): Promise<ActionResult> {
  const denied = await guardAction("review_extra_load");
  if (denied) return denied;
  if (!await isInActiveTerm("extra_load_manual_summary", id)) return { ...OUTSIDE_ACTIVE_TERM };
  await auditedChange("extra_load.manual.delete", "extra_load_manual_summary", async (tx) => {
    const [previous] = await tx.delete(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.id, id)).returning();
    return { result: null, entityId: id, before: previous ?? null };
  });
  refresh();
  return { ok: true, message: "Manual top-sheet row removed." };
}

export async function upsertStudentAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("manage_rosters", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
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
  if (studentId) {
    const [existing] = await db.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
    if (!existing) return { ok: false, message: "The student record no longer exists." };
  }
  await auditedChange(studentId ? "student.update" : "student.create", "student", async (tx) => {
    const [previous] = studentId
      ? await tx.select().from(students).where(eq(students.id, studentId)).limit(1)
      : await tx.select().from(students).where(eq(students.studentCode, studentCode)).limit(1);
    const [row] = studentId
      ? await tx.update(students).set({ studentCode, fullName, phone, homeDepartmentLabel, updatedAt: new Date() }).where(eq(students.id, studentId)).returning()
      : await tx.insert(students).values({ studentCode, fullName, phone, homeDepartmentLabel })
        .onConflictDoUpdate({ target: students.studentCode, set: { fullName, phone, homeDepartmentLabel, status: "active", updatedAt: new Date() } }).returning();
    await tx.insert(courseEnrollments).values({ termId: term.id, teachingGroupId, studentId: row.id, audienceType })
      .onConflictDoUpdate({ target: [courseEnrollments.termId, courseEnrollments.teachingGroupId, courseEnrollments.studentId], set: { audienceType, status: "active" } });
    return { result: null, entityId: row.id, before: previous ?? null, after: { ...row, teachingGroupId, audienceType } };
  });
  refresh();
  return { ok: true, message: studentId ? "Student updated." : "Student added and enrolled." };
}

export async function importStudentCsvAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("manage_rosters", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
  const csvText = String(formData.get("csvText") ?? "");
  if (!Number.isInteger(teachingGroupId) || teachingGroupId <= 0) return { ok: false, message: "Choose a course group first." };
  const source = await getAttendanceData(teachingGroupId);
  if (!source.selectedGroup) return { ok: false, message: "Choose a course group from the active term." };
  const term = source.data.term;
  let parsed;
  try { parsed = parseStudentCsv(csvText); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not parse the CSV." }; }
  await auditedChange("student.csv_import", "teaching_group", async (tx) => {
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
    return { result: null, entityId: teachingGroupId, after: { count: parsed.length } };
  });
  refresh();
  return { ok: true, message: `${parsed.length} student record(s) imported or updated.` };
}

export async function deactivateStudentAction(studentId: number, teachingGroupId: number): Promise<ActionResult> {
  const denied = await guardAction("manage_rosters", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
  const term = await getActiveTerm();
  await auditedChange("enrollment.deactivate", "student", async (tx) => {
    const where = and(eq(courseEnrollments.termId, term.id), eq(courseEnrollments.teachingGroupId, teachingGroupId), eq(courseEnrollments.studentId, studentId));
    const [previous] = await tx.select().from(courseEnrollments).where(where).limit(1);
    const [updated] = await tx.update(courseEnrollments).set({ status: "inactive" }).where(where).returning();
    return { result: null, entityId: studentId, before: previous ?? null, after: updated ?? null };
  });
  refresh();
  return { ok: true, message: "Student removed from this roster; attendance history was preserved." };
}

export async function createAttendanceSessionAction(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("take_attendance", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
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
  await auditedChange("attendance.session.create", "attendance_session", async (tx) => {
    const [session] = await tx.insert(attendanceSessions).values({
      termId: source.data.term.id, teachingGroupId, classDate, phase,
      startMinutes, endMinutes, teacherId,
    }).returning();
    await tx.insert(attendanceRecords).values(source.roster.map((student) => ({ sessionId: session.id, studentId: student.id, status: "absent" })));
    return { result: null, entityId: session.id, after: { ...session, studentCount: source.roster.length } };
  });
  refresh();
  return { ok: true, message: "Attendance session created with every student initially marked absent." };
}

export async function saveAttendanceAction(sessionId: number, values: Array<{ studentId: number; status: string }>): Promise<ActionResult> {
  const denied = await guardAction("take_attendance", { kind: "attendance_session", sessionId });
  if (denied) return denied;
  if (!Number.isInteger(sessionId) || values.some((value) => !Number.isInteger(value.studentId) || !ATTENDANCE_STATUSES.includes(value.status as never))) {
    return { ok: false, message: "Attendance payload is invalid." };
  }
  if (!await isInActiveTerm("attendance_session", sessionId)) return { ...OUTSIDE_ACTIVE_TERM };
  const [session] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1);
  if (!session) return { ok: false, message: "The attendance session no longer exists." };
  const existingRecords = await db.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status }).from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
  const allowedStudentIds = new Set(existingRecords.map((row) => row.studentId));
  const submittedStudentIds = values.map((value) => value.studentId);
  if (new Set(submittedStudentIds).size !== submittedStudentIds.length || submittedStudentIds.some((id) => !allowedStudentIds.has(id))) {
    return { ok: false, message: "Attendance can only be saved for students captured in this session." };
  }
  await auditedChange("attendance.save", "attendance_session", async (tx) => {
    for (const value of values) {
      await tx.insert(attendanceRecords).values({ sessionId, studentId: value.studentId, status: value.status })
        .onConflictDoUpdate({ target: [attendanceRecords.sessionId, attendanceRecords.studentId], set: { status: value.status, updatedAt: new Date() } });
    }
    return { result: null, entityId: sessionId,
      before: existingRecords.filter((row) => submittedStudentIds.includes(row.studentId)),
      after: values };
  });
  refresh();
  return { ok: true, message: `Attendance saved for ${values.length} student(s).` };
}

export async function deleteAttendanceSessionAction(id: number): Promise<ActionResult> {
  const denied = await guardAction("take_attendance", { kind: "attendance_session", sessionId: id });
  if (denied) return denied;
  if (!await isInActiveTerm("attendance_session", id)) return { ...OUTSIDE_ACTIVE_TERM };
  await auditedChange("attendance.session.delete", "attendance_session", async (tx) => {
    const [session] = await tx.select().from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1);
    const records = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, id));
    await tx.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, id));
    await tx.delete(attendanceSessions).where(eq(attendanceSessions.id, id));
    return { result: null, entityId: id, before: { session, records } };
  });
  refresh();
  return { ok: true, message: "Attendance session removed." };
}

export async function applyAutoScheduleAction(): Promise<ActionResult> {
  const actor = await actionActor("run_auto_schedule");
  if ("ok" in actor) return actor;
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
        actor: actor.displayName,
        actorUserId: actor.id,
        actorDisplayName: actor.displayName,
        actorKind: "user",
        action: "meeting.auto_create",
        entity: "meeting",
        entityId: meeting.id,
        after: suggestion,
        detail: suggestion,
      });
    }
  });
  refresh();
  return { ok: true, message: `${source.plan.suggestions.length} clash-free meeting(s) added to the working draft. Review Validation before publishing.` };
}
