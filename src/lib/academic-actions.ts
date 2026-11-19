"use server";

import { withActiveTermContext as withTermContext } from "./active-term";
import { appendTermContext, type TermWriteContext } from "./term-context-value";
import { addRosterStudent, changeRosterEnrollment, reviewStudentCsv } from "./student-roster-actions";
import { lockRosterTerm, lockStudents, positiveId, withRoster } from "./student-store";

import { and, asc, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
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
  students,
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
import { actionActor, guardAction, type ActionDenied } from "./auth/action-guard";
import { can } from "./auth";
import {
  COMMAND_MESSAGES, REASON_MAX, REASON_MIN, REASON_REQUIRED, STALE_SESSION_MESSAGE, decideSession, isSessionCommand, parseReason,
  sessionActionLabel, stateLabel, statusChanges, type SessionCommand, type SessionRoles, type StatusChange,
} from "./attendance-lifecycle";
import { OUTSIDE_ACTIVE_TERM, isInActiveTerm } from "./term-scope";
import { POLICY_FIELDS, validateStartingPolicy } from "./term-records";
import { conflicted, denied as deniedResult, invalid, stale, succeeded } from "./action-result";

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
    ne(attendanceSessions.status, "voided"),
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

type AttendanceValue = { studentId: number; status: string };
export interface SessionCommandInput { command: SessionCommand; revision: number; reason?: string | null; values?: AttendanceValue[] }

/** Saves marks on an editable (draft or reopened) session the user saw at `revision`. */
export async function saveAttendanceAction(sessionId: number, values: AttendanceValue[], revision: number, context?: TermWriteContext): Promise<ActionResult> {
  return changeAttendanceSessionAction(sessionId, { command: "save", revision, values }, context);
}

export async function deleteAttendanceSessionAction(id: number, revision: number, context?: TermWriteContext): Promise<ActionResult> {
  return changeAttendanceSessionAction(id, { command: "delete", revision }, context);
}

/** ATT-03A: every lifecycle command (D-2), authorized per D-3 and checked against the revision under a row lock. */
export async function changeAttendanceSessionAction(sessionId: number, input: SessionCommandInput, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => changeAttendanceSessionInTerm(sessionId, input), context);
}

const ATTENDANCE_DENIED = () => deniedResult("You do not have permission to make this change.", "forbidden");
async function sessionRoles(sessionId: number): Promise<SessionRoles | ActionDenied> {
  const actor = await actionActor("view_internal_portal");
  if ("ok" in actor) return actor;
  const target = { kind: "attendance_session", sessionId } as const;
  const roles = { taker: await can(actor, "take_attendance", target), reviewer: await can(actor, "review_attendance", target) };
  return roles.taker || roles.reviewer ? roles : ATTENDANCE_DENIED();
}

const REFUSED: Record<SessionCommand, string> = {
  save: "edited", submit: "submitted", reopen: "reopened", lock: "locked", void: "voided", restore: "restored",
  delete: "deleted. Void it with a reason instead",
};

async function changeAttendanceSessionInTerm(sessionId: number, input: SessionCommandInput): Promise<ActionResult> {
  const command = input?.command;
  if (!isSessionCommand(command) || !Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(input.revision) || input.revision < 0) {
    return { ok: false, message: "Attendance request is invalid." };
  }
  const roles = await sessionRoles(sessionId);
  if ("ok" in roles) return roles;
  const values = input.values ?? [];
  if ((command === "save" || command === "submit") && (!Array.isArray(values) || values.some((value) => !Number.isInteger(value?.studentId) || !ATTENDANCE_STATUSES.includes(value?.status as never)))) {
    return { ok: false, message: "Attendance payload is invalid." };
  }
  const reason = parseReason(input.reason, REASON_REQUIRED[command]);
  if (reason === undefined) {
    const message = REASON_REQUIRED[command] === "required" ? `Enter a reason of ${REASON_MIN}–${REASON_MAX} characters.` : `Keep the note to ${REASON_MAX} characters or fewer.`;
    return invalid(message, { reason: [message] });
  }
  if (!await isInActiveTerm("attendance_session", sessionId)) return { ...OUTSIDE_ACTIVE_TERM };
  const term = await getActiveTerm();
  if (command === "restore") {
    // Same per-group serialization as creation, taken before the row lock in the same order as create.
    const [target] = await db.select({ teachingGroupId: attendanceSessions.teachingGroupId }).from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).limit(1);
    if (target) await db.execute(sql`select pg_advisory_xact_lock(${ATTENDANCE_CREATE_LOCK}::integer, ${target.teachingGroupId}::integer)`);
  }
  const [session] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).for("update");
  if (!session || session.termId !== term.id) return stale("The attendance session no longer exists. Reload the page.", "missing");
  if (session.revision !== input.revision) return stale(STALE_SESSION_MESSAGE);
  const decision = decideSession(command, session.status, roles);
  if (!decision.ok) {
    if (decision.reason === "role") return ATTENDANCE_DENIED();
    const message = `A ${stateLabel(session.status).toLowerCase()} session cannot be ${REFUSED[command]}.`;
    return conflicted(message, [{ severity: "blocker", title: "This session's state does not allow that", detail: message }]);
  }
  const existing = await db.select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status, studentCode: students.studentCode })
    .from(attendanceRecords).innerJoin(students, eq(students.id, attendanceRecords.studentId))
    .where(eq(attendanceRecords.sessionId, sessionId)).orderBy(students.studentCode, students.id);
  let changes: StatusChange[] = [];
  if (command === "save" || command === "submit") {
    const allowed = new Set(existing.map((row) => row.studentId));
    const ids = values.map((value) => value.studentId);
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id))) {
      return { ok: false, message: "Attendance can only be saved for students captured in this session." };
    }
    if (command === "submit" && existing.length === 0) return { ok: false, message: "A session with no captured students cannot be submitted." };
    changes = statusChanges(existing, values);
    if (command === "save" && changes.length === 0) return succeeded("No attendance changes to save.", { entityId: sessionId });
  }
  if (command === "restore") {
    const [duplicate] = await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(
      eq(attendanceSessions.termId, session.termId), eq(attendanceSessions.teachingGroupId, session.teachingGroupId),
      eq(attendanceSessions.classDate, session.classDate), ne(attendanceSessions.status, "voided"), ne(attendanceSessions.id, session.id),
      session.startMinutes == null ? isNull(attendanceSessions.startMinutes) : eq(attendanceSessions.startMinutes, session.startMinutes),
      session.endMinutes == null ? isNull(attendanceSessions.endMinutes) : eq(attendanceSessions.endMinutes, session.endMinutes),
    )).limit(1);
    if (duplicate) {
      const time = session.startMinutes != null && session.endMinutes != null ? fmtRange(session.startMinutes, session.endMinutes) : "time not specified";
      const message = `Another active session already exists on ${session.classDate} (${time}). Void that session first; nothing was restored.`;
      return conflicted(message, [{ severity: "blocker", title: "Attendance session already exists", detail: message }]);
    }
  }
  const action = command === "delete" ? "attendance.session.delete" : `attendance.${command}`;
  await auditedChange(action, "attendance_session", async (tx, actor) => {
    if (command === "delete") {
      const records = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
      await tx.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
      await tx.delete(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
      return { result: null, entityId: sessionId, before: { session, records }, detail: { from: session.status, to: null } };
    }
    for (const change of changes) {
      await tx.update(attendanceRecords).set({ status: change.to, updatedAt: new Date() })
        .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.studentId, change.studentId)));
    }
    const now = new Date();
    const set: Partial<typeof attendanceSessions.$inferInsert> = { status: decision.to!, revision: session.revision + 1 };
    if (command === "submit") Object.assign(set, { submittedAt: now, submittedByUserId: actor.id });
    if (command === "lock") Object.assign(set, { lockedAt: now, lockedByUserId: actor.id });
    if (command === "reopen" || command === "restore") Object.assign(set, { lockedAt: null, lockedByUserId: null, voidedAt: null, voidedByUserId: null, voidReason: null });
    if (command === "void") Object.assign(set, { lockedAt: null, lockedByUserId: null, voidedAt: now, voidedByUserId: actor.id, voidReason: reason });
    const [after] = await tx.update(attendanceSessions).set(set).where(eq(attendanceSessions.id, sessionId)).returning();
    const state = (row: typeof session) => ({ status: row.status, revision: row.revision, submittedAt: row.submittedAt, submittedByUserId: row.submittedByUserId,
      lockedAt: row.lockedAt, lockedByUserId: row.lockedByUserId, voidedAt: row.voidedAt, voidedByUserId: row.voidedByUserId, voidReason: row.voidReason });
    // Reopening a locked roll-call keeps its full locked marks as the starting point of the correction.
    const before = command === "reopen" && session.status === "locked"
      ? { ...state(session), records: existing.map(({ studentId, studentCode, status }) => ({ studentId, studentCode, status })) }
      : state(session);
    return { result: null, entityId: sessionId, before, after: state(after),
      detail: { from: session.status, to: after.status, reason: command === "lock" ? null : reason, note: command === "lock" ? reason : null, changes } };
  });
  refresh();
  return succeeded(command === "save" ? `Attendance saved for ${changes.length} changed student(s).` : COMMAND_MESSAGES[command], { entityId: sessionId });
}

/** Reviewer: lock every currently submitted session in one group. `sessionIds` is what the confirmation showed. */
export async function lockSubmittedAttendanceAction(teachingGroupId: number, sessionIds: number[], note: string | null, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => lockSubmittedAttendanceInTerm(teachingGroupId, sessionIds, note), context);
}
async function lockSubmittedAttendanceInTerm(teachingGroupId: number, sessionIds: number[], note: string | null): Promise<ActionResult> {
  if (!Number.isInteger(teachingGroupId) || !Array.isArray(sessionIds) || sessionIds.some((id) => !Number.isInteger(id))) return { ok: false, message: "Attendance request is invalid." };
  const denied = await guardAction("review_attendance", { kind: "teaching_group", teachingGroupId });
  if (denied) return denied;
  const parsed = parseReason(note, "optional");
  if (parsed === undefined) {
    const message = `Keep the note to ${REASON_MAX} characters or fewer.`;
    return invalid(message, { reason: [message] });
  }
  if (!await isInActiveTerm("teaching_group", teachingGroupId)) return { ...OUTSIDE_ACTIVE_TERM };
  const term = await getActiveTerm();
  const rows = await db.select().from(attendanceSessions).where(and(eq(attendanceSessions.termId, term.id),
    eq(attendanceSessions.teachingGroupId, teachingGroupId), eq(attendanceSessions.status, "submitted"))).orderBy(asc(attendanceSessions.id)).for("update");
  const expected = [...new Set(sessionIds)].sort((a, b) => a - b);
  if (rows.length !== expected.length || rows.some((row, index) => row.id !== expected[index])) {
    return stale("The submitted sessions for this group changed. Reload before locking.");
  }
  if (!rows.length) return { ok: false, message: "There are no submitted sessions to lock." };
  for (const session of rows) {
    await auditedChange("attendance.lock", "attendance_session", async (tx, actor) => {
      const [after] = await tx.update(attendanceSessions).set({ status: "locked", lockedAt: new Date(), lockedByUserId: actor.id, revision: session.revision + 1 })
        .where(eq(attendanceSessions.id, session.id)).returning();
      return { result: null, entityId: session.id, before: { status: session.status, revision: session.revision },
        after: { status: after.status, revision: after.revision, lockedAt: after.lockedAt, lockedByUserId: after.lockedByUserId },
        detail: { from: session.status, to: "locked", note: parsed, groupLock: true } };
    });
  }
  refresh();
  return succeeded(`${rows.length} submitted session(s) locked.`);
}

export interface SessionHistoryEvent { id: number; at: string; actor: string; label: string; reason: string | null; note: string | null; changes: StatusChange[]; captured: number | null }
/** Read-only: newest events for one session the user may open (take or review attendance). */
export async function attendanceSessionHistoryAction(sessionId: number, before?: number): Promise<{ ok: true; events: SessionHistoryEvent[]; next: number | null } | { ok: false; message: string }> {
  if (!Number.isInteger(sessionId) || (before !== undefined && !Number.isInteger(before))) return { ok: false, message: "History request is invalid." };
  const roles = await sessionRoles(sessionId);
  if ("ok" in roles) return { ok: false, message: roles.message };
  const rows = await db.select().from(auditEvents).where(and(eq(auditEvents.entity, "attendance_session"), eq(auditEvents.entityId, sessionId), before ? lt(auditEvents.id, before) : undefined))
    .orderBy(desc(auditEvents.id)).limit(31);
  const text = (value: unknown) => typeof value === "string" ? value : null;
  const events = rows.slice(0, 30).map((row) => {
    const detail = (row.detail ?? {}) as Record<string, unknown>;
    const after = (row.after ?? {}) as Record<string, unknown>;
    const changes = Array.isArray(detail.changes) ? (detail.changes as StatusChange[]).filter((change) => change && typeof change.studentCode === "string") : [];
    return { id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, label: sessionActionLabel(row.action, detail.from),
      reason: text(detail.reason), note: text(detail.note), changes, captured: typeof after.studentCount === "number" ? after.studentCount : null };
  });
  return { ok: true, events, next: rows.length > 30 ? rows[29].id : null };
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
