"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTermAction, editTermAction, saveStartingPolicyAction, activateTermAction } from "@/lib/term-actions";
import type { ActionResult } from "@/lib/action-result";
import { POLICY_FIELDS, POLICY_LABELS, type TermFields } from "@/lib/term-records";

const control = "w-full min-w-0 rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm";
const primary = "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-pine)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
function Feedback({result}:{result:ActionResult|null}) {
  return result ? <div role="status" aria-live="polite" className="mb-4 rounded-md border border-[var(--color-line)] p-3 text-sm"><p>{result.message}</p>{result.outcome?.kind === "stale" && <button type="button" onClick={()=>location.reload()} className="mt-2 font-semibold underline">Refresh this review</button>}</div> : null;
}
function Errors({result,name}:{result:ActionResult|null;name:string}) {
  const errors=result?.outcome?.kind==="validation"?result.outcome.fieldErrors[name]:null;
  return errors?.length ? <span id={`${name}-error`} className="block text-xs text-[var(--color-clay)]">{errors.join(" ")}</span> : <span id={`${name}-error`} />;
}
function useTermSubmit(action:(previous:ActionResult|null,form:FormData)=>Promise<ActionResult>, destination:(id:number)=>string) {
  const router=useRouter();
  return useActionState<ActionResult|null,FormData>(async(previous,form)=>{
    const result=await action(previous,form);
    if(result.ok&&result.outcome?.kind==="success"&&result.outcome.entityId){router.push(destination(result.outcome.entityId));router.refresh();}
    return result;
  },null);
}
export function TermIdentityForm({term}:{term?:TermFields&{id:number;revision:number}}) {
  const [result,submit,pending]=useTermSubmit(term?editTermAction:createTermAction,id=>term?`/terms/${id}`:`/terms/${id}/setup`);
  const [fields,setFields]=useState({name:term?.name??"",academicYear:String(term?.academicYear??""),startDate:term?.startDate??"",endDate:term?.endDate??"",effectiveFrom:term?.effectiveFrom??""});
  const change=(key:keyof typeof fields,value:string)=>setFields(current=>({...current,[key]:value}));
  return <form action={submit} className="rounded-lg border border-[var(--color-line)] bg-sheet p-5">
    <Feedback result={result}/>{term&&<><input type="hidden" name="termId" value={term.id}/><input type="hidden" name="revision" value={term.revision}/></>}
    <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2"><legend className="mb-4 font-display text-xl font-semibold">Term identity</legend>
      <label className="grid gap-2 text-sm sm:col-span-2">Term name<input className={control} name="name" required maxLength={120} value={fields.name} onChange={e=>change("name",e.target.value)} aria-describedby="name-error"/><Errors result={result} name="name"/></label>
      <label className="grid gap-2 text-sm">Academic year<input className={control} name="academicYear" type="number" min="1" max="9999" required value={fields.academicYear} onChange={e=>change("academicYear",e.target.value)} aria-describedby="academicYear-error"/><Errors result={result} name="academicYear"/></label>
      <div className="text-xs text-muted">An academic term is Spring/Summer, not a cohort’s curriculum semester. Dates do not activate it automatically.</div>
      {([['startDate','Start date'],['endDate','End date'],['effectiveFrom','Routine effective from (optional)']] as const).map(([name,label])=><label key={name} className="grid gap-2 text-sm">{label}<input className={control} name={name} type="date" min="0001-01-01" max="9999-12-31" required={name!=="effectiveFrom"} value={fields[name]} onChange={e=>change(name,e.target.value)} aria-describedby={`${name}-error`}/><Errors result={result} name={name}/></label>)}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2"><button className={primary}>{pending?"Saving…":term?"Save draft details":"Save draft & set policy"}</button><Link href={term?`/terms/${term.id}`:"/terms"}>Cancel</Link></div>
    </fieldset><p className="mt-4 text-xs text-muted">New drafts start empty. Policy, classes, students and time grids are not copied.</p>
  </form>;
}
export function StartingPolicyForm({termId,revision,policy}:{termId:number;revision:number;policy:Partial<Record<typeof POLICY_FIELDS[number],string>>|null}) {
  const [result,submit,pending]=useTermSubmit(saveStartingPolicyAction,id=>`/terms/${id}/activate`);
  const [values,setValues]=useState<Partial<Record<typeof POLICY_FIELDS[number],string>>>(policy??{});
  return <form action={submit} className="rounded-lg border border-[var(--color-line)] bg-sheet p-5"><Feedback result={result}/><input type="hidden" name="termId" value={termId}/><input type="hidden" name="revision" value={revision}/>
    <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2"><legend className="mb-4 font-display text-xl font-semibold">Explicit starting policy</legend>
      {POLICY_FIELDS.map(name=><label key={name} className="grid gap-2 text-sm">{POLICY_LABELS[name]}<input className={control} type="number" name={name} required min="0" max={name==="extraClassRate"?"99999999.99":"999.9"} step={name==="extraClassRate"?"0.01":"0.1"} value={values[name]??""} onChange={e=>setValues(current=>({...current,[name]:e.target.value}))} aria-describedby={`${name}-error`}/><Errors result={result} name={name}/></label>)}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2"><button className={primary}>{pending?"Saving…":"Save policy & review activation"}</button><Link href={`/terms/${termId}`}>Finish later</Link></div>
    </fieldset><p className="mt-4 text-xs text-muted">Blank values are not zero. No previous or default policy is silently applied. Existing saved values above belong to this draft.</p>
  </form>;
}
export function ActivationForm({termId,name,revision,generation,previousActiveId,fingerprint,acknowledgement}:{termId:number;name:string;revision:number;generation:number;previousActiveId:number|null;fingerprint:string;acknowledgement:string}) {
  const [result,submit,pending]=useTermSubmit(activateTermAction,id=>`/terms/${id}?activated=1`);
  const [reason,setReason]=useState("");const [ack,setAck]=useState(false);
  return <form action={submit} className="rounded-lg border border-[var(--color-line)] bg-sheet p-5"><Feedback result={result}/>
    {Object.entries({termId,revision,generation,previousActiveId:previousActiveId??"",fingerprint}).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
    <fieldset disabled={pending} className="grid min-w-0 gap-4"><legend className="mb-4 font-display text-xl font-semibold">Confirm activation of {name}</legend>
      <label className="grid gap-2 text-sm">Reason for activation<textarea name="reason" className={control} rows={3} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} aria-describedby="reason-error"/><Errors result={result} name="reason"/></label>
      <label className="flex items-start gap-3 text-sm"><input name="acknowledge" type="checkbox" required checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" aria-describedby="acknowledge-error"/><span>{acknowledgement}<Errors result={result} name="acknowledge"/></span></label>
      <div className="flex flex-wrap items-center gap-4"><button className={primary} disabled={!ack||!reason.trim()||pending}>{pending?"Activating…":`Activate ${name}`}</button><Link href={`/terms/${termId}`}>Cancel</Link></div>
    </fieldset>
  </form>;
}
