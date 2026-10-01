import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { analyzeSchedule } from "@/lib/conflicts";
import { fmtDate } from "@/lib/time";
import { PageHeader, Badge, Panel, StatCard, EmptyNote } from "@/components/ui";
import { PublishPanel } from "@/components/publish-panel";
import { Eye, History } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicationsPage() {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const published = data.versions.find((v) => v.state === "published");
  const draftMeetingCount = data.meetings.length;
  const deltas = published ? draftMeetingCount - published.meetingCount : 0;

  return (
    <div>
      <PageHeader
        context="Routine"
        title="Publications"
        description="Publish the working draft as a new version once it has no blockers. Published versions never change; to correct one, publish a new version."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Published version" value={published ? `v${published.versionNumber}` : "None yet"}
          sub={published ? `In effect from ${fmtDate(published.effectiveFrom)} · ${published.meetingCount} meetings` : "No routine has been published for this term"} tone={published ? "good" : "default"} />
        <StatCard label="Working draft" value={`${draftMeetingCount} meetings`}
          sub={!published ? "Not yet published" : deltas === 0 ? "Same number of meetings as the published version" : `${deltas > 0 ? "+" : ""}${deltas} meetings compared with the published version`} />
        <StatCard label="Blocking conflicts" value={blockers} tone={blockers ? "bad" : "good"} sub={blockers ? "Must be fixed before publishing" : "Nothing blocks publication"} />
        <StatCard label="Warnings" value={warnings} sub="Published with the routine" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Panel title="Version history" sub="Superseded versions remain in the archive — history is never deleted">
            <div role="region" aria-label="Version history" tabIndex={0} className="table-region overflow-x-auto"><table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--color-line-soft)] text-left">
                  <th className="pb-1.5"><span className="micro-label">Version</span></th>
                  <th className="pb-1.5"><span className="micro-label">State</span></th>
                  <th className="pb-1.5"><span className="micro-label">Effective</span></th>
                  <th className="pb-1.5"><span className="micro-label">Meetings</span></th>
                  <th className="pb-1.5"><span className="micro-label">Published by / at</span></th>
                  <th className="pb-1.5"><span className="micro-label">Summary</span></th>
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id} className="border-b border-[var(--color-line-soft)]/60 align-top">
                    <td className="py-2 font-mono font-bold text-[var(--color-pine)]">v{v.versionNumber}</td>
                    <td className="py-2">
                      <Badge tone={v.state === "published" ? "pine" : v.state === "superseded" ? "neutral" : "gold"}>
                        {v.state === "superseded" && <History size={9} />}
                        {v.state}
                      </Badge>
                    </td>
                    <td className="py-2 text-[11.5px]">{fmtDate(v.effectiveFrom)}{v.effectiveTo ? ` → ${fmtDate(v.effectiveTo)}` : " →"}</td>
                    <td className="py-2 font-mono">{v.meetingCount || "—"}</td>
                    <td className="py-2 text-[11px] text-muted">
                      {v.publishedBy ?? "—"}
                      {v.publishedAt && <span className="block text-[10px] text-muted">{new Date(v.publishedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>}
                    </td>
                    <td className="max-w-[220px] py-2 text-[11px] leading-snug text-muted">{v.changeSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Link href="/public/routine" target="_blank"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 px-3 py-2 text-[12px] font-semibold text-[var(--color-pine)] hover:bg-[var(--color-pine)]/10">
              <Eye size={13} /> Open public viewer (published data only)
            </Link>
          </Panel>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <Panel title="Publish new revision" sub="Full server-side validation runs before the version is cut">
            <PublishPanel disabled={blockers > 0} blockerCount={blockers} />
          </Panel>
          <Panel title="Publication guarantees">
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-2">
              <li>• Snapshots are immutable JSON of the canonical meetings — exports always match the selected version.</li>
              <li>• Validation re-runs against the latest teacher, room, break and OD data at commit time.</li>
              <li>• A failed publish leaves no half-published state; past versions stay superseded, not deleted.</li>
              <li>• Future-effective versions never replace today’s routine before their effective date.</li>
            </ul>
          </Panel>
          <EmptyNote>
            Only people allowed to approve publication can publish. Every publication is recorded in the audit log with who published it and the change summary.
          </EmptyNote>
        </div>
      </div>
    </div>
  );
}
