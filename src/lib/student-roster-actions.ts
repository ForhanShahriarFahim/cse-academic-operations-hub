"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, inDatabaseTransaction } from "@/db";
import { batches, batchTermPlacements, courseEnrollments, courseOfferings, students, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { invalid, partial, stale, succeeded, type ActionResult } from "./action-result";
import { can, type Actor } from "./auth";
import { actionActor } from "./auth/action-guard";
import { batchIdentityKey } from "./batch-records";
import { parseStudentCsv, studentCsvHeadings, type RosterImportReceipt, type StudentCsvField } from "./attendance";
import { audiences, enrollmentWhere, identityFields, identityMismatch, insertStudent, issueStudentReview, lockStudents,
  positiveId, reviewChanged, studentAudit, usableHomeBatch, validation, unusedStudentReview, withRoster, type Enrollment, type Student } from "./student-store";
import { parseTermWriteContext } from "./term-context-value";

type RowStatus = "created" | "updated" | "unchanged" | "skipped" | "failed";
type RowReport = { row: number; kind: RowStatus; message: string };
type Candidate = { id: number; name: string; code: string; disposition: string };
type ReviewResult = ActionResult & { receipt?: RosterImportReceipt; rows?: RowReport[]; proof?: string; candidates?: Candidate[] };
type Target = { groupId: number; termId: number };
type Change = { student?: Student; fields?: typeof students.$inferInsert; enrollment?: Enrollment; audience?: string };
const mappingFields: StudentCsvField[] = ["studentCode", "fullName", "phone", "department", "homeBatch", "audienceType"];

function refreshStudentViews() {
  revalidatePath("/students");
  revalidatePath("/attendance", "layout");
}

async function commitChange(change: Change, target: Target | null, actor?: Actor) {
  let student = change.student;
  if (change.fields) {
    student = await insertStudent(change.fields);
    if (!student) throw new Error("Student code changed during apply.");
    if (actor) await studentAudit(actor, "student.create", "student", student.id, { fields: Object.keys(change.fields) });
  }
  if (!target || !student) return;
  if (change.enrollment) {
    await db.update(courseEnrollments).set({ audienceType: change.audience, status: "active" }).where(eq(courseEnrollments.id, change.enrollment.id));
    return;
  }
  await db.insert(courseEnrollments).values({ studentId: student.id, teachingGroupId: target.groupId, termId: target.termId, audienceType: change.audience });
}

export async function addRosterStudent(input: FormData, context?: unknown) {
  const groupId = positiveId(input.get("teachingGroupId"));
  return withRoster(groupId, context ?? input, async (actor, termId, groupId) => {
    if (input.get("studentId")) return invalid("Use the student directory to edit an identity.");
    const parsed = identityFields(input.get("studentCode"), input.get("fullName"));
    if (!parsed.values) return validation(parsed.errors!);
    const audience = audiences.find(value => value === (input.get("audienceType") ?? "local"));
    if (!audience) return validation({ audienceType: ["Choose an audience."] });
    const [student] = await db.select().from(students).where(eq(students.studentCode, parsed.values.studentCode));
    if (student && (student.status !== "active" || student.fullName.trim() !== parsed.values.fullName)) return invalid(identityMismatch);
    if (student) {
      const [existing] = await db.select().from(courseEnrollments).where(enrollmentWhere(termId, groupId, student.id));
      if (existing?.status === "inactive") return succeeded("This student already has an inactive enrollment. Use Restore on the roster.");
      if (existing) return succeeded("This student is already enrolled.");
    }
    await commitChange({ student, fields: student ? undefined : parsed.values, audience }, { groupId, termId }, actor);
    const [row] = await db.select({ id: students.id }).from(students).where(eq(students.studentCode, parsed.values.studentCode));
    await studentAudit(actor, "enrollment.create", "teaching_group", groupId, { termId, studentId: row.id, audience });
    refreshStudentViews();
    return succeeded("Student enrolled.");
  });
}

export async function changeRosterEnrollment(input: FormData, context?: unknown) {
  const groupId = positiveId(input.get("teachingGroupId"));
  const studentId = positiveId(input.get("studentId"));
  const operation = input.get("operation");
  if (!groupId || !studentId || !["remove", "restore", "audience"].includes(String(operation))) return invalid("Choose a valid enrollment action.");
  return withRoster(groupId, context ?? input, async (actor, termId) => {
    const [row] = await db.select({ enrollment: courseEnrollments, studentStatus: students.status }).from(courseEnrollments)
      .innerJoin(students, eq(students.id, courseEnrollments.studentId)).where(enrollmentWhere(termId, groupId, studentId));
    if (!row) return stale("This student is not on this roster.", "missing");
    const { enrollment, studentStatus } = row;
    if (operation === "restore" && studentStatus !== "active") return invalid("Restore the student in the directory before restoring enrollment.");
    const status = operation === "remove" ? "inactive" : operation === "restore" ? "active" : enrollment.status;
    const audienceType = operation === "audience" ? audiences.find(value => value === input.get("audienceType")) : enrollment.audienceType;
    if (!audienceType) return validation({ audienceType: ["Choose an audience."] });
    if (status === enrollment.status && audienceType === enrollment.audienceType) return succeeded("The enrollment already matches.");
    await db.update(courseEnrollments).set({ status, audienceType }).where(eq(courseEnrollments.id, enrollment.id));
    const action = operation === "remove" ? "deactivate" : operation;
    await studentAudit(actor, `enrollment.${action}`, "teaching_group", groupId, { termId, studentId, enrollmentId: enrollment.id, status, audienceType });
    refreshStudentViews();
    return succeeded(operation === "remove" ? "Student removed from this roster. Recorded attendance is kept." : "Enrollment saved.");
  });
}

function receiptFor(rows: RowReport[]): RosterImportReceipt {
  const receipt: RosterImportReceipt = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, issues: [] };
  for (const row of rows) {
    receipt[row.kind]++;
    if (row.kind === "skipped" || row.kind === "failed") receipt.issues.push({ row: row.row, kind: row.kind, message: row.message });
  }
  return receipt;
}

async function csvInput(form: FormData, target: Target | null, mayManageStudents: boolean) {
  const file = form.get("csv");
  if (!(file instanceof File) || file.size > 256 * 1024) return { error: "Choose a CSV file up to 256 KiB." } as const;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { return { error: "Save the file as UTF-8 CSV and try again." } as const; }
  if (text.split(/\r?\n/).filter(line => line.trim()).length > 501) return { error: "Use up to 500 nonblank data lines." } as const;
  const indices = new Map<number, StudentCsvField>();
  for (const field of mappingFields) {
    const column = form.get(`map:${field}`);
    if (column == null || column === "") continue;
    const index = positiveId(column);
    if (!index || index > 131072 || indices.has(index) || field === "phone" && !mayManageStudents || field === "audienceType" && !target) {
      return { error: "Check the column mappings and map each source column only once." } as const;
    }
    indices.set(index, field);
  }
  return { file: text, indices };
}

async function csvReview(form: FormData, actor: Actor, target: Target | null): Promise<ReviewResult> {
  const directory = await can(actor, "manage_students");
  const source = await csvInput(form, target, directory);
  if ("error" in source) return invalid(source.error!, { csv: [source.error!] });
  const headings = studentCsvHeadings(source.file);
  if (!headings || [...source.indices.keys()].some(index => index > headings.length)) return invalid("Check the CSV heading row and column mappings.");
  const mapping = headings.map((_, index) => source.indices.get(index + 1) ?? null);
  const parsed = parseStudentCsv(source.file, mapping);
  if ("error" in parsed) return invalid(parsed.error, { csv: [parsed.error] });
  const codes = parsed.rows.map(row => row.studentCode);
  const existing = codes.length ? await db.select().from(students).where(inArray(students.studentCode, codes)) : [];
  const byCode = new Map(existing.map(student => [student.studentCode, student]));
  const enrollmentRows = target && existing.length ? await db.select().from(courseEnrollments).where(and(
    eq(courseEnrollments.termId, target.termId), eq(courseEnrollments.teachingGroupId, target.groupId),
    inArray(courseEnrollments.studentId, existing.map(student => student.id)),
  )) : [];
  const enrollments = new Map(enrollmentRows.map(row => [row.studentId, row]));
  const homeBatches = parsed.rows.some(row => row.homeBatch) ? await db.select().from(batches).orderBy(batches.id) : [];
  const reports: RowReport[] = [...parsed.issues];
  const changes: Change[] = [];
  const evidence: unknown[] = [];
  for (const row of parsed.rows) {
    const student = byCode.get(row.studentCode);
    const fields = identityFields(row.studentCode, row.fullName, row.phone, row.department);
    const [, stream, label] = /^(HSC|DIPLOMA):\s*(.*)$/i.exec(row.homeBatch ?? "") ?? [];
    const matchedBatches = row.homeBatch ? homeBatches.filter(batch =>
      (!stream || batch.stream.toUpperCase() === stream.toUpperCase()) && batchIdentityKey(batch.label) === batchIdentityKey(label ?? row.homeBatch!)) : [];
    const homeBatch = matchedBatches.length === 1 ? matchedBatches[0] : undefined;
    const enrollment = student ? enrollments.get(student.id) : undefined;
    evidence.push([student?.id, student?.status, student?.fullName, row.phone ? student?.phone : null,
      row.department ? student?.homeDepartmentLabel : null, row.homeBatch ? student?.homeBatchId : null,
      homeBatch?.id, homeBatch?.status, enrollment]);
    const report = (kind: RowStatus, message: string) => reports.push({ row: row.row, kind, message });
    if (!fields.values) { report("failed", "Check the length and characters of the mapped fields."); continue; }
    if (row.homeBatch && !homeBatch) { report("failed", matchedBatches.length ? "Home batch is ambiguous. Include the stream." : "Unknown home batch."); continue; }
    if (!student && homeBatch && (!directory || !await usableHomeBatch(homeBatch.id))) {
      report("failed", "A directory administrator must assign an active home batch."); continue;
    }
    if (student && (student.status !== "active" || student.fullName.trim() !== row.fullName
      || row.phone && student.phone?.trim() !== row.phone || row.department && student.homeDepartmentLabel?.trim() !== row.department
      || homeBatch && student.homeBatchId !== homeBatch.id)) {
      report("failed", identityMismatch); continue;
    }
    if (!target && student) { report("unchanged", "Student already matches."); continue; }
    const audience = row.audienceType ?? enrollment?.audienceType ?? "local";
    if (enrollment?.status === "active" && enrollment.audienceType === audience) { report("unchanged", "Enrollment already matches."); continue; }
    const message = enrollment
      ? [enrollment.status !== "active" ? "Restore enrollment." : "", enrollment.audienceType !== audience ? `Set audience to ${audience}.` : ""].filter(Boolean).join(" ")
      : target ? student ? "Enroll an existing student." : "Create a student and enroll them." : "Create a student.";
    report(enrollment ? "updated" : "created", message);
    changes.push({ student, enrollment, audience, fields: student ? undefined : { ...fields.values, homeBatchId: homeBatch?.id } });
  }
  reports.sort((a, b) => a.row - b.row);
  const receipt = receiptFor(reports);
  const payload = ["csv", actor.id, target, target ? parseTermWriteContext(form) : null, directory, source.file, mapping, evidence, reports];
  if (form.get("operation") !== "confirm") return { ...succeeded("Preview ready. Review the row outcomes."), receipt, rows: reports, proof: changes.length ? issueStudentReview(payload) : undefined };
  const action = target ? "student.csv_import" : "student.directory_csv_import";
  const digest = changes.length ? await unusedStudentReview(form.get("proof"), payload, action) : null;
  if (!digest) return stale(reviewChanged);
  for (const change of changes) await commitChange(change, target, actor);
  const { issues, ...counts } = receipt;
  await studentAudit(actor, action, target ? "teaching_group" : "student", target?.groupId ?? null,
    { termId: target?.termId }, { digest, counts: { ...counts, count: changes.length } });
  refreshStudentViews();
  const result = issues.length ? partial("Import applied. Some lines need attention.", {
    total: reports.length, applied: changes.length, unchanged: receipt.unchanged, rejected: issues,
  }) : succeeded("Import complete.");
  return { ...result, receipt, rows: reports };
}

export async function reviewStudentCsv(form: FormData): Promise<ReviewResult> {
  const mode = form.get("mode");
  try {
    if (mode === "roster") {
      const groupId = positiveId(form.get("teachingGroupId"));
      if (!groupId) return invalid("Choose a teaching group.");
      return await withRoster(groupId, form, (actor, termId) => csvReview(form, actor, { groupId, termId }));
    }
    if (mode !== "directory") return invalid("Choose an import destination.");
    const actor = await actionActor("manage_students");
    if ("ok" in actor) return actor;
    return await db.transaction(tx => inDatabaseTransaction(tx, async () => {
      await lockStudents();
      return csvReview(form, actor, null);
    }));
  } catch {
    return invalid("The CSV request could not be completed. No changes from this attempt were saved. Try the preview again.");
  }
}

export async function reviewBatchEnrollment(form: FormData): Promise<ReviewResult> {
  const groupId = positiveId(form.get("teachingGroupId"));
  const batchId = positiveId(form.get("batchId"));
  const audience = form.get("audienceType");
  if (!groupId || !batchId || (audience !== "local" && audience !== "merged")) return invalid("Choose a linked home batch and audience.");
  try {
    return await withRoster(groupId, form, async (actor, termId): Promise<ReviewResult> => {
      const directoryActor = await actionActor("manage_students");
      if ("ok" in directoryActor) return directoryActor;
      const [linked] = await db.select({ batch: batches.label, stream: batches.stream, offeringId: courseOfferings.id,
        placement: batchTermPlacements.id, batchRevision: batches.revision, offeringStatus: courseOfferings.status }).from(teachingGroupOfferings)
        .innerJoin(teachingGroups, eq(teachingGroups.id, teachingGroupOfferings.teachingGroupId))
        .innerJoin(courseOfferings, and(eq(courseOfferings.id, teachingGroupOfferings.offeringId), eq(courseOfferings.termId, termId), eq(courseOfferings.courseId, teachingGroups.courseId)))
        .innerJoin(batches, eq(batches.id, courseOfferings.batchId))
        .innerJoin(batchTermPlacements, and(eq(batchTermPlacements.batchId, batches.id), eq(batchTermPlacements.termId, termId)))
        .where(and(eq(teachingGroupOfferings.teachingGroupId, groupId), eq(batches.id, batchId), ne(courseOfferings.status, "cancelled")));
      if (!linked || !await usableHomeBatch(batchId)) return stale("Choose an active home batch linked to this class group.");
      const rows = await db.select({ student: students, enrollment: courseEnrollments }).from(students)
        .leftJoin(courseEnrollments, and(eq(courseEnrollments.termId, termId), eq(courseEnrollments.teachingGroupId, groupId), eq(courseEnrollments.studentId, students.id)))
        .where(eq(students.homeBatchId, batchId)).orderBy(students.studentCode, students.id);
      const candidates = rows.map(({ student, enrollment }) => ({
        id: student.id, name: student.fullName, code: student.studentCode,
        disposition: student.status !== "active" ? "Inactive student" : enrollment?.status === "active" ? "Already enrolled" : enrollment ? "Previously removed" : "Enroll",
      }));
      const additions = rows.filter(({ student, enrollment }) => student.status === "active" && !enrollment);
      const payload = ["batch", actor.id, parseTermWriteContext(form), groupId, batchId, audience, linked, candidates, rows.map(row => row.enrollment)];
      const receipt: RosterImportReceipt = { created: additions.length, updated: 0,
        unchanged: candidates.filter(row => row.disposition === "Already enrolled").length,
        skipped: candidates.filter(row => row.disposition === "Previously removed" || row.disposition === "Inactive student").length, failed: 0, issues: [] };
      if (form.get("operation") !== "confirm") return { ...succeeded(additions.length ? "Review the batch enrollment." : "No new enrollments for this batch."),
        candidates, receipt, proof: additions.length ? issueStudentReview(payload) : undefined };
      const digest = additions.length ? await unusedStudentReview(form.get("proof"), payload, "enrollment.batch") : null;
      if (!digest) return stale(reviewChanged);
      await db.insert(courseEnrollments).values(additions.map(({ student }) => ({ termId, teachingGroupId: groupId, studentId: student.id, audienceType: audience })));
      await studentAudit(actor, "enrollment.batch", "teaching_group", groupId, { termId, batchId, count: additions.length, unchanged: receipt.unchanged, excluded: receipt.skipped }, { digest });
      refreshStudentViews();
      return { ...succeeded(`Enrolled ${additions.length} student(s).`), receipt };
    });
  } catch {
    return invalid("Batch enrollment could not be completed. Preview the batch again.");
  }
}
