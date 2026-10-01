"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

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
