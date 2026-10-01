"use client";

import { useActionState, useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import { signInWithPasswordAction, type SignInState } from "@/lib/auth/sign-in-actions";
import { authClient } from "@/lib/auth/client";
import { buttonClass, inputClass } from "./styles";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" />
    <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" />
  </svg>;
}

export function SignInForm({ next, googleConfigured, googleError }: { next: string; googleConfigured: boolean; googleError: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInWithPasswordAction, { message: null, email: "" });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleProblem, setGoogleProblem] = useState(googleError ? "Google sign-in was not accepted. Google must be turned on for this address in People & access." : "");
  const ids = { email: useId(), password: useId(), error: useId() };
  const [shown, setShown] = useState(false);
  const failed = Boolean(state.message);

  return <>
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.email} className="font-semibold">Email</label>
        <input id={ids.email} name="email" type="email" autoComplete="username" required spellCheck={false} autoCapitalize="none"
          defaultValue={state.email} aria-describedby={failed ? ids.error : undefined} className={inputClass} />
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <label htmlFor={ids.password} className="font-semibold">Password</label>
        <div className="relative">
          <input id={ids.password} name="password" type={shown ? "text" : "password"} autoComplete="current-password" required
            aria-invalid={failed || undefined} aria-describedby={failed ? ids.error : undefined} className={`${inputClass} pr-[68px]`} />
          <button type="button" aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown((value) => !value)}
            className="absolute inset-y-1 right-1 rounded px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-wash">{shown ? "Hide" : "Show"}</button>
        </div>
        {failed ? <p id={ids.error} role="alert" className="flex items-start gap-1.5 text-[12.5px] font-semibold text-[var(--color-clay)]">
          <CircleAlert size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{state.message}</span>
        </p> : null}
      </div>
      <button className={`${buttonClass.primary} min-h-[42px] w-full text-[14px]`} disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>

    {googleConfigured ? <>
      <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[12.5px] text-muted before:h-px before:bg-[var(--color-line)] after:h-px after:bg-[var(--color-line)]">or</div>
      <button type="button" disabled={googleBusy} onClick={async () => {
        setGoogleBusy(true);
        setGoogleProblem("");
        try {
          const result = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login?error=google" });
          if (result.error) setGoogleProblem("Google sign-in could not start. Try again, or use your password.");
        } catch {
          setGoogleProblem("Google sign-in is unavailable right now. Use your password, or try again later.");
        } finally { setGoogleBusy(false); }
      }} className="flex min-h-[42px] w-full items-center justify-center gap-2.5 rounded-md border border-[#c9c2ae] bg-white text-[14px] font-semibold disabled:opacity-60">
        <GoogleMark />{googleBusy ? "Opening Google…" : "Continue with Google"}
      </button>
      {googleProblem ? <p role="alert" className="mt-2 text-[12.5px] font-semibold text-[var(--color-clay)]">{googleProblem}</p> : null}
    </> : null}

    <div className="mt-6 grid gap-2 border-t border-[var(--color-line)] pt-3.5 text-[13.5px] text-ink-2">
      <details>
        <summary className="cursor-pointer font-semibold text-[var(--color-pine)]">Forgot your password?</summary>
        <p className="mt-1.5">Ask the portal administrator for a reset link. It works once and expires after 24 hours. Your current password keeps working until you use the link.</p>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold text-[var(--color-pine)]">First time here?</summary>
        <p className="mt-1.5">Open the setup link your administrator sent you to choose a password. A setup link expires after 72 hours.</p>
      </details>
    </div>
  </>;
}
