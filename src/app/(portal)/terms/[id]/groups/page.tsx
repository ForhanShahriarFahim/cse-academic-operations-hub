import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, EmptyNote, Notice, PageHeader, Panel, StatCard, type Tone } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PrintHeader } from "@/components/print-header";
import { buttonClass, inputClass } from "@/components/account/styles";
import { getTermClassGroups } from "@/lib/class-group-data";
import { GROUP_STATE_LABELS, SCHEDULE_LABELS, classGroupFilters, classGroupQuery, formatUnits, methodLabel, type GroupState } from "@/lib/class-group-records";
import { COURSE_TYPES } from "@/lib/course-records";
import { offeringStatusLabel } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

const typeLabel = (value: string) => COURSE_TYPES[value as keyof typeof COURSE_TYPES] ?? `${value} (unsupported)`;
const stateTone: Record<GroupState, Tone> = { reconcile: "clay", teacher_managed: "sage", vacancy: "gold", no_requirement: "gold", provisional: "neutral", ready: "pine" };
const STATE_OPTIONS: Array<[string, string]> = [["any", "Any"], ["ready", "Ready"], ["vacancy", "Vacancy"], ["no_requirement", "No weekly requirement"], ["provisional", "Provisional"], ["merged", "Merged class"], ["teacher_managed", "Teacher-managed"], ["reconcile", "Needs reconciliation"], ["unscheduled", "Not scheduled"]];

export default async function TermClassGroupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams, filters = classGroupFilters(search);
  const data = await getTermClassGroups(id);
  if (!data) notFound();
  const { term, canEdit } = data, base = `/terms/${term.id}/groups`, query = classGroupQuery(search), active = term.status === "active";
  const needle = filters.q.toLowerCase();
  const matchesAudience = (stream: string, batchId: number) => (filters.stream === "all" || stream === filters.stream) && (!filters.cohort || batchId === filters.cohort);
  const groups = data.groups.filter(group =>
    (!needle || `${group.course.code} ${group.course.title}`.toLowerCase().includes(needle))
    && ((filters.stream === "all" && !filters.cohort) || group.audiences.some(audience => matchesAudience(audience.stream, audience.batchId)))
    && (!filters.teacher || group.teachers.some(teacher => teacher.teacherId === filters.teacher))
    && (filters.state === "any" || (filters.state === "merged" ? group.audiences.length > 1 : filters.state === "unscheduled" ? group.schedule === "unscheduled" : group.states.includes(filters.state as GroupState))));
  const ungrouped = filters.teacher || !["any", "ready"].includes(filters.state) ? [] : data.ungrouped.filter(row => (!needle || `${row.course.code} ${row.course.title}`.toLowerCase().includes(needle)) && matchesAudience(row.stream, row.batchId));
  const showUngrouped = filters.state === "any" && !filters.teacher;
  const cohorts = [...new Map([...data.groups.flatMap(group => group.audiences.map(audience => [audience.batchId, audience.name] as const)), ...data.ungrouped.map(row => [row.batchId, row.cohort] as const)]).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const teacherOptions = [...new Map(data.groups.flatMap(group => group.teachers.map(teacher => [teacher.teacherId, teacher.code] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = !!(filters.q || filters.stream !== "all" || filters.state !== "any" || filters.cohort || filters.teacher);
  const done = typeof search.done === "string" ? search.done.slice(0, 300) : null;
  const nothing = !data.groups.length && !data.ungrouped.length;
  return <div className="min-w-0">
    <PrintHeader title={`Class groups — ${term.name}`} termName={term.name} publishedVersion={null} publicationState={`Working record · ${term.status} term`} />
    <Link href={`/terms/${term.id}`} className="no-print mb-3 inline-block text-sm underline">← {term.name}</Link>
    <PageHeader context="Planning records / Courses & offerings" title={`Class groups — ${term.name}`}
      description={<>Who teaches each offered course, to which cohorts, and how much is needed each week. {active ? "This is the active term." : `This is a ${term.status} term; viewing it does not change the active term.`}</>}
      actions={<><PrintButton /><Link className={buttonClass.secondary} href={`/terms/${term.id}/offerings`}>Term offerings</Link>{data.editor && <Link className={buttonClass.secondary} href={`${base}/history${query}`}>Change history</Link>}{canEdit && data.ungrouped.length > 0 && <Link className={buttonClass.primary} href={`${base}/new${query}`}>Create class group</Link>}</>} />
    {done && <Notice tone="success" className="mb-4">{done}</Notice>}
    {!data.editable && <Notice className="mb-4" title="Read-only term">{term.name} is {term.status}. Its class groups are shown as they were and cannot be changed.</Notice>}
    {data.editable && !data.editor && <Notice className="mb-4" title="View only">You can see this term&apos;s class groups, teachers and units. Changing them needs an administrator or routine coordinator role.</Notice>}
    {data.editable && term.status === "draft" && <Notice className="mb-4">This is a draft term. Class groups can be prepared now; classes are placed in the Routine builder after the term is activated.</Notice>}

    {nothing
      ? <Panel title="No offerings yet"><p className="text-sm">{term.name} has no offered courses, so there is nothing to group.</p><p className="mt-3"><Link className={buttonClass.secondary} href={`/terms/${term.id}/offerings`}>Open term offerings</Link></p></Panel>
      : <>
        <section aria-label="Class-group summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Class groups" value={data.totals.groups} sub="In this term" />
          <StatCard label="Merged classes" value={data.totals.merged} sub="Several cohorts together" />
          <StatCard label="Without a teacher" value={data.totals.vacancy} sub="Vacancies" tone={data.totals.vacancy ? "warn" : "default"} />
          <StatCard label="No weekly requirement" value={data.totals.noRequirement} sub="Minutes not set" tone={data.totals.noRequirement ? "warn" : "default"} />
          <StatCard label="Offerings without a group" value={data.totals.ungrouped} sub="Offered, nobody assigned" tone={data.totals.ungrouped ? "warn" : "default"} />
          {active ? <StatCard label="Not scheduled" value={data.totals.unscheduled} sub="No class in the routine yet" tone={data.totals.unscheduled ? "warn" : "default"} /> : <StatCard label="Needs reconciliation" value={data.totals.reconcile} sub="Stored record to correct" tone={data.totals.reconcile ? "warn" : "default"} />}
        </section>
        <Panel className="no-print mb-5">
          <form method="get" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
            <div><label htmlFor="cg-q" className="mb-1 block text-sm font-semibold">Search code or title</label><input id="cg-q" name="q" className={inputClass} defaultValue={filters.q} maxLength={200} /></div>
            <div><label htmlFor="cg-stream" className="mb-1 block text-sm font-semibold">Stream</label><select id="cg-stream" name="stream" className={inputClass} defaultValue={filters.stream}><option value="all">All</option><option value="HSC">HSC</option><option value="DIPLOMA">Diploma</option></select></div>
            <div><label htmlFor="cg-cohort" className="mb-1 block text-sm font-semibold">Cohort</label><select id="cg-cohort" name="cohort" className={inputClass} defaultValue={filters.cohort ?? ""}><option value="">All</option>{cohorts.map(([batchId, name]) => <option key={batchId} value={batchId}>{name}</option>)}</select></div>
            <div><label htmlFor="cg-teacher" className="mb-1 block text-sm font-semibold">Teacher</label><select id="cg-teacher" name="teacher" className={inputClass} defaultValue={filters.teacher ?? ""}><option value="">All</option>{teacherOptions.map(([teacherId, code]) => <option key={teacherId} value={teacherId}>{code}</option>)}</select></div>
            <div><label htmlFor="cg-state" className="mb-1 block text-sm font-semibold">State</label><select id="cg-state" name="state" className={inputClass} defaultValue={filters.state}>{STATE_OPTIONS.filter(([value]) => value !== "unscheduled" || active).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <button className={`${buttonClass.secondary} self-end`} type="submit">Apply</button>
          </form>
          {filtered && <p className="mt-3 text-xs text-muted"><Link className="underline" href={base}>Reset filters</Link></p>}
        </Panel>

        <section aria-labelledby="cg-list" className="ruled mb-5 min-w-0 rounded-lg print:border-0">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
            <div><p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{groups.length} of {data.groups.length} class group{data.groups.length === 1 ? "" : "s"}</p><h2 id="cg-list" className="font-display text-[18px] font-semibold tracking-tight">Class groups</h2></div>
            <p className="text-[12.5px] text-muted">Ordered by course code</p>
          </header>
          <div className="px-4 pb-4">
            {!data.groups.length && <p className="pt-4 text-sm">No class group yet. Create one from an offering below.</p>}
            {data.groups.length > 0 && !groups.length && <div className="pt-4"><EmptyNote>No class group matches these filters. <Link className="underline" href={base}>Reset filters</Link>.</EmptyNote></div>}
            <ul className="divide-y divide-[var(--color-line-soft)]">{groups.map(group => <li key={group.id} className="grid min-w-0 gap-x-6 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] print:break-inside-avoid">
              <div className="min-w-0 break-words">
                <p className="font-mono text-[13px] font-bold">{group.course.code}</p>
                <p className="text-[14px] font-semibold leading-snug">{group.course.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{group.course.credits} academic credits · {typeLabel(group.course.courseType)}</p>
                <dl className="mt-2 grid gap-1.5 text-[13px]">
                  <div className="grid gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]"><dt className="font-semibold text-muted">Audience</dt><dd>
                    {group.audiences.map(audience => <span key={audience.offeringId} className="block">{audience.name}{audience.semester == null ? "" : ` · Semester ${audience.semester}`}{audience.offeringStatus === "cancelled" ? ` · offering ${offeringStatusLabel(audience.offeringStatus).toLowerCase()}` : ""}{audience.batchStatus !== "active" ? ` · cohort ${audience.batchStatus}` : ""}</span>)}
                    {group.externalLabel && <span className="block">{group.externalLabel} · outside audience · {group.externalCount == null ? "count unknown" : `${group.externalCount} students`}</span>}
                    {!group.audiences.length && !group.externalLabel && <span>None recorded</span>}
                    {group.audiences.length > 1 && <span className="block"><strong>Merged class</strong> — cohorts stay separate</span>}
                  </dd></div>
                  <div className="grid gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]"><dt className="font-semibold text-muted">Teachers</dt><dd>
                    {group.teachers.map(teacher => <span key={teacher.teacherId} className="block"><span className="font-mono font-bold">{teacher.code}</span> · {formatUnits(teacher.units)} units{teacher.status === "active" ? "" : ` · ${teacher.status === "on_leave" ? "on leave" : teacher.status}`}</span>)}
                    {group.teachers.length > 1 && <span className="block text-muted">{group.method ? methodLabel(group.method) : "Crediting recorded differently per teacher"}</span>}
                    {!group.teachers.length && <span>No teacher yet</span>}
                  </dd></div>
                  <div className="grid gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]"><dt className="font-semibold text-muted">Weekly</dt><dd>{group.deliveryMode === "teacher_managed" ? "Teacher-managed — no weekly classes" : group.requirement?.minutes != null ? `${group.requirement.meetings} class${group.requirement.meetings === 1 ? "" : "es"} · ${group.requirement.minutes} minutes` : "Not set"}{active && group.deliveryMode !== "teacher_managed" ? <span className="block text-muted">In the routine: {group.scheduledMeetings} class{group.scheduledMeetings === 1 ? "" : "es"} · {group.scheduledMinutes} minutes</span> : null}</dd></div>
                </dl>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {group.states.map(state => <Badge key={state} tone={stateTone[state]}>{GROUP_STATE_LABELS[state]}</Badge>)}
                  {group.audiences.length > 1 && <Badge tone="neutral">Merged class</Badge>}
                  {active && !["teacher_managed", "vacancy"].includes(group.schedule) && <Badge tone={group.schedule === "scheduled" ? "pine" : "gold"}>{SCHEDULE_LABELS[group.schedule]}</Badge>}
                  {!group.course.isActive && <Badge tone="clay">Course inactive</Badge>}
                </p>
                {group.problems.length > 0 && <ul className="mt-2 grid gap-0.5 text-[12.5px] text-[var(--color-clay)]">{group.problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
              </div>
              {data.editor && <p className="no-print text-[12.5px] sm:text-right"><Link className="font-semibold text-[var(--color-pine)] underline" href={`${base}/${group.id}${query}`}>Open<span className="sr-only"> {group.course.code} for {group.audiences.map(audience => audience.name).join(" and ") || "no cohort"}</span></Link></p>}
            </li>)}</ul>
          </div>
        </section>

        {showUngrouped && <section aria-labelledby="cg-ungrouped" className="ruled min-w-0 rounded-lg print:border-0">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
            <div><p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{data.ungrouped.length} offering{data.ungrouped.length === 1 ? "" : "s"}</p><h2 id="cg-ungrouped" className="font-display text-[18px] font-semibold tracking-tight">Offerings without a class group</h2></div>
            <p className="text-[12.5px] text-muted">Offered this term, nobody assigned yet</p>
          </header>
          <div className="px-4 pb-4">
            {!data.ungrouped.length && <p className="pt-4 text-sm">Every offered course in this term has a class group.</p>}
            {data.ungrouped.length > 0 && !ungrouped.length && <p className="pt-4 text-sm text-muted">No ungrouped offering matches the filters.</p>}
            <ul className="divide-y divide-[var(--color-line-soft)]">{ungrouped.map(row => <li key={row.offeringId} className="grid min-w-0 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 break-words"><p className="font-mono text-[13px] font-bold">{row.course.code}</p><p className="text-[14px] font-semibold leading-snug">{row.course.title}</p><p className="mt-0.5 text-[12.5px] text-muted">{row.cohort}{row.semester == null ? "" : ` · Semester ${row.semester}`} · {offeringStatusLabel(row.status)}{row.batchStatus !== "active" ? ` · cohort ${row.batchStatus}` : ""}</p></div>
              {canEdit && row.batchStatus === "active" && row.course.isActive && <p className="no-print text-[12.5px] sm:text-right"><Link className="font-semibold text-[var(--color-pine)] underline" href={`${base}/new${classGroupQuery(search, { course: String(row.course.id), offering: String(row.offeringId) })}`}>Create class group<span className="sr-only"> for {row.course.code}, {row.cohort}</span></Link></p>}
            </li>)}</ul>
          </div>
        </section>}
        <p className="mt-5 max-w-[80ch] text-[12.5px] text-muted">Units are workload credit-hours. They feed the Workload page and extra-load eligibility for this term. A merged class counts once for each teacher, not once per cohort. An offering in a class group cannot be cancelled until the class group is removed.</p>
      </>}
  </div>;
}
