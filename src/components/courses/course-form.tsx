"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";
import { saveCourseAction } from "@/lib/course-actions";
import { COURSE_CAPABILITIES, COURSE_FIELDS, COURSE_LABELS, COURSE_TYPES, courseCodeCandidate, courseDraft, type CourseField, type CourseRecord } from "@/lib/course-records";
import type { CourseEvidence as Evidence, CourseResult } from "@/lib/course-store";
import { CourseEvidence } from "./course-evidence";

export function CourseForm({ record, departments, evidence, returnQuery }: { record: CourseRecord | null; departments: Array<{ id: number; code: string; name: string }>; evidence: Evidence | null; returnQuery: string }) {
  const [draft, setDraft] = useState(courseDraft(record)), [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false), [acknowledged, setAcknowledged] = useState(false), [submission, setSubmission] = useState(0);
  const summary = useRef<HTMLDivElement>(null), router = useRouter();
  const [result, action, pending] = useActionState<CourseResult | null, FormData>(async (previous, form) => {
    setSubmission(count => count + 1);
    const next = await saveCourseAction(previous, form);
    if (next.ok) { setDirty(false); const id = next.outcome?.kind === "success" ? next.outcome.entityId : record?.id; const query = new URLSearchParams(returnQuery); query.set("done", next.message); router.push(`/courses/${id}?${query}`); router.refresh(); }
    else setAcknowledged(false);
    return next;
  }, null);
  useEffect(() => { if (result && !result.ok) summary.current?.focus(); }, [result]);
  useEffect(() => { if (!dirty) return; const listener = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener); }, [dirty]);
  const currentEvidence = result?.evidence ?? evidence;
  const frozen = !!currentEvidence && (currentEvidence.references.length > 0 || currentEvidence.uncertainSnapshots > 0);
  const change = (field: CourseField, value: string) => { setDraft(previous => ({ ...previous, [field]: value, ...(field === "courseType" ? { needsLab: value === "sessional" ? "true" : "false" } : {}) })); setDirty(true); setAcknowledged(false); };
  const field = (name: CourseField, hint: string, options?: Array<[string, string]>) => {
    const disabled = name !== "title" && (frozen || !!record && options != null && !options.some(([value]) => value === draft[name]));
    const props = { id: `cf-${name}`, name, value: draft[name], className: inputClass, disabled: pending || disabled, onChange: (event: { target: { value: string } }) => change(name, event.target.value), "aria-invalid": fieldErrors(result, name).length > 0, "aria-describedby": `cf-${name}-hint cf-${name}-error` };
    return <div className={`grid min-w-0 gap-1.5 ${name === "title" ? "md:col-span-2" : ""}`} key={name}><label className="text-sm font-semibold" htmlFor={props.id}>{COURSE_LABELS[name]}{disabled ? " · Read-only" : ""}</label>{options ? <select {...props}>{!options.some(([value]) => value === draft[name]) && <option value={draft[name]}>{draft[name] || "Choose…"}{draft[name] ? " (unsupported legacy value)" : ""}</option>}{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input {...props} autoComplete="off" />}{disabled && <input type="hidden" name={name} value={draft[name]} />}<p id={`cf-${name}-hint`} className="text-xs text-muted">{hint}</p><FieldError id={`cf-${name}-error`} messages={fieldErrors(result, name)} /></div>;
  };
  const cancel = record ? `/courses/${record.id}?${returnQuery}` : `/courses?${returnQuery}`;
  return <form key={submission} action={action} noValidate className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">
    <input type="hidden" name="command" value="save" /><input type="hidden" name="courseId" value={record?.id ?? ""} /><input type="hidden" name="revision" value={record?.revision ?? ""} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? ""} />
    <div ref={summary} tabIndex={-1} className="outline-none"><ResultNotice result={result} />{result && !result.ok && <ul className="mt-2 text-sm">{[...COURSE_FIELDS, "reason"].filter(name => fieldErrors(result, name).length).map(name => <li key={name}><a href={`#cf-${name}`} className="underline">{name === "reason" ? "Reason" : COURSE_LABELS[name as CourseField]}: {fieldErrors(result, name)[0]}</a></li>)}</ul>}{result?.outcome?.kind === "stale" && <button className={`${buttonClass.secondary} mt-3`} type="button" onClick={() => { if (window.confirm("Discard your entered values and reload the latest course?")) window.location.reload(); }}>Reload latest</button>}</div>
    {frozen && <p className="rounded bg-gold-tint p-3 text-sm">Code and academic fields are frozen by recorded use or unsupported snapshot evidence. A historical academic correction requires a separate workflow. You can correct its title after reviewing the live-record impact below.</p>}
    <div className="ruled grid min-w-0 gap-4 rounded-lg p-4 md:grid-cols-2">
      {field("code", `Canonical candidate: ${courseCodeCandidate(draft.code) || "enter a code, e.g. CSE-4000(A)"}. Codes and earlier aliases stay reserved.`)}
      {field("title", "Plain text, 1–200 characters. No classification is inferred from the title.")}
      {field("credits", "Academic credits only: >0 to 999.9, at most one decimal. Workload units are assigned per group.")}
      {field("courseType", "Choose explicitly; existing classifications are retained.", Object.entries(COURSE_TYPES))}
      {field("owningDepartmentId", "Choose explicitly. This does not grant editor permission.", [["", "Choose…"], ["unknown", "Unknown"], ...departments.map(department => [String(department.id), `${department.code} · ${department.name}`] as [string, string])])}
      {field("semester", "Curriculum semester; independent of course digits and active term.", [["", "Choose…"], ...Array.from({ length: 8 }, (_, index) => [String(index + 1), String(index + 1)] as [string, string])])}
      {field("requiredRoomCapability", "Specialist suitability is checked independently. None adds no specialist constraint.", [["", "None"], ...COURSE_CAPABILITIES.map(value => [value, value] as [string, string])])}
      <div id="cf-needsLab" tabIndex={-1} className="text-sm"><p className="font-semibold">Lab required · {draft.needsLab === "true" ? "Yes" : "No"}</p><p className="mt-2 text-xs text-muted">Sessional courses require a lab. Existing imported lab requirements are retained.</p><input type="hidden" name="needsLab" value={draft.needsLab} />{record && record.needsLab !== (record.courseType === "sessional") && <p className="mt-2 text-xs">Legacy type/lab mismatch retained; no automatic repair.</p>}<FieldError id="cf-needsLab-error" messages={fieldErrors(result, "needsLab")} /></div>
    </div>
    {record && <p className="rounded border border-[var(--color-line)] bg-gold-tint p-3 text-sm">Title correction: {record.title} → {draft.title || "(enter title)"}. Live working views in all terms, including old terms, use the corrected title. Published snapshots and existing claim labels keep their captured values.</p>}
    {currentEvidence && <CourseEvidence evidence={currentEvidence} />}
    {result?.fingerprint && result.candidate === draft.title.trim() && <label className="flex items-start gap-2 rounded bg-gold-tint p-4 text-sm"><input type="checkbox" name="acknowledge" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>Apply this title correction to live records. I reviewed the affected terms and retained snapshots.</span></label>}
    <div><label htmlFor="cf-reason" className="text-sm font-semibold">Administrative reason{record ? " (required)" : " (optional)"}</label><textarea id="cf-reason" name="reason" value={reason} onChange={event => { setReason(event.target.value); setDirty(true); }} rows={3} maxLength={300} className={`${inputClass} mt-2`} aria-invalid={fieldErrors(result, "reason").length > 0} aria-describedby="cf-reason-hint cf-reason-error" /><p id="cf-reason-hint" className="mt-1 text-xs text-muted">Up to 300 plain-text characters. Keep personal/student details out.</p><FieldError id="cf-reason-error" messages={fieldErrors(result, "reason")} /></div>
    <div className="flex flex-wrap justify-end gap-3"><Link className={buttonClass.secondary} href={cancel} onClick={event => { if (dirty && !window.confirm("Discard unsaved course changes?")) event.preventDefault(); }}>Cancel</Link><button disabled={pending} className={buttonClass.primary} type="submit">{pending ? "Saving…" : record ? "Save changes" : "Add course"}</button><span className="sr-only" role="status">{pending ? "Saving…" : ""}</span></div>
  </form>;
}
