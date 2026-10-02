import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getPortalData, type TeacherRow } from "@/lib/data";
import { can, getOptionalActor } from "@/lib/auth";
import { computeWorkloads } from "@/lib/workload";
import { WORKLOAD_ADVISORY_UNITS } from "@/lib/constants";
import { employmentLabel, isPlaceholder } from "@/lib/teacher-records";
import { PageHeader, Badge, Panel, StatusText, TableRegion, EmptyNote, Notice } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintHeader } from "@/components/print-header";
import { buttonClass, inputClass } from "@/components/account/styles";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "active", label: "Active", match: (t: TeacherRow) => t.status === "active" || t.status === "on_leave" },
  { key: "on_leave", label: "On leave", match: (t: TeacherRow) => t.status === "on_leave" },
  { key: "inactive", label: "Inactive", match: (t: TeacherRow) => t.status === "inactive" },
  { key: "placeholders", label: "Placeholders", match: (t: TeacherRow) => isPlaceholder(t.status) },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const fmtContact = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; deleted?: string }> }) {
  const { show, q, deleted } = await searchParams;
  const data = await getPortalData();
  const actor = await getOptionalActor();
  const canEdit = actor ? await can(actor, "manage_teachers") : false;
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
  const query = (q ?? "").trim().toLowerCase();

  const workloads = computeWorkloads(
    data.meetings,
    data.allocations,
    (tid) => data.externals.some((e) => e.teacherId === tid && e.verificationStatus === "pending"),
    (tid) => data.teachers.find((t) => t.id === tid)?.loadLimit ?? WORKLOAD_ADVISORY_UNITS,
  );
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, data.teachers.filter(f.match).length])) as Record<FilterKey, number>;
  const shown = data.teachers
    .filter(filter.match)
    .filter((t) => !query || t.shortCode.toLowerCase().includes(query) || t.fullName.toLowerCase().includes(query))
    .sort((a, b) =>
      (a.homeDepartmentCode !== "CSE" ? 1 : 0) - (b.homeDepartmentCode !== "CSE" ? 1 : 0) || a.shortCode.localeCompare(b.shortCode));
  const publishedVersion = data.versions.find((v) => v.state === "published")?.versionNumber ?? null;
  const incoming = shown.filter((t) => t.homeDepartmentCode !== "CSE").length;
  const href = (key: FilterKey) => `/teachers${key === "active" ? "" : `?show=${key}`}`;

  return (
    <div>
      <PrintHeader title={`Teachers — ${filter.label}`} termName={data.term.name} publishedVersion={publishedVersion} />
      <PageHeader
        context="Planning records"
        title="Teachers"
        description="Each teacher's department, load and limit. Short codes are exact: IM and IMN are different people. Placeholder codes such as UT are listed separately."
        actions={<>
          <Link href="/teachers/routines" className={buttonClass.secondary}>Print teacher routines</Link>
          <PrintButton />
          {canEdit ? <Link href="/teachers/new" className={buttonClass.primary}><Plus size={15} aria-hidden="true" />Add teacher</Link> : null}
        </>}
      />
      {deleted ? <Notice tone="success" className="mb-4"><strong>{deleted}</strong> deleted. The deletion is in the audit log.</Notice> : null}
      <Panel
        title={filter.key === "placeholders" ? "Placeholder codes" : "Teaching staff"}
        sub={filter.key === "placeholders"
          ? "Codes that stand in for a person the routine does not name yet. They are never teachers or portal accounts."
          : `${shown.length} ${filter.label.toLowerCase()} · ${shown.length - incoming} from CSE, ${incoming} incoming from other departments`}
        flush
      >
        <div className="no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
          <nav aria-label="Show teachers" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link key={f.key} href={href(f.key)} aria-current={f.key === filter.key ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium ${f.key === filter.key ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>
                {f.label} <span className={`tabular-nums ${f.key === filter.key ? "text-[#c9d2cc]" : "text-muted"}`}>{counts[f.key]}</span>
              </Link>
            ))}
          </nav>
          {filter.key !== "placeholders" ? (
            <form role="search" action="/teachers" className="flex items-center gap-2">
              {filter.key !== "active" ? <input type="hidden" name="show" value={filter.key} /> : null}
              <Search size={15} aria-hidden="true" className="text-muted" />
              <label htmlFor="teacher-search" className="sr-only">Find a teacher by code or name</label>
              <input id="teacher-search" type="search" name="q" defaultValue={q ?? ""} placeholder="Code or name" className={`${inputClass} min-h-9 w-[200px]`} />
            </form>
          ) : null}
        </div>
        {filter.key === "placeholders"
          ? <Placeholders teachers={shown} data={data} canEdit={canEdit} />
          : shown.length === 0
            ? <div className="p-4"><EmptyNote>{query ? `No ${filter.label.toLowerCase()} teacher matches “${q}”.` : `No ${filter.label.toLowerCase()} teachers.`}</EmptyNote></div>
            : (
              <TableRegion label="Teachers" maxHeight="72vh">
                <table className="ledger stack">
                  <caption className="sr-only">{filter.label} teachers for {data.term.name}, CSE first, then incoming teachers, by short code</caption>
                  <thead>
                    <tr>
                      <th scope="col">Teacher</th>
                      <th scope="col">Department</th>
                      <th scope="col">Designation</th>
                      <th scope="col" className="num">Workload units</th>
                      <th scope="col" className="num">Limit</th>
                      <th scope="col" className="num">Contact / week</th>
                      <th scope="col" className="num">Courses</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => {
                      const w = workloads.get(t.id);
                      const units = w?.workloadUnits ?? 0;
                      const over = units > t.loadLimit;
                      const pendingExternal = w?.alerts.some((alert) => alert.startsWith("External")) ?? false;
                      const teachesElsewhere = data.externals.some((e) => e.teacherId === t.id && e.kind !== "unresolved_note");
                      const quiet = !over && !pendingExternal && !teachesElsewhere;
                      return (
                        <tr key={t.id}>
                          <th scope="row">
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <Link href={`/teachers/${t.id}`} className="group inline-flex items-baseline gap-2 underline-offset-2">
                                <span className="font-mono font-semibold text-[var(--color-pine)] group-hover:underline">{t.shortCode}</span>
                                <span className="text-[var(--color-ink)] group-hover:underline">{t.fullName}</span>
                              </Link>
                              {t.status === "on_leave" ? <Badge tone="gold">On leave</Badge> : null}
                            </span>
                          </th>
                          <td data-label="Department">
                            <span className="inline-flex flex-wrap gap-1">
                              <Badge tone={t.homeDepartmentCode === "CSE" ? "pine" : "gold"}>{t.homeDepartmentCode ?? "Unknown"}</Badge>
                              {t.homeDepartmentCode && t.homeDepartmentCode !== "CSE" ? <Badge>Incoming</Badge> : null}
                            </span>
                          </td>
                          <td data-label="Designation" className="hide-sm text-ink-2">
                            {t.designation ?? "—"}
                            <span className="block text-[12px] text-muted">{employmentLabel(t.employmentType) ?? ""}</span>
                          </td>
                          <td data-label="Workload units" className="num font-semibold">{units.toFixed(1)}</td>
                          <td data-label="Limit" className="num">
                            {t.loadLimit.toFixed(1)} <span className="text-[12px] text-muted">{t.advisoryLoadUnits != null ? "own limit" : "default"}</span>
                          </td>
                          <td data-label="Contact / week" className="num hide-sm">{w ? fmtContact(w.weeklyContactMinutes) : "—"}</td>
                          <td data-label="Courses" className="num hide-sm">{w?.distinctCourses ?? 0}</td>
                          <td data-label="Notes" className={`wrap ${quiet ? "empty-sm" : ""}`}>
                            <span className="flex flex-col gap-0.5">
                              {over ? <StatusText tone="warn">{(units - t.loadLimit).toFixed(1)} over limit</StatusText> : null}
                              {pendingExternal ? <StatusText tone="pending">External teaching not yet confirmed</StatusText> : null}
                              {teachesElsewhere && !pendingExternal ? <span className="text-[12.5px] text-ink-2">Also teaches for other departments</span> : null}
                              {quiet ? <span className="text-muted">—</span> : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableRegion>
            )}
      </Panel>
    </div>
  );
}

function Placeholders({ teachers, data, canEdit }: { teachers: TeacherRow[]; data: Awaited<ReturnType<typeof getPortalData>>; canEdit: boolean }) {
  if (!teachers.length) return <div className="p-4"><EmptyNote>No placeholder codes. Every routine code names a teacher.</EmptyNote></div>;
  return (
    <TableRegion label="Placeholder codes">
      <table className="ledger stack">
        <caption className="sr-only">Placeholder codes in the routine</caption>
        <thead><tr><th scope="col">Code</th><th scope="col">Kind</th><th scope="col" className="num">Classes</th><th scope="col">What to do</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>
          {teachers.map((t) => {
            const classes = data.meetings.filter((m) => m.teachers.some((x) => x.id === t.id)).length;
            const vacancy = t.status === "vacancy";
            return (
              <tr key={t.id}>
                <th scope="row"><Link href={`/teachers/${t.id}`} className="font-mono font-semibold text-[var(--color-pine)] underline-offset-2 hover:underline">{t.shortCode}</Link></th>
                <td data-label="Kind"><Badge tone={vacancy ? "clay" : "gold"}>{vacancy ? "Vacancy" : "Unresolved"}</Badge></td>
                <td data-label="Classes" className="num">{classes}</td>
                <td data-label="What to do" className="wrap text-ink-2">
                  {vacancy
                    ? "Upcoming teacher. Assign a real teacher to these classes in Courses; the code then has no classes."
                    : `The routine uses this code, but the teacher list does not name it${t.homeDepartmentName ? ` (imported as ${t.homeDepartmentName})` : ""}. Record who it is.`}
                </td>
                <td>
                  {vacancy
                    ? <Link href="/courses" className={buttonClass.small}>Open Courses</Link>
                    : canEdit ? <Link href={`/teachers/${t.id}/edit?resolve=1`} className={buttonClass.small}>Resolve</Link> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableRegion>
  );
}
