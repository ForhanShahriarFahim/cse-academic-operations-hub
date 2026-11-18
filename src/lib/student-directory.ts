"use server";

import { and, asc, desc, eq, exists, ilike, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, inDatabaseTransaction } from "@/db";
import { academicTerms, attendanceRecords, batches, courseEnrollments, courses, departments, students, teachingGroups } from "@/db/schema";
import { actionActor } from "./auth/action-guard";
import { invalid, stale, succeeded } from "./action-result";
import { identityFields, insertStudent, lockStudents, positiveId, studentAudit, studentFingerprint, usableHomeBatch, validation } from "./student-store";

export async function searchStudents(input: FormData) {
  const actor = await actionActor("manage_students");
  if ("ok" in actor) return actor;
  const query = String(input.get("q") ?? "").trim().slice(0, 200);
  const literal = query.replace(/[\\%_]/g, "\\$&");
  const batch = input.get("batch");
  const term = positiveId(input.get("term"));
  const status = input.get("status") ?? "active";
  const page = Math.min(positiveId(input.get("page")) ?? 1, 100_000);
  const size = 25;
  const rows = await db.select({ id: students.id, name: students.fullName, code: students.studentCode, status: students.status,
    label: students.homeDepartmentLabel, department: departments.code, batch: batches.label, stream: batches.stream })
    .from(students).leftJoin(batches, eq(students.homeBatchId, batches.id)).leftJoin(departments, eq(departments.id, students.homeDepartmentId))
    .where(and(
      query ? or(ilike(students.fullName, `%${literal}%`), ilike(students.studentCode, `%${literal}%`)) : undefined,
      status === "all" ? undefined : eq(students.status, status === "inactive" ? "inactive" : "active"),
      batch === "none" ? isNull(students.homeBatchId) : positiveId(batch) ? eq(students.homeBatchId, positiveId(batch)!) : undefined,
      term ? exists(db.select({ id: courseEnrollments.id }).from(courseEnrollments)
        .innerJoin(teachingGroups, and(eq(teachingGroups.id, courseEnrollments.teachingGroupId), eq(teachingGroups.termId, courseEnrollments.termId)))
        .where(and(eq(courseEnrollments.termId, term), eq(courseEnrollments.studentId, students.id)))) : undefined,
    )).orderBy(asc(students.fullName), asc(students.studentCode), asc(students.id)).limit(size + 1).offset((page - 1) * size);
  const [any] = rows.length ? [{ id: rows[0].id }] : await db.select({ id: students.id }).from(students).limit(1);
  return { ...succeeded("Student directory updated."), rows: rows.slice(0, size), page, more: rows.length > size, hasStudents: Boolean(any) };
}

export async function studentDirectoryOptions() {
  const actor = await actionActor("manage_students");
  if ("ok" in actor) return null;
  const homeBatches = await db.select({ id: batches.id, label: batches.label, stream: batches.stream, status: batches.status })
    .from(batches).orderBy(asc(batches.stream), asc(batches.sortOrder), asc(batches.label));
  const terms = await db.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms).orderBy(desc(academicTerms.startDate));
  return { homeBatches, terms };
}

export async function studentDetail(id: number) {
  const actor = await actionActor("manage_students");
  if ("ok" in actor || !positiveId(id)) return null;
  const [row] = await db.select({ student: students, department: departments.code }).from(students)
    .leftJoin(departments, eq(departments.id, students.homeDepartmentId)).where(eq(students.id, id));
  if (!row) return null;
  const { student, department } = row;
  const history = await db.select({ id: courseEnrollments.id, groupId: teachingGroups.id, course: courses.code, title: courses.title,
    term: academicTerms.name, termStatus: academicTerms.status, audience: courseEnrollments.audienceType, status: courseEnrollments.status })
    .from(courseEnrollments).innerJoin(teachingGroups, and(eq(teachingGroups.id, courseEnrollments.teachingGroupId), eq(teachingGroups.termId, courseEnrollments.termId)))
    .innerJoin(courses, eq(courses.id, teachingGroups.courseId)).innerJoin(academicTerms, eq(academicTerms.id, courseEnrollments.termId))
    .where(eq(courseEnrollments.studentId, id)).orderBy(desc(academicTerms.startDate), asc(courses.code), asc(courseEnrollments.id));
  const [capture] = history.length ? [{ id }] : await db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.studentId, id)).limit(1);
  return { id, studentCode: student.studentCode, fullName: student.fullName, phone: student.phone, departmentLabel: student.homeDepartmentLabel,
    department, homeBatchId: student.homeBatchId, status: student.status, fixedCode: Boolean(capture),
    fingerprint: studentFingerprint(student), history };
}

export async function changeStudent(input: FormData) {
  const actor = await actionActor("manage_students");
  if ("ok" in actor) return actor;
  const operation = input.get("operation");
  const id = positiveId(input.get("id"));
  if (operation !== "create" && (!id || !["edit", "deactivate", "restore"].includes(String(operation)))) return invalid("Choose a valid student action.");
  const result = await db.transaction(tx => inDatabaseTransaction(tx, async () => {
    await lockStudents();
    const [current] = id ? await db.select().from(students).where(eq(students.id, id)).for("update") : [];
    if (operation !== "create" && (!current || input.get("fingerprint") !== studentFingerprint(current))) {
      return stale("The student record changed. Reload it before continuing.");
    }
    if (current && (operation === "deactivate" || operation === "restore")) {
      if (operation === "deactivate" && input.get("confirmed") !== "yes") return invalid("Confirm that the student should be deactivated.");
      const status = operation === "deactivate" ? "inactive" : "active";
      if (current.status === status) return succeeded("Student status already matches.", { entityId: current.id });
      await db.update(students).set({ status, updatedAt: new Date() }).where(eq(students.id, current.id));
      await studentAudit(actor, `student.${operation}`, "student", current.id, { from: current.status, to: status });
      return succeeded(status === "active" ? "Student restored." : "Student deactivated.", { entityId: current.id });
    }
    if (operation === "create" && id) return invalid("Start a new student record.");
    const parsed = identityFields(input.get("studentCode"), input.get("fullName"), input.get("phone"), input.get("department"));
    if (!parsed.values) return validation(parsed.errors);
    const batchInput = input.get("homeBatchId");
    const homeBatchId = positiveId(batchInput);
    if (batchInput && (!homeBatchId || (homeBatchId !== current?.homeBatchId && !await usableHomeBatch(homeBatchId)))) {
      return validation({ homeBatchId: ["Choose an active home batch."] });
    }
    const studentCode = current?.studentCode === input.get("studentCode") ? current.studentCode : parsed.values.studentCode;
    const values = { ...parsed.values, studentCode, homeBatchId };
    if (!current) {
      const inserted = await insertStudent(values);
      if (!inserted) return validation({ studentCode: ["This Student ID is already in use."] });
      await studentAudit(actor, "student.create", "student", inserted.id, { fields: Object.keys(values) });
      return succeeded("Student added.", { entityId: inserted.id });
    }
    if (values.studentCode !== current.studentCode) {
      const [used] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, current.id), or(
        exists(db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(eq(courseEnrollments.studentId, current.id))),
        exists(db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.studentId, current.id))),
      )));
      if (used) return validation({ studentCode: ["Student IDs with enrollment or attendance history stay fixed."] });
      const [duplicate] = await db.select({ id: students.id }).from(students).where(eq(students.studentCode, values.studentCode));
      if (duplicate) return validation({ studentCode: ["This Student ID is already in use."] });
    }
    const fields = (Object.keys(values) as Array<keyof typeof values>).filter(key => values[key] !== current[key]);
    if (!fields.length) return succeeded("The student record already matches.", { entityId: current.id });
    await db.update(students).set({ ...values, updatedAt: sql`now()` }).where(eq(students.id, current.id));
    await studentAudit(actor, "student.update", "student", current.id, { fields });
    return succeeded("Student saved.", { entityId: current.id });
  }));
  if (result.ok) { revalidatePath("/students"); revalidatePath("/attendance", "layout"); }
  return result;
}
