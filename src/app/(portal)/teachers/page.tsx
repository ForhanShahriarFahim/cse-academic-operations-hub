import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPortalData } from "@/lib/data";
import { computeWorkloads } from "@/lib/workload";
import { PageHeader, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const data = await getPortalData();
  const workloads = computeWorkloads(
    data.meetings,
    data.allocations,
    (tid) => data.externals.some((e) => e.teacherId === tid && e.verificationStatus === "pending"),
  );

  const sorted = [...data.teachers].sort((a, b) =>
    (a.homeDepartmentCode !== "CSE" ? 1 : 0) - (b.homeDepartmentCode !== "CSE" ? 1 : 0) ||
    a.shortCode.localeCompare(b.shortCode),
  );

  return (
    <div>
      <PageHeader
        kicker="People"
        title="Teachers"
        description="Home department, incoming/outgoing teaching and identity are modeled separately. Short codes are exact identifiers — IM and IMN are different people and are never merged by substring matching."
      />
      <div className="ruled overflow-hidden rounded-lg">
        <table className="routine-table text-[12.5px]">
          <thead>
            <tr>
              {["Code", "Name", "Home dept.", "Designation", "Credits", "Units", "Contact/wk", "Courses", "Flags", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const w = workloads.get(t.id);
              const isExt = t.homeDepartmentCode !== "CSE";
              return (
                <tr key={t.id} className={i % 2 ? "bg-[#faf7ec]" : "bg-[#fffdf7]"}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[13px] font-bold text-[var(--color-pine)]">{t.shortCode}</span>
                    {t.shortCode === "IM" && (
                      <span className="ml-1 rounded bg-sky-100 px-1 py-px text-[9px] font-bold text-sky-800" title="Distinct from IMN — exact-code matching only">≠ IMN</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{t.fullName}</td>
                  <td className="px-3 py-2">
                    <Badge tone={isExt ? "gold" : "pine"}>{t.homeDepartmentCode ?? "?"}</Badge>
                    {isExt && <span className="ml-1 text-[10px] text-[#8a8571]">incoming</span>}
                  </td>
                  <td className="px-3 py-2 text-[#5c675d]">{t.designation ?? "—"}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-[var(--color-pine)]">{w ? w.catalogCredits.toFixed(1) : "0.0"}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{w ? w.workloadUnits.toFixed(1) : "0.0"}</td>
                  <td className="px-3 py-2 font-mono">
                    {w ? `${Math.floor(w.weeklyContactMinutes / 60)}h ${w.weeklyContactMinutes % 60}m` : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono">{w?.distinctCourses ?? 0}</td>
                  <td className="px-3 py-2">
                    {w?.alerts.map((a, k) => (
                      <Badge key={k} tone="clay">{a.split("—")[0].slice(0, 42)}</Badge>
                    ))}
                    {data.externals.some((e) => e.teacherId === t.id && e.kind !== "unresolved_note") && (
                      <Badge tone="gold">teaches OD</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/teachers/${t.id}`} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--color-pine)] hover:underline">
                      Detail <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px] text-[#8a8571]">
        Vacancies are never shown as people — “UT / Upcoming Teacher” appears in the scheduling tracker, not in this directory.
      </p>
    </div>
  );
}
