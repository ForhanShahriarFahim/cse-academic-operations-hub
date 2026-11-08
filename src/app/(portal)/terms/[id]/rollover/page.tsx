import Link from "next/link";
import { notFound } from "next/navigation";
import { RolloverForm } from "@/components/batches/rollover-form";
import { PageHeader, Panel, Notice } from "@/components/ui";
import { inputClass, buttonClass } from "@/components/account/styles";
import { getRolloverWorkspace } from "@/lib/rollover-data";
import { eligibleCohort, positiveId } from "@/lib/rollover";
import { AuthorizationError } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function RolloverPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{source?:string}>}) {
  const id = Number((await params).id), query = await searchParams;
  if (!positiveId(id)) notFound();
  let data;
  try { data = await getRolloverWorkspace(id,typeof query.source === "string" ? Number(query.source) : undefined); }
  catch (e) { if (e instanceof AuthorizationError) return <Notice tone="warn">You do not have permission to prepare terms and cohort placements. <Link href={`/terms/${id}`} className="underline">View term summary</Link>.</Notice>; throw e; }
  if (!data) notFound();
  const {target,receipt} = data;
  if (receipt) return <div className="min-w-0 break-words"><PageHeader context={`${target.status} term · active across the portal: ${data.activeName}`} title={`${target.name} preparation receipt`} description={`Prepared ${new Date(receipt.createdAt).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})} (Asia/Dhaka). This receipt cannot be overwritten by the wizard.`}/><Panel title={`${receipt.summary.source} → ${receipt.summary.target}`}><p className="text-sm">Reason: {receipt.reason}</p><ul className="my-4 space-y-2 text-sm">{receipt.summary.decisions.map(d => <li key={d.id}><strong>{d.stream}-{d.label}</strong> · {d.disposition} · {d.destinationSemester == null ? "No destination placement" : `Semester ${d.destinationSemester} · ${d.destinationCount == null ? "Unknown" : `${d.destinationCount} estimate`}`} {d.reason && `· ${d.reason}`}</li>)}</ul><p className="text-sm">Grid copied: {receipt.summary.grid.patterns} patterns · {receipt.summary.grid.plans} plans · {receipt.summary.grid.windows} windows. Authorized actor ID: {receipt.actorUserId}.</p><div className="mt-5 flex flex-wrap gap-4"><Link className="underline" href={`/terms/${id}`}>View term setup</Link>{target.status === "draft" && <Link className={buttonClass.primary} href={`/terms/${id}/activate`}>Review activation separately</Link>}</div></Panel></div>;
  const selectedSource = data.sources.find(s => s.id === data.sourceId);
  const excluded = data.cohorts.filter(b => !eligibleCohort(b));
  return <div className="min-w-0 break-words"><Link className="mb-3 inline-block text-sm underline" href={`/terms/${id}`}>← Destination term</Link><PageHeader context={`Active across the portal: ${data.activeName}`} title={`Prepare ${target.name}`} description="Choose a source, review cohort decisions and confirm draft preparation. Activation is a separate action."/>
    {target.status !== "draft" ? <Notice tone="warn">Only an unused draft can receive a preparation.</Notice> : <>
      <Panel title="1 · Choose source term"><p className="mb-3 text-sm">Destination: <strong>{target.name}</strong> · {target.startDate} – {target.endDate} · draft</p><p className="mb-4 text-sm">Save correct <Link className="underline" href={`/terms/${id}/edit`}>draft details</Link> and an explicit <Link className="underline" href={`/terms/${id}/setup`}>starting policy</Link> before preparing placements. Those settings freeze once placements exist.</p>
        {data.sources.length ? <form className="flex min-w-0 flex-wrap items-end gap-3"><label className="grid min-w-0 flex-1 gap-1 text-sm">Source term<select name="source" className={inputClass} defaultValue={data.sourceId ?? ""}><option value="">Choose an active/completed source</option>{data.sources.map(s => <option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}</select></label><button className={buttonClass.secondary}>Load source placements</button></form> : <p className="text-sm text-muted">No active or completed source term is available.</p>}
      </Panel>
      {selectedSource && <p className="my-4 text-sm">Source: <strong>{selectedSource.name}</strong> · {selectedSource.status} · {selectedSource.startDate} – {selectedSource.endDate}</p>}
      {!!(excluded.length || data.unplaced.length) && <details className="my-5 rounded border border-line p-4 text-sm"><summary>Excluded and unplaced cohorts ({excluded.length + data.unplaced.length})</summary><ul className="mt-3 space-y-2">{excluded.map(b => <li key={`excluded-${b.id}`}>{b.stream}-{b.label} · {b.status} · source semester {b.semester}. No valid active source placement to progress.</li>)}{data.unplaced.map(b => <li key={`missing-${b.id}`}>{b.stream}-{b.label} · no source placement; semester is unknown.</li>)}</ul></details>}
      {data.sourceId && <RolloverForm key={`${id}-${data.sourceId}`} sourceId={data.sourceId} targetId={id} sourceName={data.sourceName!} targetName={target.name} targetYear={target.academicYear} cohorts={data.cohorts}/>}
    </>}
  </div>;
}
