import Link from "next/link";
import { getTermDirectory } from "@/lib/term-data";
import { can, requireActor } from "@/lib/auth";
import { PageHeader, Panel, EmptyNote } from "@/components/ui";

export default async function TermsPage() {
  const terms=await getTermDirectory();const actor=await requireActor();const manager=await can(actor,"manage_terms");
  const active=terms.filter(term=>term.status==="active");
  return <div><PageHeader context="Administration" title="Academic terms" description="View a term's setup and saved publications. Activation is a separate reviewed action." actions={manager?<Link href="/terms/new" className="rounded-md bg-[var(--color-pine)] px-4 py-2 text-sm font-semibold text-white">Create draft term</Link>:undefined}/>
    <p className="mb-4 text-sm">Active across the portal: <strong>{active.length===1?active[0].name:active.length?"Unavailable — multiple active terms":"None"}</strong></p>
    <Panel title="Term directory">{!terms.length?<EmptyNote>No academic terms yet. An administrator can create an empty draft, save its policy and review activation.</EmptyNote>:<div className="divide-y divide-[var(--color-line-soft)]">{terms.map(term=><div key={term.id} className="grid gap-3 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><div><h2 className="font-display text-lg font-semibold">{term.name}</h2><p className="text-xs text-muted">{term.status} · Academic year {term.academicYear}</p></div><p>{term.startDate} – {term.endDate}</p><Link className="font-semibold text-[var(--color-pine)] underline" href={`/terms/${term.id}`}>View term</Link></div>)}</div>}</Panel>
    <p className="mt-4 text-sm text-muted">Opening an older term leaves the active term unchanged. Completed terms are read-only.</p>{!manager&&<p className="mt-2 text-xs text-muted">Your role can view terms and saved publications. Management controls require an administrator.</p>}
  </div>;
}
