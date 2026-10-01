"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { createAccountAction, type AccountActionResult } from "@/lib/auth/admin-actions";
import { ROLE_LABELS } from "@/lib/auth/access-summary";
import { ROLES } from "@/lib/auth/policy";
import { Notice } from "@/components/ui";
import { FieldError, IssuedLinkPanel, ResultNotice, TextField, buttonClass, fieldErrors, inputClass } from "./form-bits";

interface TeacherOption { id: number; code: string; name: string }

const firstName = (name: string) => name.trim().split(/\s+/).find((part) => !/^(md|mohammad|muhammad|dr|mr|mrs|ms)\.?$/i.test(part)) ?? name;

/** Each round is a fresh form; "Create another account" starts the next one. */
export function CreateAccountForm(props: { teachers: TeacherOption[]; googleConfigured: boolean }) {
  const [round, setRound] = useState(0);
  return <CreateAccountRound key={round} {...props} onAgain={() => setRound((value) => value + 1)} />;
}

function CreateAccountRound({ teachers, googleConfigured, onAgain }: { teachers: TeacherOption[]; googleConfigured: boolean; onAgain: () => void }) {
  // React resets a form after its action; keep what was typed so a refusal does not wipe it.
  const [draft, setDraft] = useState<Record<string, string>>({ role: "teacher", password: "on" });
  const [result, action, pending] = useActionState<AccountActionResult | null, FormData>(async (previous, formData) => {
    setDraft(Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)])));
    return createAccountAction(previous, formData);
  }, null);
  const ids = { teacher: useId(), role: useId(), methods: useId() };

  if (result?.ok) {
    const userId = result.outcome?.kind === "success" ? result.outcome.entityId : null;
    const name = result.message.replace(/^Account created for /, "").replace(/\.$/, "");
    return <div className="grid gap-4">
      <ResultNotice result={result} />
      {result.link ? <IssuedLinkPanel link={result.link} firstName={firstName(name)} /> : <Notice tone="info">This account uses Google only. {name} can sign in with Google now.</Notice>}
      <div className="flex flex-wrap gap-2">
        {userId ? <Link href={`/access/${userId}`} className={buttonClass.primary}>Open the account</Link> : null}
        <button type="button" className={buttonClass.secondary} onClick={onAgain}>Create another account</button>
        <Link href="/access" className={buttonClass.secondary}>Back to People &amp; access</Link>
      </div>
    </div>;
  }

  const methodErrors = fieldErrors(result, "methods");
  const teacherErrors = fieldErrors(result, "teacherId");
  const roleErrors = fieldErrors(result, "role");
  return <form key={JSON.stringify(draft)} action={action} className="ruled rounded-lg" noValidate>
    <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[16px] font-semibold">Person</h2></header>
    <div className="grid gap-4 p-4 md:grid-cols-2">
      {result && !result.ok && !result.outcome ? <ResultNotice result={result} className="md:col-span-2" /> : null}
      {result?.outcome?.kind === "permission" ? <ResultNotice result={result} className="md:col-span-2" /> : null}
      <TextField label={<>Full name <span aria-hidden="true" className="text-[var(--color-clay)]">*</span></>} name="displayName" defaultValue={draft.displayName ?? ""} required autoComplete="off" errors={fieldErrors(result, "displayName")} />
      <div className="grid gap-1.5">
        <TextField
          label={<>Email <span aria-hidden="true" className="text-[var(--color-clay)]">*</span></>} name="email" type="email" defaultValue={draft.email ?? ""} required autoComplete="off" spellCheck={false}
          errors={fieldErrors(result, "email")} hint="This is the sign-in name. For Google, it must be the Google address."
        />
        {result?.existingUserId ? <Link href={`/access/${result.existingUserId}`} className="text-[12.5px] font-semibold text-[var(--color-pine)] underline">Open the existing account</Link> : null}
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.teacher} className="font-semibold">Linked teacher record</label>
        <select id={ids.teacher} name="teacherId" defaultValue={draft.teacherId ?? ""} aria-invalid={teacherErrors.length ? true : undefined}
          aria-describedby={`${ids.teacher}-hint${teacherErrors.length ? ` ${ids.teacher}-error` : ""}`} className={inputClass}>
          <option value="">None</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.name}</option>)}
        </select>
        <FieldError id={`${ids.teacher}-error`} messages={teacherErrors} />
        <p id={`${ids.teacher}-hint`} className="text-[12.5px] text-muted">Needed for the Teacher role and My routine.</p>
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.role} className="font-semibold">First role <span aria-hidden="true" className="text-[var(--color-clay)]">*</span></label>
        <select id={ids.role} name="role" defaultValue={draft.role ?? "teacher"} aria-describedby={`${ids.role}-hint${roleErrors.length ? ` ${ids.role}-error` : ""}`} className={inputClass}>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        <FieldError id={`${ids.role}-error`} messages={roleErrors} />
        <p id={`${ids.role}-hint`} className="text-[12.5px] text-muted">Starts today. Add more roles, with dates, on the account page.</p>
      </div>
      <fieldset className="grid gap-2 md:col-span-2" aria-describedby={methodErrors.length ? `${ids.methods}-error` : undefined}>
        <legend className="mb-1.5 text-[13.5px] font-semibold">Sign-in methods</legend>
        <label className="grid cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-2 rounded-md border border-[var(--color-line)] bg-white px-3 py-2.5 text-[13.5px]">
          <input type="checkbox" name="password" defaultChecked={draft.password === "on"} className="mt-0.5 h-4 w-4 accent-[var(--color-pine)]" />
          <span><b className="block">Password</b><span className="text-[12.5px] text-muted">Creates a setup link that expires in 72 hours.</span></span>
        </label>
        <label className="grid cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-2 rounded-md border border-[var(--color-line)] bg-white px-3 py-2.5 text-[13.5px]">
          <input type="checkbox" name="google" defaultChecked={draft.google === "on"} className="mt-0.5 h-4 w-4 accent-[var(--color-pine)]" />
          <span><b className="block">Google</b><span className="text-[12.5px] text-muted">
            Only if the email above is a Google or university Google account.{googleConfigured ? "" : " Google sign-in is not set up on this server yet, so this takes effect once it is."}
          </span></span>
        </label>
        <FieldError id={`${ids.methods}-error`} messages={methodErrors} />
      </fieldset>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-[var(--color-line)] bg-wash px-4 py-3.5">
      <p className="text-[12.5px] text-muted">Fields marked <span className="text-[var(--color-clay)]">*</span> are required.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/access" className={buttonClass.secondary}>Cancel</Link>
        <button className={buttonClass.primary} disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      </div>
    </div>
    <p role="status" className="sr-only">{result && !result.ok ? result.message : ""}</p>
  </form>;
}
