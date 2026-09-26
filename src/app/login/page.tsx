import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/login-button";
import { getOptionalActor } from "@/lib/auth";
import { googleAuthConfigured } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const actor = await getOptionalActor();
  if (actor) redirect("/");
  const query = await searchParams;
  const callbackURL = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/";
  return <main className="paper-grain flex min-h-screen items-center justify-center px-4">
    <section className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#8d6e2d]">CSE Academic Operations</p>
      <h1 className="font-display mt-3 text-3xl font-semibold">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-[#66705f]">Use a Google account invited by the portal administrator. The published routine remains available to everyone.</p>
      {query.error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Sign-in was not accepted. Check that this Google address has been invited.</p>}
      <div className="mt-6">
        {googleAuthConfigured ? <LoginButton callbackURL={callbackURL} /> :
          <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">Google sign-in is not configured yet. Set the four authentication environment values described in the README.</p>}
      </div>
      <Link href="/public/routine" className="mt-5 inline-block text-sm font-medium underline">View the public routine</Link>
    </section>
  </main>;
}
