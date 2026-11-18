import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseEnrollments, students } from "@/db/schema";

export async function currentRoster(termId: number, groupId: number) {
  const rows = await db.select({ id: students.id, studentCode: students.studentCode, fullName: students.fullName,
    enrollment: { audienceType: courseEnrollments.audienceType } })
    .from(courseEnrollments).innerJoin(students, eq(students.id, courseEnrollments.studentId))
    .where(and(eq(courseEnrollments.termId, termId), eq(courseEnrollments.teachingGroupId, groupId),
      eq(courseEnrollments.status, "active"), eq(students.status, "active")));
  return rows.sort((a, b) => a.studentCode.localeCompare(b.studentCode) || a.id - b.id);
}
