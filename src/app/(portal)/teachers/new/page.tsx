import { PageHeader } from "@/components/ui";
import { TeacherForm } from "@/components/teachers/teacher-form";
import { getDepartmentOptions } from "@/lib/teacher-data";
import { formValues, requireTeacherEditor } from "@/lib/teacher-pages";

export const dynamic = "force-dynamic";

export default async function NewTeacherPage() {
  const { privateContacts } = await requireTeacherEditor("/teachers/new");
  const departments = await getDepartmentOptions();
  const initial = formValues(null, privateContacts);
  initial.employmentType = "full_time";
  initial.homeDepartmentId = String(departments.find((d) => d.code === "CSE")?.id ?? "");
  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader context="Teachers" title="Add teacher" description="Add a person who teaches CSE classes. A teacher record is not a portal account; accounts are in People & Access." />
      <TeacherForm mode="create" teacherId={null} expectedUpdatedAt={null} initial={initial} departments={departments}
        privateContacts={privateContacts} publishedWithCode={[]} lastSaved={null} cancelHref="/teachers" />
    </div>
  );
}
