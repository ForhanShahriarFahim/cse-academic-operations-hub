"use client";

import Link from "next/link";
import { useId, useState, useTransition, type ReactNode } from "react";
import { Ban, KeyRound, Laptop, Link2, Lock, Smartphone } from "lucide-react";
import {
  clearLockAction, endRoleAction, grantRoleAction, issueLinkAction, revokeLinkAction, setMethodsAction, setStatusAction,
  signOutEverywhereAction, updateDetailsAction, type AccountActionResult, type IssuedLink,
} from "@/lib/auth/admin-actions";
import type { AccountDetail } from "@/lib/auth/access-data";
import { ROLE_LABELS } from "@/lib/auth/access-summary";
import { dhakaToday } from "@/lib/auth/account-rules";
import { activityText, deviceLabel, fmtDay, fmtInstant, fmtLastDay, isPhone } from "@/lib/auth/display";
import { ROLES } from "@/lib/auth/policy";
import { useConfirm } from "@/components/confirm-dialog";
import { PageHeader, StatusText } from "@/components/ui";
import { CapabilityList, Chip, FieldError, IssuedLinkPanel, ResultNotice, TextField, buttonClass, fieldErrors, inputClass } from "./form-bits";

interface TeacherOption { id: number; code: string; name: string }
type Action = (previous: AccountActionResult | null, formData: FormData) => Promise<AccountActionResult>;

const firstName = (name: string) => name.trim().split(/\s+/).find((part) => !/^(md|mohammad|muhammad|dr|mr|mrs|ms)\.?$/i.test(part)) ?? name;

function form(fields: Record<string, string | number | boolean>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== false) data.set(key, value === true ? "on" : String(value));
  return data;
}

function Section({ title, sub, children, actions }: { title: string; sub?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="ruled rounded-lg">
    <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-2.5 pt-3.5">
      <div className="min-w-0"><h2 id={id} className="font-display text-[16px] font-semibold">{title}</h2>{sub ? <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p> : null}</div>
      {actions}
    </header>
    {children}
  </section>;
}

function Row({ icon, title, sub, end }: { icon: ReactNode; title: ReactNode; sub: ReactNode; end?: ReactNode }) {
  return <div className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-line-soft)] px-4 py-3 sm:grid-cols-[34px_minmax(0,1fr)_auto]">
    <span aria-hidden="true" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-line)] bg-paper text-ink-2">{icon}</span>
    <div className="min-w-0"><b className="block text-[13.5px]">{title}</b><span className="text-[12.5px] text-muted">{sub}</span></div>
    {end ? <div className="col-start-2 sm:col-start-auto">{end}</div> : null}
  </div>;
}

function Switch({ label, checked, disabled, onChange, describedBy }: { label: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; describedBy?: string }) {
  return <label className={`inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
    <input
      type="checkbox" role="switch" aria-label={label} aria-describedby={describedBy} checked={checked} disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="relative h-5 w-9 cursor-[inherit] appearance-none rounded-full bg-[#cfc8b5] transition-colors checked:bg-[var(--color-pine)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform checked:after:translate-x-4"
    />
    {checked ? "On" : "Off"}
  </label>;
}

export function AccountManager({ detail, teachers, viewerId, googleConfigured }: {
  detail: AccountDetail;
  teachers: TeacherOption[];
  viewerId: number;
  googleConfigured: boolean;
}) {
  const [ask, dialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [editing, setEditing] = useState(false);
  const isSelf = detail.id === viewerId;
  const name = detail.displayName;
  const first = firstName(name);
  const lockHint = useId();

  const run = (action: Action, fields: FormData, after?: (result: AccountActionResult) => void) => startTransition(async () => {
    const outcome = await action(null, fields);
    setResult(outcome);
    if (outcome.link) setLink(outcome.link);
    after?.(outcome);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  });
  const confirmThen = async (request: Parameters<typeof ask>[0], action: Action, fields: FormData, after?: (result: AccountActionResult) => void) => {
    if (await ask(request)) run(action, fields, after);
  };

  const otherSessions = detail.sessions.filter((session) => !session.current).length;
  const suspended = detail.rawStatus === "suspended";
  const statusLine = suspended ? <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-clay)]"><Ban size={14} aria-hidden="true" />Suspended</span>
    : detail.rawStatus === "invited" ? <StatusText tone="pending">Invited, not signed in yet</StatusText>
    : <StatusText tone="ok">Active</StatusText>;

  const setMethods = (password: boolean, google: boolean) => {
    const turningOff = (detail.passwordEnabled && !password) ? "Password" : (detail.googleEnabled && !google) ? "Google" : null;
    const fields = form({ userId: detail.id, password, google });
    if (!turningOff) return run(setMethodsAction, fields);
    void confirmThen({
      title: `Turn off ${turningOff} sign-in for ${name}?`,
      body: <ul className="list-disc space-y-1 pl-5">
        <li>{first} is signed out on every device that used {turningOff === "Password" ? "a password" : "Google"}.</li>
        {turningOff === "Password" ? <li>Any open setup or reset link stops working. The password is kept and works again if you turn Password back on.</li> : null}
      </ul>,
      confirmLabel: `Turn off ${turningOff}`,
    }, setMethodsAction, fields);
  };

  const link_ = detail.link;
  const linkLine = link_ == null ? "No link has been issued."
    : link_.state === "waiting" ? `A ${link_.purpose} link is waiting. It expires ${fmtInstant(link_.expiresAt)}.`
    : link_.state === "used" ? `The last ${link_.purpose} link was used ${fmtInstant(link_.usedAt!)}.`
    : link_.state === "expired" ? `The last ${link_.purpose} link expired ${fmtInstant(link_.expiresAt)} without being used.`
    : `The last ${link_.purpose} link was revoked.`;
  const nextPurpose = detail.passwordSet ? "reset" : "setup";

  return <div className="mx-auto max-w-6xl">
    {dialog}
    <PageHeader
      context="People & access · Account"
      title={name}
      description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {[
          <span key="email" className="break-all">{detail.email}</span>,
          detail.teacherLabel ? <span key="teacher">teacher record <span className="font-mono text-[12.5px]">{detail.teacherLabel.split(" · ")[0]}</span></span> : null,
          <span key="status">{statusLine}</span>,
          <span key="seen">{detail.lastLoginAt ? `last signed in ${fmtInstant(detail.lastLoginAt)}` : "never signed in"}</span>,
          isSelf ? <span key="self">this is you</span> : null,
        ].filter(Boolean)}
      </span>}
      actions={<>
        <button type="button" className={buttonClass.secondary} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{editing ? "Close details" : "Edit details"}</button>
        {isSelf ? null : suspended
          ? <button type="button" className={buttonClass.secondary} disabled={pending} onClick={() => run(setStatusAction, form({ userId: detail.id, status: "active" }))}>Reactivate</button>
          : <button type="button" className={buttonClass.danger} disabled={pending} onClick={() => void confirmThen({
              title: `Suspend ${name}?`,
              body: <ul className="list-disc space-y-1 pl-5">
                <li>Signs {first} out on {detail.sessions.length} device{detail.sessions.length === 1 ? "" : "s"} now.</li>
                <li>{first} cannot sign in with any method until reactivated. An open link stops working.</li>
                <li>Roles and history are kept.</li>
              </ul>,
              confirmLabel: "Suspend",
            }, setStatusAction, form({ userId: detail.id, status: "suspended" }))}>Suspend account…</button>}
      </>}
    />

    <div aria-live="polite" className="mb-4 empty:hidden">{result ? <ResultNotice result={result} /> : null}</div>

    {editing ? <DetailsForm detail={detail} teachers={teachers} pending={pending} confirmThen={confirmThen} run={run} onDone={() => setEditing(false)} result={result} /> : null}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-5">
        <Section title="Sign-in" sub="Each method can be turned on or off. At least one stays on.">
          <Row icon={<KeyRound size={17} />} title="Password"
            sub={!detail.passwordSet ? "No password set yet." : detail.passwordChangedAt ? `Set ${fmtInstant(detail.passwordChangedAt)}` : "Set"}
            end={<Switch label={`Password sign-in for ${name}`} checked={detail.passwordEnabled} disabled={pending || (isSelf && detail.passwordEnabled)}
              onChange={(next) => setMethods(next, detail.googleEnabled)} />} />
          <Row icon={<span className="text-[15px] font-bold">G</span>} title="Google"
            sub={detail.googleEnabled ? (googleConfigured ? "On. Signs in with the Google account for this email." : "On, but Google sign-in is not set up on this server yet.") : "Off. Turn on only if this address is a Google account."}
            end={<Switch label={`Google sign-in for ${name}`} checked={detail.googleEnabled} disabled={pending || (isSelf && detail.googleEnabled)}
              onChange={(next) => setMethods(detail.passwordEnabled, next)} />} />
          {isSelf ? <p className="px-4 pb-2 text-[12.5px] text-muted">You can turn your own methods on here. Another system administrator turns them off.</p> : null}

          {detail.lockedUntil ? <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-2.5 rounded-md border border-[#e3c98f] bg-gold-tint px-3.5 py-2.5 text-[13px] text-gold-text">
            <Lock size={16} aria-hidden="true" />
            <span id={lockHint} className="flex-1">Password sign-in is locked until <b>{fmtInstant(detail.lockedUntil)}</b> after 5 failed tries.</span>
            <button type="button" className={buttonClass.small} aria-describedby={lockHint} disabled={pending} onClick={() => run(clearLockAction, form({ userId: detail.id }))}>Clear lock</button>
          </div> : null}

          <div className="grid gap-3 border-t border-[var(--color-line-soft)] px-4 pb-4 pt-3">
            {link ? <IssuedLinkPanel link={link} firstName={first} /> : <p className="flex items-start gap-2 text-[13px] text-ink-2"><Link2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />{linkLine}</p>}
            {detail.passwordEnabled && !suspended ? <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass.small} disabled={pending} onClick={() => {
                const fields = form({ userId: detail.id });
                if (nextPurpose === "setup" && link_?.state !== "waiting") return run(issueLinkAction, fields);
                void confirmThen({
                  title: nextPurpose === "reset" ? `Issue a reset link for ${name}?` : `Issue a new setup link for ${name}?`,
                  body: <>
                    <p>Anyone holding the link can set {first}’s password, so send it only to {first}.</p>
                    {link_?.state === "waiting" ? <p className="mt-2">The link that is waiting now stops working.</p> : null}
                    {nextPurpose === "reset" ? <p className="mt-2">{first}’s current password keeps working until the link is used.</p> : null}
                  </>,
                  confirmLabel: "Issue link", tone: "primary",
                }, issueLinkAction, fields);
              }}>{nextPurpose === "reset" ? "Issue a reset link…" : link_?.state === "waiting" ? "Issue a new setup link…" : "Issue a setup link"}</button>
              {link_?.state === "waiting" || link ? <button type="button" className={buttonClass.small} disabled={pending}
                onClick={() => run(revokeLinkAction, form({ userId: detail.id }), () => setLink(null))}>Revoke the open link</button> : null}
            </div> : <p className="text-[12.5px] text-muted">{suspended ? "Reactivate the account to issue a link." : "Turn on Password to issue a setup or reset link."}</p>}
          </div>
        </Section>

        <RolesSection detail={detail} isSelf={isSelf} pending={pending} confirmThen={confirmThen} run={run} result={result} first={first} />
      </div>

      <div className="grid min-w-0 gap-5">
        <Section title={isSelf ? "What you can do today" : `What ${first} can do today`} sub="From current roles only.">
          <CapabilityList lines={detail.summary.now} empty={`${isSelf ? "You have" : `${first} has`} no current role, so cannot open the internal portal.`} />
          {detail.summary.later.map((group) => <div key={new Date(group.from).getTime()}>
            <p className="px-4 pb-1.5 text-[12px] font-semibold text-muted">From {fmtDay(group.from)}, also</p>
            <CapabilityList lines={group.lines} />
          </div>)}
        </Section>

        <Section title="Signed-in devices" sub={`${detail.sessions.length} active session${detail.sessions.length === 1 ? "" : "s"}`}>
          {detail.sessions.map((session) => <Row key={session.id} icon={isPhone(session.device) ? <Smartphone size={17} /> : <Laptop size={17} />}
            title={<>{deviceLabel(session.device)}{session.current ? <span className="ml-1.5 font-normal text-muted">(this device)</span> : null}</>}
            sub={`${session.method === "password" ? "Password" : "Google"} · last used ${fmtInstant(session.lastSeenAt)}`} />)}
          <div className="border-t border-[var(--color-line-soft)] px-4 pb-4 pt-3">
            {isSelf ? <p className="text-[12.5px] text-muted">Sign out your other devices from <Link href="/account" className="font-medium text-[var(--color-pine)] underline">My account</Link>.</p>
              : detail.sessions.length ? <button type="button" className={buttonClass.dangerSmall} disabled={pending} onClick={() => void confirmThen({
                  title: `Sign ${name} out everywhere?`,
                  body: `${first} is signed out on ${detail.sessions.length} device${detail.sessions.length === 1 ? "" : "s"} and must sign in again. Nothing else changes.`,
                  confirmLabel: "Sign out everywhere",
                }, signOutEverywhereAction, form({ userId: detail.id }))}>Sign out everywhere…</button>
              : <p className="text-[12.5px] text-muted">{first} is not signed in anywhere.</p>}
            {otherSessions && isSelf ? <span className="sr-only">{otherSessions} other devices</span> : null}
          </div>
        </Section>

        <Section title="Recent account activity">
          {detail.activity.length ? <ul className="px-4 pb-3 text-[13px]">
            {detail.activity.map((event, index) => <li key={index} className="grid gap-0.5 border-t border-[var(--color-line-soft)] py-2 first:border-t-0 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-2.5">
              <time dateTime={event.at} className="tabular text-[12.5px] text-muted">{fmtInstant(event.at)}</time>
              <span>{activityText(event, viewerId, detail.id, first)}</span>
            </li>)}
          </ul> : <p className="px-4 pb-4 text-[13px] text-muted">No account activity recorded yet.</p>}
        </Section>
      </div>
    </div>
  </div>;
}

type ConfirmThen = (request: Parameters<ReturnType<typeof useConfirm>[0]>[0], action: Action, fields: FormData, after?: (result: AccountActionResult) => void) => Promise<void>;
type Run = (action: Action, fields: FormData, after?: (result: AccountActionResult) => void) => void;

function RolesSection({ detail, isSelf, pending, confirmThen, run, result, first }: {
  detail: AccountDetail; isSelf: boolean; pending: boolean; confirmThen: ConfirmThen; run: Run; result: AccountActionResult | null; first: string;
}) {
  const ids = { role: useId(), from: useId(), to: useId() };
  const [formKey, setFormKey] = useState(0);
  const roles = detail.summary.roles;
  const shownEnded = roles.filter((entry) => entry.state === "ended").slice(-3);
  const visible = [...roles.filter((entry) => entry.state !== "ended"), ...shownEnded];
  const today = dhakaToday(new Date());
  const roleErrors = fieldErrors(result, "role");
  const fromErrors = fieldErrors(result, "activeFrom");
  const toErrors = fieldErrors(result, "activeTo");
  return <Section title="Roles" sub={`Changes apply on ${isSelf ? "your" : `${first}’s`} next page load. No new sign-in is needed.`}>
    {visible.length ? <ul>
      {visible.map((entry) => {
        const dates = entry.state === "scheduled"
          ? `from ${fmtDay(entry.activeFrom)}${entry.activeTo ? ` to ${fmtLastDay(entry.activeTo)}` : ""}`
          : entry.state === "ended" ? `${fmtDay(entry.activeFrom)} to ${fmtLastDay(entry.activeTo!)}`
          : `since ${fmtDay(entry.activeFrom)}${entry.activeTo ? ` until ${fmtLastDay(entry.activeTo)}` : " · no end date"}`;
        const protectedSelf = isSelf && entry.role === "system_administrator";
        return <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-[var(--color-line-soft)] px-4 py-2.5">
          <b className={`text-[13.5px] ${entry.state === "ended" ? "text-muted line-through decoration-[rgba(86,97,90,.5)]" : ""}`}>{entry.label}</b>
          <span className="row-span-2 flex items-center gap-2">
            <Chip tone={entry.state === "current" ? "pine" : entry.state === "scheduled" ? "gold" : "off"}>{entry.state === "current" ? "Current" : entry.state === "scheduled" ? "Scheduled" : "Ended"}</Chip>
            {entry.state !== "ended" && !protectedSelf ? <button type="button" className={buttonClass.small} disabled={pending}
              aria-label={`${entry.state === "scheduled" ? "Cancel the scheduled" : "End the"} ${entry.label} role for ${detail.displayName}`}
              onClick={() => void confirmThen({
                title: entry.state === "scheduled" ? `Cancel the scheduled ${entry.label} role?` : `End ${detail.displayName}’s ${entry.label} role?`,
                body: entry.state === "scheduled"
                  ? `${first} will not get it on ${fmtDay(entry.activeFrom)}. The record is kept in history.`
                  : `${first} loses what this role allows on the next page load. The record is kept in history.`,
                confirmLabel: entry.state === "scheduled" ? "Cancel role" : "End role",
              }, endRoleAction, form({ assignmentId: entry.id }))}>{entry.state === "scheduled" ? "Cancel…" : "End…"}</button> : null}
          </span>
          <span className="text-[12.5px] text-muted">{entry.scope} · {dates}</span>
        </li>;
      })}
    </ul> : <p className="border-t border-[var(--color-line-soft)] px-4 py-3 text-[13px] text-muted">No roles yet.</p>}
    <form key={formKey} className="grid gap-3 rounded-b-lg border-t border-[var(--color-line)] bg-wash px-4 pb-4 pt-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        fields.set("userId", String(detail.id));
        run(grantRoleAction, fields, (outcome) => { if (outcome.ok) setFormKey((key) => key + 1); });
      }}>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.role} className="font-semibold">Add a role</label>
        <select id={ids.role} name="role" required className={`${inputClass} min-h-9`} aria-invalid={roleErrors.length ? true : undefined} aria-describedby={roleErrors.length ? `${ids.role}-error` : undefined}>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        <FieldError id={`${ids.role}-error`} messages={roleErrors} />
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.from} className="font-semibold">Starts</label>
        <input id={ids.from} name="activeFrom" type="date" min={today} defaultValue={today} className={`${inputClass} min-h-9`} aria-invalid={fromErrors.length ? true : undefined} aria-describedby={fromErrors.length ? `${ids.from}-error` : undefined} />
        <FieldError id={`${ids.from}-error`} messages={fromErrors} />
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.to} className="font-semibold">Last day <span className="font-normal text-muted">(optional)</span></label>
        <input id={ids.to} name="activeTo" type="date" min={today} className={`${inputClass} min-h-9`} aria-invalid={toErrors.length ? true : undefined} aria-describedby={toErrors.length ? `${ids.to}-error` : undefined} />
        <FieldError id={`${ids.to}-error`} messages={toErrors} />
      </div>
      <button className={buttonClass.secondary} disabled={pending}>Add role</button>
    </form>
  </Section>;
}

function DetailsForm({ detail, teachers, pending, confirmThen, run, onDone, result }: {
  detail: AccountDetail; teachers: TeacherOption[]; pending: boolean; confirmThen: ConfirmThen; run: Run; onDone: () => void; result: AccountActionResult | null;
}) {
  const teacherId = useId();
  const teacherErrors = fieldErrors(result, "teacherId");
  return <form className="ruled mb-5 grid gap-4 rounded-lg p-4 md:grid-cols-3" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    fields.set("userId", String(detail.id));
    const email = String(fields.get("email") ?? "").trim().toLowerCase();
    const after = (outcome: AccountActionResult) => { if (outcome.ok) onDone(); };
    if (email && email !== detail.email.toLowerCase()) {
      void confirmThen({
        title: "Change the email address?",
        body: <>From <b>{detail.email}</b> to <b>{email}</b>. {firstName(detail.displayName)} is signed out everywhere and signs in with the new address. A linked Google account must be signed in again.</>,
        confirmLabel: "Change email", tone: "primary",
      }, updateDetailsAction, fields, after);
    } else run(updateDetailsAction, fields, after);
  }}>
    <h2 className="sr-only">Edit details</h2>
    <TextField label="Full name" name="displayName" defaultValue={detail.displayName} required autoComplete="off" errors={fieldErrors(result, "displayName")} />
    <TextField label="Email" name="email" type="email" defaultValue={detail.email} required autoComplete="off" spellCheck={false} errors={fieldErrors(result, "email")} hint="The sign-in name for both methods." />
    <div className="grid gap-1.5 text-[13.5px]">
      <label htmlFor={teacherId} className="font-semibold">Linked teacher record</label>
      <select id={teacherId} name="teacherId" defaultValue={detail.teacherId ?? ""} className={inputClass} aria-invalid={teacherErrors.length ? true : undefined} aria-describedby={teacherErrors.length ? `${teacherId}-error` : undefined}>
        <option value="">None</option>
        {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.name}</option>)}
      </select>
      <FieldError id={`${teacherId}-error`} messages={teacherErrors} />
    </div>
    <div className="flex flex-wrap gap-2 md:col-span-3">
      <button className={buttonClass.primary} disabled={pending}>Save details</button>
      <button type="button" className={buttonClass.secondary} onClick={onDone}>Cancel</button>
    </div>
  </form>;
}
