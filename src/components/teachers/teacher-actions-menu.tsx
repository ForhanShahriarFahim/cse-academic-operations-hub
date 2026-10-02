"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { setTeacherStatusAction } from "@/lib/teacher-actions";
import { ResultNotice } from "@/components/account/form-bits";
import { buttonClass } from "@/components/account/styles";

type StatusAction = "set_on_leave" | "back_from_leave" | "reactivate";

/** One-click status change (on leave, back, reactivate) as a plain form. */
export function StatusButton({ teacherId, expectedUpdatedAt, action, label, hint, className }: {
  teacherId: number; expectedUpdatedAt: string; action: StatusAction; label: string; hint?: string; className?: string;
}) {
  const router = useRouter();
  // Navigate from the submit itself: on success this button may unmount (its status no longer applies).
  const [result, submit, pending] = useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    const outcome = await setTeacherStatusAction(previous, formData);
    if (outcome.ok) router.replace(`/teachers/${teacherId}?done=${action}`);
    return outcome;
  }, null);
  return (
    <form action={submit} className="contents">
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" disabled={pending} className={className ?? "block w-full rounded px-2.5 py-2 text-left text-[13.5px] hover:bg-wash disabled:opacity-60"}>
        {pending ? "Saving…" : label}
        {hint ? <small className="block text-[12px] text-muted">{hint}</small> : null}
      </button>
      {result && !result.ok ? <ResultNotice result={result} className="mt-1" /> : null}
    </form>
  );
}

/** The teacher page's "More" menu: status changes, deactivate and delete. */
export function TeacherActionsMenu({ teacherId, code, status, expectedUpdatedAt }: {
  teacherId: number; code: string; status: string; expectedUpdatedAt: string;
}) {
  const item = "block rounded px-2.5 py-2 text-[13.5px] hover:bg-wash";
  return (
    <details className="relative">
      <summary aria-label={`More actions for ${code}`} className={`${buttonClass.secondary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <MoreHorizontal size={15} aria-hidden="true" />More
      </summary>
      <div className="absolute right-0 top-[calc(100%+6px)] z-20 grid min-w-[240px] rounded-lg border border-[var(--color-line)] bg-sheet p-1.5 shadow-[0_18px_36px_-18px_rgba(16,29,22,.4)]">
        {status === "active" ? <StatusButton teacherId={teacherId} expectedUpdatedAt={expectedUpdatedAt} action="set_on_leave" label="Set on leave" hint="Keeps classes; shows an On leave badge" /> : null}
        {status === "on_leave" ? <StatusButton teacherId={teacherId} expectedUpdatedAt={expectedUpdatedAt} action="back_from_leave" label="Back from leave" /> : null}
        {status === "inactive" ? <StatusButton teacherId={teacherId} expectedUpdatedAt={expectedUpdatedAt} action="reactivate" label="Reactivate" hint="Offered again when assigning classes" /> : null}
        {status === "active" || status === "on_leave" ? (
          <Link href={`/teachers/${teacherId}/deactivate`} className={item}>Deactivate…<small className="block text-[12px] text-muted">Checks classes and allocations first</small></Link>
        ) : null}
        <hr className="my-1 border-[var(--color-line-soft)]" />
        <Link href={`/teachers/${teacherId}/delete`} className={`${item} text-[var(--color-clay)]`}>Delete…<small className="block text-[12px] text-muted">Only for an unused mistaken record</small></Link>
      </div>
    </details>
  );
}
