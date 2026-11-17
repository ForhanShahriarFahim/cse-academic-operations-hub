import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Panel } from "@/components/ui";
import { PrintHeader } from "@/components/print-header";
import { PrintButton } from "@/components/print-button";
import { buttonClass, inputClass } from "@/components/account/styles";
import { CourseCompleteness } from "@/components/courses/course-completeness";
import { getCourseDirectory } from "@/lib/course-data";
import { COURSE_TYPES } from "@/lib/course-records";
export const dynamic = "force-dynamic";
export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const data = await getCourseDirectory(), query = await searchParams;
  const q = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const status = ["active", "inactive", "all"].includes(query.status ?? "") ? query.status! : "active";
  const rows = data.records.filter(course => (status === "all" || course.isActive === (status === "active")) && `${course.code} ${course.title}`.toLowerCase().includes(q.toLowerCase()));
  const returnQuery = new URLSearchParams({ q, status }).toString();
  const type = (value: string) => COURSE_TYPES[value as keyof typeof COURSE_TYPES] ?? `${value} (unsupported)`;
  return <div className="min-w-0">
    <PrintHeader title="Courses & offerings" termName={data.term?.name ?? "Global course catalog"} publishedVersion={data.publishedVersion} publicationState={data.term ? undefined : "Global working catalog — no active term selected"} />
    <PageHeader context="Planning records" title="Courses & offerings" description="Manage the global course catalog and review scheduling completeness for the active term." actions={<><PrintButton />{data.editor && <Link className={buttonClass.primary} href={`/courses/new?${returnQuery}`}>Add course</Link>}</>} />
    <Panel title="Course catalog" sub={`${rows.length} displayed catalog records · global across terms`}>
      <form className="no-print mb-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]" method="get">
        <div><label htmlFor="course-search" className="mb-1 block text-sm font-semibold">Search code or title</label><input id="course-search" name="q" className={inputClass} defaultValue={q} maxLength={200} /></div>
        <div><label htmlFor="course-status" className="mb-1 block text-sm font-semibold">Status</label><select id="course-status" name="status" className={inputClass} defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></div>
        <button className={`${buttonClass.secondary} self-end`} type="submit">Apply filters</button>
      </form>
      {!rows.length && <p className="py-6 text-sm">{data.records.length ? <>No matching courses. <Link className="underline" href="/courses?status=all">Reset filters</Link>.</> : <>No courses yet.{data.editor && <> <Link className="underline" href="/courses/new">Add a course</Link>.</>}</>}</p>}
      <div className="hidden md:block print:block"><table className="routine-table w-full table-fixed text-xs [&_td]:[overflow-wrap:anywhere]"><caption className="sr-only">Global course catalog</caption><thead><tr>{["Code", "Title", "Academic credits", "Type", "Owner", "Semester", "Requirement", "Status"].map(label => <th className="px-2 py-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(course => <tr key={course.id}><td className="px-2 py-2 font-mono font-bold"><Link className="underline" href={`/courses/${course.id}?${returnQuery}`}>{course.code}</Link>{course.duplicate && <span className="block text-xs">Duplicate normalized code</span>}</td><td className="[overflow-wrap:anywhere] px-2 py-2">{course.title}</td><td className="px-2 py-2">{course.credits}</td><td className="px-2 py-2">{type(course.courseType)}</td><td className="px-2 py-2">{course.owner ?? "Unknown"}</td><td className="px-2 py-2">{course.semester}</td><td className="px-2 py-2">{course.requiredRoomCapability ?? (course.needsLab ? "Lab required" : "None")}</td><td className="px-2 py-2">{course.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>
      <ul className="grid gap-3 md:hidden print:hidden">{rows.map(course => <li key={course.id} className="min-w-0 rounded border border-[var(--color-line)] p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><Link className="font-mono font-bold underline" href={`/courses/${course.id}?${returnQuery}`}>{course.code}</Link><span>{course.isActive ? "Active" : "Inactive"}</span></div><p className="mt-1 break-words font-semibold">{course.title}</p><p className="mt-2 text-xs">{course.credits} academic credits · {type(course.courseType)} · Semester {course.semester}</p><p className="mt-1 break-words text-xs">Owner: {course.owner ?? "Unknown"} · Requirement: {course.requiredRoomCapability ?? (course.needsLab ? "Lab required" : "None")}</p>{course.duplicate && <p className="mt-2 text-xs">Duplicate normalized code — retained separately.</p>}</li>)}</ul>
    </Panel>
    <section className="no-print mt-5" aria-label="Term offerings"><Panel title="Term offerings" sub="What each cohort is offered in a term, and the class groups that teach it">{data.term || data.draftTerms.length ? <ul className="grid gap-2 text-sm">{data.term && <li><Link className="font-semibold underline" href={`/terms/${data.term.id}/offerings`}>{data.term.name} offerings</Link> · <Link className="font-semibold underline" href={`/terms/${data.term.id}/groups`}>{data.term.name} class groups</Link> · active term</li>}{data.draftTerms.map(draft => <li key={draft.id}><Link className="font-semibold underline" href={`/terms/${draft.id}/offerings`}>{draft.name} offerings</Link> · <Link className="font-semibold underline" href={`/terms/${draft.id}/groups`}>{draft.name} class groups</Link> · draft term being prepared</li>)}</ul> : <p className="text-sm">No active or draft term. Offerings are managed per term from <Link className="underline" href="/terms">Academic terms</Link>.</p>}</Panel></section>
    <section className="mt-5" aria-label="Term scheduling completeness">{data.term ? <Suspense fallback={<p role="status">Loading scheduling completeness…</p>}><CourseCompleteness expectedTermId={data.term.id} /></Suspense> : <Panel title="Scheduling completeness" sub="Term-specific report"><p className="p-3 text-sm">{data.termProblem === "none" ? "Select an active academic term to see scheduling completeness." : "The active academic term is ambiguous or unavailable. Review Terms before scheduling."} The global catalog remains available.</p></Panel>}</section>
  </div>;
}
