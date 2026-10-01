import { redirect } from "next/navigation";
import { getOptionalActor } from "@/lib/auth";
import { safeReturnPath } from "@/lib/auth/account-policy";
import { authConfigured, googleAuthConfigured } from "@/lib/auth/provider";
import { GateLayout } from "@/components/account/gate-layout";
import { SignInForm } from "@/components/account/sign-in-form";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  const next = safeReturnPath(query.next);
  if (await getOptionalActor()) redirect(next);
  return <GateLayout
    eyebrow="Staff sign-in"
    title="Sign in"
    intro="Use the email address your administrator set up for you."
    sideHeading="Routines, attendance and teaching load, in one place."
    sideText="Accounts are created by the portal administrator. Students and visitors do not need one."
  >
    {authConfigured
      ? <SignInForm next={next} googleConfigured={googleAuthConfigured} googleError={Boolean(query.error)} />
      : <Notice tone="warn" title="Sign-in is not set up on this server yet">Set BETTER_AUTH_SECRET and BETTER_AUTH_URL as described in the README.</Notice>}
  </GateLayout>;
}
