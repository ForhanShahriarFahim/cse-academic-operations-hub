import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { StudentDirectory } from "@/components/students/directory";
import { secondaryClass } from "@/components/students/styles";
import { searchStudents, studentDirectoryOptions } from "@/lib/student-directory";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const options = await studentDirectoryOptions();
  if (!options) redirect("/forbidden");
  const initial = await searchStudents(new FormData());
  return <div className="min-w-0 space-y-4">
    <PageHeader context="Classes" title="Students" description="Find student records and see their teaching group enrollments." />
    <div className="flex flex-wrap gap-2"><Link className={secondaryClass} href="/students/new">Add student</Link>
      <a className={secondaryClass} href="#import-students">Import students</a></div>
    <StudentDirectory initial={initial} options={options} />
  </div>;
}
