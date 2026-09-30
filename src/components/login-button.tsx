"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function LoginButton({ callbackURL }: { callbackURL: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      setError("");
      try {
        const result = await authClient.signIn.social({ provider: "google", callbackURL });
        if (result.error) setError("Google sign-in could not start. Check the portal configuration and try again.");
      } catch {
        setError("Google sign-in is unavailable right now.");
      } finally { setBusy(false); }
    }} className="w-full rounded-md bg-[var(--color-ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--color-clay)]">{error}</p>}
  </div>;
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }} className="mt-2 rounded-md border border-white/25 px-2.5 py-1 text-[12.5px] text-[#e9ece8] hover:bg-white/10 disabled:opacity-60">
    {busy ? "Signing out…" : "Sign out"}
  </button>;
}
