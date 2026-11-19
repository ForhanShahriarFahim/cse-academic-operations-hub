/**
 * Query adapters for the attendance and extra-load modules. Pages consume
 * these serialized views instead of depending on Drizzle table shapes.
 */
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, databaseReadBatch } from "@/db";
import {
  attendanceRecords,
  attendanceSessions,
  auditEvents,
  extraLoadClasses,
  extraLoadManualSummaries,
  portalUsers,
  students,
} from "@/db/schema";
import { getPortalData, type PortalData } from "./data";
import { assertTermContext } from "./term-context";
import { can, requireActor } from "./auth";
import type { Actor } from "./auth/policy";
import { redirect } from "next/navigation";
import { summarizeAttendance } from "./attendance";
import { countsInSummary, isUnsubmitted } from "./attendance-lifecycle";
import { currentRoster } from "./current-roster";
import { loadTermPolicy, recordedDate } from "./policy-store";
import { evaluationDate, fromPaisa, manualAmount, toPaisa, versionOn, versionsUsed } from "./policy-versions";
import { dhakaToday } from "./room-lifecycle";
import { allocationTotals } from "./workload";

export interface TeachingGroupOption {
  id: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  audience: string;
  teacherIds: number[];
}

/** SET-01B: the term's policy timeline and the figures in force on its evaluation date (today, or the end of a completed term). */
export async function getTermPolicyView(term: { id: number; startDate: string; endDate: string; status: string }) {
  const policy = await loadTermPolicy(term.id);
  const timeline = policy?.timeline ?? null;
  const when = evaluationDate(term, dhakaToday());
  const current = timeline ? versionOn(timeline, when) : null;
  return { policy, timeline, evaluationDate: when, current, figures: current?.figures ?? null };
}

export function groupOptions(data: PortalData): TeachingGroupOption[] {
  return data.coverage.map((coverage) => {
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
    };
  }).sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.audience.localeCompare(b.audience));
}

export async function getExtraLoadData(from?: string, to?: string) {
  const data = await getPortalData();
  const actor = await requireActor();
  const view = await getTermPolicyView(data.term);
  const { timeline } = view;
  const canReview = await can(actor, "review_extra_load") || await can(actor, "view_payment_reports");
  if (!canReview && (actor.teacherId == null || !await can(actor, "submit_extra_load", { kind: "teacher", teacherId: actor.teacherId }))) {
    redirect("/forbidden");
  }
  const groups = groupOptions(data).filter((group) => canReview || actor.teacherId != null && group.teacherIds.includes(actor.teacherId));
  // Compute on the full active-term allocation set, then scope returned totals.
  const loads = new Map([...allocationTotals(data.allocations)]
    .filter(([teacherId]) => canReview || teacherId === actor.teacherId)
    .map(([teacherId, total]) => [teacherId, total.workloadUnits]));
  const where = from && to
    ? and(eq(extraLoadClasses.termId, data.term.id), gte(extraLoadClasses.classDate, from), lte(extraLoadClasses.classDate, to))
    : eq(extraLoadClasses.termId, data.term.id);
  const [classRows, manualRows] = await Promise.all([
    db.select().from(extraLoadClasses).where(where).orderBy(asc(extraLoadClasses.classDate), asc(extraLoadClasses.startMinutes)),
    db.select().from(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.termId, data.term.id)).orderBy(asc(extraLoadManualSummaries.teacherName)),
  ]);
  const classes = classRows.filter((row) => canReview || row.teacherId === actor.teacherId).map((row) => {
    const teacher = data.teachers.find((item) => item.id === row.teacherId);
    // SET-01B D-2: each class is paid at the rate in force on its own date.
    const version = timeline ? versionOn(timeline, row.classDate) : null;
    return {
      ...row,
      rate: version?.figures.extraClassRate ?? null,
      policyVersion: version?.version ?? null,
      teacherName: teacher?.fullName ?? "Unknown teacher",
      teacherDesignation: teacher?.designation ?? null,
      teacherShortCode: teacher?.shortCode ?? "—",
    };
  });
  const teacherSummaries = data.teachers.filter((teacher) => canReview || teacher.id === actor.teacherId).map((teacher) => {
    const entries = classes.filter((row) => row.teacherId === teacher.id);
    return {
      teacher,
      assignedWorkloadUnits: loads.get(teacher.id) ?? 0,
      hasUnverifiedExternal: data.externals.some((entry) => entry.teacherId === teacher.id && entry.verificationStatus === "pending"),
      classCount: entries.length,
      amount: timeline ? fromPaisa(entries.reduce((sum, row) => sum + toPaisa(row.rate!), 0)) : null,
      rates: [...new Set(entries.map((row) => row.rate))].filter((rate): rate is number => rate != null),
    };
  }).filter((row) => row.assignedWorkloadUnits > 0 || row.classCount > 0);
  const manualSummaries = (canReview ? manualRows : []).map((row) => {
    const rateOverride = row.rateOverride == null ? null : Number(row.rateOverride);
    const amountOverride = row.amountOverride == null ? null : Number(row.amountOverride);
    // Manual rows without an override use the rate in force on their recording date.
    const priced = timeline ? manualAmount(timeline, { recordedDate: recordedDate(row.createdAt), classCount: row.classCount, rateOverride, amountOverride })
      : amountOverride != null ? { rate: rateOverride, policyVersion: null, amount: amountOverride } : null;
    return { ...row, rateOverride, amountOverride, rate: priced?.rate ?? rateOverride, policyVersion: priced?.policyVersion ?? null, amount: priced?.amount ?? null };
  });
  const used = timeline ? versionsUsed(timeline, [...classes.map((row) => row.policyVersion), ...manualSummaries.map((row) => row.policyVersion)]) : [];
  await assertTermContext(data.writeContext);
  return {
    data, policy: view.figures, policyVersion: view.current?.version ?? null, policyMissing: !timeline, versionsUsed: used,
    groups, loads, classes, teacherSummaries, manualSummaries,
  };
}

export async function getAttendanceData(selectedGroupId: number, portal?: { data: PortalData; actor: Actor }) {
  const data = portal?.data ?? await getPortalData();
  const actor = portal?.actor ?? await requireActor();
  const candidate = groupOptions(data).find(group => group.id === selectedGroupId);
  const target = { kind: "teaching_group", teachingGroupId: selectedGroupId } as const;
  const canManageRosters = !!candidate && await can(actor, "manage_rosters", target);
  const canTakeAttendance = !!candidate && await can(actor, "take_attendance", target);
  const canReviewAttendance = !!candidate && await can(actor, "review_attendance", target);
  const selectedGroup = canManageRosters || canTakeAttendance || canReviewAttendance ? candidate : undefined;
  if (!selectedGroup) {
    await assertTermContext(data.writeContext);
    return { data, selectedGroup: null, canManageRosters, canTakeAttendance, canReviewAttendance: false, roster: [], sessions: [], summaries: [], maximum: null, maximumVersion: null, unsubmitted: 0 };
  }

  const [view, roster, sessionRows] = await databaseReadBatch([
    () => getTermPolicyView(data.term),
    () => currentRoster(data.term.id, selectedGroup.id),
    () => db.select({ id: attendanceSessions.id, classDate: attendanceSessions.classDate, phase: attendanceSessions.phase,
      startMinutes: attendanceSessions.startMinutes, endMinutes: attendanceSessions.endMinutes, status: attendanceSessions.status, revision: attendanceSessions.revision,
      submittedAt: attendanceSessions.submittedAt, submittedByUserId: attendanceSessions.submittedByUserId, lockedAt: attendanceSessions.lockedAt,
      lockedByUserId: attendanceSessions.lockedByUserId, voidedAt: attendanceSessions.voidedAt, voidedByUserId: attendanceSessions.voidedByUserId,
      voidReason: attendanceSessions.voidReason }).from(attendanceSessions).where(and(
      eq(attendanceSessions.termId, data.term.id),
      eq(attendanceSessions.teachingGroupId, selectedGroup.id),
    )).orderBy(asc(attendanceSessions.classDate), asc(attendanceSessions.id)),
  ]);
  const sessionIds = sessionRows.map((row) => row.id);
  const recordRows = sessionIds.length
    ? await db.select({ sessionId: attendanceRecords.sessionId, studentId: attendanceRecords.studentId, status: attendanceRecords.status,
      studentCode: students.studentCode, fullName: students.fullName }).from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId)).where(inArray(attendanceRecords.sessionId, sessionIds))
      .orderBy(students.studentCode, students.id)
    : [];
  const userIds = [...new Set(sessionRows.flatMap((row) => [row.submittedByUserId, row.lockedByUserId, row.voidedByUserId]).filter((id): id is number => id != null))];
  const reopenedIds = sessionRows.filter((row) => row.status === "reopened").map((row) => row.id);
  const [users, reasons] = await databaseReadBatch([
    () => userIds.length ? db.select({ id: portalUsers.id, displayName: portalUsers.displayName }).from(portalUsers).where(inArray(portalUsers.id, userIds)) : [],
    () => reopenedIds.length ? db.select({ entityId: auditEvents.entityId, detail: auditEvents.detail }).from(auditEvents).where(and(eq(auditEvents.entity, "attendance_session"),
      inArray(auditEvents.entityId, reopenedIds), inArray(auditEvents.action, ["attendance.reopen", "attendance.restore"]))).orderBy(desc(auditEvents.id)) : [],
  ]);
  const name = (id: number | null) => id == null ? null : users.find((user) => user.id === id)?.displayName ?? "Unknown user";
  const at = (value: Date | null) => value?.toISOString() ?? null;
  const sessions = sessionRows.map(({ submittedByUserId, lockedByUserId, voidedByUserId, submittedAt, lockedAt, voidedAt, ...session }) => ({
    ...session,
    submittedAt: at(submittedAt), submittedBy: name(submittedByUserId), lockedAt: at(lockedAt), lockedBy: name(lockedByUserId),
    voidedAt: at(voidedAt), voidedBy: name(voidedByUserId),
    reopenReason: (() => { const detail = reasons.find((row) => row.entityId === session.id)?.detail as { reason?: unknown } | undefined; return typeof detail?.reason === "string" ? detail.reason : null; })(),
    records: recordRows.filter((record) => record.sessionId === session.id).map(({ studentId, status, studentCode, fullName }) => ({ studentId, status, studentCode, fullName })),
  }));
  // SET-01B D-2: the whole-term maximum in force on the evaluation date; no recorded policy, no marks.
  const maximum = view.figures ? (selectedGroup.courseType === "sessional" ? view.figures.sessionalAttendanceMarks : view.figures.theoryAttendanceMarks) : null;
  const maximumVersion = view.current?.version ?? null;
  // ATT-03A D-4: every non-voided session counts, whatever its state.
  const counted = sessions.filter((session) => countsInSummary(session.status));
  const summaries = roster.map((student) => summarizeAttendance(student.id, counted, maximum ?? 0));
  const unsubmitted = sessions.filter((session) => isUnsubmitted(session.status)).length;
  await assertTermContext(data.writeContext);
  return { data, selectedGroup, canManageRosters, canTakeAttendance, canReviewAttendance, roster, sessions, summaries, maximum, maximumVersion, unsubmitted };
}
