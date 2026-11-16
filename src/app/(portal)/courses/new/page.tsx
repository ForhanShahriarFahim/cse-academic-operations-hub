import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CourseForm } from "@/components/courses/course-form";
import { courseDepartments, requireCourseEditor } from "@/lib/course-data";
import { courseReturnQuery } from "@/lib/course-records";
export const dynamic = "force-dynamic";
export default async function NewCoursePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireCourseEditor("/courses/new");
  const query = courseReturnQuery(await searchParams);
  return <div className="mx-auto max-w-[980px] min-w-0"><Link className="text-sm underline" href={`/courses?${query}`}>← Course catalog</Link><PageHeader context="Global course catalog" title="Add course" description="Create a catalog definition. New courses start Active, without a term offering or teaching group." /><CourseForm record={null} evidence={null} departments={await courseDepartments()} returnQuery={query} /></div>;
}
