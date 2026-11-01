import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { getTermPublicationState } from "@/lib/data";
import { ActiveTermUnavailable, type TermProblem } from "@/lib/term-state";
import { can, getOptionalActor } from "@/lib/auth";
import { SignOutButton } from "@/components/login-button";
import { ROLE_CAPABILITIES } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login");
  if (!await can(actor, "view_internal_portal")) redirect("/forbidden");
  const capabilities = [...new Set(actor.assignments.flatMap((assignment) => ROLE_CAPABILITIES[assignment.role]))];
  const roles = [...new Set(actor.assignments.map((assignment) => assignment.role.replaceAll("_", " ")))];
  const roleLabel = roles.length ? roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(", ") : "No active role";

  let termName = "No active term";
  let termProblem: TermProblem | null = "none";
  let publishedVersion: number | null = null;
  try {
    const state = await getTermPublicationState();
    if (state) {
      ({ termName, publishedVersion } = state);
      termProblem = null;
    }
  } catch (error) {
    if (!(error instanceof ActiveTermUnavailable)) throw error;
    termProblem = error.problem;
    termName = "Academic term unavailable";
  }

  return (
    <PortalShell
      capabilities={capabilities}
      linkedTeacher={actor.teacherId != null}
      termName={termName}
      termProblem={termProblem}
      publishedVersion={publishedVersion}
      displayName={actor.displayName}
      roleLabel={roleLabel}
      account={<>
        <Link href="/account" className="mt-1 block w-fit text-[12.5px] font-medium text-[#f0c98a] underline underline-offset-2">My account</Link>
        <SignOutButton />
      </>}
    >
      {children}
    </PortalShell>
  );
}
