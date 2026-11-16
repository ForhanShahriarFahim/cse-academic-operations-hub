import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { ClassGroupForm, type CourseChoice } from "@/components/class-groups/class-group-forms";
import { getTermClassGroups, requireClassGroupEditor } from "@/lib/class-group-data";
import { classGroupQuery, groupInteger } from "@/lib/class-group-records";

export const dynamic = "force-dynamic";

export default async function NewClassGroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams;
  await requireClassGroupEditor(`/terms/${id}/groups/new`);
  const data = await getTermClassGroups(id);
  if (!data) notFound();
  const { term } = data, returnHref = `/terms/${term.id}/groups${classGroupQuery(search)}`;
  const usable = data.ungrouped.filter(row => row.batchStatus === "active" && row.course.isActive);
  const choices: CourseChoice[] = [...new Map(usable.map(row => [row.course.id, row.course])).values()].map(course => ({
    course, offerings: usable.filter(row => row.course.id === course.id),
    held: data.groups.filter(group => group.course.id === course.id).flatMap(group => group.audiences.map(audience => ({ cohort: audience.name, groupId: group.id }))),
  }));
  const course = typeof search.course === "string" ? groupInteger(search.course) : null, offering = typeof search.offering === "string" ? groupInteger(search.offering) : null;
  return <div className="mx-auto max-w-[980px] min-w-0">
    <Link className="text-sm underline" href={returnHref}>← Class groups</Link>
    <PageHeader context={`Class groups / ${term.name}`} title="Create class group" description="Choose who is taught together, who teaches, and what is needed each week." />
    {!data.editable ? <Notice title="Read-only term">{term.name} is {term.status}. Its class groups cannot be changed.</Notice>
      : !choices.length ? <><Notice>{data.ungrouped.length ? "The offerings still without a class group belong to an inactive cohort or an inactive course, so no class group can be created for them." : `Every offered course in ${term.name} already has a class group.`}</Notice><p className="mt-4 flex flex-wrap gap-2"><Link className={buttonClass.secondary} href={returnHref}>Return to class groups</Link><Link className={buttonClass.secondary} href={`/terms/${term.id}/offerings`}>Open term offerings</Link></p></>
      : <ClassGroupForm termId={term.id} termName={term.name} termStatus={term.status} returnHref={returnHref} teachers={data.teachers} suggestions={data.suggestions} choices={choices} initialCourseId={course} initialOfferingId={offering} />}
  </div>;
}
