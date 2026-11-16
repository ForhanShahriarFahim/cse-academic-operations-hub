import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { OfferingAddForm } from "@/components/offerings/offering-forms";
import { getTermOfferings, requireOfferingEditor } from "@/lib/offering-data";
import { offeringFilters, offeringInteger, offeringQuery } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

export default async function AddOfferingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams, filters = offeringFilters(search);
  await requireOfferingEditor(`/terms/${id}/offerings/add`);
  const data = await getTermOfferings(id, filters.source ? String(filters.source) : undefined);
  if (!data) notFound();
  const { term } = data, returnHref = `/terms/${term.id}/offerings${offeringQuery(search)}`;
  const cohorts = data.cohorts.filter(cohort => cohort.placed && cohort.batchStatus === "active");
  const course = typeof search.course === "string" ? offeringInteger(search.course) : null;
  return <div className="mx-auto max-w-[980px] min-w-0">
    <Link className="text-sm underline" href={returnHref}>← Term offerings</Link>
    <PageHeader context={`Term offerings / ${term.name}`} title="Add course" description="Offer one catalog course to one cohort this term." />
    {!data.editable ? <Notice title="Read-only term">{term.name} is {term.status}. Its offerings cannot be changed.</Notice>
      : !cohorts.length ? <Notice>{term.name} has no active cohort placed in it, so there is nobody to offer courses to.</Notice>
      : <OfferingAddForm termId={term.id} cohorts={cohorts} courses={data.courses.filter(item => item.isActive)} initialCohort={filters.cohort} initialCourse={course} returnHref={returnHref} />}
  </div>;
}
