"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { setExternalLinkAction } from "@/lib/commitment-actions";
import type { ActionResult } from "@/lib/action-result";
import type { TermWriteContext } from "@/lib/term-context-value";
import { buttonClass, inputClass } from "@/components/account/styles";

export function CommitmentLinkForm({ id, revision, context, linked, candidates, returnTo }: {
  id: number; revision: number; context: TermWriteContext; linked: boolean;
  candidates: { id: number; label: string }[]; returnTo: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(async (_previous, data) => {
    const next = await setExternalLinkAction(id, data, context);
    if (next.ok) router.push(returnTo);
    return next;
  }, null);
  if (!linked && !candidates.length) return <p>No scheduled teaching group covers all of this commitment’s occurrences.</p>;
  return <form action={action} className="max-w-xl space-y-4">
    <input type="hidden" name="revision" value={revision} />
    {linked ? <input type="hidden" name="groupId" value="" /> : <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold">Matching scheduled groups</legend>
      {candidates.map((group) => <label className="flex items-start gap-2 text-sm" key={group.id}><input type="radio" name="groupId" value={group.id} checked={choice === group.id} onChange={() => setChoice(group.id)} required className="mt-1" />{group.label}</label>)}
    </fieldset>}
    <label className="grid gap-1 text-sm">{linked ? "Reason for removing the link" : "Why are these the same class?"}
      <textarea name="reason" maxLength={300} required value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} />
    </label>
    {result && !result.ok && <p role="alert" className="text-sm text-clay">{result.message}</p>}
    <button type="submit" className={buttonClass.primary} disabled={pending}>{pending ? "Saving…" : linked ? "Remove link" : "Link teaching group"}</button>
  </form>;
}
