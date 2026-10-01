import { redirect } from "next/navigation";
import { getCurrentSessionToken, getOptionalActor } from "@/lib/auth";
import { loadAccountDetail } from "@/lib/auth/access-data";
import { googleAuthConfigured } from "@/lib/auth/provider";
import { MyAccount } from "@/components/account/my-account";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function MyAccountPage() {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login?next=/account");
  const detail = await loadAccountDetail(actor.id, {
    currentToken: await getCurrentSessionToken(),
    wording: { assignedGroups: "Only for groups you teach", ownClasses: "Only your own classes" },
    activity: false,
  });
  if (!detail) redirect("/login");
  return <MyAccount detail={detail} googleConfigured={googleAuthConfigured} />;
}
