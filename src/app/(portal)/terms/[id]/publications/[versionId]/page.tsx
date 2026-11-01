import Link from "next/link";
import { getTermPublication } from "@/lib/term-archive";
import { requireTermPage } from "@/lib/term-pages";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { teachingDays } from "@/lib/time-grid";
import { RoutineDocument } from "@/components/routine-document";
import { RoutineViewControls } from "@/components/routine-view-controls";
import { PageHeader, Notice } from "@/components/ui";
export default async function ArchivePage({params,searchParams}:{params:Promise<{id:string;versionId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireTermPage("view_internal_portal");const {id,versionId}=await params;
  const archive=await getTermPublication(Number(id),Number(versionId));
  if(!archive)return <Notice tone="warn" title="Stored publication unavailable">This version is missing, belongs to a different term, is not published, or has an unsupported snapshot. No current draft data has been substituted.</Notice>;
  const {source}=archive,base=`/terms/${id}/publications/${versionId}`;
  const {selection}=parseRoutineSelection(await searchParams,source);
  return <div><div className="no-print"><Link className="text-sm underline" href={`/terms/${id}`}>← Term publications</Link><PageHeader context="Historical publication · Read-only" title={`${source.termName} · Version ${source.versionNumber}`} description={`Published ${source.publishedAt??"date unavailable"} · Generated ${source.generatedAt}. Frozen routine; private contacts redacted. Viewing this version does not change the active term.`} actions={<Link className="text-sm font-semibold underline" href={`${base}/teachers`}>Teacher sheets</Link>}/><RoutineViewControls selection={selection} batches={source.batches} days={teachingDays(source.timeGrid)} exportPath={`${base}/export`} officialPath={`${base}/official`}/></div><RoutineDocument projection={projectRoutine({source,selection})}/></div>;
}
