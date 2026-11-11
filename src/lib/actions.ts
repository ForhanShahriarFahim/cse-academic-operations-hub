"use server";

import { requireActiveTerm, withActiveTermContext as withTermContext } from "./active-term";
import type { TermWriteContext } from "./term-context-value";

/**
 * Server actions — every mutation is validated server-side. Conflict
 * validation runs within the commit path; client-side checks are advisory
 * only (spec §18.3). All actions write an audit event.
 */
import { revalidatePath } from "next/cache";
import { db, databaseReadBatch } from "@/db";
import {
  meetings,
  meetingTeachers,
  teachers,
  meetingRooms,
  teachingGroups,
  teachingGroupOfferings,
  courseOfferings,
  externalCommitments,
  scheduleVersions,
  auditEvents,
  attendanceSessions,
  workloadAllocations,
} from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { getPortalData } from "./data";
import { analyzeSchedule } from "./conflicts";
import { buildSnapshot, type MeetingView } from "./serialize";
import { fmtDate, parseTimeToMinutes } from "./time";
import { auditedChange } from "./auth/audit";
import { actionActor, guardAction } from "./auth/action-guard";
import { OUTSIDE_ACTIVE_TERM, isInActiveTerm } from "./term-scope";
import { conflicted, stale, type ActionResult, type ResultIssue } from "./action-result";
import { isForeignKeyViolation, isUniqueViolation } from "./db-errors";
import { lockRooms, RoomAssignmentChanged, roomAssignmentGuard, validateRoomAssignment } from "./room-transaction";
import { assertActiveRooms, lockMoveRooms, retainAssignedRooms } from "./room-lifecycle-transaction";
import { assertGroupMaintenanceClear, assertMeetingMaintenanceClear, assertMaintenanceClear } from "./room-maintenance-transaction";
import { checkPublicationMaintenance } from "./room-publication-maintenance";

// The shared contract lives in ./action-result; this type-only re-export keeps
// existing `import type { ActionResult } from "@/lib/actions"` consumers working.
export type { ActionResult } from "./action-result";

// ---------------------------------------------------------------------------
// Meeting creation / move / delete
// ---------------------------------------------------------------------------

async function buildCandidateView(groupId: number): Promise<MeetingView | null> {
  const [group] = await db.select().from(teachingGroups).where(eq(teachingGroups.id, groupId));
  if (!group) return null;
  const data = await getPortalData();
  const course = data.courses.find((c) => c.id === group.courseId);
  if (!course) return null;
  const links = await db.select().from(teachingGroupOfferings).where(eq(teachingGroupOfferings.teachingGroupId, groupId));
  const offerings = await databaseReadBatch(
    links.map((l) => () => db.select().from(courseOfferings).where(eq(courseOfferings.id, l.offeringId)).then((r) => r[0])),
  );
  const audiences = offerings
    .map((o) => {
      const b = o ? data.batches.find((x) => x.id === o.batchId) : null;
      return b
        ? { batchId: b.id, batchLabel: b.label, stream: b.stream, semester: b.semester, studentCount: b.studentCount, countStatus:b.countStatus }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => !!a);
  return {
    id: -1,
    teachingGroupId: group.id,
    dayOfWeek: 0,
    startMinutes: 0,
    endMinutes: 0,
    courseCode: course.code,
    courseTitle: course.title,
    courseType: course.courseType,
    courseCredits: course.credits,
    requiredRoomCapability: course.requiredRoomCapability,
    owningDepartmentCode: course.owningDepartmentCode,
    deliveryMode: group.deliveryMode,
    isException: false,
    exceptionNote: null,
    customTimeLabel: null,
    highlightColor: null,
    pendingReconciliation: group.pendingReconciliation,
    teachers: [],
    rooms: [],
    audiences,
    externalAudienceLabel: group.externalAudienceLabel,
    externalStudentCount: group.externalStudentCount,
  };
}

export async function createMeetingAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => createMeetingActionInTerm(formData), context ?? formData);
}
async function createMeetingActionInTerm(formData: FormData): Promise<ActionResult> {
  const groupId = Number(formData.get("teachingGroupId"));
  const denied = await guardAction("manage_routine", { kind: "teaching_group", teachingGroupId: groupId });
  if (denied) return denied;
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const start = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
  const end = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
  const selectedIds = (name: string) => [...new Set(formData.getAll(name).map((v) => Number(v)))].filter((n) => Number.isSafeInteger(n) && n > 0);
  const teacherIds = selectedIds("teacherIds");
  const roomIds = selectedIds("roomIds");
  const isException = formData.get("isException") === "on";
  const exceptionNote = String(formData.get("exceptionNote") ?? "").trim() || null;
  const customTimeLabel = String(formData.get("customTimeLabel") ?? "").trim() || null;

  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, message: "Select a teaching group." };
  if (!await isInActiveTerm("teaching_group", groupId)) return { ...OUTSIDE_ACTIVE_TERM };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return { ok: false, message: "Invalid day." };
  if (start == null || end == null) return { ok: false, message: "Enter valid times, e.g. 9:30 AM and 10:45 AM." };
  if (end <= start) return { ok: false, message: "End time must be after start time." };
  if (teacherIds.length === 0) return { ok: false, message: "Assign at least one teacher." };
  if (roomIds.length === 0) return { ok: false, message: "Reserve at least one room." };

  const data = await getPortalData();
  const inactive = data.teachers.filter((t) => teacherIds.includes(t.id) && t.status === "inactive");
  if (inactive.length) return { ok: false, message: `${inactive.map((t) => t.shortCode).join(", ")} ${inactive.length === 1 ? "is" : "are"} inactive. Reactivate on the teacher page before assigning new classes.` };
  const candidate = await buildCandidateView(groupId);
  if (!candidate) return { ok: false, message: "Teaching group not found." };
  candidate.dayOfWeek = dayOfWeek;
  candidate.startMinutes = start;
  candidate.endMinutes = end;
  candidate.isException = isException;
  candidate.exceptionNote = exceptionNote;
  candidate.teachers = data.teachers
    .filter((t) => teacherIds.includes(t.id))
    .map((t) => ({
      id: t.id, shortCode: t.shortCode, fullName: t.fullName,
      homeDepartmentCode: t.homeDepartmentCode, designation: t.designation,
      isExternalCse: t.homeDepartmentCode !== "CSE", role: "instructor",
    }));
  candidate.rooms = data.rooms
    .filter((r) => roomIds.includes(r.id))
    .map((r) => ({ id: r.id, code: r.code, building: r.building, roomType: r.roomType, capabilities: r.capabilities, capacity: r.capacity }));

  const issues = analyzeSchedule({
    meetings: [...data.meetings, candidate],
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    maintenance: data.maintenance,
    windows: data.windows,
  }).filter((i) => i.meetingIds.includes(-1));
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, message: `${blockers.length} blocking conflict(s) — placement rejected.`, issues };
  }

  const roomFailure = await roomAssignmentGuard(async () => { await auditedChange("meeting.create", "meeting", async (tx, actor) => {
    await lockRooms(tx, roomIds);
    await validateRoomAssignment(tx, groupId, roomIds);
    await assertGroupMaintenanceClear(tx, groupId, roomIds, { dayOfWeek, startMinutes: start, endMinutes: end });
    const [m] = await tx.insert(meetings).values({
      teachingGroupId: groupId, dayOfWeek, startMinutes: start, endMinutes: end,
      isException, exceptionNote, customTimeLabel,
    }).returning();
    await tx.insert(meetingTeachers).values(teacherIds.map((tid) => ({ meetingId: m.id, teacherId: tid })));
    await tx.insert(meetingRooms).values(roomIds.map((rid) => ({ meetingId: m.id, roomId: rid })));
    await retainAssignedRooms(tx, actor, roomIds, `class #${m.id}`);
    return { result: null, entityId: m.id, after: { groupId, dayOfWeek, start, end, teacherIds, roomIds } };
  }); });
  if (roomFailure) return roomFailure;

  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting scheduled.", issues };
}

export async function moveMeetingAction(
  meetingId: number,
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => moveMeetingActionInTerm(meetingId, dayOfWeek, startMinutes, endMinutes), context);
}
async function moveMeetingActionInTerm(
  meetingId: number,
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
): Promise<ActionResult> {
  const denied = await guardAction("manage_routine", { kind: "meeting", meetingId });
  if (denied) return denied;
  if (!Number.isInteger(meetingId)) return { ok: false, message: "Invalid meeting." };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !Number.isInteger(startMinutes) || !Number.isInteger(endMinutes) || startMinutes < 0 || endMinutes > 1440) return { ok: false, message: "Choose a valid day and exact times." };
  if (endMinutes <= startMinutes) return { ok: false, message: "End time must be after start time." };
  const data = await getPortalData();
  const existing = data.meetings.find((m) => m.id === meetingId);
  if (!existing) return { ok: false, message: "Meeting not found — it may have been changed by another user. Reload and try again." };

  const moved: MeetingView = { ...existing, dayOfWeek, startMinutes, endMinutes };
  const issues = analyzeSchedule({
    meetings: [...data.meetings.filter((m) => m.id !== meetingId), moved],
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    maintenance: data.maintenance,
    windows: data.windows,
  }).filter((i) => i.meetingIds.includes(meetingId));
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, message: `${blockers.length} blocking conflict(s) — move rejected, original placement kept.`, issues };
  }

  const roomFailure = await roomAssignmentGuard(async () => { await auditedChange("meeting.move", "meeting", async (tx) => {
    await lockMoveRooms(tx, [meetingId]);
    await assertMeetingMaintenanceClear(tx, meetingId, { dayOfWeek, startMinutes, endMinutes });
    await tx.update(meetings).set({ dayOfWeek, startMinutes, endMinutes }).where(eq(meetings.id, meetingId));
    return { result: null, entityId: meetingId,
      before: { dayOfWeek: existing.dayOfWeek, startMinutes: existing.startMinutes, endMinutes: existing.endMinutes },
      after: { dayOfWeek, startMinutes, endMinutes } };
  }); });
  if (roomFailure) return roomFailure;
  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting moved.", issues };
}

export interface MeetingUpdate {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  teacherIds: number[];
  roomIds: number[];
  isException: boolean;
  exceptionNote: string | null;
}

/**
 * Change a class's day, times, teachers, rooms and exception note as one
 * validated, audited change (UX-01 amendment A). Teachers kept on the class
 * keep their role; newly added teachers are instructors.
 */
export async function updateMeetingAction(meetingId: number, update: MeetingUpdate, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => updateMeetingActionInTerm(meetingId, update), context);
}
async function updateMeetingActionInTerm(meetingId: number, update: MeetingUpdate): Promise<ActionResult> {
  const denied = await guardAction("manage_routine", { kind: "meeting", meetingId });
  if (denied) return denied;
  if (!Number.isInteger(meetingId)) return { ok: false, message: "Invalid meeting." };
  if (!await isInActiveTerm("meeting", meetingId)) return { ...OUTSIDE_ACTIVE_TERM };
  const { dayOfWeek, startMinutes, endMinutes } = update;
  const teacherIds = [...new Set(update.teacherIds)].filter((id) => Number.isInteger(id) && id > 0);
  const roomIds = [...new Set(update.roomIds)].filter((id) => Number.isInteger(id) && id > 0);
  const exceptionNote = update.exceptionNote?.trim() || null;
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return { ok: false, message: "Invalid day." };
  if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes) || startMinutes < 0 || endMinutes > 24 * 60) {
    return { ok: false, message: "Enter valid times, e.g. 9:30 AM and 10:45 AM." };
  }
  if (endMinutes <= startMinutes) return { ok: false, message: "End time must be after start time." };
  if (teacherIds.length === 0) return { ok: false, message: "Assign at least one teacher." };
  if (roomIds.length === 0) return { ok: false, message: "Reserve at least one room." };
  if (update.isException && !exceptionNote) return { ok: false, message: "Add a note explaining the approved exception." };

  const data = await getPortalData();
  const existing = data.meetings.find((m) => m.id === meetingId);
  if (!existing) return { ok: false, message: "Meeting not found — it may have been changed by another user. Reload and try again." };
  const teachers = data.teachers.filter((t) => teacherIds.includes(t.id));
  const rooms = data.rooms.filter((r) => roomIds.includes(r.id) && r.isActive);
  if (teachers.length !== teacherIds.length) return { ok: false, message: "One of the selected teachers no longer exists. Reload and try again." };
  const inactive = teachers.filter((t) => t.status === "inactive" && !existing.teachers.some((current) => current.id === t.id));
  if (inactive.length) return { ok: false, message: `${inactive.map((t) => t.shortCode).join(", ")} ${inactive.length === 1 ? "is" : "are"} inactive. Reactivate on the teacher page before assigning new classes.` };
  if (rooms.length !== roomIds.length) return { ok: false, message: "One of the selected rooms is not available. Reload and try again." };

  const roleOf = new Map(existing.teachers.map((t) => [t.id, t.role]));
  const updated: MeetingView = {
    ...existing,
    dayOfWeek, startMinutes, endMinutes,
    isException: update.isException,
    exceptionNote,
    teachers: teachers.map((t) => ({
      id: t.id, shortCode: t.shortCode, fullName: t.fullName,
      homeDepartmentCode: t.homeDepartmentCode, designation: t.designation,
      isExternalCse: t.homeDepartmentCode !== "CSE", role: roleOf.get(t.id) ?? "instructor",
    })),
    rooms: rooms.map((r) => ({ id: r.id, code: r.code, building: r.building, roomType: r.roomType, capabilities: r.capabilities, capacity: r.capacity })),
  };
  const issues = analyzeSchedule({
    meetings: [...data.meetings.filter((m) => m.id !== meetingId), updated],
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    maintenance: data.maintenance,
    windows: data.windows,
  }).filter((i) => i.meetingIds.includes(meetingId));
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, message: `${blockers.length} blocking conflict(s) — change rejected, the class is unchanged.`, issues };
  }

  const before = {
    dayOfWeek: existing.dayOfWeek, startMinutes: existing.startMinutes, endMinutes: existing.endMinutes,
    teacherIds: existing.teachers.map((t) => t.id), roomIds: existing.rooms.map((r) => r.id),
    isException: existing.isException, exceptionNote: existing.exceptionNote ?? null,
  };
  const roomFailure = await roomAssignmentGuard(async () => { await auditedChange("meeting.update", "meeting", async (tx, actor) => {
    const [current] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).for("update");
    if (!current) throw new RoomAssignmentChanged(["The class no longer exists; reload before saving"]);
    const storedRooms = await tx.select({ roomId: meetingRooms.roomId }).from(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
    await lockRooms(tx, [...roomIds, ...storedRooms.map((row) => row.roomId)]);
    await validateRoomAssignment(tx, current?.teachingGroupId ?? existing.teachingGroupId, roomIds);
    await assertGroupMaintenanceClear(tx, current.teachingGroupId, roomIds, { dayOfWeek, startMinutes, endMinutes }, meetingId);
    await tx.update(meetings).set({ dayOfWeek, startMinutes, endMinutes, isException: update.isException, exceptionNote })
      .where(eq(meetings.id, meetingId));
    await tx.delete(meetingTeachers).where(eq(meetingTeachers.meetingId, meetingId));
    await tx.insert(meetingTeachers).values(updated.teachers.map((t) => ({ meetingId, teacherId: t.id, role: t.role })));
    // Rooms kept on the class keep their role (primary / alternative / segment).
    const previousRooms = await tx.select({ roomId: meetingRooms.roomId, roomRole: meetingRooms.roomRole })
      .from(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
    const roomRoleOf = new Map(previousRooms.map((row) => [row.roomId, row.roomRole]));
    await tx.delete(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
    await tx.insert(meetingRooms).values(roomIds.map((roomId) => ({ meetingId, roomId, roomRole: roomRoleOf.get(roomId) ?? "primary" })));
    await retainAssignedRooms(tx, actor, roomIds, `class #${meetingId}`);
    return { result: null, entityId: meetingId, before,
      after: { dayOfWeek, startMinutes, endMinutes, teacherIds, roomIds, isException: update.isException, exceptionNote } };
  }); });
  if (roomFailure) return roomFailure;
  revalidatePath("/", "layout");
  return { ok: true, message: `${existing.courseCode} updated.`, issues };
}

export async function deleteMeetingAction(meetingId: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => deleteMeetingActionInTerm(meetingId), context);
}
async function deleteMeetingActionInTerm(meetingId: number): Promise<ActionResult> {
  const denied = await guardAction("manage_routine", { kind: "meeting", meetingId });
  if (denied) return denied;
  if (!await isInActiveTerm("meeting", meetingId)) return { ...OUTSIDE_ACTIVE_TERM };
  try {
    await auditedChange("meeting.delete", "meeting", async (tx) => {
      const [previous] = await tx.select().from(meetings).where(eq(meetings.id, meetingId)).for("update");
      const referencedRooms = await tx.select({ roomId: meetingRooms.roomId }).from(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
      await lockRooms(tx, referencedRooms.map((row) => row.roomId));
      const sessions = await tx.select({ classDate: attendanceSessions.classDate }).from(attendanceSessions)
        .where(eq(attendanceSessions.meetingId, meetingId)).orderBy(attendanceSessions.classDate);
      if (sessions.length) {
        const dates = [...new Set(sessions.map((session) => session.classDate))];
        const listed = dates.slice(0, 5).map(fmtDate).join(", ") + (dates.length > 5 ? ` and ${dates.length - 5} more` : "");
        throw new DeleteBlocked(MEETING_IN_USE, [{
          severity: "blocker",
          title: "Attendance recorded",
          detail: `Attendance was taken in this class on ${listed}. Keep the class, or change its time instead.`,
        }]);
      }
      await tx.delete(meetingTeachers).where(eq(meetingTeachers.meetingId, meetingId));
      await tx.delete(meetingRooms).where(eq(meetingRooms.meetingId, meetingId));
      await tx.delete(meetings).where(eq(meetings.id, meetingId));
      return { result: null, entityId: meetingId, before: previous ?? null };
    });
  } catch (error) {
    const blocked = blockedDelete(error, "class");
    if (blocked) return blocked;
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Meeting removed from the working draft." };
}

// ---------------------------------------------------------------------------
// External commitments (OD)
// ---------------------------------------------------------------------------

export async function createExternalAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => createExternalActionInTerm(formData), context ?? formData);
}
async function createExternalActionInTerm(formData: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  const kind = String(formData.get("kind") ?? "");
  const counterpartDepartment = String(formData.get("counterpartDepartment") ?? "").trim();
  const optionalId = (name: string): number | null | undefined => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : undefined;
  };
  const teacherId = optionalId("teacherId");
  const roomId = optionalId("roomId");
  if (teacherId === undefined || roomId === undefined) return { ok: false, message: "Choose a teacher and room from the lists, or leave them blank." };
  if (teacherId) {
    const [teacher] = await db.select({ status: teachers.status, shortCode: teachers.shortCode }).from(teachers).where(eq(teachers.id, teacherId)).limit(1);
    if (!teacher) return { ok: false, message: "That teacher record no longer exists. Reload and choose again." };
    if (teacher.status === "inactive") return { ok: false, message: `${teacher.shortCode} is inactive. Reactivate on the teacher page before recording new work.` };
  }
  const dayRaw = formData.get("dayOfWeek");
  const dayOfWeek = dayRaw === "" || dayRaw == null ? null : Number(dayRaw);
  const start = formData.get("startTime") ? parseTimeToMinutes(String(formData.get("startTime"))) : null;
  const end = formData.get("endTime") ? parseTimeToMinutes(String(formData.get("endTime"))) : null;
  const courseLabel = String(formData.get("courseLabel") ?? "").trim() || null;
  const audienceLabel = String(formData.get("audienceLabel") ?? "").trim() || null;
  const creditsRaw = String(formData.get("credits") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!["teaching", "room_reservation", "combined", "unresolved_note"].includes(kind)) {
    return { ok: false, message: "Invalid commitment kind." };
  }
  if (!counterpartDepartment) return { ok: false, message: "Counterpart department is required." };
  if (creditsRaw && !/^\d{1,2}(?:\.\d)?$/.test(creditsRaw)) return { ok: false, message: "Enter credits from 0 to 99.9 with at most one decimal place, or leave blank." };
  if (kind !== "unresolved_note" && (dayOfWeek == null || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || start == null || end == null || end <= start)) {
    return { ok: false, message: "Structured commitments need a day and a valid time range." };
  }

  // Completeness level derived from actual data — not from the printed OD row.
  let level = "D";
  if (kind === "unresolved_note") level = "D";
  else if (kind === "room_reservation") level = teacherId ? "A" : "C";
  else if (teacherId && courseLabel && roomId && creditsRaw) level = "A";
  else if (teacherId) level = "B";
  else level = "C";

  const term = (await getPortalData()).term;
  const roomFailure = await roomAssignmentGuard(async () => { await auditedChange("external.create", "external_commitment", async (tx, actor) => {
    if (roomId) { await lockRooms(tx, [roomId]); await assertActiveRooms(tx, [roomId]); }
    if (roomId && ["room_reservation", "combined"].includes(kind)) await assertMaintenanceClear(tx, [roomId], { termStart: term.startDate, termEnd: term.endDate }, { dayOfWeek, startMinutes: start, endMinutes: end });
    const [row] = await tx.insert(externalCommitments).values({
      termId: term.id, kind, completenessLevel: level, counterpartDepartment,
      teacherId, roomId, courseLabel, audienceLabel,
      dayOfWeek: kind === "unresolved_note" ? null : dayOfWeek,
      startMinutes: kind === "unresolved_note" ? null : start,
      endMinutes: kind === "unresolved_note" ? null : end,
      credits: creditsRaw || null, verificationStatus: "pending",
      source: "Manual entry via OD manager", notes,
    }).returning();
    if (roomId) await retainAssignedRooms(tx, actor, [roomId], `OD #${row.id}`);
    return { result: null, entityId: row.id, after: row };
  }); });
  if (roomFailure) return roomFailure;
  revalidatePath("/", "layout");
  return { ok: true, message: `External commitment recorded (completeness level ${level}).` };
}

export async function verifyExternalAction(id: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => verifyExternalActionInTerm(id), context);
}
async function verifyExternalActionInTerm(id: number): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  if (!await isInActiveTerm("external_commitment", id)) return { ...OUTSIDE_ACTIVE_TERM };
  await auditedChange("external.verify", "external_commitment", async (tx) => {
    const [previous] = await tx.select().from(externalCommitments).where(eq(externalCommitments.id, id)).limit(1);
    if (previous?.roomId) await lockRooms(tx, [previous.roomId]);
    const [updated] = await tx.update(externalCommitments)
      .set({ verificationStatus: "verified", lastVerifiedAt: new Date() })
      .where(eq(externalCommitments.id, id)).returning();
    return { result: null, entityId: id, before: previous ?? null, after: updated ?? null };
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Commitment verified." };
}

export async function deleteExternalAction(id: number, context?: TermWriteContext): Promise<ActionResult> {
  return withTermContext(() => deleteExternalActionInTerm(id), context);
}
async function deleteExternalActionInTerm(id: number): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  if (!await isInActiveTerm("external_commitment", id)) return { ...OUTSIDE_ACTIVE_TERM };
  try {
    await auditedChange("external.delete", "external_commitment", async (tx) => {
      const [reference] = await tx.select({ roomId: externalCommitments.roomId }).from(externalCommitments).where(eq(externalCommitments.id, id)).for("update");
      if (reference?.roomId) await lockRooms(tx, [reference.roomId]);
      const allocations = await tx.select({ shortCode: teachers.shortCode, units: workloadAllocations.units })
        .from(workloadAllocations).innerJoin(teachers, eq(teachers.id, workloadAllocations.teacherId))
        .where(eq(workloadAllocations.externalCommitmentId, id)).orderBy(teachers.shortCode);
      if (allocations.length) {
        throw new DeleteBlocked(EXTERNAL_IN_USE, allocations.map((allocation) => ({
          severity: "blocker" as const,
          title: "Counts toward workload",
          detail: `${allocation.shortCode}'s workload counts this commitment (${allocation.units} units).`,
        })));
      }
      const [previous] = await tx.delete(externalCommitments).where(eq(externalCommitments.id, id)).returning();
      return { result: null, entityId: id, before: previous ?? null };
    });
  } catch (error) {
    const blocked = blockedDelete(error, "commitment");
    if (blocked) return blocked;
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Commitment removed." };
}

// A delete refused because other records still use the row (BUG-27). Thrown inside
// the audited transaction so nothing is deleted and no audit event is written.
const MEETING_IN_USE = "This class can't be removed: attendance is recorded against it.";
const EXTERNAL_IN_USE = "This commitment can't be removed: it counts toward teaching workload.";

class DeleteBlocked extends Error {
  constructor(message: string, readonly issues: ResultIssue[]) { super(message); }
}

/** The conflict result for a blocked delete, including a reference that appeared after the check. */
function blockedDelete(error: unknown, what: "class" | "commitment"): ActionResult | null {
  if (error instanceof DeleteBlocked) return conflicted(error.message, error.issues);
  if (isForeignKeyViolation(error)) {
    return conflicted(`This ${what} can't be removed: another record uses it.`, [{ severity: "blocker", title: "In use", detail: "Another record started using it just now. Reload the page to see what." }]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Publication — atomic version cut with full server-side validation
// ---------------------------------------------------------------------------

/** First key of the per-term publication advisory lock (BUG-25); the second key is the term id. */
const PUBLICATION_LOCK = 61025;
const publishedAtText = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const PUBLICATION_PAGE_STALE = "The version list on this page is out of date. Nothing was published. Refresh the page, review the current version, then publish again if a new version is still needed.";

/**
 * `expectedLatestVersionId` is the highest-numbered version the approver's page
 * showed (null when it showed none). It is untrusted input: anything but the
 * current latest version, including a missing value, publishes nothing.
 */
export async function publishAction(changeSummary: string, context?: TermWriteContext, expectedLatestVersionId?: number | null): Promise<ActionResult> {
  return withTermContext(() => publishActionInTerm(changeSummary, expectedLatestVersionId), context);
}
async function publishActionInTerm(changeSummary: string, expectedLatestVersionId: unknown): Promise<ActionResult> {
  const actor = await actionActor("approve_publication");
  if ("ok" in actor) return actor;
  // BUG-25: publications of one term run one at a time. Lock order: term context
  // (share, already held) -> this lock -> room rows. Only publishers take this
  // lock, and they take it before any draft read, so a waiting publisher sees
  // the winner's committed version. It is released when the transaction ends.
  const activeTerm = await requireActiveTerm();
  await db.execute(sql`select pg_advisory_xact_lock(${PUBLICATION_LOCK}::integer, ${activeTerm.id}::integer)`);
  const [latest] = await db.select().from(scheduleVersions)
    .where(eq(scheduleVersions.termId, activeTerm.id))
    .orderBy(desc(scheduleVersions.versionNumber), desc(scheduleVersions.id)).limit(1);
  const expected = expectedLatestVersionId === null || (typeof expectedLatestVersionId === "number" && Number.isSafeInteger(expectedLatestVersionId) && expectedLatestVersionId > 0)
    ? expectedLatestVersionId : undefined;
  if (expected === undefined || (latest?.id ?? null) !== expected) {
    return stale(expected !== undefined && latest?.state === "published" && latest.publishedAt
      ? `Version ${latest.versionNumber} was published by ${latest.publishedBy ?? "another approver"} on ${publishedAtText.format(latest.publishedAt)} while this page was open. Nothing was published. Review the current version, then publish again if a new version is still needed.`
      : PUBLICATION_PAGE_STALE);
  }
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    maintenance: data.maintenance,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  if (blockers.length > 0) {
    return {
      ok: false,
      message: `Publication blocked — ${blockers.length} blocking issue(s) must be resolved first.`,
      issues: blockers,
    };
  }

  const nextVersion = (latest?.versionNumber ?? 0) + 1;
  const snapshot = buildSnapshot({
    meetings: data.meetings,
    term: {
      id: data.term.id,
      name: data.term.name,
      academicYear: data.term.academicYear,
      effectiveFrom: data.term.effectiveFrom,
    },
    versionNumber: nextVersion,
    batches: data.batches,
    breaks: data.breaks,
      externals: data.externals,
      issues,
      metadata: data.publicationMetadata,
      timeGrid: data.timeGrid,
  });

  // Atomic state transition: supersede the old published version, insert new.
  let publicationFailure: ActionResult | null;
  try { publicationFailure = await roomAssignmentGuard(async () => { await db.transaction(async (tx) => {
    const maintenanceCheck = await checkPublicationMaintenance(tx, data);
    await tx.update(scheduleVersions)
      .set({ state: "superseded", effectiveTo: data.term.effectiveFrom })
      .where(and(
        eq(scheduleVersions.termId, data.term.id),
        eq(scheduleVersions.state, "published"),
      ));
    const [v] = await tx.insert(scheduleVersions).values({
      termId: data.term.id,
      versionNumber: nextVersion,
      state: "published",
      effectiveFrom: data.term.effectiveFrom,
      publishedAt: new Date(),
      publishedBy: actor.displayName,
      changeSummary: changeSummary || `Version ${nextVersion}`,
      snapshot,
    }).returning();
    await tx.insert(auditEvents).values({
      actor: actor.displayName,
      actorUserId: actor.id,
      actorDisplayName: actor.displayName,
      actorKind: "user",
      action: "publish",
      entity: "schedule_version",
      entityId: v.id,
      before: latest ? { versionNumber: latest.versionNumber, state: latest.state } : null,
      after: { versionNumber: nextVersion, state: "published", meetingCount: data.meetings.length },
      detail: { version: nextVersion, warnings: issues.length, maintenanceCheck },
    });
  }); }); } catch (error) {
    // Backstop: a version row written outside the lock. The savepoint above is
    // already rolled back, so the supersede and audit rows are not kept.
    if (isUniqueViolation(error)) return stale("Another version was saved for this routine at the same moment. Nothing was published. Refresh the page, review the current version, then publish again if a new version is still needed.");
    throw error;
  }
  if (publicationFailure) return publicationFailure;

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Version ${nextVersion} published (${data.meetings.length} canonical meetings, ${issues.length} advisory warning(s) acknowledged).`,
  };
}
