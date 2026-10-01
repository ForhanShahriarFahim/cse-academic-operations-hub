"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Link2Off, UserRound } from "lucide-react";
import { inspectLinkAction, setPasswordWithLinkAction, type LinkView, type SetPasswordResult } from "@/lib/auth/account-actions";
import { authClient } from "@/lib/auth/client";
import { fmtInstant } from "@/lib/auth/display";
import { Notice } from "@/components/ui";
import { PasswordField, PasswordRules, fieldErrors } from "./form-bits";
import { buttonClass } from "./styles";

type Stage =
  | { kind: "reading" }
  | { kind: "no-link" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; token: string; view: Extract<LinkView, { ok: true }> };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");

export function SetPasswordForm({ signedIn }: { signedIn: { email: string; displayName: string } | null }) {
  const [stage, setStage] = useState<Stage>({ kind: "reading" });
  const [someoneElse, setSomeoneElse] = useState(signedIn);
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Read the token from the fragment once (effects can run twice), then take it out of the address bar and history.
    if (tokenRef.current === undefined) {
      tokenRef.current = new URLSearchParams(window.location.hash.slice(1)).get("t");
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenRef.current;
    let cancelled = false;
    (async () => {
      if (!token) { setStage({ kind: "no-link" }); return; }
      const view = await inspectLinkAction(token);
      if (cancelled) return;
      setStage(view.ok ? { kind: "ready", token, view } : { kind: "invalid", message: view.message });
    })();
    return () => { cancelled = true; };
  }, []);

  if (stage.kind === "reading") return <p role="status" className="text-[13.5px] text-muted">Checking your link…</p>;
  if (stage.kind === "no-link") return <div className="grid gap-4">
    <Notice tone="info">This page needs the link your administrator sent you. Open that link again from your message. For your safety, the address bar no longer shows it.</Notice>
    <Link href="/login" className={`${buttonClass.secondary} w-fit`}>Go to sign in</Link>
  </div>;
  if (stage.kind === "invalid") return <Invalid message={stage.message} />;

  const other = someoneElse && someoneElse.email.toLowerCase() !== stage.view.email.toLowerCase() ? someoneElse : null;
  if (other) return <div className="grid gap-4">
    <div role="status" className="flex items-start gap-2.5 rounded-md border border-[#e3c98f] bg-gold-tint px-3.5 py-2.5 text-[13.5px] text-gold-text">
      <UserRound size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span><b>{other.displayName}</b> is signed in on this browser. To set up <b>{stage.view.displayName}</b>’s account, sign {other.displayName.split(/\s+/)[0]} out first.</span>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass.primary} onClick={async () => { await authClient.signOut(); setSomeoneElse(null); }}>Sign out and continue</button>
      <Link href="/" className={buttonClass.secondary}>Keep me signed in</Link>
    </div>
  </div>;

  return <ReadyForm token={stage.token} view={stage.view} onInvalid={(message) => setStage({ kind: "invalid", message })} />;
}

function Invalid({ message }: { message: string }) {
  return <div className="grid gap-4">
    <div role="alert" className="flex items-start gap-2.5 rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-3.5 py-2.5 text-[13.5px] text-[var(--color-clay)]">
      <Link2Off size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{message}</span>
    </div>
    <Link href="/login" className={`${buttonClass.secondary} w-fit`}>Go to sign in</Link>
  </div>;
}

function ReadyForm({ token, view, onInvalid }: { token: string; view: Extract<LinkView, { ok: true }>; onInvalid: (message: string) => void }) {
  const [result, action, pending] = useActionState<SetPasswordResult | null, FormData>(async (previous, formData) => {
    const outcome = await setPasswordWithLinkAction(previous, formData);
    if (outcome?.linkInvalid) onInvalid(outcome.message);
    return outcome;
  }, null);
  const [password, setPassword] = useState("");
  const rulesId = useId();
  return <>
    <p className="mb-4 text-[14px] text-ink-2">After you save it, you are signed in and the link stops working.</p>
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-sheet px-3.5 py-3">
      <span aria-hidden="true" className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-[var(--color-pine)] text-[14px] font-semibold text-white">{initials(view.displayName)}</span>
      <span className="min-w-0"><b className="block">{view.displayName}</b><span className="break-all text-[13px] text-muted">{view.email}</span></span>
    </div>
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="email" name="username" autoComplete="username" value={view.email} readOnly hidden />
      <div className="grid gap-1.5">
        <PasswordField label="New password" name="password" autoComplete="new-password" required value={password}
          onChange={(event) => setPassword(event.target.value)} errors={fieldErrors(result, "password")} describedBy={rulesId} />
        <PasswordRules id={rulesId} password={password} email={view.email} />
      </div>
      <PasswordField label="Type it again" name="confirm" autoComplete="new-password" required errors={fieldErrors(result, "confirm")} />
      <button className={`${buttonClass.primary} min-h-[42px] w-full text-[14px]`} disabled={pending}>{pending ? "Saving…" : "Save password and sign in"}</button>
    </form>
    <p className="mt-3 text-[12.5px] text-muted">This link works once and expires {fmtInstant(view.expiresAt)}.</p>
    <details className="mt-4 border-t border-[var(--color-line)] pt-3.5 text-[13.5px] text-ink-2">
      <summary className="cursor-pointer font-semibold text-[var(--color-pine)]">Not you?</summary>
      <p className="mt-1.5">Do not use this link. Tell the portal administrator, who can revoke it.</p>
    </details>
  </>;
}
