"use client";

import { usePathname, useRouter } from "next/navigation";
import { Download, FileText, Printer } from "lucide-react";
import { DAY_SHORT } from "@/lib/time";
import { daysForStream, type Stream } from "@/lib/constants";
import type { RoutineBatch, RoutineSelection, RoutineView } from "@/lib/routine-projection";

export function RoutineViewControls({
  selection,
  batches,
  exportPath,
  dark = false,
  officialPath,
}: {
  selection: RoutineSelection;
  batches: RoutineBatch[];
  exportPath: string;
  dark?: boolean;
  officialPath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams();
    params.set("stream", selection.stream);
    params.set("view", selection.view);
    params.set("day", String(selection.day));
    params.set("batch", selection.batchId ? String(selection.batchId) : "all");
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  function selectStream(stream: Stream) {
    navigate({ stream, day: String(daysForStream(stream)[0]), batch: "all" });
  }

  function selectView(view: RoutineView) {
    navigate({ view });
  }

  const query = new URLSearchParams({
    stream: selection.stream,
    view: selection.view,
    day: String(selection.day),
    batch: selection.batchId ? String(selection.batchId) : "all",
  });
  const base = dark ? "border-white/15 bg-white/5" : "border-[var(--color-line)] bg-white";
  const inactive = dark ? "text-white/60 hover:text-white" : "text-muted hover:text-[var(--color-pine)]";

  return (
    <div className={`no-print flex flex-wrap items-center gap-2 ${dark ? "text-white" : ""}`} aria-label="Routine view controls">
      <div className={`flex rounded-md border p-0.5 ${base}`} role="group" aria-label="Stream">
        {(["HSC", "DIPLOMA"] as Stream[]).map((stream) => (
          <button key={stream} type="button" onClick={() => selectStream(stream)} aria-pressed={selection.stream === stream}
            className={`rounded px-3 py-1.5 text-[11.5px] font-semibold ${selection.stream === stream ? "bg-[var(--color-pine)] text-white" : inactive}`}>
            {stream === "HSC" ? "HSC" : "Diploma"}
          </button>
        ))}
      </div>
      <div className={`flex rounded-md border p-0.5 ${base}`} role="group" aria-label="View">
        {(["day", "week"] as RoutineView[]).map((view) => (
          <button key={view} type="button" onClick={() => selectView(view)} aria-pressed={selection.view === view}
            className={`rounded px-3 py-1.5 text-[11.5px] font-semibold capitalize ${selection.view === view ? "bg-[var(--color-ink)] text-white" : inactive}`}>
            {view === "day" ? "Day" : "Week"}
          </button>
        ))}
      </div>
      {selection.view === "day" && (
        <div className={`flex rounded-md border p-0.5 ${base}`} role="group" aria-label="Day">
          {daysForStream(selection.stream).map((day) => (
            <button key={day} type="button" onClick={() => navigate({ day: String(day) })} aria-pressed={selection.day === day}
              className={`rounded px-2.5 py-1.5 text-[11.5px] font-semibold ${selection.day === day ? "bg-[var(--color-gold)] text-[var(--color-ink)]" : inactive}`}>
              {DAY_SHORT[day]}{selection.stream === "HSC" && day === 6 ? "*" : ""}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-[11px] font-semibold">
        <span className={dark ? "text-white/60" : "text-muted"}>Batch</span>
        <select value={selection.batchId ?? "all"} onChange={(event) => navigate({ batch: event.target.value })}
          className={`rounded-md border px-2.5 py-1.5 text-[11.5px] outline-none ${dark ? "border-white/15 bg-[var(--color-ink)] text-white" : "border-[var(--color-line)] bg-white text-[var(--color-ink)]"}`}>
          <option value="all">All batches</option>
          {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.stream === "HSC" ? "HSC" : "DIP"}-{batch.label}</option>)}
        </select>
      </label>
      <span className="ml-auto flex items-center gap-2">
        {officialPath && <a href={officialPath} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold ${base} ${inactive}`}>
          <FileText size={13} /> Official package
        </a>}
        <button type="button" onClick={() => window.print()} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold ${base} ${inactive}`}>
          <Printer size={13} /> Print / PDF
        </button>
        <a href={`${exportPath}?${query.toString()}`} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold ${base} ${inactive}`}>
          <Download size={13} /> CSV
        </a>
      </span>
    </div>
  );
}
