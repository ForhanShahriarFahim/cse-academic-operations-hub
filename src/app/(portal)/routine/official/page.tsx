import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { draftRoutineSource } from "@/lib/routine-sources";
import { buildOfficialRoutinePackage } from "@/lib/official-routine-package";
import { OfficialRoutinePackage } from "@/components/official-routine-package";
import { PrintPackageButton } from "@/components/print-package-button";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DraftOfficialRoutinePage() {
  const data = await getPortalData();
  const document = buildOfficialRoutinePackage({ source: draftRoutineSource(data), metadata: data.publicationMetadata });
  return <div>
    <div className="no-print"><PageHeader context="Routine · Draft preview" title="Official routine package" description="The A4 landscape sheets as they will print: each program's weekly routine, then the course and contact pages." actions={<div className="flex gap-2"><Link href="/routine" className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold">Back to builder</Link><PrintPackageButton /></div>} /></div>
    <OfficialRoutinePackage document={document} />
  </div>;
}
