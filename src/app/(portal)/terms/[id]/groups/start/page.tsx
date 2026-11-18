import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { buttonClass, inputClass } from "@/components/account/styles";
import { ClassGroupStartForm } from "@/components/class-groups/class-group-start-form";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { requireClassGroupEditor } from "@/lib/class-group-data";
import { groupInteger } from "@/lib/class-group-records";
import { getClassGroupStartReview } from "@/lib/class-group-start-store";
import { cohortRead } from "@/lib/term-context";

export const dynamic = "force-dynamic";

export default async function StartClassGroupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string | string[] }> }) {
  const { id } = await params;
  const { source } = await searchParams;
  const termId = groupInteger(id);
  if (!termId) notFound();
  const base = "/terms/" + termId + "/groups";
  await requireClassGroupEditor(base + "/start");
  const requested = groupInteger(source);
  const data = await cohortRead(() => getClassGroupStartReview(db, termId, source === undefined ? null : requested ?? 0));
  if (!data) notFound();

  return <div className="mx-auto max-w-[1100px] min-w-0">
    <Link className="text-sm underline" href={base}>← Class groups</Link>
    <PageHeader context={"Class groups / " + data.target.name} title="Start class groups from a previous term"
      description="Review existing offerings, teachers and weekly requirements before selecting groups to create." />
    {!data.editable ? <Notice title="Read-only term">{data.target.name} is {data.target.status}.</Notice>
      : !data.sources.length ? <Notice>No earlier active or completed term is available. <Link className="underline" href={base}>Return to class groups</Link>.</Notice>
        : <Panel>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label htmlFor="group-source" className="mb-1 block text-sm font-semibold">Copy from</label>
              <select id="group-source" name="source" className={inputClass} defaultValue={data.source?.id ?? ""} required>
                {!data.source && <option value="">Choose an earlier term</option>}
                {data.sources.map(term => <option key={term.id} value={term.id}>{term.name} · {term.status}</option>)}
              </select>
            </div>
            <button className={buttonClass.secondary}>Show review</button>
          </form>
          <p className="mt-2 text-sm text-muted">Changing the source clears the selection.</p>
        </Panel>}
    {data.editable && data.sources.length > 0 && !data.source && <Notice title="Source term unavailable">Choose an eligible earlier term to open the review.</Notice>}
    {data.review && data.source && <>
      {!data.review.hasOfferings && <Notice title="No destination offerings">Prepare this term&apos;s <Link className="underline" href={"/terms/" + termId + "/offerings"}>offerings</Link> first.</Notice>}
      <ClassGroupStartForm key={data.source.id} termId={termId} sourceId={data.source.id} sourceName={data.source.name} termStatus={data.target.status} review={data.review} />
    </>}
  </div>;
}
