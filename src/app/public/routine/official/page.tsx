import Link from "next/link";
import { getPublicRoutineData } from "@/lib/public-routine";
import { buildOfficialRoutinePackage } from "@/lib/official-routine-package";
import { OfficialRoutinePackage } from "@/components/official-routine-package";
import { PrintPackageButton } from "@/components/print-package-button";

export const dynamic = "force-dynamic";

export default async function PublishedOfficialRoutinePage() {
  const data = await getPublicRoutineData();
  const source = data?.source ?? null;
  if (!source || !data) {
    return <main className="mx-auto max-w-3xl p-8"><h1 className="font-display text-2xl font-bold">No published routine</h1><p className="mt-2">Publish a validated routine before generating the official package.</p></main>;
  }
  const document = buildOfficialRoutinePackage({ source, metadata: data.metadata });
  return <div className="paper-grain min-h-screen py-5 print:bg-white print:py-0">
    <div className="no-print mx-auto mb-4 flex max-w-7xl items-center justify-between px-4">
      <div><h1 className="font-display text-xl font-bold">Official routine package</h1><p className="text-xs text-muted">HSC, Diploma, course offers, teachers, CRs and query contacts</p></div>
      <div className="flex gap-2"><Link href="/public/routine" className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold">Back to viewer</Link><PrintPackageButton /></div>
    </div>
    <OfficialRoutinePackage document={document} />
  </div>;
}
