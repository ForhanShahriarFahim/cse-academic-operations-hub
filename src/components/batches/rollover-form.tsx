"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { prepareRolloverAction, type RolloverResult } from "@/lib/rollover-actions";
import { eligibleCohort, type Disposition, type RolloverChoice, type RolloverCohort } from "@/lib/rollover";
import { countLabel } from "@/lib/batch-records";
import { buttonClass, inputClass } from "@/components/account/styles";
import { Panel } from "@/components/ui";

export function RolloverForm({sourceId,targetId,sourceName,targetName,targetYear,cohorts}:{sourceId:number;targetId:number;sourceName:string;targetName:string;targetYear:number;cohorts:RolloverCohort[]}) {
  const [choices,setChoices] = useState<RolloverChoice[]>(cohorts.filter(eligibleCohort).map(b => ({batchId:b.id,disposition:b.semester === 8 ? "hold" : "progress",carryCount:true,reason:"",graduateConfirmed:false})));
  const [reason,setReason] = useState(""), [clone,setClone] = useState(false), [ack,setAck] = useState(false), [confirmation,setConfirmation] = useState("");
  const [reviewSignature,setReviewSignature] = useState("");
  const [changedRows,setChangedRows] = useState<number[]>([]);
  const signature = JSON.stringify({choices,reason,clone});
  const feedback = useRef<HTMLDivElement>(null);
  const choiceSection = useRef<HTMLDivElement>(null);
  const [result,action,pending] = useActionState<RolloverResult|null,FormData>(async(previous,form) => {
    const next = await prepareRolloverAction(previous,form);
    setChangedRows(next.review && previous?.review ? next.review.decisions.filter(d => JSON.stringify(previous.review!.decisions.find(old => old.id === d.id)) !== JSON.stringify(d)).map(d => d.id) : []);
    setReviewSignature(signature); setAck(false); return next;
  },null);
  useEffect(() => { if (result) feedback.current?.focus(); },[result]);
  const change = (id:number,patch:Partial<RolloverChoice>) => { setChoices(rows => rows.map(c => c.batchId === id ? {...c,...patch} : c)); setAck(false); };
  const reviewed = !!result?.review && reviewSignature === signature;
  const targetIdentity = result?.review?.targetIdentity ?? `${targetName} · ${targetYear}`;
  const fieldErrors = result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};
  return <form action={action} className="min-w-0 break-words space-y-5">
    <input type="hidden" name="sourceId" value={sourceId}/><input type="hidden" name="targetId" value={targetId}/><input type="hidden" name="choices" value={JSON.stringify(choices)}/><input type="hidden" name="cloneGrid" value={clone ? "on" : "off"}/>
    <input type="hidden" name="fingerprint" value={reviewed ? result.review!.fingerprint : ""}/>
    {result && <div ref={feedback} tabIndex={-1} role="status" className="rounded border border-line bg-wash p-4 text-sm outline-offset-4"><p className="font-semibold">{result.message}</p>{result.receiptId && <Link className="underline" href={`/terms/${targetId}/rollover`}>View saved preparation receipt</Link>}{result.message.includes("cohort list changed") && <button type="button" disabled={pending} className="mt-3 underline" onClick={() => window.location.reload()}>Reload source placements (discard unsaved choices)</button>}</div>}
    <fieldset disabled={pending || !!result?.receiptId} className="min-w-0 break-words space-y-5">
      <div ref={choiceSection} tabIndex={-1} className="outline-offset-4"><Panel title="2 · Review cohorts & grid"><p className="mb-4 text-sm"><strong>{sourceName} → {targetName}</strong>. Source placements are retained. The destination will remain draft.</p>
        {choices.length === 0 && <p className="text-sm text-muted">No eligible cohort placements. You can still review a valid optional time-grid copy.</p>}
        {choices.map(c => { const b = result?.review?.decisions.find(b => b.id === c.batchId) ?? cohorts.find(b => b.id === c.batchId)!; const key = `cohort-${b.id}`;
          return <div key={b.id} className="grid min-w-0 gap-3 border-t border-line py-5 lg:grid-cols-[1fr_1fr_1.1fr]">
            <div><strong className="text-sm">{b.stream}-{b.label}</strong><p className="text-sm">Source semester {b.semester}</p><p className="text-xs text-muted">{b.studentCount ?? "Unknown"} · {countLabel(b.confidence as "unknown"|"unverified"|"verified")}</p></div>
            <label className="grid min-w-0 gap-1 self-start text-sm" htmlFor={`${key}-outcome`}>Outcome for {b.stream}-{b.label}<select id={`${key}-outcome`} aria-label={`Outcome for ${b.stream}-${b.label}`} className={`${inputClass} max-w-full`} value={c.disposition} onChange={e => change(b.id,{disposition:e.target.value as Disposition,graduateConfirmed:false})}>
              {b.semester < 8 && <option value="progress">Progress · semester {b.semester + 1}</option>}<option value="repeat">Repeat · semester {b.semester}</option><option value="hold">Hold · no placement</option><option value="graduate">Graduate · guarded review</option></select></label>
            <div className="min-w-0 space-y-3">
              {["progress","repeat"].includes(c.disposition) ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={c.carryCount} onChange={e => change(b.id,{carryCount:e.target.checked})}/><span>Carry source count as estimate<span className="block text-xs text-muted">{c.carryCount && b.studentCount != null ? `${b.studentCount} · Estimate — unverified` : "Start unknown"}. Verification is not copied.</span></span></label> : <><label className="grid gap-1 text-sm" htmlFor={`${key}-reason`}>{c.disposition === "hold" ? "Hold" : "Graduation"} reason<input id={`${key}-reason`} className={inputClass} required maxLength={300} value={c.reason} onChange={e => change(b.id,{reason:e.target.value})}/></label>{c.disposition === "graduate" ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={c.graduateConfirmed} onChange={e => change(b.id,{graduateConfirmed:e.target.checked})}/><span>Confirm graduation for {b.stream}-{b.label}. Existing teaching must be resolved; this does not certify degrees.</span></label> : <p className="text-xs text-muted">Hold is recorded for this destination. Global cohort status stays unchanged.</p>}</>}
            </div>
          </div>;
        })}
        <div className="mt-3 border-t border-line pt-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={clone} onChange={e => {setClone(e.target.checked);setAck(false);}}/><span>Copy source time grid into an empty destination grid<span className="block text-xs text-muted">Period patterns, stream plans/windows and exceptions for receiving cohorts only. Existing setup is never overwritten. Off by default.</span></span></label><p className="mt-3 text-xs text-muted">Academic calendar copying is unavailable.</p></div>
      </Panel></div>
      <Panel title="Preparation reason"><label className="grid gap-1 text-sm" htmlFor="rollover-reason">Reason for preparation<textarea id="rollover-reason" name="reason" required maxLength={300} className={inputClass} value={reason} onChange={e => {setReason(e.target.value);setAck(false);}} aria-describedby="reason-hint"/></label><p id="reason-hint" className="mt-1 text-xs text-muted">Use 1–300 characters; keep private student data out of reasons.</p></Panel>
      <p className="text-sm text-muted">Adding placements freezes draft details and starting-policy editing. Preparation is saved once; this wizard cannot append or overwrite. Activation is separate. Reloading discards an unsaved proposal.</p>
      <button name="command" value="preview" className={buttonClass.secondary}>{pending ? "Reviewing or saving…" : "Review preparation"}</button>
      {reviewed && <Panel title="3 · Confirm preparation"><ul className="mb-4 list-disc space-y-1 pl-5 text-sm">{result.review!.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        <p className="mb-4 text-sm font-semibold">Reviewed terms: {result.review!.source} → {result.review!.target}</p>
        <ul className="mb-4 space-y-2 text-sm">{result.review!.decisions.map(d => <li key={d.id} className={changedRows.includes(d.id) ? "rounded border border-gold bg-gold-tint p-2" : undefined}><strong>{d.stream}-{d.label}</strong>: {d.disposition} · {d.destinationSemester == null ? "no destination placement" : `semester ${d.semester} → ${d.destinationSemester} · ${d.destinationCount == null ? "unknown count" : `${d.destinationCount} estimate`}`}{changedRows.includes(d.id) && <span className="block font-semibold">Changed since the previous review</span>}</li>)}</ul>
        <p className="mb-4 text-sm">Grid: {result.review!.grid.patterns} patterns · {result.review!.grid.plans} day plans · {result.review!.grid.windows} windows · {result.review!.grid.excludedExceptions} excluded exception rows · {result.review!.grid.legacyWindows} excluded legacy windows.</p>
        <label className="grid gap-1 text-sm" htmlFor="rollover-confirm">Type destination identity: {targetIdentity}<input id="rollover-confirm" name="confirmation" className={inputClass} value={confirmation} onChange={e => setConfirmation(e.target.value)} aria-invalid={!!fieldErrors.confirmation?.length} aria-describedby={fieldErrors.confirmation?.length ? "confirmation-error" : undefined}/></label>
        {fieldErrors.confirmation && <p id="confirmation-error" className="text-sm text-clay">{fieldErrors.confirmation.join(" ")}</p>}
        <label className="my-4 flex items-start gap-2 text-sm"><input name="acknowledge" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} aria-describedby={fieldErrors.acknowledge?.length ? "ack-error" : undefined}/><span>I reviewed these decisions, the setup freeze and one-time preparation. The destination stays draft and copied counts need reconfirmation.</span></label>
        {fieldErrors.acknowledge && <p id="ack-error" className="text-sm text-clay">{fieldErrors.acknowledge.join(" ")}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass.secondary} onClick={() => {setAck(false);choiceSection.current?.focus();choiceSection.current?.scrollIntoView();}}>Back to cohort decisions</button><button name="command" value="commit" className={buttonClass.primary} disabled={!ack || pending}>Prepare {result.review!.target}</button></div>
      </Panel>}
    </fieldset>
  </form>;
}
