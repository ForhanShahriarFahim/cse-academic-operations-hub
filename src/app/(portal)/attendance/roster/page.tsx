import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { batches, batchTermPlacements, courseEnrollments, courseOfferings, students, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { StudentActionForm } from "@/components/students/forms";
import { fieldClass, secondaryClass } from "@/components/students/styles";
import { StudentReview } from "@/components/students/review";
import { groupOptions } from "@/lib/academic-operations";
import { getPortalData } from "@/lib/data";
import { can, requireActor } from "@/lib/auth";
import { addRosterStudent, changeRosterEnrollment } from "@/lib/student-roster-actions";
import { audiences, positiveId } from "@/lib/student-store";
import { assertTermContext } from "@/lib/term-context";
import type { TermWriteContext } from "@/lib/term-context-value";

export const dynamic = "force-dynamic";

function Target({ groupId, context }: { groupId: number; context: TermWriteContext }) {
  return <><input type="hidden" name="teachingGroupId" value={groupId} />
    <input type="hidden" name="_activeTermId" value={context.activeTermId} />
    <input type="hidden" name="_termGeneration" value={context.generation} /></>;
}

function Audience({ value = "local" }: { value?: string }) {
  return <label>Audience<select className={fieldClass} name="audienceType" defaultValue={value}>
    {audiences.map(audience => <option value={audience} key={audience}>{audience === "local" ? "Local" : audience === "external" ? "External" : "Merged audience"}</option>)}
  </select></label>;
}

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const actor = await requireActor();
  const groupId = positiveId((await searchParams).group);
  if (!groupId) notFound();
  if (!await can(actor, "manage_rosters", { kind: "teaching_group", teachingGroupId: groupId })) redirect("/forbidden");
  const data = await getPortalData();
  const group = groupOptions(data).find(row => row.id === groupId);
  if (!group) notFound();
  const { term, writeContext } = data;
  const directory = await can(actor, "manage_students");
  const members = await db.select({ id: students.id, name: students.fullName, code: students.studentCode, studentStatus: students.status,
    status: courseEnrollments.status, audience: courseEnrollments.audienceType })
    .from(courseEnrollments).innerJoin(students, eq(students.id, courseEnrollments.studentId))
    .where(and(eq(courseEnrollments.termId, term.id), eq(courseEnrollments.teachingGroupId, groupId))).orderBy(students.studentCode, students.id);
  const batchOptions = directory ? await db.selectDistinct({ id: batches.id, stream: batches.stream, label: batches.label })
    .from(teachingGroupOfferings).innerJoin(teachingGroups, eq(teachingGroups.id, teachingGroupOfferings.teachingGroupId))
    .innerJoin(courseOfferings, and(eq(courseOfferings.id, teachingGroupOfferings.offeringId), eq(courseOfferings.termId, term.id), eq(courseOfferings.courseId, teachingGroups.courseId)))
    .innerJoin(batches, eq(batches.id, courseOfferings.batchId))
    .innerJoin(batchTermPlacements, and(eq(batchTermPlacements.batchId, batches.id), eq(batchTermPlacements.termId, term.id)))
    .where(and(eq(teachingGroupOfferings.teachingGroupId, groupId), ne(courseOfferings.status, "cancelled"), eq(batches.status, "active")))
    .orderBy(batches.stream, batches.label) : undefined;
  await assertTermContext(writeContext);
  return <div className="min-w-0 space-y-4">
    <Link className={secondaryClass} href={`/attendance?group=${groupId}`}>Back to attendance</Link>
    <PageHeader context="Classes" title="Manage roster"
      description={`${term.name} · ${group.courseCode} · ${group.courseTitle} · ${group.audience}`} />
    <section className="ruled min-w-0 rounded-lg p-4">
      <h2 className="mb-3 font-display text-lg font-semibold">Add student</h2>
      <StudentActionForm action={addRosterStudent} submit="Add to roster" reset>
        <Target groupId={groupId} context={writeContext} />
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label>Student ID<input name="studentCode" className={fieldClass} required maxLength={120} /></label>
          <label>Student name<input name="fullName" className={fieldClass} required maxLength={200} /></label>
          <Audience />
        </div>
      </StudentActionForm>
    </section>
    <section className="ruled min-w-0 rounded-lg p-4">
      <h2 className="font-display text-lg font-semibold">Group enrollments</h2>
      {!members.length && <p className="mt-2 text-sm text-muted">This roster has no enrollments.</p>}
      <ul className="divide-y divide-[var(--color-line)]">{members.map(member => <li key={member.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="min-w-0 break-words text-sm"><strong>{member.name}</strong> · <span className="font-mono">{member.code}</span>
          <p className="mt-1 capitalize">{member.audience} · {member.status === "active" ? "Active enrollment" : "Removed"}{member.studentStatus !== "active" ? " · Inactive student" : ""}</p>
          {directory && <Link className="underline" href={`/students/${member.id}`}>Edit student</Link>}
        </div>
        <details className="text-sm"><summary className="cursor-pointer">Change audience</summary>
          <StudentActionForm action={changeRosterEnrollment} submit="Save audience" className="mt-2">
            <Target groupId={groupId} context={writeContext} />
            <input type="hidden" name="studentId" value={member.id} /><input type="hidden" name="operation" value="audience" />
            <Audience value={member.audience} />
          </StudentActionForm>
        </details>
        {member.status === "active" ? <details className="text-sm"><summary className="cursor-pointer">Remove from roster</summary>
          <StudentActionForm action={changeRosterEnrollment} submit="Confirm removal" className="mt-2">
            <Target groupId={groupId} context={writeContext} /><input type="hidden" name="studentId" value={member.id} />
            <input type="hidden" name="operation" value="remove" /><p className="text-muted">Recorded attendance is kept.</p>
          </StudentActionForm>
        </details> : member.studentStatus === "active" && <StudentActionForm action={changeRosterEnrollment} submit="Restore enrollment">
          <Target groupId={groupId} context={writeContext} /><input type="hidden" name="studentId" value={member.id} /><input type="hidden" name="operation" value="restore" />
        </StudentActionForm>}
      </li>)}</ul>
    </section>
    <StudentReview key={`csv-${groupId}-${writeContext.generation}`} groupId={groupId} context={writeContext} phone={directory} />
    {batchOptions && <StudentReview key={`batch-${groupId}-${writeContext.generation}`} groupId={groupId} context={writeContext} phone={false} batchOptions={batchOptions} />}
  </div>;
}
