import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendanceRecords, attendanceSessions, courseEnrollments, students, teachers } from "@/db/schema";
import { can, getOptionalActor } from "./auth";
import { buildLedger, ledgerTeacherOptions, parseLedgerQuery, type LedgerQuery } from "./attendance-ledger";
import { readAttendanceReportGroups } from "./attendance-marks";
import { cohortRead } from "./term-context";

/**
 * ATT-05 report loader. Reuses ATT-04's term binding and group access on every
 * request (page, CSV and print), then reads the group's sessions, records and
 * roster in a fixed number of queries for the one shared projection.
 */
export async function getAttendanceLedger(termId: number, groupId: number, query: LedgerQuery) {
  const actor = await getOptionalActor();
  if (!actor) return { kind: "sign-in" } as const;
  if (!await can(actor, "view_internal_portal")) return { kind: "denied" } as const;

  return cohortRead(async () => {
    const access = await readAttendanceReportGroups(actor, termId, groupId);
    if (access.kind !== "groups") return access;
    const { term, groups: [group] } = access;
    const activeTerm = term.status === "active";

    const sessions = await db.select({
      id: attendanceSessions.id, date: attendanceSessions.classDate, startMinutes: attendanceSessions.startMinutes,
      endMinutes: attendanceSessions.endMinutes, phase: attendanceSessions.phase, state: attendanceSessions.status,
      voidReason: attendanceSessions.voidReason, teacherId: attendanceSessions.teacherId,
      teacherCode: teachers.shortCode, teacherName: teachers.fullName,
    }).from(attendanceSessions).leftJoin(teachers, eq(teachers.id, attendanceSessions.teacherId))
      .where(and(eq(attendanceSessions.termId, termId), eq(attendanceSessions.teachingGroupId, groupId)));
    const records = await db.select({
      sessionId: attendanceRecords.sessionId, studentId: attendanceRecords.studentId, status: attendanceRecords.status,
    }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .where(and(eq(attendanceSessions.termId, termId), eq(attendanceSessions.teachingGroupId, groupId)));
    const enrolled = new Set((await db.select({ studentId: courseEnrollments.studentId }).from(courseEnrollments).where(and(
      eq(courseEnrollments.termId, termId), eq(courseEnrollments.teachingGroupId, groupId), eq(courseEnrollments.status, "active"),
    ))).map(row => row.studentId));
    const voided = new Set(sessions.filter(session => session.state === "voided").map(session => session.id));
    const ids = [...new Set([...enrolled, ...records.filter(record => !voided.has(record.sessionId)).map(record => record.studentId)])];
    const people = ids.length ? await db.select({ id: students.id, code: students.studentCode, name: students.fullName, status: students.status })
      .from(students).where(inArray(students.id, ids)).orderBy(asc(students.studentCode), asc(students.id)) : [];

    const teacherOptions = ledgerTeacherOptions(sessions);
    const { view, filters, invalid } = parseLedgerQuery(query, term, teacherOptions);
    const ledger = buildLedger({
      sessions, filters, activeTerm,
      // Records of voided sessions never reach a total or a matrix cell; keep them out of the projection entirely.
      records: records.filter(record => !voided.has(record.sessionId)),
      students: people.map(person => ({
        id: person.id, code: person.code, name: person.name, enrolled: enrolled.has(person.id),
        onRoster: activeTerm && enrolled.has(person.id) && person.status === "active",
      })),
    });
    const target = { kind: "teaching_group", teachingGroupId: groupId } as const;
    const canOpenSessions = activeTerm && (await can(actor, "take_attendance", target) || await can(actor, "review_attendance", target));
    return { kind: "ledger", term, group, view, filters, invalid, teacherOptions, ledger, canOpenSessions } as const;
  });
}
