import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, CalendarDays, Clock3, GraduationCap, Pencil } from "lucide-react";
import { getPortalData } from "@/lib/data";
import { can, getOptionalActor } from "@/lib/auth";
import { fmtInstant } from "@/lib/auth/display";
import { computeWorkloads } from "@/lib/workload";
import { fmtRange, DAY_NAMES } from "@/lib/time";
import { sharingLabel, knownAudienceSize } from "@/lib/serialize";
import { WORKLOAD_ADVISORY_UNITS } from "@/lib/constants";
import { EMPLOYMENT_LABELS, FIELD_LABELS, STATUS_LABELS, employmentLabel, isPlaceholder, statusLabel, type TeacherField } from "@/lib/teacher-records";
import { getTeacherChanges, getTeacherRecord, type TeacherChange } from "@/lib/teacher-data";
import { PageHeader, Badge, Panel, StatCard, EmptyNote, Notice, StatusText, type Tone } from "@/components/ui";
import { StatusButton, TeacherActionsMenu } from "@/components/teachers/teacher-actions-menu";
import { buttonClass } from "@/components/account/styles";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = { active: "pine", on_leave: "gold", inactive: "neutral", vacancy: "clay", unresolved: "gold" };
const DONE: Record<string, string> = {
  added: "Teacher added.", saved: "Changes saved.", resolved: "Code resolved. Its classes are unchanged.",
  set_on_leave: "Set on leave. Classes and allocations are unchanged.", back_from_leave: "Back from leave.",
  deactivate: "Deactivated. Listed under Inactive and no longer offered when assigning classes.", reactivate: "Active again.",
};

export default async function TeacherDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const { done } = await searchParams;
  const teacherId = Number(id);
  const data = await getPortalData();
  const t = data.teachers.find((x) => x.id === teacherId);
  if (!t) notFound();
  const actor = await getOptionalActor();
  const canEdit = actor ? await can(actor, "manage_teachers") : false;
  const privateContacts = actor ? await can(actor, "view_private_contacts") : false;
  const [record, changes] = await Promise.all([getTeacherRecord(teacherId), canEdit ? getTeacherChanges(teacherId) : Promise.resolve([])]);
  if (!record) notFound();
  const updatedAt = record.updatedAt.toISOString();
  const placeholder = isPlaceholder(t.status);

  const workloads = computeWorkloads(
    data.meetings,
    data.allocations,
    (tid) => data.externals.some((e) => e.teacherId === tid && e.verificationStatus === "pending"),
    (tid) => data.teachers.find((x) => x.id === tid)?.loadLimit ?? WORKLOAD_ADVISORY_UNITS,
  );
  const w = workloads.get(teacherId);
  const over = (w?.workloadUnits ?? 0) > t.loadLimit;

  const myMeetings = data.meetings
    .filter((m) => m.teachers.some((x) => x.id === teacherId))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes);
  const myAllocations = data.allocations.filter((a) => a.teacherId === teacherId);
  const myExternals = data.externals.filter((e) => e.teacherId === teacherId);
  const departmentName = (departmentId: unknown) => data.departments.find((d) => d.id === Number(departmentId))?.code ?? "—";

  return (
    <div>
      <Link href={placeholder ? "/teachers?show=placeholders" : "/teachers"} className="no-print mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
        <ArrowLeft size={13} aria-hidden="true" /> {placeholder ? "Placeholder codes" : "All teachers"}
      </Link>
      <PageHeader
        context={[t.homeDepartmentName ?? "Unknown department", employmentLabel(t.employmentType)].filter(Boolean).join(" · ")}
        title={placeholder && t.status === "vacancy" ? `${t.shortCode} — vacancy` : `${t.fullName} (${t.shortCode})`}
        description={<>
          {[t.designation, t.homeDepartmentCode && t.homeDepartmentCode !== "CSE" ? "Incoming teacher — only verified CSE-facing load is shown; university-wide totals may be incomplete." : null].filter(Boolean).join(" ")}{" "}
          <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{statusLabel(t.status)}</Badge>
        </>}
        actions={<>
          {!placeholder ? <Link href={`/teachers/${t.id}/routine`} className={buttonClass.secondary}><CalendarDays size={15} strokeWidth={1.8} aria-hidden="true" /> Individual routine</Link> : null}
          {canEdit && t.status === "unresolved" ? <Link href={`/teachers/${t.id}/edit?resolve=1`} className={buttonClass.primary}>Resolve {t.shortCode}</Link> : null}
          {canEdit && !placeholder ? <Link href={`/teachers/${t.id}/edit`} className={buttonClass.primary}><Pencil size={14} aria-hidden="true" /> Edit</Link> : null}
          {canEdit && t.status !== "vacancy" ? <TeacherActionsMenu teacherId={t.id} code={t.shortCode} status={t.status} expectedUpdatedAt={updatedAt} /> : null}
        </>}
      />

      {done && DONE[done] ? (
        <Notice tone="success" className="mb-4">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span><strong>{t.shortCode}:</strong> {DONE[done]}</span>
            {done === "deactivate" && canEdit && t.status === "inactive"
              ? <StatusButton teacherId={t.id} expectedUpdatedAt={updatedAt} action="reactivate" label="Undo — reactivate" className="font-semibold underline" />
              : null}
          </span>
        </Notice>
      ) : null}
      {t.status === "vacancy" ? <Notice tone="info" className="mb-4">UT is a vacancy marker, not a person or an account. Assign a real teacher to its classes in <Link href="/courses" className="font-semibold underline">Courses</Link>.</Notice> : null}
      {t.status === "unresolved" ? <Notice tone="warn" className="mb-4">The routine uses {t.shortCode}, but the supplied teacher list does not name it.{canEdit ? " Resolve it to record who it is; its classes stay as they are." : ""}</Notice> : null}
      {t.status === "inactive" ? <Notice tone="info" className="mb-4">Inactive: kept on past records and published routines, and not offered when assigning classes.</Notice> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Workload units" value={w ? w.workloadUnits.toFixed(1) : "0.0"}
          sub={over ? `Above ${t.advisoryLoadUnits != null ? "their own" : "the"} ${t.loadLimit.toFixed(1)}-unit limit` : w ? `local ${w.localUnits.toFixed(1)} + external ${w.externalUnits.toFixed(1)}` : "no allocations"} />
        <StatCard label="Catalog credits" value={w ? w.catalogCredits.toFixed(1) : "0.0"} sub="distinct assigned courses — not a workload total" />
        <StatCard label="Weekly contact" value={w ? `${Math.floor(w.weeklyContactMinutes / 60)}h ${String(w.weeklyContactMinutes % 60).padStart(2, "0")}m` : "0h"}
          sub={w ? `${w.weeklyMeetings} scheduled meetings` : ""} />
        <StatCard label="Distinct courses" value={w?.distinctCourses ?? 0} sub="preparations across all deliveries" />
      </div>

      {w && w.alerts.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {w.alerts.map((a, i) => (
            <p key={i} className="rounded-md border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-2 text-[12px] text-gold-text">{a}</p>
          ))}
        </div>
      )}

      <div className={`mt-6 grid gap-4 ${canEdit ? "xl:grid-cols-2" : ""}`}>
        <Panel title="Profile" actions={canEdit && !placeholder ? <Link href={`/teachers/${t.id}/edit`} className="text-[13px] font-medium text-[var(--color-pine)] underline">Edit</Link> : undefined}>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Fact label="Short code"><span className="font-mono">{record.shortCode}</span></Fact>
            <Fact label="Full name">{record.fullName}</Fact>
            <Fact label="Designation">{record.designation ?? <Empty />}</Fact>
            <Fact label="Employment">{employmentLabel(record.employmentType) ?? <Empty>none (placeholder)</Empty>}</Fact>
            <Fact label="Home department">{record.departmentName ?? <Empty />}</Fact>
            <Fact label="Workload limit">{t.advisoryLoadUnits != null ? <>{t.loadLimit.toFixed(1)} units <span className="italic text-muted">(department default {WORKLOAD_ADVISORY_UNITS})</span></> : <>Department default, {WORKLOAD_ADVISORY_UNITS} units</>}</Fact>
            {privateContacts ? <>
              <Fact label="Email">{record.email ?? <Empty />}</Fact>
              <Fact label="Private phone">{record.phonePrivate ? <>{record.phonePrivate} <Badge tone="gold">Private</Badge></> : <Empty />}</Fact>
            </> : null}
            <Fact label="Notes" wide>{record.notes ?? <Empty />}</Fact>
          </dl>
        </Panel>
        {canEdit ? (
          <Panel title="Changes" sub="Who changed this record, and when. Visible to editors.">
            <ChangeList changes={changes} departmentName={departmentName} />
          </Panel>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Weekly schedule" sub="Canonical meetings — shared classes counted once">
          {myMeetings.length === 0 ? (
            <EmptyNote>No fixed-schedule meetings. Teacher-managed work (thesis, projects) is listed under allocations.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--color-line-soft)]">
              {myMeetings.map((m) => {
                const size = knownAudienceSize(m);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                    <span className="w-[86px] font-semibold text-ink-2">{DAY_NAMES[m.dayOfWeek].slice(0, 3)}</span>
                    <span className="font-mono w-[150px] text-[12px] text-[var(--color-pine)]">
                      <Clock3 size={11} className="mr-1 inline -translate-y-px" aria-hidden="true" />{fmtRange(m.startMinutes, m.endMinutes)}
                    </span>
                    <span className="font-mono font-semibold">{m.courseCode}</span>
                    <span className="text-muted">{m.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "DIP"}-${a.batchLabel}`).join(" + ")}</span>
                    <span className="font-mono text-[11px] text-muted">{m.rooms.map((r) => r.code).join("/")}</span>
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
          <div role="region" aria-label="Workload allocations" tabIndex={0} className="table-region overflow-x-auto"><table className="w-full text-[12.5px]">
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
                      <span className="ml-1.5 text-[11px] text-gold-text">
                        <ArrowLeftRight size={10} className="mr-0.5 inline" aria-hidden="true" />{a.externalDepartment}
                      </span>
                    )}
                    {a.policyNote && <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{a.policyNote}</p>}
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
          </table></div>
          {over ? <p className="mt-2"><StatusText tone="warn">{((w?.workloadUnits ?? 0) - t.loadLimit).toFixed(1)} over the {t.loadLimit.toFixed(1)}-unit limit</StatusText></p> : null}
          {myExternals.length > 0 && (
            <div className="mt-3 border-t border-[var(--color-line-soft)] pt-2.5">
              <p className="micro-label mb-1.5">External commitments (OD)</p>
              {myExternals.map((e) => (
                <p key={e.id} className="mb-1 text-[11.5px] text-muted">
                  <GraduationCap size={11} className="mr-1 inline text-gold-text" aria-hidden="true" />
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

function Fact({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`border-t border-[var(--color-line-soft)] py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[14px]">{children}</dd>
    </div>
  );
}

const Empty = ({ children = "Not recorded" }: { children?: React.ReactNode }) => <span className="italic text-muted">{children}</span>;

const ACTION_LABELS: Record<string, string> = {
  "teacher.create": "Added", "teacher.update": "Edited", "teacher.resolve": "Resolved", "teacher.set_on_leave": "Set on leave",
  "teacher.back_from_leave": "Back from leave", "teacher.deactivate": "Deactivated", "teacher.reactivate": "Reactivated",
};

function ChangeList({ changes, departmentName }: { changes: TeacherChange[]; departmentName: (id: unknown) => string }) {
  const own = changes.filter((change) => change.action.startsWith("teacher."));
  const imported = changes.find((change) => change.action === "summer_2026_imported");
  const rows = [...own, ...(imported && !own.some((change) => change.action === "teacher.create") ? [imported] : [])];
  if (!rows.length) return <EmptyNote>No changes recorded yet.</EmptyNote>;
  const value = (field: string, raw: unknown) => {
    if (raw == null || raw === "") return field === "advisoryLoadUnits" ? `default ${WORKLOAD_ADVISORY_UNITS}` : "none";
    if (field === "homeDepartmentId") return departmentName(raw);
    if (field === "employmentType") return EMPLOYMENT_LABELS[raw as keyof typeof EMPLOYMENT_LABELS] ?? String(raw);
    if (field === "status") return STATUS_LABELS[raw as keyof typeof STATUS_LABELS] ?? String(raw);
    if (field === "advisoryLoadUnits") return `${Number(raw).toFixed(1)} units`;
    return String(raw);
  };
  return (
    <ol className="divide-y divide-[var(--color-line-soft)]">
      {rows.map((change) => {
        const fields = Object.keys({ ...(change.before ?? {}), ...(change.after ?? {}) })
          .filter((field) => change.action !== "teacher.create" || (change.after?.[field] ?? null) !== null);
        const label = change.action === "summer_2026_imported" ? "Imported from the Summer-2026 routine source" : ACTION_LABELS[change.action] ?? change.action;
        return (
          <li key={change.id} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[112px_minmax(0,1fr)]">
            <time dateTime={change.at.toISOString()} className="text-[12.5px] text-muted">{fmtInstant(change.at)}</time>
            <div className="min-w-0 text-[13.5px]">
              <p><strong>{label}</strong>{change.action !== "summer_2026_imported" ? <> by {change.actor}</> : null}</p>
              {change.action.startsWith("teacher.") && (fields.length || change.detail?.phoneChanged || change.detail?.reason) ? (
                <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
                  {fields.map((field) => (
                    <div key={field} className="contents">
                      <dt className="text-muted">{field === "status" ? "Status" : FIELD_LABELS[field as TeacherField] ?? field}</dt>
                      <dd className="min-w-0 break-words">
                        {change.action === "teacher.create" ? value(field, change.after?.[field]) : <>
                          <del className="text-muted decoration-[var(--color-clay)]">{value(field, change.before?.[field])}</del>{" → "}
                          <ins className="font-semibold no-underline">{value(field, change.after?.[field])}</ins>
                        </>}
                      </dd>
                    </div>
                  ))}
                  {change.detail?.phoneChanged ? <><dt className="text-muted">Private phone</dt><dd>changed</dd></> : null}
                  {change.detail?.reason ? <><dt className="text-muted">Reason</dt><dd className="break-words">{String(change.detail.reason)}</dd></> : null}
                </dl>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
