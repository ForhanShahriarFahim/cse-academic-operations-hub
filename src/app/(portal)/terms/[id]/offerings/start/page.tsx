import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/account/styles";
import { OfferingStartForm } from "@/components/offerings/offering-forms";
import { getTermOfferings, requireOfferingEditor } from "@/lib/offering-data";
import { offeringFilters, offeringQuery } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

export default async function StartOfferingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams, filters = offeringFilters(search);
  await requireOfferingEditor(`/terms/${id}/offerings/start`);
  const data = await getTermOfferings(id, filters.source ? String(filters.source) : undefined);
  if (!data) notFound();
  const { term, source } = data, returnHref = `/terms/${term.id}/offerings${offeringQuery(search)}`;
  // A cohort is listed when it is placed and either the reader asked for it or it still has something to review.
  const cohorts = data.cohorts.filter(cohort => cohort.placed && (filters.cohort ? cohort.batchId === filters.cohort : cohort.proposal.some(item => item.selectable) || !cohort.offerings.length));
  return <div className="mx-auto max-w-[980px] min-w-0">
    <Link className="text-sm underline" href={returnHref}>← Term offerings</Link>
    <PageHeader context={`Term offerings / ${term.name}`} title="Start from previous term" description={source ? `Review what ${source.name} offered at each cohort's stream and semester. Only missing offerings are created; nothing existing is changed.` : "There is no earlier term to copy from."} />
    {!data.editable && <Notice title="Read-only term">{term.name} is {term.status}. Its offerings cannot be changed.</Notice>}
    {data.editable && !source && <Notice>No earlier active or completed term exists. Add this term&apos;s courses individually. <Link className="font-semibold underline" href={`/terms/${term.id}/offerings/add${offeringQuery(search)}`}>Add course</Link></Notice>}
    {data.editable && source && <>
      <Panel className="mb-5">
        <form method="get" className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div><label htmlFor="start-source" className="mb-1 block text-sm font-semibold">Copy from</label><select id="start-source" name="source" className={inputClass} defaultValue={source.id} aria-describedby="start-source-hint">{data.sources.map(option => <option key={option.id} value={option.id}>{option.name} · {option.status}</option>)}</select></div>
          <div><label htmlFor="start-cohort" className="mb-1 block text-sm font-semibold">Cohorts</label><select id="start-cohort" name="cohort" className={inputClass} defaultValue={filters.cohort ?? ""}><option value="">All with something to review</option>{data.cohorts.filter(cohort => cohort.placed).map(cohort => <option key={cohort.batchId} value={cohort.batchId}>{cohort.name} · Semester {cohort.semester}</option>)}</select></div>
          <button type="submit" className={`${buttonClass.secondary} self-end`}>Show</button>
        </form>
        <p id="start-source-hint" className="mt-2 text-xs text-muted">{data.preparedFromId === source.id ? `Default: the term ${term.name} was prepared from.` : data.preparedFromId ? `${term.name} was prepared from a different term; you chose ${source.name}.` : "The latest earlier term is chosen unless you pick another."} Changing the source reloads this review and clears your ticks.</p>
      </Panel>
      {!cohorts.length
        ? <Notice>Every placed cohort already has all the courses {source.name} offered in its slot. <Link className="font-semibold underline" href={returnHref}>Return to offerings</Link></Notice>
        : <OfferingStartForm key={`${source.id}-${filters.cohort ?? "all"}-${data.startFingerprint}`} termId={term.id} termName={term.name} source={source} cohorts={cohorts} fingerprint={data.startFingerprint} returnHref={returnHref} />}
    </>}
  </div>;
}
