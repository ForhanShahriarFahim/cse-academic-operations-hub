import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getPortalData } from "@/lib/data";
import { computeWorkloads } from "@/lib/workload";
import { WORKLOAD_ADVISORY_UNITS } from "@/lib/constants";
import { PageHeader, Badge, Panel, EmptyNote } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmtMinutes(m: number) {
  return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
}

export default async function WorkloadPage() {
  const data = await getPortalData();
  const workloads = computeWorkloads(
    data.meetings,
    data.allocations,
    (tid) => data.externals.some((e) => e.teacherId === tid && e.verificationStatus === "pending"),
  );

  const rows = data.teachers
    .map((t) => ({ t, w: workloads.get(t.id) }))
    .filter((r) => r.w && (r.w.workloadUnits > 0 || r.w.weeklyContactMinutes > 0))
    .sort((a, b) => (b.w!.workloadUnits - a.w!.workloadUnits));

  const maxUnits = Math.max(...rows.map((r) => r.w!.workloadUnits), 1);

  return (
    <div>
      <PageHeader
        kicker="Governance"
        title="Teacher workload"
        description="Three metrics are kept strictly separate (spec §16): catalog credits of assigned offerings, approved workload units from explicit allocation records, and scheduled contact minutes from canonical meetings. Merged classes are counted once per teacher — never once per audience."
      />

      <Panel
        title="Department summary"
        sub={`Advisory threshold ${WORKLOAD_ADVISORY_UNITS} units (configurable — no assumed universal maximum)`}
      >
        <div className="overflow-x-auto">
          <table className="routine-table text-[12.5px]">
            <thead>
              <tr>
                {["Teacher", "Catalog credits", "Workload units", "Local / external", "Contact min/wk", "Meetings", "Courses", "Coverage & alerts"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, w }, i) => (
                <tr key={t.id} className={i % 2 ? "bg-wash" : "bg-sheet"}>
                  <td className="px-3 py-2">
                    <Link href={`/teachers/${t.id}`} className="font-mono font-bold text-[var(--color-pine)] hover:underline">{t.shortCode}</Link>
                    <span className="ml-1.5 text-[10.5px] text-muted">{t.homeDepartmentCode}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{w!.catalogCredits.toFixed(1)}</td>
                  <td className="w-[220px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                        <div
                          className={`h-full rounded-full ${w!.workloadUnits > WORKLOAD_ADVISORY_UNITS ? "bg-[var(--color-clay)]" : "bg-[var(--color-pine)]"}`}
                          style={{ width: `${Math.min(100, (w!.workloadUnits / maxUnits) * 100)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono font-semibold">{w!.workloadUnits.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{w!.localUnits.toFixed(1)} / {w!.externalUnits.toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono">{fmtMinutes(w!.weeklyContactMinutes)}</td>
                  <td className="px-3 py-2 font-mono">{w!.weeklyMeetings}</td>
                  <td className="px-3 py-2 font-mono">{w!.distinctCourses}</td>
                  <td className="px-3 py-2">
                    {w!.alerts.length === 0 ? <span className="text-[10.5px] text-muted">—</span> : (
                      <span className="flex flex-wrap items-center gap-1">
                        {w!.alerts.map((a, k) => (
                          <Badge key={k} tone={a.startsWith("External") ? "gold" : "clay"}>
                            <AlertTriangle size={9} /> {a.startsWith("External") ? "ext. unverified" : "high load"}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Panel title="Merged class policy" sub="Example A (spec §16.3)">
          <EmptyNote>
            CSE-2101 is one merged HSC-27B + DIP-21B delivery: two 3-credit offerings, but the physical
            meeting and KMH’s load are recorded once (3.0 units via <em>shared_policy</em>) — automatically
            multiplying to 6 is forbidden.
          </EmptyNote>
        </Panel>
        <Panel title="Co-teaching split" sub="Example C — not assumed 50/50">
          <EmptyNote>
            CSE-2201 (HSC-26B) is co-taught: TAH and SJD are both occupied during meetings, while the
            workload split is an explicit 2.0 / 1.0 allocation record.
          </EmptyNote>
        </Panel>
        <Panel title="External coverage" sub="Known total ≠ full total">
          <EmptyNote>
            Outgoing teaching (MRI → Mathematics, NAK → EEE) counts in these totals. Commitments still at
            completeness level B/D are flagged, so no report claims a verified university-wide figure.
          </EmptyNote>
        </Panel>
      </div>
    </div>
  );
}
