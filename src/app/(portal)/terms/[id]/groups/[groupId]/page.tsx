import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { ClassGroupForm, ClassGroupRemoveForm } from "@/components/class-groups/class-group-forms";
import { getTermClassGroups, requireClassGroupEditor } from "@/lib/class-group-data";
import { GROUP_STATE_LABELS, SCHEDULE_LABELS, classGroupQuery, groupInteger, groupUsed, usageText } from "@/lib/class-group-records";
import { COURSE_TYPES } from "@/lib/course-records";

export const dynamic = "force-dynamic";

export default async function ClassGroupPage({ params, searchParams }: { params: Promise<{ id: string; groupId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, groupId } = await params, search = await searchParams;
  await requireClassGroupEditor(`/terms/${id}/groups/${groupId}`);
  const data = await getTermClassGroups(id), key = groupInteger(groupId);
  const group = data?.groups.find(item => item.id === key);
  if (!data || !group) notFound();
  const { term } = data, returnHref = `/terms/${term.id}/groups${classGroupQuery(search)}`, active = term.status === "active";
  const used = groupUsed(group.usage), audience = group.audiences.map(item => item.name).join(" and ") || group.externalLabel || "no cohort";
  const addable = data.ungrouped.filter(row => row.course.id === group.course.id && row.batchStatus === "active");
  return <div className="mx-auto max-w-[980px] min-w-0 break-words">
    <Link className="text-sm underline" href={returnHref}>← Class groups</Link>
    <PageHeader context={`Class groups / ${term.name}`} title={`${group.course.code} for ${audience}`}
      description={`${group.course.title} · ${group.course.credits} academic credits · ${COURSE_TYPES[group.course.courseType as keyof typeof COURSE_TYPES] ?? `${group.course.courseType} (unsupported)`}`}
      actions={active && group.deliveryMode !== "teacher_managed" && !group.problems.length ? <Link className={buttonClass.secondary} href="/routine">Schedule in Routine builder</Link> : undefined} />
    <dl className="ruled mb-5 grid min-w-0 gap-4 rounded-lg p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-xs font-semibold text-muted">State</dt><dd className="mt-1 flex flex-wrap gap-1.5">{group.states.map(state => <Badge key={state} tone={state === "ready" ? "pine" : state === "reconcile" ? "clay" : "gold"}>{GROUP_STATE_LABELS[state]}</Badge>)}</dd></div>
      <div><dt className="text-xs font-semibold text-muted">In the routine</dt><dd className="mt-1">{active ? `${SCHEDULE_LABELS[group.schedule]} · ${group.scheduledMeetings} class${group.scheduledMeetings === 1 ? "" : "es"} · ${group.scheduledMinutes} minutes` : "Scheduling opens when this term is activated"}</dd></div>
      <div><dt className="text-xs font-semibold text-muted">Already recorded</dt><dd className="mt-1">{used ? usageText(group.usage) : "Nothing yet"}</dd></div>
      <div><dt className="text-xs font-semibold text-muted">Kind</dt><dd className="mt-1">{group.audiences.length > 1 ? "Merged class — cohorts stay separate" : "One cohort"}</dd></div>
    </dl>
    {active && !group.problems.length && group.deliveryMode !== "teacher_managed" && <p className="mb-5 text-xs text-muted">Auto-schedule picks up class groups that have a teacher and weekly minutes but no class in the routine yet.</p>}
    {!data.editable ? <Notice title="Read-only term">{term.name} is {term.status}. Its class groups are kept for reference and cannot be changed.</Notice>
      : group.problems.length ? <><Notice tone="warn" title="This class group needs reconciliation.">It is shown as stored and cannot be edited here until the record is corrected. Nothing is repaired automatically.</Notice><ul className="mt-3 grid gap-1 text-sm">{group.problems.map(problem => <li key={problem}>{problem}</li>)}</ul><p className="mt-4"><Link className={buttonClass.secondary} href={returnHref}>Return to class groups</Link></p></>
      : <div className="grid gap-5">
        <ClassGroupForm termId={term.id} termName={term.name} termStatus={term.status} returnHref={returnHref} teachers={data.teachers} suggestions={data.suggestions} group={group} audienceFixed={used} addable={addable} />
        {used
          ? <section className="ruled grid min-w-0 gap-3 rounded-lg p-4" aria-labelledby="cg-remove-blocked"><h2 id="cg-remove-blocked" className="font-display text-[18px] font-semibold tracking-tight">Remove this class group</h2><Notice tone="warn" title="This class group cannot be removed.">It has {usageText(group.usage)}. A class group can be removed only before it is used; its history must stay intact.</Notice></section>
          : <ClassGroupRemoveForm termId={term.id} groupId={group.id} courseCode={group.course.code} fingerprint={group.fingerprint} returnHref={returnHref} />}
      </div>}
  </div>;
}
