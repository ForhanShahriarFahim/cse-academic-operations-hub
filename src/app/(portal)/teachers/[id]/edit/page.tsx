import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Notice, PageHeader } from "@/components/ui";
import { TeacherForm } from "@/components/teachers/teacher-form";
import { allowedFrom, transitionRefusal } from "@/lib/teacher-records";
import { getDepartmentOptions, getTeacherRecord, getTeacherReferences } from "@/lib/teacher-data";
import { formValues, lastSavedLine, requireTeacherEditor } from "@/lib/teacher-pages";

export const dynamic = "force-dynamic";

export default async function EditTeacherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ resolve?: string }> }) {
  const { id } = await params;
  const { resolve } = await searchParams;
  const { privateContacts } = await requireTeacherEditor(`/teachers/${id}/edit`);
  const record = await getTeacherRecord(Number(id));
  if (!record) notFound();
  const mode = record.status === "unresolved" || resolve === "1" ? "resolve" : "edit";
  const back = <Link href={`/teachers/${record.id}`} className="no-print mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline"><ArrowLeft size={13} aria-hidden="true" /> {record.status === "unresolved" ? record.shortCode : record.fullName}</Link>;

  if (!allowedFrom(mode, record.status)) {
    return <div className="mx-auto max-w-[980px]">{back}<PageHeader context="Teachers" title={`Edit ${record.shortCode}`} /><Notice tone="warn">{transitionRefusal(mode, record.status)}</Notice></div>;
  }
  const [departments, references, lastSaved] = await Promise.all([
    getDepartmentOptions(), getTeacherReferences(record.id, record.shortCode), lastSavedLine(record.id),
  ]);
  return (
    <div className="mx-auto max-w-[980px]">
      {back}
      <PageHeader context="Teachers"
        title={mode === "resolve" ? `Resolve ${record.shortCode}` : "Edit teacher"}
        description={mode === "resolve"
          ? `The routine uses ${record.shortCode}, but the teacher list did not name it. Record who it is; its classes stay as they are.`
          : "Changes apply from now. Published routines keep the values they were published with."} />
      <TeacherForm mode={mode} teacherId={record.id} expectedUpdatedAt={record.updatedAt.toISOString()} initial={formValues(record, privateContacts)}
        departments={departments} privateContacts={privateContacts}
        publishedWithCode={references.publishedVersions.map((v) => `${v.termName} publication v${v.versionNumber}`)}
        lastSaved={lastSaved} cancelHref={`/teachers/${record.id}`} />
    </div>
  );
}
