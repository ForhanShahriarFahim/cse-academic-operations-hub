import { requireTermPage as authorize } from "@/lib/term-pages";
import { PageHeader } from "@/components/ui";
import { TermIdentityForm } from "@/components/terms/forms";
export default async function NewTermPage(){await authorize("manage_terms");return <div className="mx-auto max-w-3xl"><PageHeader context="Academic terms · Step 1" title="Create a draft term" description="Save its identity first, then explicitly set its starting policy. The active term stays unchanged."/><TermIdentityForm/></div>;}
