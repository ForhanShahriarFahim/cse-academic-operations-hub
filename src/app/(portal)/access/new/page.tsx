import { redirect } from "next/navigation";
import { can, getOptionalActor } from "@/lib/auth";
import { teacherOptions } from "@/lib/auth/access-data";
import { googleAuthConfigured } from "@/lib/auth/provider";
import { PageHeader } from "@/components/ui";
import { CreateAccountForm } from "@/components/account/create-account-form";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login?next=/access/new");
  if (!await can(actor, "manage_users")) redirect("/forbidden");
  const teachers = await teacherOptions();
  return <div className="mx-auto max-w-[860px]">
    <PageHeader
      context="People & access · New account"
      title="Create an account"
      description="You will get a one-time setup link to send to the person. They choose their own password; you never see it."
    />
    <CreateAccountForm teachers={teachers} googleConfigured={googleAuthConfigured} />
  </div>;
}
