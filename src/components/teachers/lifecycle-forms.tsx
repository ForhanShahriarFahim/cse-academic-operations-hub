"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId } from "react";
import type { ActionResult } from "@/lib/action-result";
import { deleteTeacherAction, setTeacherStatusAction } from "@/lib/teacher-actions";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";

const solidDanger = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--color-clay)] px-4 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

function Refusal({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  const issues = (result.issues ?? []).filter((issue) => issue.detail !== result.message);
  return (
    <div className="mt-3">
      <ResultNotice result={result} />
      {issues.length ? <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">{issues.map((issue, index) => <li key={index}><strong>{issue.title}:</strong> {issue.detail}</li>)}</ul> : null}
    </div>
  );
}

/** Confirm deactivation, with an optional reason kept in Changes. */
export function DeactivateForm({ teacherId, code, expectedUpdatedAt }: { teacherId: number; code: string; expectedUpdatedAt: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [result, submit, pending] = useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    const outcome = await setTeacherStatusAction(previous, formData);
    if (outcome.ok) router.replace(`/teachers/${teacherId}?done=deactivate`);
    return outcome;
  }, null);
  return (
    <form action={submit}>
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="action" value="deactivate" />
      <div className="grid max-w-[520px] gap-1.5 text-[13.5px]">
        <label htmlFor={reasonId} className="font-semibold">Reason <span className="font-normal text-muted">(optional, kept in Changes)</span></label>
        <input id={reasonId} name="reason" maxLength={300} autoComplete="off" className={inputClass} />
      </div>
      <Refusal result={result} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/teachers/${teacherId}`} className={buttonClass.secondary}>Cancel</Link>
        <button type="submit" disabled={pending} className={solidDanger}>{pending ? "Deactivating…" : `Deactivate ${code}`}</button>
      </div>
    </form>
  );
}

/** Confirm a permanent delete by typing the short code. */
export function DeleteForm({ teacherId, code, expectedUpdatedAt }: { teacherId: number; code: string; expectedUpdatedAt: string }) {
  const router = useRouter();
  const inputId = useId();
  const [result, submit, pending] = useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    const outcome = await deleteTeacherAction(previous, formData);
    if (outcome.ok) router.replace(`/teachers?deleted=${encodeURIComponent(code)}`);
    return outcome;
  }, null);
  const errors = fieldErrors(result, "confirmCode");
  return (
    <form action={submit}>
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <div className="grid max-w-[360px] gap-1.5 text-[13.5px]">
        <label htmlFor={inputId} className="font-semibold">Type the short code <span className="font-mono">{code}</span> to confirm</label>
        <input id={inputId} name="confirmCode" autoComplete="off" spellCheck={false} aria-invalid={errors.length ? true : undefined}
          aria-describedby={errors.length ? `${inputId}-error` : undefined} className={`${inputClass} font-mono uppercase`} />
        <FieldError id={`${inputId}-error`} messages={errors} />
      </div>
      {errors.length ? null : <Refusal result={result} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/teachers/${teacherId}`} className={buttonClass.secondary}>Cancel</Link>
        <button type="submit" disabled={pending} className={solidDanger}>{pending ? "Deleting…" : `Delete ${code} permanently`}</button>
      </div>
    </form>
  );
}
