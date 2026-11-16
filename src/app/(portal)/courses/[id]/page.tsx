import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { CourseLifecycle } from "@/components/courses/course-lifecycle";
import { getCourseDetail } from "@/lib/course-data";
import { COURSE_FIELDS, COURSE_LABELS, COURSE_TYPES, courseReturnQuery } from "@/lib/course-records";
export const dynamic = "force-dynamic";
export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string; done?: string }> }) {
  const { id } = await params, detail = await getCourseDetail(id); if (!detail) notFound();
  const { record, owner, editor, evidence, fingerprints } = detail, search = await searchParams, query = courseReturnQuery(search);
  const value = (field: typeof COURSE_FIELDS[number]) => field === "owningDepartmentId" ? owner ?? "Unknown" : field === "courseType" ? COURSE_TYPES[record.courseType as keyof typeof COURSE_TYPES] ?? `${record.courseType} (unsupported legacy value)` : typeof record[field] === "boolean" ? record[field] ? "Yes" : "No" : record[field] ?? "None";
  return <div className="mx-auto max-w-[980px] min-w-0 break-words"><Link href={`/courses?${query}`} className="text-sm underline">← Course catalog</Link><PageHeader context="Global course catalog" title={record.code} description={`${record.title} · ${record.isActive ? "Active" : "Inactive"}`} actions={editor && <><Link className={buttonClass.secondary} href={`/courses/${id}/history?${query}`}>Change history</Link><Link className={buttonClass.primary} href={`/courses/${id}/edit?${query}`}>Edit course</Link></>} />
    {typeof search.done === "string" && <Notice tone="success">{search.done}</Notice>}
    <dl className="ruled grid min-w-0 gap-4 rounded-lg p-4 md:grid-cols-2">{COURSE_FIELDS.map(field => <div key={field} className="min-w-0 break-words"><dt className="text-xs font-semibold text-muted">{COURSE_LABELS[field]}</dt><dd className="mt-1 text-sm">{String(value(field))}</dd></div>)}</dl><section className="mt-4 text-sm"><h2 className="font-semibold">Workload is assigned per teaching group</h2><p className="mt-2 text-muted">Catalog credits are academic credits. Editing this definition never calculates or changes allocation units, eligibility or payments. Live working records use the current title; published routines and existing claims keep their captured labels.</p></section>
    {editor && evidence && fingerprints && <CourseLifecycle key={`${record.revision}-${record.isActive}`} record={record} evidence={evidence} fingerprint={record.isActive ? fingerprints.deactivate : fingerprints.reactivate} returnQuery={query} />}
  </div>;
}
