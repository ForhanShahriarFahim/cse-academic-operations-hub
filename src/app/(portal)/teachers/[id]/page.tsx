import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, Clock3, GraduationCap } from "lucide-react";
import { getPortalData } from "@/lib/data";
import { computeWorkloads } from "@/lib/workload";
import { fmtRange, DAY_NAMES } from "@/lib/time";
import { sharingLabel, knownAudienceSize } from "@/lib/serialize";
import { PageHeader, Badge, Panel, StatCard, EmptyNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacherId = Number(id);
  const data = await getPortalData();
  const t = data.teachers.find((x) => x.id === teacherId);
  if (!t) notFound();

  const workloads = computeWorkloads(
    data.meetings,
    data.allocations,
    (tid) => data.externals.some((e) => e.teacherId === tid && e.verificationStatus === "pending"),
  );
  const w = workloads.get(teacherId);

  const myMeetings = data.meetings
    .filter((m) => m.teachers.some((x) => x.id === teacherId))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes);
  const myAllocations = data.allocations.filter((a) => a.teacherId === teacherId);
  const myExternals = data.externals.filter((e) => e.teacherId === teacherId);

  return (
    <div>
      <Link href="/teachers" className="no-print mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
        <ArrowLeft size={13} /> All teachers
      </Link>
      <PageHeader
        kicker={`${t.homeDepartmentName ?? "Unknown department"} · ${t.employmentType.replace("_", " ")}`}
        title={`${t.fullName} (${t.shortCode})`}
        description={[
          t.designation,
          t.homeDepartmentCode !== "CSE" ? "Incoming teacher — only verified CSE-facing load is shown; university-wide totals may be incomplete." : null,
          t.notes,
        ].filter(Boolean).join(" ")}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Workload units" value={w ? w.workloadUnits.toFixed(1) : "0.0"}
          sub={w ? `local ${w.localUnits.toFixed(1)} + external ${w.externalUnits.toFixed(1)}` : "no allocations"} />
        <StatCard label="Catalog credits" value={w ? w.catalogCredits.toFixed(1) : "0.0"} sub="distinct assigned courses — not a workload total" />
        <StatCard label="Weekly contact" value={w ? `${Math.floor(w.weeklyContactMinutes / 60)}h ${String(w.weeklyContactMinutes % 60).padStart(2, "0")}m` : "0h"}
          sub={w ? `${w.weeklyMeetings} scheduled meetings` : ""} />
        <StatCard label="Distinct courses" value={w?.distinctCourses ?? 0} sub="preparations across all deliveries" />
      </div>

      {w && w.alerts.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {w.alerts.map((a, i) => (
            <p key={i} className="rounded-md border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-2 text-[12px] text-[#7a5a17]">{a}</p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Weekly schedule" sub="Canonical meetings — shared classes counted once">
          {myMeetings.length === 0 ? (
            <EmptyNote>No fixed-schedule meetings. Teacher-managed work (thesis, projects) is listed under allocations.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--color-line-soft)]">
              {myMeetings.map((m) => {
                const size = knownAudienceSize(m);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                    <span className="w-[86px] font-semibold text-[#3f4a41]">{DAY_NAMES[m.dayOfWeek].slice(0, 3)}</span>
                    <span className="font-mono w-[150px] text-[12px] text-[var(--color-pine)]">
                      <Clock3 size={11} className="mr-1 inline -translate-y-px" />{fmtRange(m.startMinutes, m.endMinutes)}
                    </span>
                    <span className="font-mono font-semibold">{m.courseCode}</span>
                    <span className="text-[#5c675d]">{m.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "DIP"}-${a.batchLabel}`).join(" + ")}</span>
                    <span className="font-mono text-[11px] text-[var(--color-moss)]">{m.rooms.map((r) => r.code).join("/")}</span>
                    <span className="ml-auto flex gap-1">
                      {sharingLabel(m) && <Badge tone="gold">{sharingLabel(m)}</Badge>}
                      {size == null && <Badge tone="clay">size unverified</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Workload allocations" sub="Explicit approved records — never derived by summing timetable cells">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line-soft)] text-left">
                <th className="pb-1.5"><span className="micro-label">Assignment</span></th>
                <th className="pb-1.5"><span className="micro-label">Method</span></th>
                <th className="pb-1.5 text-right"><span className="micro-label">Units</span></th>
              </tr>
            </thead>
            <tbody>
              {myAllocations.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-line-soft)]/60 align-top">
                  <td className="py-1.5 pr-2">
                    <span className="font-mono font-semibold">{a.courseCode ?? "External"}</span>
                    {a.externalDepartment && (
                      <span className="ml-1.5 text-[11px] text-[#7a5a17]">
                        <ArrowLeftRight size={10} className="mr-0.5 inline" />{a.externalDepartment}
                      </span>
                    )}
                    {a.policyNote && <p className="mt-0.5 text-[10.5px] leading-snug text-[#8a8571]">{a.policyNote}</p>}
                  </td>
                  <td className="py-1.5 pr-2"><Badge tone={a.allocationMethod === "sole" ? "neutral" : a.allocationMethod === "external" ? "gold" : "sage"}>{a.allocationMethod.replace("_", " ")}</Badge></td>
                  <td className="py-1.5 text-right font-mono font-semibold">{a.units.toFixed(1)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold" colSpan={2}>Total known units</td>
                <td className="py-2 text-right font-mono font-bold text-[var(--color-pine)]">{w ? w.workloadUnits.toFixed(1) : "0.0"}</td>
              </tr>
            </tbody>
          </table>
          {myExternals.length > 0 && (
            <div className="mt-3 border-t border-[var(--color-line-soft)] pt-2.5">
              <p className="micro-label mb-1.5">External commitments (OD)</p>
              {myExternals.map((e) => (
                <p key={e.id} className="mb-1 text-[11.5px] text-[#5c675d]">
                  <GraduationCap size={11} className="mr-1 inline text-[var(--color-gold)]" />
                  <strong>{e.counterpartDepartment}</strong>
                  {e.courseLabel ? ` — ${e.courseLabel}` : ""}
                  {e.dayOfWeek != null ? ` · ${DAY_NAMES[e.dayOfWeek]} ${fmtRange(e.startMinutes!, e.endMinutes!)}` : ""} ·{" "}
                  <Badge tone={e.verificationStatus === "verified" ? "pine" : "clay"}>{e.verificationStatus}</Badge>
                </p>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
