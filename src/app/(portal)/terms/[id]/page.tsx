import Link from "next/link";
import { notFound } from "next/navigation";
import { getTermWorkspace } from "@/lib/term-data";
import { getRolloverSummary } from "@/lib/rollover-data";
import { getTermDirectory } from "@/lib/term-data";
import { can, requireActor } from "@/lib/auth";
import { PageHeader, Panel, Notice } from "@/components/ui";
export default async function TermPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
  const summary=await getTermWorkspace(id);if(!summary)notFound();
  const actor=await requireActor(),manager=await can(actor,"manage_terms");const {term}=summary;
  const rollover=await getRolloverSummary(id);
  const batchManager=await can(actor,"manage_batches");
  const terms=await getTermDirectory();const active=terms.filter(t=>t.status==="active");
  const overlaps=terms.filter(t=>t.id!==id&&t.startDate<=term.endDate&&t.endDate>=term.startDate);
  const published=summary.versions.filter(v=>v.state==="published"||v.state==="superseded");
  return <div><Link href="/terms" className="mb-3 inline-block text-sm underline">← All academic terms</Link><PageHeader context={`Viewing ${term.status} term`} title={term.name} description={`Active across the portal: ${active.length===1?active[0].name:active.length?"Unavailable":"None"}. Viewing this term does not change that selection.`} actions={<Link href="/routine" className="text-sm font-semibold underline">Open active routine</Link>}/>
    {(await searchParams).activated==="1"&&<Notice tone="success">Activation saved. Historical records and publications are retained. Publication is a separate action.</Notice>}
    <div className="grid gap-5 lg:grid-cols-2"><Panel title="Term details"><dl className="grid gap-3 text-sm"><div><dt className="text-muted">Academic year</dt><dd>{term.academicYear}</dd></div><div><dt className="text-muted">Dates</dt><dd>{term.startDate} – {term.endDate}</dd></div><div><dt className="text-muted">Routine effective from</dt><dd>{term.effectiveFrom??"Not set"}</dd></div><div><dt className="text-muted">Lifecycle</dt><dd>{term.status}</dd></div></dl></Panel>
    <Panel title="Setup summary"><p className="text-sm">{summary.counts.classes} classes · {summary.counts.placements} placements · {summary.counts.patterns} period patterns · {summary.counts.dayPlans} day plans</p><p className="mt-3 text-sm">Starting policy: {summary.policy?"Stored for this term":"Not saved — default fallback does not qualify"}</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
      {manager&&summary.editable&&<><Link className="underline" href={`/terms/${id}/edit`}>Edit draft details</Link><Link className="underline" href={`/terms/${id}/setup`}>Set starting policy</Link></>}
      {manager&&batchManager&&(term.status==="draft"||rollover)&&<Link className="underline" href={`/terms/${id}/rollover`}>{rollover?"View preparation receipt":"Prepare next term"}</Link>}
      {manager&&term.status==="draft"&&<Link className="underline" href={`/terms/${id}/activate`}>Review activation</Link>}
      {term.status==="active"&&<Link className="underline" href="/routine/periods">Open Days &amp; periods</Link>}</div>
      {!summary.editable&&<p className="mt-3 text-xs text-muted">Identity and dates are read-only: {term.status!=="draft"?"this term is not an unused draft":"business records already use this draft"}.</p>}
      {!["draft","active","completed"].includes(term.status)&&<p className="mt-3 text-xs text-muted">Legacy status retained as stored. Lifecycle controls are unavailable.</p>}
    </Panel></div>
    {!!overlaps.length&&<p className="my-4 text-sm text-muted">Date overlap with: {overlaps.map(t=>t.name).join(", ")}. Overlap does not prevent a valid draft or activation.</p>}
    {rollover&&<div className="my-5"><Panel title="Cohort preparation"><p className="text-sm">From {rollover.source}: {rollover.placements} placements · {rollover.held} held · {rollover.graduated} graduated. Preparation did not activate this term.</p></Panel></div>}
    <div className="mt-5"><Panel title="Saved publications">{published.length?<ul className="divide-y divide-[var(--color-line-soft)]">{published.map(v=><li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>Version {v.versionNumber} · {v.state}<span className="block text-xs text-muted">Published {v.publishedAt??"date unavailable"}</span></span><Link className="font-semibold underline" href={`/terms/${id}/publications/${v.id}`}>View frozen publication</Link></li>)}</ul>:<p className="text-sm text-muted">No saved published routine. Draft versions are not part of this archive.</p>}<p className="mt-3 text-xs text-muted">Read-only snapshot views; private contacts are redacted. Attendance and payment records are outside this archive.</p></Panel></div>
  </div>;
}
