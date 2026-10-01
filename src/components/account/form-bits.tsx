"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, CircleAlert, Copy, Link2 } from "lucide-react";
import type { CapabilityLine } from "@/lib/auth/access-summary";
import type { ActionResult } from "@/lib/action-result";
import { passwordChecks } from "@/lib/auth/password-rules";
import { fmtInstant } from "@/lib/auth/display";
import { Notice } from "@/components/ui";
import { buttonClass, inputClass } from "./styles";

export { buttonClass, inputClass };

/** AUTH-02 form pieces shared by sign-in, set password, My account and People & Access. */

export const fieldErrors = (result: ActionResult | null | undefined, name: string): string[] =>
  result?.outcome?.kind === "validation" ? result.outcome.fieldErrors[name] ?? [] : [];

export function FieldError({ id, messages }: { id: string; messages: string[] }) {
  if (!messages.length) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-[12.5px] font-semibold text-[var(--color-clay)]">
      <CircleAlert size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{messages.join(" ")}</span>
    </p>
  );
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  errors?: string[];
};

export function TextField({ label, hint, errors = [], ...input }: FieldProps) {
  const id = useId();
  const described = [errors.length ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5 text-[13.5px]">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <input id={id} aria-invalid={errors.length ? true : undefined} aria-describedby={described} className={inputClass} {...input} />
      <FieldError id={`${id}-error`} messages={errors} />
      {hint ? <p id={`${id}-hint`} className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function PasswordField({ label, hint, errors = [], describedBy, ...input }: FieldProps & { describedBy?: string }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const described = [errors.length ? `${id}-error` : null, hint ? `${id}-hint` : null, describedBy ?? null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5 text-[13.5px]">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <div className="relative">
        <input
          id={id} type={shown ? "text" : "password"} spellCheck={false} autoCapitalize="none"
          aria-invalid={errors.length ? true : undefined} aria-describedby={described}
          className={`${inputClass} pr-[68px]`} {...input}
        />
        <button
          type="button" aria-pressed={shown} aria-label={shown ? `Hide ${typeof label === "string" ? label.toLowerCase() : "password"}` : `Show ${typeof label === "string" ? label.toLowerCase() : "password"}`}
          onClick={() => setShown((value) => !value)}
          className="absolute inset-y-1 right-1 rounded px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-wash"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <FieldError id={`${id}-error`} messages={errors} />
      {hint ? <p id={`${id}-hint`} className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** The password rules, shown before typing and ticked as they are met. */
export function PasswordRules({ id, password, email }: { id: string; password: string; email: string }) {
  const checks = passwordChecks(password, email);
  return (
    <ul id={id} className="grid gap-1 text-[12.5px]">
      {checks.map((check) => {
        const met = password.length > 0 && check.met;
        return (
          <li key={check.rule} className={`flex items-center gap-1.5 ${met ? "text-[var(--color-pine)]" : "text-muted"}`}>
            {met ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <span aria-hidden="true" className="inline-block h-[5px] w-[5px] rounded-full bg-current mx-[4.5px]" />}
            <span>{check.label}<span className="sr-only">{met ? ": met" : ": not yet met"}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

/** A server action's result, next to what it reports. */
export function ResultNotice({ result, className = "" }: { result: ActionResult | null | undefined; className?: string }) {
  if (!result) return null;
  if (result.ok) return <Notice tone="success" className={className}>{result.message}</Notice>;
  const kind = result.outcome?.kind;
  return <Notice tone={kind === "permission" ? "error" : "warn"} className={className}>{result.message}</Notice>;
}

/** The only place a setup or reset link is ever shown: once, right after it is issued. */
export function IssuedLinkPanel({ link, firstName }: { link: { url: string; purpose: "setup" | "reset"; expiresAt: string }; firstName: string }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const headingId = useId();
  const what = link.purpose === "setup" ? "Setup" : "Reset";
  return (
    <section aria-labelledby={headingId} className="rounded-lg border-[1.5px] border-[var(--color-pine)] bg-[#fbfdf9] px-4 py-3.5">
      <h3 id={headingId} className="font-display flex items-center gap-2 text-[15px] font-semibold">
        <Link2 size={16} strokeWidth={2} aria-hidden="true" className="text-[var(--color-pine)]" />{what} link for {firstName}
      </h3>
      <p className="mt-1 text-[13px] text-ink-2">
        Works once. Expires <b>{fmtInstant(link.expiresAt)}</b> ({link.purpose === "setup" ? "72" : "24"} hours).
        {link.purpose === "reset" ? ` ${firstName}’s current password keeps working until the link is used.` : null}
      </p>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <output aria-label={`${what} link`} className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 font-mono text-[12.5px]">
          {link.url}
        </output>
        <button
          type="button" className={buttonClass.primary}
          onClick={async () => {
            try { await navigator.clipboard.writeText(link.url); setCopied("yes"); } catch { setCopied("failed"); }
          }}
        >
          {copied === "yes" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied === "yes" ? "Copied" : "Copy link"}
        </button>
      </div>
      <p role="status" className="mt-1 text-[12.5px] text-muted">
        {copied === "yes" ? "The link is on your clipboard." : copied === "failed" ? "Copying was blocked. Select the link and copy it yourself." : ""}
      </p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-2">
        <li>Send it to {firstName} yourself, by a channel only {firstName} reads.</li>
        <li>When you leave this page, the link is never shown again. You can issue a new one, which cancels this one.</li>
      </ol>
    </section>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "pine" | "gold" | "clay" | "off"; children: ReactNode }) {
  const tones = {
    neutral: "border-[var(--color-line)] bg-sheet text-ink-2",
    pine: "border-[#b9ccb9] bg-pine-tint text-[var(--color-pine)]",
    gold: "border-[#e3c98f] bg-gold-tint text-gold-text",
    clay: "border-[#e6b8a8] bg-clay-tint text-[var(--color-clay)]",
    off: "border-dashed border-[var(--color-line)] bg-transparent text-muted",
  } as const;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[12px] font-medium ${tones[tone]}`}>{children}</span>;
}


/** What a person can do, one line per permission. A scope shared by every line is said once. */
export function CapabilityList({ lines, empty }: { lines: CapabilityLine[]; empty?: string }) {
  if (!lines.length) return empty ? <p className="px-4 pb-4 text-[13px] text-muted">{empty}</p> : null;
  const details = [...new Set(lines.map((line) => line.detail).filter((detail): detail is string => detail != null))];
  const shared = details.length === 1 && lines.filter((line) => line.detail != null).length > 1 ? details[0] : null;
  return <>
    <ul className="grid gap-2 px-4 pb-3 text-[13.5px]">
      {lines.map((line) => <li key={line.capability} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
        <Check size={15} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 text-[var(--color-pine)]" />
        <span>{line.label}{line.detail && line.detail !== shared ? <small className="block text-[12px] text-muted">{line.detail}</small> : null}</span>
      </li>)}
    </ul>
    {shared ? <p className="px-4 pb-3 text-[12.5px] text-muted">Applies to: {shared}</p> : null}
  </>;
}
