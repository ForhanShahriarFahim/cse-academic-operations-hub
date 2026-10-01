"use client";

import Link from "next/link";
import { useActionState, useId, useState, useTransition } from "react";
import { KeyRound, Laptop, Smartphone } from "lucide-react";
import { changeOwnPasswordAction, signOutOtherSessionsAction } from "@/lib/auth/account-actions";
import type { ActionResult } from "@/lib/action-result";
import type { AccountDetail } from "@/lib/auth/access-data";
import { deviceLabel, fmtDay, fmtInstant, fmtLastDay, isPhone } from "@/lib/auth/display";
import { emailName } from "@/lib/auth/password-rules";
import { PageHeader, StatusText } from "@/components/ui";
import { CapabilityList, PasswordField, ResultNotice, fieldErrors } from "./form-bits";
import { buttonClass } from "./styles";

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="ruled rounded-lg">
    <header className="px-4 pb-2.5 pt-3.5"><h2 id={id} className="font-display text-[16px] font-semibold">{title}</h2>{sub ? <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p> : null}</header>
    {children}
  </section>;
}

export function MyAccount({ detail, googleConfigured }: { detail: AccountDetail; googleConfigured: boolean }) {
  const [formRound, setFormRound] = useState(0);
  const [passwordResult, changePassword, changing] = useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    const outcome = await changeOwnPasswordAction(previous, formData);
    if (outcome.ok) setFormRound((value) => value + 1);
    return outcome;
  }, null);
  const [sessionsResult, setSessionsResult] = useState<ActionResult | null>(null);
  const [signingOut, startSignOut] = useTransition();
  const current = detail.summary.roles.filter((entry) => entry.state !== "ended");
  const others = detail.sessions.filter((session) => !session.current);
  const notice = passwordResult?.ok ? passwordResult : sessionsResult;

  return <div className="mx-auto max-w-6xl">
    <PageHeader context="Your account" title="My account"
      description="Your sign-in, your password and what you can do in the portal. Ask the portal administrator to change your name, email or roles." />
    <div aria-live="polite" className="mb-4 empty:hidden">{notice ? <ResultNotice result={notice} /> : null}</div>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-5">
        <Section title="Details">
          <dl className="grid px-4 pb-4 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
            {[
              ["Name", detail.displayName],
              ["Email", <span key="email" className="break-all">{detail.email}</span>],
              ["Teacher record", detail.teacherLabel ? <span key="teacher"><span className="font-mono text-[12.5px]">{detail.teacherLabel.split(" · ")[0]}</span> · <Link href="/my-routine" className="font-medium text-[var(--color-pine)] underline">My routine</Link></span> : "Not linked"],
              ["Last signed in", detail.lastLoginAt ? fmtInstant(detail.lastLoginAt) : "Not recorded"],
            ].map(([term, value], index) => <div key={index} className="contents">
              <dt className={`pt-2.5 text-muted sm:pb-2.5 ${index ? "border-t border-[var(--color-line-soft)]" : ""}`}>{term}</dt>
              <dd className={`pb-2.5 sm:pt-2.5 ${index ? "sm:border-t sm:border-[var(--color-line-soft)]" : ""}`}>{value}</dd>
            </div>)}
          </dl>
        </Section>

        <Section title="Change password" sub={detail.passwordEnabled ? (detail.passwordChangedAt ? `Last changed ${fmtInstant(detail.passwordChangedAt)}` : "You have not set a password here yet.") : undefined}>
          {!detail.passwordEnabled ? <p className="px-4 pb-4 text-[13.5px] text-ink-2">Password sign-in is off for your account. Ask the portal administrator if you want it.</p>
            : !detail.passwordSet ? <p className="px-4 pb-4 text-[13.5px] text-ink-2">Ask the portal administrator for a setup link to choose your first password.</p>
            : <form key={formRound} action={changePassword} className="grid max-w-[440px] gap-3.5 px-4 pb-4" noValidate>
              <input type="email" name="username" autoComplete="username" value={detail.email} readOnly hidden />
              {passwordResult && !passwordResult.ok && !passwordResult.outcome ? <ResultNotice result={passwordResult} /> : null}
              <PasswordField label="Current password" name="current" autoComplete="current-password" required errors={fieldErrors(passwordResult, "current")} />
              <PasswordField label="New password" name="password" autoComplete="new-password" required errors={fieldErrors(passwordResult, "password")}
                hint={`At least 12 characters, not a common password, and not containing “${emailName(detail.email)}”. A phrase works well.`} />
              <PasswordField label="Type the new password again" name="confirm" autoComplete="new-password" required errors={fieldErrors(passwordResult, "confirm")} />
              <div><button className={buttonClass.primary} disabled={changing}>{changing ? "Changing…" : "Change password"}</button></div>
              <p className="text-[12.5px] text-muted">Changing it signs you out on your other devices.</p>
            </form>}
        </Section>
      </div>

      <div className="grid min-w-0 gap-5">
        <Section title="Sign-in methods" sub="Set by the administrator">
          {[
            { label: "Password", on: detail.passwordEnabled, icon: <KeyRound size={17} /> },
            { label: "Google", on: detail.googleEnabled, icon: <span className="text-[15px] font-bold">G</span>, note: detail.googleEnabled && !googleConfigured ? "On, but not set up on this server yet." : null },
          ].map((method) => <div key={method.label} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--color-line-soft)] px-4 py-3">
            <span aria-hidden="true" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-line)] bg-paper text-ink-2">{method.icon}</span>
            <div><b className="block text-[13.5px]">{method.label}</b><span className="text-[12.5px] text-muted">{method.note ?? (method.on ? "On" : "Off. Ask the administrator if you want it.")}</span></div>
            {method.on ? <StatusText tone="ok">On</StatusText> : <StatusText tone="muted">Off</StatusText>}
          </div>)}
        </Section>

        <Section title="What you can do">
          <CapabilityList lines={detail.summary.now} empty="You have no current role." />
          <p className="px-4 pb-4 text-[12px] font-semibold text-muted">
            {current.map((entry) => entry.state === "scheduled"
              ? `${entry.label} from ${fmtDay(entry.activeFrom)}${entry.activeTo ? ` to ${fmtLastDay(entry.activeTo)}` : ""}`
              : `${entry.label} since ${fmtDay(entry.activeFrom)}${entry.activeTo ? ` until ${fmtLastDay(entry.activeTo)}` : ""}`).join(" · ")}
          </p>
        </Section>

        <Section title="Signed-in devices" sub={others.length ? `${others.length} other besides this one` : "Only this device"}>
          {detail.sessions.map((session) => <div key={session.id} className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-line-soft)] px-4 py-3">
            <span aria-hidden="true" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-line)] bg-paper text-ink-2">{isPhone(session.device) ? <Smartphone size={17} /> : <Laptop size={17} />}</span>
            <div><b className="block text-[13.5px]">{session.current ? "This device" : deviceLabel(session.device)}</b>
              <span className="text-[12.5px] text-muted">{session.current ? `${deviceLabel(session.device)} · ` : ""}{session.method === "password" ? "Password" : "Google"} · last used {fmtInstant(session.lastSeenAt)}</span></div>
          </div>)}
          <div className="border-t border-[var(--color-line-soft)] px-4 pb-4 pt-3">
            {others.length ? <button type="button" className={buttonClass.small} disabled={signingOut}
              onClick={() => startSignOut(async () => setSessionsResult(await signOutOtherSessionsAction(null)))}>Sign out other devices</button>
              : <p className="text-[12.5px] text-muted">You are not signed in anywhere else.</p>}
          </div>
        </Section>
      </div>
    </div>
  </div>;
}
