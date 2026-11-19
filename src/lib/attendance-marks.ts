import { and, asc, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms, attendanceRecords, attendanceSessions, batches, courseEnrollments,
  courseOfferings, courses, students, teachingGroupOfferings, teachingGroups,
} from "@/db/schema";
import { can, getOptionalActor } from "./auth";
import { getTermPolicyView } from "./academic-operations";
import { attendanceContribution, attendanceResult, type AttendancePhase } from "./attendance";
import { isUnsubmitted } from "./attendance-lifecycle";
import { cohortRead, readTermContext } from "./term-context";

type MarksRequest = { termId: number; groupId?: number; studentId?: number; phase: AttendancePhase };

export async function getAttendanceMarks({ termId, groupId, studentId, phase }: MarksRequest) {
  const actor = await getOptionalActor();
  if (!actor) return { kind: "sign-in" } as const;
  if (!await can(actor, "view_internal_portal")) return { kind: "denied" } as const;

  return cohortRead(async () => {
    const [term] = await db.select().from(academicTerms).where(eq(academicTerms.id, termId));
    if (!term || (term.status !== "active" && term.status !== "completed")) return { kind: "missing" } as const;
    const completed = term.status === "completed";
    if (!completed) {
      const { state } = await readTermContext();
      if (state.kind !== "one" || state.term.id !== term.id) return { kind: "missing" } as const;
    }
    const groups = await db.select({
      id: teachingGroups.id, courseCode: courses.code, courseTitle: courses.title, courseType: courses.courseType,
      externalAudience: teachingGroups.externalAudienceLabel,
    }).from(teachingGroups).innerJoin(courses, eq(courses.id, teachingGroups.courseId))
      .where(and(eq(teachingGroups.termId, termId), groupId === undefined ? undefined : eq(teachingGroups.id, groupId)))
      .orderBy(asc(courses.code), asc(teachingGroups.id));

    const permitted: typeof groups = [];
    for (const group of groups) {
      const target = { kind: "teaching_group", teachingGroupId: group.id } as const;
      if (await can(actor, "take_attendance", target) || await can(actor, "review_attendance", target)
        || await can(actor, "manage_rosters", target)) permitted.push(group);
    }
    if (groupId !== undefined && !permitted.length) return { kind: "missing" } as const;

    const batchesByGroup = permitted.length ? await db.select({
      groupId: teachingGroupOfferings.teachingGroupId, stream: batches.stream, label: batches.label,
    }).from(teachingGroupOfferings)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId))
      .innerJoin(batches, eq(batches.id, courseOfferings.batchId))
      .where(and(eq(courseOfferings.termId, termId), inArray(teachingGroupOfferings.teachingGroupId, permitted.map(group => group.id))))
      .orderBy(asc(batches.stream), asc(batches.label)) : [];
    const labelled = permitted.map(group => ({
      ...group, audience: [...batchesByGroup.filter(row => row.groupId === group.id).map(row => `${row.stream} ${row.label}`),
        ...(group.externalAudience ? [group.externalAudience] : [])].join(" + "),
    }));
    if (groupId === undefined) return { kind: "groups", term, groups: labelled } as const;
    const [group] = labelled;

    const enrolled = exists(db.select({ one: sql`1` }).from(courseEnrollments).where(and(
      eq(courseEnrollments.termId, termId), eq(courseEnrollments.teachingGroupId, groupId),
      eq(courseEnrollments.studentId, students.id), eq(courseEnrollments.status, "active"),
    )));
    const captured = exists(db.select({ one: sql`1` }).from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId)).where(and(
        eq(attendanceSessions.termId, termId), eq(attendanceSessions.teachingGroupId, groupId),
        eq(attendanceRecords.studentId, students.id), ne(attendanceSessions.status, "voided"),
      )));
    const roster = await db.select({ id: students.id, code: students.studentCode, name: students.fullName })
      .from(students).where(and(
        studentId === undefined ? undefined : eq(students.id, studentId),
        completed ? or(enrolled, captured) : and(enrolled, eq(students.status, "active")),
      )).orderBy(asc(students.studentCode), asc(students.id));
    if (studentId !== undefined && !roster.length) return { kind: "missing" } as const;

    const policy = await getTermPolicyView(term);
    const maximum = policy.figures
      ? (group.courseType === "sessional" ? policy.figures.sessionalAttendanceMarks : policy.figures.theoryAttendanceMarks)
      : null;
    const inputs = await db.select({
      sessionId: attendanceSessions.id, date: attendanceSessions.classDate, phase: attendanceSessions.phase,
      startMinutes: attendanceSessions.startMinutes, endMinutes: attendanceSessions.endMinutes, state: attendanceSessions.status,
      studentId: attendanceRecords.studentId, recordedStatus: attendanceRecords.status,
    }).from(attendanceSessions).leftJoin(attendanceRecords, and(
      eq(attendanceRecords.sessionId, attendanceSessions.id),
      roster.length ? inArray(attendanceRecords.studentId, roster.map(student => student.id)) : sql`false`,
    )).where(and(
      eq(attendanceSessions.termId, termId), eq(attendanceSessions.teachingGroupId, groupId),
      phase === "semester" ? undefined : eq(attendanceSessions.phase, phase),
    )).orderBy(asc(attendanceSessions.classDate), asc(attendanceSessions.startMinutes), asc(attendanceSessions.id));
    const provisional = new Set(inputs.filter(row => isUnsubmitted(row.state)).map(row => row.sessionId)).size;
    const totals = new Map(roster.map(student => [student.id, { attended: 0, total: 0 }]));
    const evidence = inputs.map(row => {
      const contribution = attendanceContribution(row.state, row.recordedStatus);
      const total = row.studentId == null ? undefined : totals.get(row.studentId);
      if (total) {
        total.attended += contribution.attended;
        total.total += contribution.total;
      }
      return { ...row, ...contribution };
    });
    const rows = roster.map(student => {
      const { attended, total } = totals.get(student.id)!;
      return { ...student, ...attendanceResult(attended, total, maximum) };
    });

    return {
      kind: "marks", term, group, rows, provisional, maximum, evaluationDate: policy.evaluationDate,
      version: policy.current?.version ?? null, effectiveFrom: policy.current?.effectiveFrom ?? null,
      sessionCount: new Set(inputs.map(row => row.sessionId)).size,
      evidence: studentId === undefined ? [] : evidence,
    } as const;
  });
}
