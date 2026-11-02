import { notFound } from "next/navigation";
import { requireTermPage as authorize } from "@/lib/term-pages";
import { getTermWorkspace } from "@/lib/term-data";
import { TermIdentityForm } from "@/components/terms/forms";
import { PageHeader, Notice } from "@/components/ui";
export default async function EditTermPage({params}:{params:Promise<{id:string}>}){
  await authorize("manage_terms");const summary=await getTermWorkspace(Number((await params).id));if(!summary)notFound();
  return <div className="mx-auto max-w-3xl"><PageHeader context={`Academic terms · ${summary.term.name}`} title="Edit draft identity" description="Only unused drafts can change their identity or dates."/>{summary.editable?<TermIdentityForm key={`${summary.term.id}:${summary.term.revision}`} term={summary.term}/>:<Notice tone="warn">This term is read-only. Its identity and dates cannot be edited here.</Notice>}</div>;
}
