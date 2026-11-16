import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CourseHistory } from "@/components/courses/course-history";
import { getCourseChanges, getCourseDetail, requireCourseEditor } from "@/lib/course-data";
import { courseReturnQuery } from "@/lib/course-records";
export const dynamic = "force-dynamic";
export default async function CourseHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string }> }) {
  const { id } = await params; await requireCourseEditor(`/courses/${id}/history`);
  const detail = await getCourseDetail(id); if (!detail) notFound();
  const query = courseReturnQuery(await searchParams);
  return <div className="mx-auto max-w-[980px] min-w-0"><Link className="text-sm underline" href={`/courses/${id}?${query}`}>← Course details</Link><PageHeader context="Global course catalog" title={`${detail.record.code} · Change history`} description="Administrative changes, newest first. Times are shown in Asia/Dhaka." /><CourseHistory id={detail.record.id} initial={await getCourseChanges(detail.record.id)} /></div>;
}
