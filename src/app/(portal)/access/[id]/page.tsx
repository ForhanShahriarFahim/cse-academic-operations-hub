import { notFound, redirect } from "next/navigation";
import { can, getCurrentSessionToken, getOptionalActor } from "@/lib/auth";
import { loadAccountDetail, teacherOptions } from "@/lib/auth/access-data";
import { googleAuthConfigured } from "@/lib/auth/provider";
import { AccountManager } from "@/components/account/account-manager";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=/access/${encodeURIComponent(id)}`);
  if (!await can(actor, "manage_users")) redirect("/forbidden");
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();
  const isSelf = userId === actor.id;
  const [detail, teachers] = await Promise.all([
    loadAccountDetail(userId, { currentToken: isSelf ? await getCurrentSessionToken() : null }),
    teacherOptions(),
  ]);
  if (!detail) notFound();
  return <AccountManager detail={detail} teachers={teachers} viewerId={actor.id} googleConfigured={googleAuthConfigured} />;
}
