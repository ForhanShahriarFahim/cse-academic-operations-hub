"use server";

import { withActiveTermContext as withTermContext } from "./active-term";
import { appendTermContext, type TermWriteContext } from "./term-context-value";
import { addRosterStudent, changeRosterEnrollment, reviewStudentCsv } from "./student-roster-actions";
import { lockRosterTerm, lockStudents, positiveId, withRoster } from "./student-store";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  academicPolicies,
  attendanceRecords,
  attendanceSessions,
  auditEvents,
  batches,
  extraLoadClasses,
  extraLoadManualSummaries,
  meetingRooms,
  meetings,
  meetingTeachers,
} from "@/db/schema";
import { ATTENDANCE_STATUSES, type RosterImportReceipt } from "./attendance";
import { getAttendanceData, getExtraLoadData } from "./academic-operations";
import { getActiveTerm } from "./data";
import { isExtraLoadEligible } from "./extra-load";
import { formatWorkloadUnits } from "./workload";
import { fmtRange, parseTimeToMinutes } from "./time";
import type { ActionResult } from "./actions";
import { buildAutoSchedulePlan } from "./schedule-automation";
import { auditedChange } from "./auth/audit";
import { lockRooms, roomAssignmentGuard, validateRoomAssignment } from "./room-transaction";
import { retainAssignedRooms } from "./room-lifecycle-transaction";
import { assertGroupMaintenanceClear } from "./room-maintenance-transaction";
import { actionActor, guardAction } from "./auth/action-guard";
import { OUTSIDE_ACTIVE_TERM, isInActiveTerm } from "./term-scope";
import { POLICY_FIELDS, validateStartingPolicy } from "./term-records";
import { conflicted, invalid, stale } from "./action-result";

function refresh() {
  revalidatePath("/", "layout");
}

function numberField(formData: FormData, name: string): number | null {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateAcademicPolicyAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => updateAcademicPolicyActionInTerm(formData), context ?? formData);
}
async function updateAcademicPolicyActionInTerm(formData: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_policy");
  if (denied) return denied;
  const term = await getActiveTerm();
  // Legacy metadata is no longer editable here, including via a forged payload.
  // Preserve it inside the audited transaction; only the four live settings are parsed.
  const parsed = validateStartingPolicy({
    ...Object.fromEntries(POLICY_FIELDS.map((key) => [key, formData.get(key)])),
    theoryCreditHours: "3", sessionalCreditHours: "2",
  });
  if (!parsed.ok) return invalid("Enter valid non-negative policy values.", parsed.errors);
  const { theoryCreditHours: _theory, sessionalCreditHours: _sessional, ...numericValues } = parsed.values;
  await auditedChange("policy.update", "academic_policy", async (tx) => {
    const [previous] = await tx.select().from(academicPolicies).where(eq(academicPolicies.termId, term.id)).limit(1);
    const [updated] = await tx.insert(academicPolicies).values({ termId: term.id, ...numericValues,
      theoryCreditHours: previous?.theoryCreditHours ?? _theory,
      sessionalCreditHours: previous?.sessionalCreditHours ?? _sessional,
    })
      .onConflictDoUpdate({ target: academicPolicies.termId, set: { ...numericValues, updatedAt: new Date() } }).returning();
    return { result: null, entityId: term.id, before: previous ?? null, after: updated };
  });
  refresh();
  return { ok: true, message: "Academic and payment policy updated for this term." };
}

// Class days, periods and class hours are edited in Days & periods (RUT-04, time-grid-actions.ts).

export async function createExtraLoadClassAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => createExtraLoadClassActionInTerm(formData), context ?? formData);
}
async function createExtraLoadClassActionInTerm(formData: FormData): Promise<ActionResult> {
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
  const assignedWorkloadUnits = source.loads.get(teacherId) ?? 0;
  if (!Number.isInteger(teacherId) || !group || !group.teacherIds.includes(teacherId)) {
    return { ok: false, message: "Choose a course assigned to that teacher." };
  }
  if (!isExtraLoadEligible(assignedWorkloadUnits, source.policy.extraLoadThresholdCredits)) {
    return { ok: false, message: `Extra load starts above ${source.policy.extraLoadThresholdCredits} workload credit-hours; this teacher currently has ${formatWorkloadUnits(assignedWorkloadUnits)}.` };
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

export async function deleteExtraLoadClassAction(id: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => deleteExtraLoadClassActionInTerm(id), context);
}
async function deleteExtraLoadClassActionInTerm(id: number): Promise<ActionResult> {
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

export async function createManualTopSheetRowAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => createManualTopSheetRowActionInTerm(formData), context ?? formData);
}
async function createManualTopSheetRowActionInTerm(formData: FormData): Promise<ActionResult> {
  const denied = await guardAction("review_extra_load");
  if (denied) return denied;
  const term = await getActiveTerm();
  const teacherName = String(formData.get("teacherName") ?? "").trim();
  const classCount = numberField(formData, "classCount");
  const rateOverride = numberField(formData, "rateOverride");
  const amountOverride = numberField(formData, "amountOverride");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!teacherName || teacherName.length > 200 || classCount == null || !Number.isInteger(classCount) || classCount < 0 || classCount > 10_000) return { ok: false, message: "Enter a teacher name and whole-number class count." };
  // Checked as text: binary floating point cannot test "two decimal places" reliably.
  const moneyText = (name: string, digits: number) => new RegExp(`^(?:\d{1,${digits}}(?:\.\d{1,2})?)?$`).test(String(formData.get(name) ?? "").trim());
  if (!moneyText("rateOverride", 8) || !moneyText("amountOverride", 10)) {
    return { ok: false, message: "Enter rate and amount as non-negative numbers with at most two decimal places, or leave them blank." };
  }
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

export async function deleteManualTopSheetRowAction(id: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => deleteManualTopSheetRowActionInTerm(id), context);
}
async function deleteManualTopSheetRowActionInTerm(id: number): Promise<ActionResult> {
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

export async function upsertStudentAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return addRosterStudent(formData, context);
}

export async function importStudentCsvAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult & { receipt?: RosterImportReceipt }> {
  if (context) appendTermContext(formData, context);
  const groupId = positiveId(formData.get("teachingGroupId"));
  if (!groupId) return withTermContext(async () => invalid("Choose a teaching group."), context ?? formData);
  if (formData.get("operation") !== "confirm") {
    return withRoster(groupId, formData, async () => invalid("Open Manage roster and preview the CSV before importing."));
  }
  formData.set("mode", "roster");
  return reviewStudentCsv(formData);
}

export async function deactivateStudentAction(studentId: number, teachingGroupId: number, context?: TermWriteContext): Promise<ActionResult> {
  const input = new FormData();
  input.set("operation", "remove");
  input.set("studentId", String(studentId));
  input.set("teachingGroupId", String(teachingGroupId));
  if (!positiveId(studentId) || !positiveId(teachingGroupId)) return withTermContext(async () => invalid("Choose an enrollment."), context);
  return changeRosterEnrollment(input, context);
}

export async function createAttendanceSessionAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => createAttendanceSessionActionInTerm(formData), context ?? formData);
}
const ATTENDANCE_CREATE_LOCK = 61027;
async function createAttendanceSessionActionInTerm(formData: FormData): Promise<ActionResult> {
  const teachingGroupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("take_attendance", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
  const classDate = String(formData.get("classDate") ?? "");
  const phase = String(formData.get("phase") ?? "midterm");
  const startMinutes = formData.get("startTime") ? parseTimeToMinutes(String(formData.get("startTime"))) : null;
  const endMinutes = formData.get("endTime") ? parseTimeToMinutes(String(formData.get("endTime"))) : null;
  const teacherId = numberField(formData, "teacherId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate) || !["midterm", "final"].includes(phase)) {
    const message = "Choose a valid date and assessment phase.";
    return invalid(message, { [!/^\d{4}-\d{2}-\d{2}$/.test(classDate) ? "classDate" : "phase"]: [message] });
  }
  if ((startMinutes == null) !== (endMinutes == null) || (startMinutes != null && endMinutes != null && endMinutes <= startMinutes)) {
    const message = "Enter both times, with end after start, or leave both blank.";
    return invalid(message, { [startMinutes == null ? "startTime" : "endTime"]: [message] });
  }
  // The shared term-context lock is already held by withTermContext. Serialize
  // creators before reading the roster or duplicate key; release at outer commit.
  await db.execute(sql`select pg_advisory_xact_lock(${ATTENDANCE_CREATE_LOCK}::integer, ${teachingGroupId}::integer)`);
  const term = await getActiveTerm();
  await lockRosterTerm(term.id);
  await lockStudents();
  const source = await getAttendanceData(teachingGroupId);
  if (!source.selectedGroup) return { ok: false, message: "Choose a group, date, and assessment phase." };
  if (classDate < source.data.term.startDate || classDate > source.data.term.endDate) {
    const message = `Choose a date within ${source.data.term.name}.`;
    return invalid(message, { classDate: [message] });
  }
  if (source.roster.length === 0) return { ok: false, message: "Add or import students before creating an attendance session." };
  if (teacherId != null && !source.selectedGroup.teacherIds.includes(teacherId)) {
    const message = "Choose a teacher assigned to this course group.";
    return invalid(message, { teacherId: [message] });
  }
  const [duplicate] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(
    eq(attendanceSessions.termId, source.data.term.id),
    eq(attendanceSessions.teachingGroupId, teachingGroupId),
    eq(attendanceSessions.classDate, classDate),
    startMinutes == null ? isNull(attendanceSessions.startMinutes) : eq(attendanceSessions.startMinutes, startMinutes),
    endMinutes == null ? isNull(attendanceSessions.endMinutes) : eq(attendanceSessions.endMinutes, endMinutes),
  )).limit(1);
  if (duplicate) {
    const time = startMinutes != null && endMinutes != null ? fmtRange(startMinutes, endMinutes) : "time not specified";
    const message = `An attendance session already exists on ${classDate} (${time}). Open that session to take attendance; nothing was created.`;
    return conflicted(message, [{ severity: "blocker", title: "Attendance session already exists", detail: message }]);
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

export async function saveAttendanceAction(sessionId: number, values: Array<{ studentId: number; status: string }>, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => saveAttendanceActionInTerm(sessionId, values), context);
}
async function saveAttendanceActionInTerm(sessionId: number, values: Array<{ studentId: number; status: string }>): Promise<ActionResult> {
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

export async function deleteAttendanceSessionAction(id: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => deleteAttendanceSessionActionInTerm(id), context);
}
async function deleteAttendanceSessionActionInTerm(id: number): Promise<ActionResult> {
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

export async function applyAutoScheduleAction(context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => applyAutoScheduleActionInTerm(), context);
}
async function applyAutoScheduleActionInTerm(): Promise<ActionResult> {
  const actor = await actionActor("run_auto_schedule");
  if ("ok" in actor) return actor;
  // Recompute immediately before commit; suggestions from an earlier page
  // render are never trusted after the draft may have changed.
  const source = await buildAutoSchedulePlan();
  if (source.plan.suggestions.length === 0) return { ok: false, message: "There are no safe automatic placements to apply." };
  const roomFailure = await roomAssignmentGuard(async () => { await db.transaction(async (tx) => {
    await lockRooms(tx, source.plan.suggestions.map((suggestion) => suggestion.roomId));
    for (const suggestion of source.plan.suggestions) await validateRoomAssignment(tx, suggestion.teachingGroupId, [suggestion.roomId]);
    for (const suggestion of source.plan.suggestions) await assertGroupMaintenanceClear(tx, suggestion.teachingGroupId, [suggestion.roomId], suggestion);
    await retainAssignedRooms(tx, actor, source.plan.suggestions.map((suggestion) => suggestion.roomId), "automatic class batch");
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
  }); });
  if (roomFailure) return roomFailure;
  refresh();
  return { ok: true, message: `${source.plan.suggestions.length} clash-free meeting(s) added to the working draft. Review Validation before publishing.` };
}
