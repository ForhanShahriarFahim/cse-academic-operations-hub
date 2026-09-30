import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { computeWorkloads } from "@/lib/workload";
import { WORKLOAD_ADVISORY_UNITS } from "@/lib/constants";
import { PageHeader, Badge, Panel, StatusText, TableRegion } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintHeader } from "@/components/print-header";

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
  const publishedVersion = data.versions.find((v) => v.state === "published")?.versionNumber ?? null;
  const fromOtherDepartments = sorted.filter((t) => t.homeDepartmentCode !== "CSE").length;

  return (
    <div>
      <PrintHeader title="Teachers" termName={data.term.name} publishedVersion={publishedVersion} />
      <PageHeader
        context="Planning records"
        title="Teachers"
        description="Each teacher's home department, load and teaching outside the department. Short codes are exact: IM and IMN are different people. Vacant posts appear in Courses as “Teacher to be assigned”, not here."
        actions={<PrintButton />}
      />
      <Panel
        title="Teaching staff"
        sub={`${sorted.length} teachers · ${sorted.length - fromOtherDepartments} from CSE, ${fromOtherDepartments} from other departments`}
        flush
      >
        <TableRegion label="Teachers" maxHeight="72vh">
          <table className="ledger">
            <caption className="sr-only">Teachers for {data.term.name}, CSE first, then other departments, by short code</caption>
            <thead>
              <tr>
                <th scope="col">Teacher</th>
                <th scope="col">Department</th>
                <th scope="col">Designation</th>
                <th scope="col" className="num">Workload units</th>
                <th scope="col" className="num">Contact / week</th>
                <th scope="col" className="num">Courses</th>
                <th scope="col" className="num">Catalog credits</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const w = workloads.get(t.id);
                const isExternal = t.homeDepartmentCode !== "CSE";
                const over = (w?.workloadUnits ?? 0) > WORKLOAD_ADVISORY_UNITS;
                const pendingExternal = w?.alerts.some((alert) => alert.startsWith("External")) ?? false;
                const teachesElsewhere = data.externals.some((e) => e.teacherId === t.id && e.kind !== "unresolved_note");
                return (
                  <tr key={t.id}>
                    <th scope="row">
                      <Link href={`/teachers/${t.id}`} className="group inline-flex items-baseline gap-2 underline-offset-2">
                        <span className="font-mono font-semibold text-[var(--color-pine)] group-hover:underline">{t.shortCode}</span>
                        <span className="text-[var(--color-ink)] group-hover:underline">{t.fullName}</span>
                      </Link>
                    </th>
                    <td>
                      <Badge tone={isExternal ? "gold" : "pine"}>{t.homeDepartmentCode ?? "Unknown"}</Badge>
                    </td>
                    <td className="text-ink-2">{t.designation ?? "—"}</td>
                    <td className="num font-semibold">{w ? w.workloadUnits.toFixed(1) : "0.0"}</td>
                    <td className="num">{w ? `${Math.floor(w.weeklyContactMinutes / 60)}h ${String(w.weeklyContactMinutes % 60).padStart(2, "0")}m` : "—"}</td>
                    <td className="num">{w?.distinctCourses ?? 0}</td>
                    <td className="num">{w ? w.catalogCredits.toFixed(1) : "0.0"}</td>
                    <td>
                      <span className="flex flex-col gap-0.5">
                        {over ? <StatusText tone="warn">Above the {WORKLOAD_ADVISORY_UNITS}-unit limit</StatusText> : null}
                        {pendingExternal ? <StatusText tone="pending">External teaching not yet confirmed</StatusText> : null}
                        {teachesElsewhere && !pendingExternal ? <span className="text-[12.5px] text-ink-2">Also teaches for other departments</span> : null}
                        {!over && !pendingExternal && !teachesElsewhere ? <span className="text-muted">—</span> : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableRegion>
      </Panel>
    </div>
  );
}
