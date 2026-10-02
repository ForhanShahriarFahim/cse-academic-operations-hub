import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { computeWorkloads } from "@/lib/workload";
import { WORKLOAD_ADVISORY_UNITS } from "@/lib/constants";
import { PageHeader, Panel, StatusText, TableRegion } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintHeader } from "@/components/print-header";

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
    (tid) => data.teachers.find((t) => t.id === tid)?.loadLimit ?? WORKLOAD_ADVISORY_UNITS,
  );

  const rows = data.teachers
    .map((t) => ({ t, w: workloads.get(t.id)! }))
    .filter((r) => r.w && (r.w.workloadUnits > 0 || r.w.weeklyContactMinutes > 0))
    .sort((a, b) => (b.w.workloadUnits - a.w.workloadUnits));

  const scale = Math.max(...rows.map((r) => Math.max(r.w.workloadUnits, r.t.loadLimit)), WORKLOAD_ADVISORY_UNITS, 1);
  const overCount = rows.filter((r) => r.w.workloadUnits > r.t.loadLimit).length;
  const ownLimits = rows.filter((r) => r.t.advisoryLoadUnits != null).length;
  const publishedVersion = data.versions.find((v) => v.state === "published")?.versionNumber ?? null;

  return (
    <div>
      <PrintHeader title="Teacher workload" termName={data.term.name} publishedVersion={publishedVersion} />
      <PageHeader
        context="Planning records"
        title="Teacher workload"
        description={`Workload units from assigned offerings, compared with each teacher's advisory limit (the department default is ${WORKLOAD_ADVISORY_UNITS} units), next to weekly contact time and catalog credits. A merged class counts once per teacher.`}
        actions={<PrintButton />}
      />

      <Panel
        title="Department summary"
        sub={`${rows.length} teachers with teaching this term · ${overCount} above their limit${ownLimits ? ` · ${ownLimits} with their own limit` : ""}`}
        flush
      >
        <TableRegion label="Teacher workload" maxHeight="72vh">
          <table className="ledger">
            <caption className="sr-only">Teacher workload for {data.term.name}, working draft, sorted by workload units</caption>
            <thead>
              <tr>
                <th scope="col">Teacher</th>
                <th scope="col" className="num">Workload units</th>
                <th scope="col">Against limit</th>
                <th scope="col" className="num">Contact / week</th>
                <th scope="col" className="num">Meetings</th>
                <th scope="col" className="num">Courses</th>
                <th scope="col" className="num">Catalog credits</th>
                <th scope="col" className="num">Local / external units</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, w }) => {
                const limit = t.loadLimit;
                const over = w.workloadUnits > limit;
                const externalPending = w.alerts.some((alert) => alert.startsWith("External"));
                return (
                  <tr key={t.id}>
                    <th scope="row">
                      <Link href={`/teachers/${t.id}`} className="font-mono font-semibold text-[var(--color-pine)] underline-offset-2 hover:underline">{t.shortCode}</Link>
                      <span className="ml-1.5 text-[12px] text-muted">{t.homeDepartmentCode}</span>
                    </th>
                    <td className="num">
                      <span className={`load-bar mr-2.5 ${over ? "over" : ""}`} aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (w.workloadUnits / scale) * 100)}%` }} />
                        <b style={{ left: `${(limit / scale) * 100}%` }} />
                      </span>
                      <span className="font-semibold">{w.workloadUnits.toFixed(1)}</span>
                    </td>
                    <td>
                      <span className="flex flex-col gap-0.5">
                        {over
                          ? <StatusText tone="warn">Over by {(w.workloadUnits - limit).toFixed(1)}</StatusText>
                          : <StatusText tone="muted">{w.workloadUnits === limit ? "At limit" : "Within limit"}</StatusText>}
                        {t.advisoryLoadUnits != null ? <span className="text-[12px] text-muted">Own limit {limit.toFixed(1)}</span> : null}
                        {externalPending ? <StatusText tone="pending">External teaching not yet confirmed</StatusText> : null}
                      </span>
                    </td>
                    <td className="num">{fmtMinutes(w.weeklyContactMinutes)}</td>
                    <td className="num">{w.weeklyMeetings}</td>
                    <td className="num">{w.distinctCourses}</td>
                    <td className="num">{w.catalogCredits.toFixed(1)}</td>
                    <td className="num">{w.localUnits.toFixed(1)} / {w.externalUnits.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableRegion>
      </Panel>

      <Panel title="How workload is counted" className="mt-5">
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2 marker:text-muted">
          <li><strong className="font-semibold text-[var(--color-ink)]">Workload units</strong> come from approved allocation records, not from counting timetable cells. A one-credit sessional counts as two units.</li>
          <li>A <strong className="font-semibold text-[var(--color-ink)]">merged class</strong> taught to several batches at once counts once for the teacher, even though each batch has its own offering.</li>
          <li><strong className="font-semibold text-[var(--color-ink)]">Co-taught classes</strong> are split by their allocation record, not assumed to be half each.</li>
          <li>Teaching for other departments is included. While those bookings are unconfirmed, the total is the known minimum, not the full figure.</li>
        </ul>
      </Panel>
    </div>
  );
}
