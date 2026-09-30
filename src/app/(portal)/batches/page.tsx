import { getPortalData } from "@/lib/data";
import { PageHeader, Badge, Panel, EmptyNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const data = await getPortalData();

  const streams = [
    { key: "HSC" as const, title: "HSC stream", note: "Regular teaching Saturday–Tuesday · Friday by approved exception" },
    { key: "DIPLOMA" as const, title: "Diploma stream", note: "Teaching Friday & Saturday · morning windows provisional" },
  ];

  return (
    <div>
      <PageHeader
        context="Planning records"
        title="Batches & semester placements"
        description={`Each batch's semester in ${data.term.name}. HSC-22B and Diploma-22B are separate batches, and earlier terms keep their own placements.`}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {streams.map((s) => {
          const rows = data.batches.filter((b) => b.stream === s.key);
          return (
            <Panel key={s.key} title={s.title} sub={s.note}>
              <div role="region" aria-label="Batches and semesters" tabIndex={0} className="table-region overflow-x-auto"><table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--color-line-soft)] text-left">
                    <th className="pb-1.5"><span className="micro-label">Batch</span></th>
                    <th className="pb-1.5"><span className="micro-label">Semester</span></th>
                    <th className="pb-1.5"><span className="micro-label">Students</span></th>
                    <th className="pb-1.5"><span className="micro-label">Meetings/wk</span></th>
                    <th className="pb-1.5"><span className="micro-label">Status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const n = data.meetings.filter((m) => m.audiences.some((a) => a.batchId === b.id)).length;
                    const shared = data.meetings.some(
                      (m) => m.audiences.some((a) => a.batchId === b.id) && (m.audiences.length > 1 || m.externalAudienceLabel),
                    );
                    return (
                      <tr key={b.id} className="border-b border-[var(--color-line-soft)]/60">
                        <td className="py-2 font-mono font-bold text-[var(--color-pine)]">{s.key === "HSC" ? "HSC" : "DIP"}-{b.label}</td>
                        <td className="py-2">
                          <Badge tone="sage">Sem {b.semester ?? "?"}</Badge>
                        </td>
                        <td className="py-2 font-mono">
                          {b.studentCount ?? <span className="text-[var(--color-clay)]" title="Unknown — never treated as zero">unknown</span>}
                        </td>
                        <td className="py-2 font-mono">{n}</td>
                        <td className="py-2">
                          {shared && <Badge tone="gold">merged/shared</Badge>}
                          {b.studentCount == null && <Badge tone="clay">count unverified</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </Panel>
          );
        })}
      </div>
      <div className="mt-4">
        <EmptyNote>
          Sections, lab sub-groups and elective groups aggregate into these batch audiences in this phase.
          Clash rules: a whole-batch meeting conflicts with any overlapping meeting for the same batch;
          unknown student overlap (DIP-18B count unverified) produces advisories, never silent approval.
        </EmptyNote>
      </div>
    </div>
  );
}
