import { notFound } from "next/navigation";
import { requireTermPage as authorize } from "@/lib/term-pages";
import { getTermWorkspace } from "@/lib/term-data";
import { StartingPolicyForm } from "@/components/terms/forms";
import { PageHeader, Notice } from "@/components/ui";
export default async function SetupTermPage({params}:{params:Promise<{id:string}>}){
  await authorize("manage_terms");await authorize("manage_policy");const summary=await getTermWorkspace(Number((await params).id));if(!summary)notFound();
  return <div className="mx-auto max-w-3xl"><PageHeader context={`Academic terms · ${summary.term.name} · Step 2`} title="Set the starting policy" description="Enter each value explicitly for this draft. The active term stays unchanged."/>{summary.editable?<StartingPolicyForm termId={summary.term.id} revision={summary.term.revision} policy={summary.policy}/>:<Notice tone="warn">The starting-policy editor is only available on an unused draft.</Notice>}<p className="mt-4 text-sm text-muted">An empty term may be activated after its policy is saved. Set up Days &amp; periods in the active term afterwards.</p></div>;
}
