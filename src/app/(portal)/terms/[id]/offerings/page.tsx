import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyNote, Notice, PageHeader, Panel, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintHeader } from "@/components/print-header";
import { buttonClass, inputClass } from "@/components/account/styles";
import { getTermOfferings } from "@/lib/offering-data";
import { COURSE_TYPES } from "@/lib/course-records";
import { OFFERING_COMPARISON_LABELS, offeringFilters, offeringOffered, offeringQuery, offeringStatusLabel } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

const streamLabel = (stream: string) => stream === "HSC" ? "HSC stream" : stream === "DIPLOMA" ? "Diploma stream" : `${stream} stream`;
const typeLabel = (value: string) => COURSE_TYPES[value as keyof typeof COURSE_TYPES] ?? `${value} (unsupported)`;

export default async function TermOfferingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams, filters = offeringFilters(search);
  const data = await getTermOfferings(id, filters.source ? String(filters.source) : undefined);
  if (!data) notFound();
  const { term, source, canEdit } = data, base = `/terms/${term.id}/offerings`, query = offeringQuery(search);
  const needle = filters.q.toLowerCase();
  const cohorts = data.cohorts
    .filter(cohort => (filters.stream === "all" || cohort.stream === filters.stream) && (!filters.cohort || cohort.batchId === filters.cohort))
    .map(cohort => ({
      ...cohort,
      visible: cohort.offerings.filter(row =>
        (filters.status === "all" || (filters.status === "offered" ? offeringOffered(row.status) : row.status === "cancelled"))
        && (filters.compare === "any" || row.comparison === filters.compare)
        && (!needle || `${row.course.code} ${row.course.title}`.toLowerCase().includes(needle))),
    }));
  const filtered = filters.q || filters.status !== "all" || filters.compare !== "any";
  const placed = data.cohorts.filter(cohort => cohort.placed);
  const done = typeof search.done === "string" ? search.done.slice(0, 300) : null;
  return <div className="min-w-0">
    <PrintHeader title={`Term offerings — ${term.name}`} termName={term.name} publishedVersion={null} publicationState={`Working record · ${term.status} term${source ? ` · compared with ${source.name}` : ""}`} />
    <Link href={`/terms/${term.id}`} className="no-print mb-3 inline-block text-sm underline">← {term.name}</Link>
    <PageHeader context="Planning records / Courses & offerings" title={`Term offerings — ${term.name}`}
      description={<>What each cohort is offered this term{source ? <>, compared with {source.name}</> : null}. {term.status === "active" ? "This is the active term." : `This is a ${term.status} term; viewing it does not change the active term.`}</>}
      actions={<><PrintButton /><Link className={buttonClass.secondary} href={`/terms/${term.id}/groups`}>Class groups</Link>{data.editor && <Link className={buttonClass.secondary} href={`${base}/history${query}`}>Change history</Link>}{canEdit && placed.length > 0 && <><Link className={buttonClass.secondary} href={`${base}/add${query}`}>Add course</Link><Link className={buttonClass.primary} href={`${base}/start${query}`}>Start from previous term</Link></>}</>} />
    {done && <Notice tone="success" className="mb-4">{done}</Notice>}
    {!data.editable && <Notice className="mb-4" title="Read-only term">{term.name} is {term.status}. Its offerings are shown for reference and cannot be changed.</Notice>}
    {data.editable && !data.editor && <Notice className="mb-4" title="View only">You can see this term&apos;s offerings and the comparison. Changing offerings needs the academic administrator role.</Notice>}

    {!placed.length
      ? <Panel title="No cohorts placed"><p className="text-sm">{term.name} has no cohort placements yet, so there is nobody to offer courses to.</p>{term.status === "draft" && <p className="mt-3"><Link className={buttonClass.secondary} href={`/terms/${term.id}/rollover`}>Prepare next term</Link></p>}</Panel>
      : <>
        <section aria-label="Comparison summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Offered" value={data.totals.offered} sub="Planned, open or completed" />
          <StatCard label="Carried" value={source ? data.totals.carried : "—"} sub={source ? `Also offered in ${source.name}` : "Nothing to compare"} />
          <StatCard label="Added" value={source ? data.totals.added : "—"} sub="Not in the previous term's slot" />
          <StatCard label="Dropped" value={source ? data.totals.dropped : "—"} sub="Offered before, absent now" tone={source && data.totals.dropped ? "warn" : "default"} />
          <StatCard label="Changed" value={source ? data.totals.changed : "—"} sub="Same course, cancelled now" tone={source && data.totals.changed ? "warn" : "default"} />
          <StatCard label="Cohorts not started" value={data.totals.notStarted} sub="Placed, no offerings yet" tone={data.totals.notStarted ? "warn" : "default"} />
        </section>
        <Panel className="no-print mb-5">
          <form method="get" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
            <div><label htmlFor="of-q" className="mb-1 block text-sm font-semibold">Search code or title</label><input id="of-q" name="q" className={inputClass} defaultValue={filters.q} maxLength={200} /></div>
            <div><label htmlFor="of-stream" className="mb-1 block text-sm font-semibold">Stream</label><select id="of-stream" name="stream" className={inputClass} defaultValue={filters.stream}><option value="all">All</option><option value="HSC">HSC</option><option value="DIPLOMA">Diploma</option></select></div>
            <div><label htmlFor="of-status" className="mb-1 block text-sm font-semibold">Status</label><select id="of-status" name="status" className={inputClass} defaultValue={filters.status}><option value="all">All</option><option value="offered">Offered</option><option value="cancelled">Cancelled</option></select></div>
            <div><label htmlFor="of-compare" className="mb-1 block text-sm font-semibold">Comparison</label><select id="of-compare" name="compare" className={inputClass} defaultValue={filters.compare}><option value="any">Any</option><option value="carried">Carried</option><option value="added">Added</option><option value="changed">Changed</option></select></div>
            <div><label htmlFor="of-source" className="mb-1 block text-sm font-semibold">Compared with</label><select id="of-source" name="source" className={inputClass} defaultValue={source?.id ?? ""} disabled={!data.sources.length}>{!data.sources.length && <option value="">No earlier term</option>}{data.sources.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
            {filters.cohort ? <input type="hidden" name="cohort" value={filters.cohort} /> : null}
            <button className={`${buttonClass.secondary} self-end`} type="submit">Apply</button>
          </form>
          <p className="mt-3 text-xs text-muted">{source ? "Changing “Compared with” changes only the comparison, never the offerings." : "There is no earlier term to compare with. Offerings are listed without carried / added / dropped labels."}{(filtered || filters.cohort || filters.stream !== "all") && <> <Link className="underline" href={`${base}${filters.source ? `?source=${filters.source}` : ""}`}>Reset filters</Link></>}</p>
        </Panel>

        {!cohorts.length && <EmptyNote>No cohort matches these filters. <Link className="underline" href={base}>Reset filters</Link>.</EmptyNote>}
        <div className="grid gap-5">{cohorts.map(cohort => {
          const cohortQuery = offeringQuery(search, { cohort: String(cohort.batchId) });
          return <section key={cohort.batchId} aria-labelledby={`cohort-${cohort.batchId}`} className="ruled min-w-0 rounded-lg print:break-inside-avoid print:border-0">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
              <div className="min-w-0"><p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{streamLabel(cohort.stream)}</p><h2 id={`cohort-${cohort.batchId}`} className="font-display text-[18px] font-semibold tracking-tight">{cohort.name} · {cohort.semester == null ? "No placement in this term" : `Semester ${cohort.semester}`}</h2></div>
              <p className="text-[12.5px] text-muted">{cohort.offerings.length ? `${cohort.counts.offered} offered · ${cohort.counts.cancelled} cancelled · ${cohort.counts.ungrouped} without a class group` : "Not started"}{cohort.batchStatus !== "active" ? ` · cohort ${cohort.batchStatus}` : ""}</p>
            </header>
            <div className="px-4 pb-4">
              {!cohort.offerings.length && <div className="pt-4 text-sm"><p>No offerings yet.{source && cohort.placed ? cohort.hasBasis ? ` ${source.name} offered ${cohort.proposal.length} course${cohort.proposal.length === 1 ? "" : "s"} at ${streamLabel(cohort.stream).replace(" stream", "")} semester ${cohort.semester}.` : ` ${source.name} had no ${streamLabel(cohort.stream).replace(" stream", "")} cohort at semester ${cohort.semester}, so nothing is proposed.` : ""}</p>{canEdit && cohort.placed && cohort.batchStatus === "active" && <p className="no-print mt-3 flex flex-wrap gap-2">{cohort.proposal.some(item => item.selectable) && <Link className={buttonClass.primary} href={`${base}/start${cohortQuery}`}>Start from previous term</Link>}<Link className={buttonClass.secondary} href={`${base}/add${cohortQuery}`}>Add course</Link></p>}</div>}
              {cohort.offerings.length > 0 && !cohort.visible.length && <p className="pt-4 text-sm text-muted">No offering of this cohort matches the filters.</p>}
              <ul className="divide-y divide-[var(--color-line-soft)]">{cohort.visible.map(row => <li key={row.id} className="grid min-w-0 gap-x-6 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 break-words">
                  <p className="font-mono text-[13px] font-bold">{row.course.code}</p>
                  <p className="text-[14px] font-semibold leading-snug">{row.course.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{row.course.credits} academic credits · {typeLabel(row.course.courseType)}{cohort.semester != null && row.course.semester !== cohort.semester ? ` · semester ${row.course.semester} course` : ""}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={offeringOffered(row.status) ? "pine" : "neutral"}>{offeringStatusLabel(row.status)}</Badge>
                    {row.comparison && <Badge tone={row.comparison === "carried" ? "neutral" : "gold"}>{OFFERING_COMPARISON_LABELS[row.comparison]}</Badge>}
                    {!row.course.isActive && <Badge tone="clay">Course inactive</Badge>}
                  </p>
                </div>
                <div className="text-[12.5px] text-muted sm:text-right">
                  <p>{row.groups ? `In ${row.groups} class group${row.groups === 1 ? "" : "s"}` : "No class group yet"} · <Link className="no-print underline" href={`/terms/${term.id}/groups?q=${encodeURIComponent(row.course.code)}`}>Class groups<span className="sr-only"> for {row.course.code}</span></Link></p>
                  {canEdit && <p className="no-print mt-1"><Link className="font-semibold text-[var(--color-pine)] underline" href={`${base}/${row.id}${query}`}>{row.status === "cancelled" ? "Restore" : "Change"}<span className="sr-only"> {row.course.code} for {cohort.name}</span></Link></p>}
                </div>
              </li>)}</ul>
              {cohort.dropped.length > 0 && filters.compare === "any" && filters.status === "all" && !needle && <div className="mt-2 rounded-md border border-[var(--color-gold)]/40 border-l-[3px] bg-gold-tint px-3.5 py-3 text-[13px]">
                <h3 className="font-semibold">Dropped since {source!.name}</h3>
                <ul className="mt-1.5 grid gap-1">{cohort.dropped.map(item => <li key={item.course.id} className="break-words"><span className="font-mono font-bold">{item.course.code}</span> {item.course.title} — {item.partial ? "offered to some cohorts in this slot" : `offered at semester ${cohort.semester}`}, not offered now.{!item.course.isActive ? " The course is inactive." : canEdit && cohort.batchStatus === "active" ? <> <Link className="no-print font-semibold underline" href={`${base}/add${offeringQuery(search, { cohort: String(cohort.batchId), course: String(item.course.id) })}`}>Add it</Link></> : null}</li>)}</ul>
              </div>}
              {canEdit && cohort.offerings.length > 0 && cohort.placed && cohort.batchStatus === "active" && <p className="no-print mt-3"><Link className="text-[13px] font-semibold text-[var(--color-pine)] underline" href={`${base}/add${cohortQuery}`}>Add course to {cohort.name}</Link></p>}
            </div>
          </section>;
        })}</div>
        <p className="mt-5 max-w-[80ch] text-[12.5px] text-muted">Offering a course protects its academic fields in the catalog and keeps the course active. A cohort with offered courses cannot be graduated until they are cancelled or the term is completed. Teachers, class groups and timetable are arranged separately.</p>
      </>}
  </div>;
}
