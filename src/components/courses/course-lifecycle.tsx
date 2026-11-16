"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, inputClass } from "@/components/account/styles";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { saveCourseAction } from "@/lib/course-actions";
import type { CourseRecord } from "@/lib/course-records";
import type { CourseEvidence as Evidence, CourseResult } from "@/lib/course-store";
import { CourseEvidence } from "./course-evidence";
export function CourseLifecycle({ record, evidence, fingerprint, returnQuery }: { record: CourseRecord; evidence: Evidence; fingerprint: string; returnQuery: string }) {
  const command = record.isActive ? "deactivate" : "reactivate", label = record.isActive ? "Deactivate course" : "Reactivate course";
  const [reason, setReason] = useState(""), [confirmation, setConfirmation] = useState(""), [ack, setAck] = useState(false), [submission, setSubmission] = useState(0);
  const summary = useRef<HTMLDivElement>(null), router = useRouter();
  const [result, action, pending] = useActionState<CourseResult | null, FormData>(async (previous, form) => {
    setSubmission(value => value + 1);
    const next = await saveCourseAction(previous, form);
    if (next.ok) { const query = new URLSearchParams(returnQuery); query.set("done", next.message); router.push(`/courses/${record.id}?${query}`); router.refresh(); }
    setAck(false); return next;
  }, null);
  useEffect(() => { if (result) summary.current?.focus(); }, [result]);
  return <section className="no-print mt-5 min-w-0"><h2 className="font-display text-xl font-semibold">Status</h2><CourseEvidence evidence={result?.evidence ?? evidence} /><form key={submission} action={action} noValidate className="ruled mt-3 grid min-w-0 gap-3 rounded-lg p-4"><h3 className="font-semibold">{label}: {record.code}</h3><p className="text-sm">{record.isActive ? "Unresolved teaching/planning obligations in any term or unsupported snapshot evidence prevent deactivation. All references and captured history are retained." : "Reactivation permits new assignments subject to ordinary checks. No offering, teaching group or enrollment is created."}</p>
    <div ref={summary} tabIndex={-1} className="outline-none"><ResultNotice result={result} />{result?.outcome?.kind === "stale" && <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => { if (window.confirm("Discard this confirmation and reload the latest course?")) window.location.reload(); }}>Reload latest</button>}</div>
    <input type="hidden" name="command" value={command} /><input type="hidden" name="courseId" value={record.id} /><input type="hidden" name="revision" value={record.revision} /><input type="hidden" name="fingerprint" value={result?.fingerprint ?? fingerprint} />
    <label htmlFor="cl-reason" className="text-sm font-semibold">Reason (required)</label><textarea id="cl-reason" name="reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={300} rows={3} className={inputClass} aria-describedby="cl-reason-hint cl-reason-error" aria-invalid={fieldErrors(result, "reason").length > 0} /><p id="cl-reason-hint" className="text-xs text-muted">1–300 plain-text characters; no personal/student details.</p><FieldError id="cl-reason-error" messages={fieldErrors(result, "reason")} />
    <label htmlFor="cl-code" className="text-sm font-semibold">Type {record.code} to confirm</label><input id="cl-code" name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} aria-describedby="cl-code-error" aria-invalid={fieldErrors(result, "confirmation").length > 0} /><FieldError id="cl-code-error" messages={fieldErrors(result, "confirmation")} />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acknowledge" checked={ack} onChange={event => setAck(event.target.checked)} /><span>I reviewed this course and its current all-term impact.</span></label><button disabled={pending} className={`${buttonClass.primary} justify-self-start`} type="submit">{pending ? "Saving…" : label}</button><span className="sr-only" role="status">{pending ? "Saving…" : ""}</span>
  </form></section>;
}
