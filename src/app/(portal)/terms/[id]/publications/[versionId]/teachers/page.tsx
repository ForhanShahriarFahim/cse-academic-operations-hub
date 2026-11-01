import Link from "next/link";
import { notFound } from "next/navigation";
import { getTermPublication } from "@/lib/term-archive";
import { requireTermPage } from "@/lib/term-pages";
import { projectTeacherRoutine } from "@/lib/teacher-routine";
import { IndividualRoutineSheets } from "@/components/teacher-routine/sheet";
import { PrintPackageButton } from "@/components/print-package-button";
import { PageHeader } from "@/components/ui";
export default async function ArchiveTeachersPage({params}:{params:Promise<{id:string;versionId:string}>}) {
  await requireTermPage("view_internal_portal");const {id,versionId}=await params;const archive=await getTermPublication(Number(id),Number(versionId));if(!archive)notFound();
  const teachers=[...new Map(archive.source.meetings.flatMap(m=>m.teachers).map(t=>[t.id,t])).values()].sort((a,b)=>a.fullName.localeCompare(b.fullName));
  const printedAt=new Date().toISOString();
  return <div><div className="no-print"><PageHeader context="Historical publication · Read-only" title={`${archive.source.termName} · Teacher sheets v${archive.source.versionNumber}`} description="Classes and teacher identities come only from this saved version. Historical workload totals were not stored in the publication and are shown as unavailable." actions={<div className="flex flex-wrap gap-4"><Link className="text-sm underline" href={`/terms/${id}/publications/${versionId}`}>Back to publication</Link><PrintPackageButton/></div>}/></div>{!teachers.length&&<p>No teacher classes in this saved publication.</p>}{teachers.map(teacher=><IndividualRoutineSheets key={teacher.id} routine={projectTeacherRoutine({source:archive.source,teacher:{...teacher,status:archive.metadata.teachers.find(t=>t.shortCode===teacher.shortCode)?.status??"recorded"},allocations:[],coverage:[]})} printedAt={printedAt} historicalAllocationsUnavailable/>)}</div>;
}
