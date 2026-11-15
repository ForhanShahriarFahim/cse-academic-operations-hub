import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CourseForm } from "@/components/courses/course-form";
import { courseDepartments, getCourseDetail, requireCourseEditor } from "@/lib/course-data";
import { courseReturnQuery } from "@/lib/course-records";
export const dynamic = "force-dynamic";
export default async function EditCoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string }> }) {
  const { id } = await params; await requireCourseEditor(`/courses/${id}/edit`);
  const detail = await getCourseDetail(id); if (!detail) notFound();
  const query = courseReturnQuery(await searchParams);
  return <div className="mx-auto max-w-[980px] min-w-0"><Link className="text-sm underline" href={`/courses/${id}?${query}`}>← Course details</Link><PageHeader context="Global course catalog" title={`Edit ${detail.record.code}`} description="Correct the definition while preserving recorded use and captured history." /><CourseForm key={detail.record.revision} record={detail.record} evidence={detail.evidence} departments={await courseDepartments()} returnQuery={query} /></div>;
}
