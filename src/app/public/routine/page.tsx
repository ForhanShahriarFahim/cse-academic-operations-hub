import { AlertTriangle, Landmark } from "lucide-react";
import { getPublicRoutineData } from "@/lib/public-routine";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { RoutineViewControls } from "@/components/routine-view-controls";
import { RoutineDocument } from "@/components/routine-document";

export const dynamic = "force-dynamic";

export default async function PublicRoutinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPublicRoutineData();
  const source = data?.source ?? null;
  const selectionSource = source?.batches ?? [];
  const { selection } = parseRoutineSelection(await searchParams, selectionSource);

  return (
    <div className="paper-grain min-h-screen">
      <header className="no-print border-b border-[var(--color-line)] bg-[var(--color-ink)]">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-gold)]/15 text-[var(--color-gold)]"><Landmark size={16} /></span>
            <div>
              <p className="font-display text-[15px] font-semibold text-white">Official Class Routine</p>
              <p className="text-[10.5px] text-white/50">Department of Computer Science &amp; Engineering · public viewer</p>
            </div>
            {source?.versionNumber && <span className="ml-auto rounded-md border border-white/15 px-2.5 py-1 text-[10.5px] text-white/60">v{source.versionNumber}</span>}
          </div>
          <RoutineViewControls selection={selection} batches={selectionSource.filter((batch) => batch.stream === selection.stream)} exportPath="/public/routine/export" officialPath="/public/routine/official" dark />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {!source ? (
          <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white/60 p-10 text-center">
            <AlertTriangle size={22} className="mx-auto text-[var(--color-gold)]" />
            <h2 className="font-display mt-2 text-[19px] font-semibold">No published routine</h2>
            <p className="mt-1 text-[12.5px] text-[#66705f]">The public viewer only displays approved, published versions. Draft data is never exposed here.</p>
          </div>
        ) : (
          <RoutineDocument projection={projectRoutine({ source, selection })} />
        )}
      </main>
    </div>
  );
}
