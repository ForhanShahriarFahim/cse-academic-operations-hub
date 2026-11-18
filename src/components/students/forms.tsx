"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

import { primaryClass } from "./styles";

export function StudentActionForm({ action, children, submit, destination, reset, className = "" }: {
  action: (form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submit: string;
  destination?: "student";
  reset?: boolean;
  className?: string;
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const errors = result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const form = event.currentTarget;
    const input = new FormData(form);
    setPending(true);
    let response: ActionResult;
    try { response = await action(input); }
    catch { response = { ok: false, message: "The change could not be confirmed. Reload the current record before trying again." }; }
    setResult(response);
    setPending(false);
    busy.current = false;
    if (response.ok) {
      if (response.outcome?.kind === "success" && response.outcome.entityId && destination === "student") {
        router.push(`/students/${response.outcome.entityId}`);
        return;
      }
      if (reset) form.reset();
      router.refresh();
    }
    requestAnimationFrame(() => {
      const name = response.outcome?.kind === "validation" ? Object.keys(response.outcome.fieldErrors)[0] : undefined;
      const field = name && form.elements.namedItem(name);
      (field instanceof HTMLElement ? field : feedback.current)?.focus();
    });
  }
  return <form onSubmit={save} className={className}>
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      {children}
      <button type="submit" className={primaryClass}>{submit}</button>
    </fieldset>
    <div role="status" aria-atomic="true" tabIndex={-1} ref={feedback} className="mt-2 break-words text-sm empty:hidden">
      {pending ? "Saving…" : result?.message}
      {!pending && Object.keys(errors).length > 0 && <ul className="list-disc pl-5">{Object.entries(errors).map(([name, messages]) =>
        <li key={name}>{messages.join(" ")}</li>)}</ul>}
    </div>
  </form>;
}
