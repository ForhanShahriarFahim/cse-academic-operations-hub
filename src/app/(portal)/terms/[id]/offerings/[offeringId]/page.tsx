import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { OfferingChangeForm } from "@/components/offerings/offering-forms";
import { getTermOfferings, requireOfferingEditor } from "@/lib/offering-data";
import { COURSE_TYPES } from "@/lib/course-records";
import { OFFERING_COMPARISON_LABELS, offeringFilters, offeringInteger, offeringLive, offeringOffered, offeringQuery, offeringStatusLabel } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

export default async function OfferingChangePage({ params, searchParams }: { params: Promise<{ id: string; offeringId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, offeringId } = await params, search = await searchParams, filters = offeringFilters(search);
  await requireOfferingEditor(`/terms/${id}/offerings/${offeringId}`);
  const data = await getTermOfferings(id, filters.source ? String(filters.source) : undefined), key = offeringInteger(offeringId);
  const cohort = data?.cohorts.find(item => item.offerings.some(row => row.id === key)), row = cohort?.offerings.find(item => item.id === key);
  if (!data || !cohort || !row) notFound();
  const { term } = data, returnHref = `/terms/${term.id}/offerings${offeringQuery(search)}`;
  const common = { termId: term.id, offeringId: row.id, courseCode: row.course.code, fingerprint: cohort.fingerprint, returnHref };
  const live = offeringLive(row.status), linked = row.groups > 0;
  return <div className="mx-auto max-w-[980px] min-w-0 break-words">
    <Link className="text-sm underline" href={returnHref}>← Term offerings</Link>
    <PageHeader context={`Term offerings / ${term.name}`} title={`${row.course.code} for ${cohort.name}`} description={`${row.course.title} · ${row.course.credits} academic credits · ${COURSE_TYPES[row.course.courseType as keyof typeof COURSE_TYPES] ?? `${row.course.courseType} (unsupported)`}`} />
    <dl className="ruled mb-5 grid min-w-0 gap-4 rounded-lg p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><dt className="text-xs font-semibold text-muted">Status</dt><dd className="mt-1"><Badge tone={offeringOffered(row.status) ? "pine" : "neutral"}>{offeringStatusLabel(row.status)}</Badge></dd></div>
      <div><dt className="text-xs font-semibold text-muted">Cohort</dt><dd className="mt-1">{cohort.name} · {cohort.semester == null ? "no placement in this term" : `semester ${cohort.semester}`}</dd></div>
      <div><dt className="text-xs font-semibold text-muted">Class groups</dt><dd className="mt-1">{linked ? `In ${row.groups} class group${row.groups === 1 ? "" : "s"}` : "No class group yet"}</dd></div>
      <div><dt className="text-xs font-semibold text-muted">Compared with {data.source?.name ?? "previous term"}</dt><dd className="mt-1">{row.comparison ? OFFERING_COMPARISON_LABELS[row.comparison] : "No comparison"}</dd></div>
    </dl>
    {!data.editable ? <Notice title="Read-only term">{term.name} is {term.status}. Its offerings are kept for reference and cannot be changed.</Notice>
      : linked ? <><Notice tone="warn" title="This offering is part of a class group.">It cannot be cancelled or removed here. Changing who attends a class belongs to the class-group step.</Notice><p className="mt-4"><Link className={buttonClass.secondary} href={returnHref}>Return to offerings</Link></p></>
      : <div className="grid gap-5">
        {live && <OfferingChangeForm command="cancel" {...common} />}
        {row.status === "cancelled" && <OfferingChangeForm command="restore" {...common} />}
        {term.status === "draft" && <OfferingChangeForm command="remove" {...common} />}
        {!live && row.status !== "cancelled" && term.status !== "draft" && <Notice>An offering marked {offeringStatusLabel(row.status)} cannot be changed here.</Notice>}
        {term.status !== "draft" && <p className="text-xs text-muted">Offerings are removed only while a term is a draft. In an active term the record is kept as cancelled.</p>}
      </div>}
  </div>;
}
