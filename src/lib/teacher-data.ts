/**
 * TCH-01 (#4): server reads for teacher records — one record, everything that
 * refers to it, and its change log. Callers check permissions first.
 */
import { and, count, countDistinct, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms, attendanceSessions, auditEvents, courses, departments, externalCommitments, extraLoadClasses, meetingTeachers,
  meetings, portalUsers, scheduleVersions, teachers, teachingGroups, workloadAllocations,
} from "@/db/schema";
import { DAY_SHORT, fmtTime } from "./time";
import { snapshotMentionsCode, type TeacherReferences } from "./teacher-records";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Transaction;

export type TeacherRecord = typeof teachers.$inferSelect & { departmentCode: string | null; departmentName: string | null };

export async function getTeacherRecord(id: number, reader: Reader = db): Promise<TeacherRecord | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await reader.select({ teacher: teachers, departmentCode: departments.code, departmentName: departments.name })
    .from(teachers).leftJoin(departments, eq(departments.id, teachers.homeDepartmentId)).where(eq(teachers.id, id)).limit(1);
  return row ? { ...row.teacher, departmentCode: row.departmentCode, departmentName: row.departmentName } : null;
}

export async function getDepartmentOptions(reader: Reader = db) {
  return reader.select({ id: departments.id, code: departments.code, name: departments.name }).from(departments).orderBy(departments.name);
}

/** Every reference to the teacher. Inside a transaction so a just-added class still counts. */
export async function getTeacherReferences(teacherId: number, shortCode: string, reader: Reader = db): Promise<TeacherReferences> {
  const [term] = await reader.select().from(academicTerms).where(eq(academicTerms.status, "active")).limit(1);
  const termId = term?.id ?? -1;

  const [classRows, allocationRows, extraRows, externalRows, account, versions] = await Promise.all([
    reader.select({ termId: teachingGroups.termId, courseCode: courses.code, day: meetings.dayOfWeek, start: meetings.startMinutes, status: meetings.status })
      .from(meetingTeachers)
      .innerJoin(meetings, eq(meetings.id, meetingTeachers.meetingId))
      .innerJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId))
      .innerJoin(courses, eq(courses.id, teachingGroups.courseId))
      .where(eq(meetingTeachers.teacherId, teacherId))
      .orderBy(meetings.dayOfWeek, meetings.startMinutes),
    reader.select({ termId: workloadAllocations.termId, courseCode: courses.code, method: workloadAllocations.allocationMethod, externalDepartment: externalCommitments.counterpartDepartment })
      .from(workloadAllocations)
      .leftJoin(teachingGroups, eq(teachingGroups.id, workloadAllocations.teachingGroupId))
      .leftJoin(courses, eq(courses.id, teachingGroups.courseId))
      .leftJoin(externalCommitments, eq(externalCommitments.id, workloadAllocations.externalCommitmentId))
      .where(eq(workloadAllocations.teacherId, teacherId)),
    reader.select({ termId: extraLoadClasses.termId, classDate: extraLoadClasses.classDate, courseCode: extraLoadClasses.courseCodeSnapshot })
      .from(extraLoadClasses).where(eq(extraLoadClasses.teacherId, teacherId)).orderBy(extraLoadClasses.classDate),
    reader.select({ termId: externalCommitments.termId, counterpartDepartment: externalCommitments.counterpartDepartment, courseLabel: externalCommitments.courseLabel })
      .from(externalCommitments).where(eq(externalCommitments.teacherId, teacherId)),
    reader.select({ email: portalUsers.email }).from(portalUsers).where(eq(portalUsers.teacherId, teacherId)).limit(1),
    reader.select({ termName: academicTerms.name, versionNumber: scheduleVersions.versionNumber, snapshot: scheduleVersions.snapshot })
      .from(scheduleVersions).innerJoin(academicTerms, eq(academicTerms.id, scheduleVersions.termId))
      .where(isNotNull(scheduleVersions.snapshot)).orderBy(academicTerms.id, scheduleVersions.versionNumber),
  ]);
  const [attendance] = await reader.select({ sessions: count(), terms: countDistinct(attendanceSessions.termId) })
    .from(attendanceSessions).where(eq(attendanceSessions.teacherId, teacherId));
  const attendanceTerms = attendance.sessions
    ? await reader.selectDistinct({ termId: attendanceSessions.termId }).from(attendanceSessions).where(eq(attendanceSessions.teacherId, teacherId))
    : [];

  const activeClasses = classRows.filter((row) => row.termId === termId && row.status === "active");
  const terms = new Set<number>([...classRows, ...allocationRows, ...extraRows, ...externalRows, ...attendanceTerms].map((row) => row.termId));
  return {
    termName: term?.name ?? "the active term",
    activeTerm: {
      classes: activeClasses.map((row) => ({ courseCode: row.courseCode, day: DAY_SHORT[row.day] ?? `Day ${row.day}`, time: fmtTime(row.start) })),
      allocations: allocationRows.filter((row) => row.termId === termId).map(({ courseCode, method, externalDepartment }) => ({ courseCode, method, externalDepartment })),
      extraLoad: extraRows.filter((row) => row.termId === termId).map(({ classDate, courseCode }) => ({ classDate, courseCode })),
      externals: externalRows.filter((row) => row.termId === termId).map(({ counterpartDepartment, courseLabel }) => ({ counterpartDepartment, courseLabel })),
    },
    anyTerm: {
      classes: classRows.length, allocations: allocationRows.length, extraLoad: extraRows.length, externals: externalRows.length,
      attendanceSessions: attendance.sessions, terms: terms.size,
    },
    portalAccount: account[0] ?? null,
    publishedVersions: versions.filter((version) => snapshotMentionsCode(version.snapshot, shortCode))
      .map(({ termName, versionNumber }) => ({ termName, versionNumber })),
  };
}

export interface TeacherChange {
  id: number;
  at: Date;
  action: string;
  actor: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
}

/** The teacher's audit history, newest first: TCH-01 events plus the source import that created it. */
export async function getTeacherChanges(teacherId: number, reader: Reader = db): Promise<TeacherChange[]> {
  const rows = await reader.select().from(auditEvents)
    .where(or(
      and(eq(auditEvents.entity, "teacher"), eq(auditEvents.entityId, teacherId)),
      eq(auditEvents.action, "summer_2026_imported"),
    ))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(200);
  return rows.map((row) => ({
    id: row.id, at: row.at, action: row.action,
    actor: row.actorDisplayName ?? row.actor,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
    detail: row.detail as Record<string, unknown> | null,
  }));
}

/** Short codes in use, for duplicate checks (compared in upper case). */
export async function getShortCodes(reader: Reader = db) {
  return reader.select({ id: teachers.id, shortCode: teachers.shortCode, fullName: teachers.fullName }).from(teachers)
    .orderBy(sql`upper(${teachers.shortCode})`);
}
