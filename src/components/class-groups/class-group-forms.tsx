"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";
import { Notice } from "@/components/ui";
import { fmtInstant } from "@/lib/auth/display";
import { changeClassGroupAction, loadClassGroupChangesAction } from "@/lib/class-group-actions";
import type { ClassGroupChange, ClassGroupSnapshot } from "@/lib/class-group-data";
import { CLASS_GROUP_ACTION_LABELS, creditingOf, formatUnits, methodLabel, parseUnits, suggestUnits, type Crediting } from "@/lib/class-group-records";
import type { ClassGroupResult, ClassGroupView, CourseSuggestion, GroupCourseView, TeacherOption, UngroupedView } from "@/lib/class-group-store";

/** One action; success returns to `returnHref` with its message, failures keep every entry and take focus. */
function useClassGroupAction(returnHref: string) {
  const router = useRouter(), summary = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState<ClassGroupResult | null, FormData>(async (previous, form) => {
    const next = await changeClassGroupAction(previous, form);
    if (next.ok) { const [path, search = ""] = returnHref.split("?"); const query = new URLSearchParams(search); query.set("done", next.message); router.push(`${path}?${query}`); router.refresh(); }
    return next;
  }, null);
  useEffect(() => { if (result && !result.ok) summary.current?.focus(); }, [result]);
  // Dispatching from onSubmit avoids React's automatic form reset, which would untick controlled inputs after a failed save.
  const [, startTransition] = useTransition();
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form)); };
  return { result, submit, pending, summary };
}
function Feedback({ result, summary }: { result: ClassGroupResult | null; summary: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={summary} tabIndex={-1} className="outline-none">
    <ResultNotice result={result} />
    {result?.issues?.map(issue => <p key={`${issue.title}-${issue.detail}`} className="mt-2 text-[13px]"><strong>{issue.title}.</strong> {issue.detail}</p>)}
    {result?.outcome?.kind === "stale" && <p className="mt-2 text-[13px]">Your entries are kept. Nothing was saved. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Show current details</button></p>}
  </div>;
}
function ReasonField({ id, value, onChange, result, required }: { id: string; value: string; onChange: (value: string) => void; result: ClassGroupResult | null; required: boolean }) {
  const errors = fieldErrors(result, "reason");
  return <div className="grid gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold">Reason {required ? "(required)" : "(optional)"}</label>
    <textarea id={id} name="reason" value={value} onChange={event => onChange(event.target.value)} maxLength={300} rows={2} className={`${inputClass} py-2`} aria-describedby={`${id}-hint ${id}-error`} aria-invalid={errors.length > 0} />
    <p id={`${id}-hint`} className="text-xs text-muted">Up to 300 plain-text characters; no student details. Recorded in the change history.</p>
    <FieldError id={`${id}-error`} messages={errors} />
  </div>;
}
const Pending = ({ pending }: { pending: boolean }) => <span className="sr-only" role="status">{pending ? "Saving…" : ""}</span>;
const sectionClass = "ruled grid min-w-0 gap-4 rounded-lg p-4";
const headingClass = "font-display text-[18px] font-semibold tracking-tight";

export interface CourseChoice { course: GroupCourseView; offerings: UngroupedView[]; held: Array<{ cohort: string; groupId: number }> }
interface TeacherRow { key: number; teacherId: string; units: string }

export function ClassGroupForm({ termId, termName, termStatus, returnHref, teachers, suggestions, choices = [], initialCourseId = null, initialOfferingId = null, group, audienceFixed = false, addable = [] }: {
  termId: number; termName: string; termStatus: string; returnHref: string; teachers: TeacherOption[]; suggestions: CourseSuggestion[];
  /** Create: courses that still have an ungrouped offering. */ choices?: CourseChoice[]; initialCourseId?: number | null; initialOfferingId?: number | null;
  /** Edit: the group, whether its audience is fixed, and same-course offerings that may join it. */ group?: ClassGroupView; audienceFixed?: boolean; addable?: UngroupedView[];
}) {
  const editing = !!group;
  const startCourse = editing ? String(group!.course.id) : initialCourseId && choices.some(choice => choice.course.id === initialCourseId) ? String(initialCourseId) : choices.length === 1 ? String(choices[0].course.id) : "";
  const [courseId, setCourseId] = useState(startCourse);
  const choice = choices.find(item => String(item.course.id) === courseId);
  const course = editing ? group!.course : choice?.course;
  const suggestion = suggestions.find(item => String(item.courseId) === courseId) ?? null;
  const suggestedUnits = course ? suggestUnits(course, suggestion?.units ?? null) : null;
  const seedPicks = (id: string) => { const found = choices.find(item => String(item.course.id) === id); if (!found) return new Set<number>(); const preset = found.offerings.find(row => row.offeringId === initialOfferingId); return new Set(preset ? [preset.offeringId] : found.offerings.length === 1 ? [found.offerings[0].offeringId] : []); };
  const [picks, setPicks] = useState<Set<number>>(() => editing ? new Set(group!.audiences.map(audience => audience.offeringId)) : seedPicks(startCourse));
  const startSuggestion = suggestions.find(item => String(item.courseId) === startCourse);
  const startThesis = !editing && choices.find(item => String(item.course.id) === startCourse)?.course.courseType === "thesis";
  const [delivery, setDelivery] = useState(editing ? group!.deliveryMode : startThesis ? "teacher_managed" : "fixed");
  const [meetings, setMeetings] = useState(editing ? group!.deliveryMode === "teacher_managed" ? "" : String(group!.requirement?.meetings ?? "") : String(startSuggestion?.meetings ?? ""));
  const [minutes, setMinutes] = useState(editing ? String(group!.requirement?.minutes ?? "") : String(startSuggestion?.minutes ?? ""));
  const [requirementSource, setRequirementSource] = useState(!editing && startSuggestion?.minutes != null ? startSuggestion.from : "");
  const [provisional, setProvisional] = useState(editing ? !!group!.requirement?.provisional : false);
  const nextKey = useRef(editing ? group!.teachers.length : 0);
  const [rows, setRows] = useState<TeacherRow[]>(() => editing ? group!.teachers.map((teacher, index) => ({ key: index, teacherId: String(teacher.teacherId), units: formatUnits(teacher.units) })) : []);
  const [crediting, setCrediting] = useState<Crediting | "">(editing ? creditingOf(group!.method) : "");
  const [externalLabel, setExternalLabel] = useState(group?.externalLabel ?? ""), [externalCount, setExternalCount] = useState(group?.externalCount == null ? "" : String(group.externalCount));
  const [notes, setNotes] = useState(group?.notes ?? ""), [reason, setReason] = useState("");
  const { result, submit, pending, summary } = useClassGroupAction(returnHref);

  const chooseCourse = (id: string) => {
    setCourseId(id); setPicks(seedPicks(id));
    const found = choices.find(item => String(item.course.id) === id), hint = suggestions.find(item => String(item.courseId) === id);
    setDelivery(found?.course.courseType === "thesis" ? "teacher_managed" : "fixed");
    setMeetings(String(hint?.meetings ?? "")); setMinutes(String(hint?.minutes ?? "")); setRequirementSource(hint?.minutes != null ? hint.from : "");
  };
  const toggle = (id: number, on: boolean) => setPicks(previous => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; });
  const setRow = (key: number, change: Partial<TeacherRow>) => setRows(previous => previous.map(row => row.key === key ? { ...row, ...change } : row));
  const addRow = () => setRows(previous => [...previous, { key: nextKey.current++, teacherId: "", units: suggestedUnits ? formatUnits(suggestedUnits.units) : "" }]);

  const original = new Map(group?.teachers.map(teacher => [String(teacher.teacherId), teacher.units]) ?? []);
  const locked = new Set(group?.lockedTeacherIds.map(String) ?? []);
  const audienceOptions: Array<{ offeringId: number; label: string }> = editing
    ? [...group!.audiences.map(audience => ({ offeringId: audience.offeringId, label: `${audience.name}${audience.semester == null ? "" : ` · Semester ${audience.semester}`}${audience.offeringStatus === "cancelled" ? " · offering cancelled" : ""}` })), ...addable.map(row => ({ offeringId: row.offeringId, label: `${row.cohort}${row.semester == null ? "" : ` · Semester ${row.semester}`}` }))]
    : (choice?.offerings ?? []).map(row => ({ offeringId: row.offeringId, label: `${row.cohort}${row.semester == null ? "" : ` · Semester ${row.semester}`}` }));
  const teacherErrors = fieldErrors(result, "teachers"), offeringErrors = fieldErrors(result, "offering");
  const suggestionText = suggestedUnits ? suggestedUnits.source === "previous" ? `Suggested ${formatUnits(suggestedUnits.units)} from this course's last recorded units (${suggestion!.from}).` : suggestedUnits.source === "catalog" ? `Suggested ${formatUnits(suggestedUnits.units)} from this course's catalog credits.` : `Suggested ${formatUnits(suggestedUnits.units)}: a one-credit sessional currently counts as two units.` : "No units are suggested for this course; enter what applies.";

  return <form onSubmit={submit} noValidate className="grid min-w-0 gap-5">
    <input type="hidden" name="command" value={editing ? "update" : "create"} /><input type="hidden" name="termId" value={termId} />
    {editing && <><input type="hidden" name="groupId" value={group!.id} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? group!.fingerprint} /></>}
    <Feedback result={result} summary={summary} />

    <section className={sectionClass} aria-labelledby="cg-audience">
      <h2 id="cg-audience" className={headingClass}>{editing ? "Audience" : "Course and audience"}</h2>
      {!editing && <div className="grid gap-1.5"><label htmlFor="cg-course" className="text-sm font-semibold">Course</label>
        <select id="cg-course" name="courseId" value={courseId} onChange={event => chooseCourse(event.target.value)} className={inputClass} aria-describedby="cg-course-hint cg-course-error" aria-invalid={fieldErrors(result, "courseId").length > 0}><option value="">Choose a course</option>{choices.map(item => <option key={item.course.id} value={item.course.id}>{item.course.code} · {item.course.title}</option>)}</select>
        <p id="cg-course-hint" className="text-xs text-muted">Courses offered this term that still have a cohort without a class group.</p><FieldError id="cg-course-error" messages={fieldErrors(result, "courseId")} /></div>}
      {audienceFixed
        ? <><ul className="grid gap-1 text-sm">{group!.audiences.map(audience => <li key={audience.offeringId}>{audience.name}{audience.semester == null ? "" : ` · Semester ${audience.semester}`}<input type="hidden" name="offering" value={audience.offeringId} /></li>)}</ul><p className="text-xs text-muted">The audience is fixed because this class group is already in use. Clash and room-size checks for its classes depend on who attends.</p></>
        : course && <fieldset className="grid gap-2" aria-describedby="cg-offering-error"><legend className="text-sm font-semibold">Cohorts taught together</legend>
          {audienceOptions.map(option => <label key={option.offeringId} className="flex items-start gap-2 text-sm"><input type="checkbox" name="offering" value={option.offeringId} checked={picks.has(option.offeringId)} onChange={event => toggle(option.offeringId, event.target.checked)} className="mt-0.5 h-4 w-4" /><span>{option.label}</span></label>)}
          {!audienceOptions.length && <p className="text-sm text-muted">No cohort of this course is waiting for a class group.</p>}
          <FieldError id="cg-offering-error" messages={offeringErrors} /></fieldset>}
      {!audienceFixed && picks.size > 1 && <Notice title={`One merged class for ${picks.size} cohorts.`}>They attend the same classes. The cohorts stay separate: each keeps its own offering, roster and attendance marks.</Notice>}
      {!editing && choice && choice.held.length > 0 && <p className="text-xs text-muted">Already in a class group for this course: {choice.held.map((item, index) => <span key={item.groupId}>{index ? ", " : ""}<Link className="underline" href={`/terms/${termId}/groups/${item.groupId}`}>{item.cohort}</Link></span>)}.</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1.5"><label htmlFor="cg-external" className="text-sm font-semibold">Outside audience (optional)</label><input id="cg-external" name="externalLabel" value={externalLabel} onChange={event => setExternalLabel(event.target.value)} maxLength={40} className={inputClass} aria-describedby="cg-external-hint cg-external-error" aria-invalid={fieldErrors(result, "externalLabel").length > 0} /><p id="cg-external-hint" className="text-xs text-muted">For example students of another department. Up to 40 characters.</p><FieldError id="cg-external-error" messages={fieldErrors(result, "externalLabel")} /></div>
        <div className="grid content-start gap-1.5"><label htmlFor="cg-external-count" className="text-sm font-semibold">Outside student count</label><input id="cg-external-count" name="externalCount" inputMode="numeric" value={externalCount} onChange={event => setExternalCount(event.target.value)} maxLength={4} className={inputClass} aria-describedby="cg-external-count-hint cg-external-count-error" aria-invalid={fieldErrors(result, "externalCount").length > 0} /><p id="cg-external-count-hint" className="text-xs text-muted">Leave blank when unknown.</p><FieldError id="cg-external-count-error" messages={fieldErrors(result, "externalCount")} /></div>
      </div>
    </section>

    <section className={sectionClass} aria-labelledby="cg-teachers">
      <h2 id="cg-teachers" className={headingClass}>Teachers and workload units</h2>
      <FieldError id="cg-teachers-error" messages={teacherErrors} />
      {!rows.length && <p className="text-sm">No teacher yet. Saving like this records a vacancy.</p>}
      <ul className="grid gap-3">{rows.map((row, index) => {
        const teacher = teachers.find(item => String(item.id) === row.teacherId), entered = parseUnits(row.units), was = original.get(row.teacherId) ?? 0;
        const after = teacher && entered != null ? teacher.total - was + entered : null, isLocked = locked.has(row.teacherId);
        const taken = new Set(rows.filter(other => other.key !== row.key).map(other => other.teacherId));
        return <li key={row.key} className="grid min-w-0 gap-x-3 gap-y-1.5 border-b border-[var(--color-line-soft)] pb-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <div className="grid gap-1.5"><label htmlFor={`cg-teacher-${row.key}`} className="text-sm font-semibold">Teacher {index + 1}</label>
            <select id={`cg-teacher-${row.key}`} name="teacherId" value={row.teacherId} onChange={event => setRow(row.key, { teacherId: event.target.value })} className={inputClass} aria-describedby={`cg-teacher-${row.key}-note cg-teachers-error`}>
              <option value="">Choose a teacher</option>
              {teachers.filter(item => (item.status === "active" || original.has(String(item.id))) && (!taken.has(String(item.id)))).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}{item.status === "active" ? "" : ` (${item.status === "on_leave" ? "on leave" : item.status})`}</option>)}
            </select></div>
          <div className="grid gap-1.5"><label htmlFor={`cg-units-${row.key}`} className="text-sm font-semibold">Units</label><input id={`cg-units-${row.key}`} name="units" inputMode="decimal" value={row.units} onChange={event => setRow(row.key, { units: event.target.value })} maxLength={5} className={inputClass} aria-describedby={`cg-teacher-${row.key}-note cg-teachers-error`} /></div>
          <div className="flex items-end">{isLocked ? null : <button type="button" className={buttonClass.secondary} onClick={() => setRows(previous => previous.filter(other => other.key !== row.key))}>Remove<span className="sr-only"> teacher {index + 1}</span></button>}</div>
          <p id={`cg-teacher-${row.key}-note`} className="text-xs text-muted sm:col-span-3">
            {teacher && after != null ? <>This term: {formatUnits(teacher.total)} → <strong>{formatUnits(after)}</strong> units.{after > teacher.limit ? ` Above this teacher's advisory limit of ${formatUnits(teacher.limit)}; saving is still allowed.` : ""}</> : teacher ? "Enter units from 0.25 to 20.00, with at most two decimals." : "Choose a teacher and enter units."}
            {isLocked ? " Teaches a scheduled class of this group, so cannot be removed here. Change that class in the Routine builder first." : ""}
          </p>
        </li>;
      })}</ul>
      <p><button type="button" className={buttonClass.secondary} onClick={addRow} disabled={rows.length >= 12}>Add {rows.length ? "another " : "a "}teacher</button></p>
      {course && <p className="text-xs text-muted">{suggestionText} What you enter is what is recorded; nothing is calculated afterwards.</p>}
      {rows.length > 1 && <fieldset className="grid gap-2" aria-describedby="cg-method-error"><legend className="text-sm font-semibold">{rows.length} teachers share this class</legend>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="method" value="full" checked={crediting === "full"} onChange={() => setCrediting("full")} className="mt-0.5 h-4 w-4" /><span>Each is credited in full</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="method" value="split" checked={crediting === "split"} onChange={() => setCrediting("split")} className="mt-0.5 h-4 w-4" /><span>The units are split between them</span></label>
        <FieldError id="cg-method-error" messages={fieldErrors(result, "method")} /></fieldset>}
    </section>

    <section className={sectionClass} aria-labelledby="cg-weekly">
      <h2 id="cg-weekly" className={headingClass}>Weekly requirement</h2>
      <fieldset className="grid gap-2" aria-describedby="cg-delivery-error"><legend className="text-sm font-semibold">Delivery</legend>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="delivery" value="fixed" checked={delivery === "fixed"} onChange={() => setDelivery("fixed")} className="mt-0.5 h-4 w-4" /><span>Fixed weekly classes</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="delivery" value="teacher_managed" checked={delivery === "teacher_managed"} onChange={() => setDelivery("teacher_managed")} className="mt-0.5 h-4 w-4" /><span>Teacher-managed (thesis or project; no weekly classes)</span></label>
        <FieldError id="cg-delivery-error" messages={fieldErrors(result, "delivery")} /></fieldset>
      {delivery === "fixed" && <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1.5"><label htmlFor="cg-meetings" className="text-sm font-semibold">Classes per week</label><input id="cg-meetings" name="meetings" inputMode="numeric" value={meetings} onChange={event => setMeetings(event.target.value)} maxLength={2} className={inputClass} aria-describedby="cg-meetings-error" aria-invalid={fieldErrors(result, "meetings").length > 0} /><FieldError id="cg-meetings-error" messages={fieldErrors(result, "meetings")} /></div>
        <div className="grid content-start gap-1.5"><label htmlFor="cg-minutes" className="text-sm font-semibold">Minutes per week</label><input id="cg-minutes" name="minutes" inputMode="numeric" value={minutes} onChange={event => { setMinutes(event.target.value); setRequirementSource(""); }} maxLength={4} className={inputClass} aria-describedby="cg-minutes-hint cg-minutes-error" aria-invalid={fieldErrors(result, "minutes").length > 0} /><p id="cg-minutes-hint" className="text-xs text-muted">{requirementSource ? `Suggested from ${course?.code ?? "this course"} in ${requirementSource}.` : "Total class time each week, from 30 to 1,500 minutes."}</p><FieldError id="cg-minutes-error" messages={fieldErrors(result, "minutes")} /></div>
      </div>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="provisional" checked={provisional} onChange={event => setProvisional(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>Provisional — to be confirmed</span></label>
      <div className="grid gap-1.5"><label htmlFor="cg-notes" className="text-sm font-semibold">Notes (optional)</label><input id="cg-notes" name="notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={500} className={inputClass} aria-describedby="cg-notes-error" aria-invalid={fieldErrors(result, "notes").length > 0} /><FieldError id="cg-notes-error" messages={fieldErrors(result, "notes")} /></div>
      <ReasonField id="cg-reason" value={reason} onChange={setReason} result={result} required={editing} />
      {termStatus === "active"
        ? <Notice tone="warn" title={`${termName} is the active term.`}>Workload totals and extra-load eligibility follow these units as soon as you save. Existing extra-load records and published routines are not changed. A teacher&apos;s access to this class group follows their assignment.</Notice>
        : <p className="text-xs text-muted">{editing ? "Saves" : "Creates"} the class group only. No class, room, enrollment or attendance is created. Classes are placed in the Routine builder after {termName} is activated.</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending || (!editing && !course)} className={buttonClass.primary}>{pending ? "Saving…" : editing ? "Save changes" : "Create class group"}</button><Link className={buttonClass.secondary} href={returnHref}>Cancel</Link></div>
      <Pending pending={pending} />
    </section>
  </form>;
}

export function ClassGroupRemoveForm({ termId, groupId, courseCode, fingerprint, returnHref }: { termId: number; groupId: number; courseCode: string; fingerprint: string; returnHref: string }) {
  const [reason, setReason] = useState(""), [confirmation, setConfirmation] = useState("");
  const { result, submit, pending, summary } = useClassGroupAction(returnHref);
  return <form onSubmit={submit} noValidate className={sectionClass} aria-labelledby="cg-remove-title">
    <input type="hidden" name="command" value="remove" /><input type="hidden" name="termId" value={termId} /><input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? fingerprint} />
    <h2 id="cg-remove-title" className={headingClass}>Remove this class group</h2>
    <p className="text-sm">It has not been used yet, so it can be removed. Its teachers, units and weekly requirement are deleted; its offerings stay. The change history keeps who removed it and why.</p>
    <Feedback result={result} summary={summary} />
    <div className="grid gap-1.5"><label htmlFor="cg-remove-code" className="text-sm font-semibold">Type {courseCode} to confirm</label><input id="cg-remove-code" name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} autoComplete="off" aria-describedby="cg-remove-code-error" aria-invalid={fieldErrors(result, "confirmation").length > 0} /><FieldError id="cg-remove-code-error" messages={fieldErrors(result, "confirmation")} /></div>
    <ReasonField id="cg-remove-reason" value={reason} onChange={setReason} result={result} required />
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending} className={buttonClass.danger}>{pending ? "Saving…" : "Remove class group"}</button><Link className={buttonClass.secondary} href={returnHref}>Keep it</Link></div>
    <Pending pending={pending} />
  </form>;
}

const describe = (snapshot: ClassGroupSnapshot) => [
  snapshot.teachers.length ? `Teachers: ${snapshot.teachers.map(teacher => `${teacher.code} ${teacher.units}`).join(", ")}${snapshot.teachers.length > 1 && snapshot.method ? ` (${methodLabel(snapshot.method).toLowerCase()})` : ""}` : "No teacher",
  snapshot.deliveryMode === "teacher_managed" ? "teacher-managed" : snapshot.requirement?.minutes != null ? `${snapshot.requirement.meetings} class${snapshot.requirement.meetings === 1 ? "" : "es"}, ${snapshot.requirement.minutes} minutes per week${snapshot.requirement.provisional ? " (provisional)" : ""}` : "no weekly requirement",
  ...(snapshot.externalLabel ? [`outside audience ${snapshot.externalLabel}${snapshot.externalCount == null ? "" : ` (${snapshot.externalCount})`}`] : []),
].join(" · ");

export function ClassGroupHistory({ termId, initial }: { termId: number; initial: { changes: ClassGroupChange[]; next: number | null } }) {
  const [page, setPage] = useState(initial), [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <section className="ruled min-w-0 rounded-lg p-4" aria-label="Class-group changes">
    <ol className="grid gap-4">{page.changes.map(event => <li key={event.id} className="min-w-0 break-words border-t border-[var(--color-line-soft)] pt-3 text-sm first:border-t-0 first:pt-0">
      <p><strong>{CLASS_GROUP_ACTION_LABELS[event.action] ?? event.action}</strong> · {fmtInstant(event.at)} · {event.actor}</p>
      {event.course && <p className="mt-1"><span className="font-mono font-bold">{event.course}</span> for {event.audience ?? "unknown audience"}</p>}
      {event.before && event.after && <><p className="mt-1">Before: {describe(event.before)}</p><p className="mt-1">After: {describe(event.after)}</p></>}
      {!event.before && event.after && <p className="mt-1">{describe(event.after)}</p>}
      {event.started && <>
        <p className="mt-1">{event.started.groups.length} class groups from {event.started.source}</p>
        <ul className="ml-4 mt-1 list-disc">
          {event.started.groups.map(({ course, snapshot }, index) => <li key={index}><strong>{course}</strong> · {snapshot.audience.join(", ")} · {describe(snapshot)}</li>)}
        </ul>
      </>}
      {event.before && !event.after && <p className="mt-1">Was: {describe(event.before)}</p>}
      {event.reason && <p className="mt-1 text-muted">Reason: {event.reason}</p>}
    </li>)}</ol>
    {!page.changes.length && <p className="text-sm">No class-group changes are recorded for this term. Imported class groups have no fabricated history.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {page.next && <button className={`${buttonClass.secondary} mt-4`} type="button" disabled={pending} onClick={() => start(async () => { try { const older = await loadClassGroupChangesAction(termId, page.next!); setPage(current => ({ changes: [...current.changes, ...older.changes], next: older.next })); setError(""); } catch { setError("Changes could not be loaded. Reload to check your access."); } })}>{pending ? "Loading…" : "Load older"}</button>}
  </section>;
}
