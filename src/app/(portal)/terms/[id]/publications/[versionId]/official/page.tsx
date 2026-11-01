import Link from "next/link";
import { notFound } from "next/navigation";
import { getTermPublication } from "@/lib/term-archive";
import { requireTermPage } from "@/lib/term-pages";
import { buildOfficialRoutinePackage } from "@/lib/official-routine-package";
import { OfficialRoutinePackage } from "@/components/official-routine-package";
import { PrintPackageButton } from "@/components/print-package-button";
import { PageHeader } from "@/components/ui";
export default async function ArchiveOfficialPage({params}:{params:Promise<{id:string;versionId:string}>}) {
  await requireTermPage("view_internal_portal");const {id,versionId}=await params;const archive=await getTermPublication(Number(id),Number(versionId));if(!archive)notFound();
  const document=buildOfficialRoutinePackage(archive);
  return <div><div className="no-print"><PageHeader context="Historical publication · Read-only" title={`${archive.source.termName} · Official sheets v${archive.source.versionNumber}`} description="Frozen published content with private contacts redacted. The active term remains unchanged." actions={<div className="flex flex-wrap gap-4"><Link className="text-sm underline" href={`/terms/${id}/publications/${versionId}`}>Back to publication</Link><PrintPackageButton/></div>}/></div><OfficialRoutinePackage document={document}/></div>;
}
