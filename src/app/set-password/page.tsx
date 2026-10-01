import { getOptionalActor } from "@/lib/auth";
import { GateLayout } from "@/components/account/gate-layout";
import { SetPasswordForm } from "@/components/account/set-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your password", referrer: "no-referrer" as const };

/** AUTH-02: the page a setup or reset link opens. The token is in the URL fragment, read only by the browser. */
export default async function SetPasswordPage() {
  const actor = await getOptionalActor();
  return <GateLayout
    eyebrow="Account setup"
    title="Choose your password"
    sideHeading="Choose a password only you know."
    sideText="The administrator who sent this link cannot see your password. A long phrase you can remember works well, and a password manager is welcome."
  >
    <SetPasswordForm signedIn={actor ? { email: actor.email, displayName: actor.displayName } : null} />
  </GateLayout>;
}
