import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { StudentActionForm } from "@/components/students/forms";
import { fieldClass, secondaryClass } from "@/components/students/styles";
import { changeStudent, studentDetail, studentDirectoryOptions } from "@/lib/student-directory";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const options = await studentDirectoryOptions();
  if (!options) redirect("/forbidden");
  const { id } = await params;
  const adding = id === "new";
  const student = adding ? null : await studentDetail(/^\d+$/.test(id) ? Number(id) : 0);
  if (!adding && !student) notFound();
  return <div className="min-w-0 space-y-4">
    <Link href="/students" className={secondaryClass}>Students</Link>
    <PageHeader context="Classes" title={student?.fullName ?? "Add student"}
      description={student ? `${student.studentCode} · ${student.status === "active" ? "Active" : "Inactive"}` : "Create a student record for future enrollment."} />
    <section className="ruled min-w-0 rounded-lg p-4">
      <h2 className="mb-3 font-display text-lg font-semibold">Identity</h2>
      <StudentActionForm action={changeStudent} submit={adding ? "Add student" : "Save student"} destination={adding ? "student" : undefined}>
        <input type="hidden" name="operation" value={adding ? "create" : "edit"} />
        {student && <><input type="hidden" name="id" value={student.id} /><input type="hidden" name="fingerprint" value={student.fingerprint} /></>}
        <div key={student?.fingerprint ?? "new"} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label>Student ID<input name="studentCode" className={fieldClass} required maxLength={120} readOnly={student?.fixedCode}
              defaultValue={student?.studentCode} aria-describedby={student?.fixedCode ? "fixed-student-code" : undefined} /></label>
            {student?.fixedCode && <p id="fixed-student-code" className="text-sm text-muted">This ID has enrollment or attendance history.</p>}
          </div>
          <label>Student name<input name="fullName" className={fieldClass} required maxLength={200} defaultValue={student?.fullName} /></label>
          <label>Private phone<input name="phone" type="tel" className={fieldClass} maxLength={80} defaultValue={student?.phone ?? ""} /></label>
          <label>Home department<input name="department" className={fieldClass} maxLength={120}
            defaultValue={student?.departmentLabel ?? ""} placeholder={student?.department ?? undefined} /></label>
          <label>Home batch<select name="homeBatchId" className={fieldClass} defaultValue={student?.homeBatchId ?? ""}>
            <option value="">No home batch</option>
            {options.homeBatches.filter(row => row.status === "active" || row.id === student?.homeBatchId).map(row =>
              <option key={row.id} value={row.id}>{row.stream} {row.label}{row.status === "active" ? "" : ` · ${row.status}`}</option>)}
          </select></label>
        </div>
      </StudentActionForm>
    </section>
    {student && <>
      <section className="ruled min-w-0 rounded-lg p-4">
        <h2 className="font-display text-lg font-semibold">Enrollments</h2>
        {student.history.length ? <ul className="mt-2 divide-y divide-[var(--color-line)]">
          {student.history.map(row => <li key={row.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[2fr_1fr_auto]">
            <span className="break-words"><strong>{row.course} · {row.title}</strong><br />{row.term} · Teaching group {row.groupId}</span>
            <span className="capitalize">{row.audience} · {row.status}</span>
            {row.termStatus === "active" && <Link className="underline" href={`/attendance/roster?group=${row.groupId}`}>Manage roster</Link>}
          </li>)}
        </ul> : <p className="mt-2 text-sm text-muted">No teaching group enrollments.</p>}
      </section>
      <section className="ruled min-w-0 rounded-lg p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">{student.status === "active" ? "Deactivate student" : "Restore student"}</h2>
        <StudentActionForm action={changeStudent} submit={student.status === "active" ? "Deactivate student" : "Restore student"}>
          <input type="hidden" name="id" value={student.id} /><input type="hidden" name="fingerprint" value={student.fingerprint} />
          <input type="hidden" name="operation" value={student.status === "active" ? "deactivate" : "restore"} />
          {student.status === "active" ? <label className="block text-sm"><input type="checkbox" name="confirmed" value="yes" required /> I confirm that this student should be excluded from new attendance sessions across all groups. Recorded attendance is kept.</label>
            : <p className="text-sm text-muted">Current active enrollments become eligible for new attendance sessions again.</p>}
        </StudentActionForm>
      </section>
    </>}
  </div>;
}
