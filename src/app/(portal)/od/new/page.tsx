import Link from "next/link";
import { TermWriteProvider } from "@/components/term-write-context";
import { PageHeader } from "@/components/ui";
import { CommitmentForm } from "@/components/od/commitment-form";
import { getCommitmentWorkspace, requireCommitmentManager } from "@/lib/commitment-data";
import { safeRegisterReturn } from "@/lib/commitment-records";

export const dynamic = "force-dynamic";

export default async function NewCommitmentPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  await requireCommitmentManager("/od/new");
  const returnTo = safeRegisterReturn((await searchParams).return);
  const { term, writeContext, options } = await getCommitmentWorkspace();
  return (
    <TermWriteProvider value={writeContext}>
      <div className="min-w-0">
        <Link href={returnTo} className="text-[13px] underline">← Cross-department commitments</Link>
        <PageHeader context={`Planning records · ${term.name}`} title="Record a commitment" description="Record what is known about a teacher or room committed to another department. It starts as Pending until someone confirms it." />
        <CommitmentForm mode="create" returnTo={returnTo} {...options}
          initial={{ kind: "", counterpartDepartment: "", teacherId: "", roomId: "", dayOfWeek: "", startTime: "", endTime: "", courseLabel: "", audienceLabel: "", credits: "", notes: "" }} />
      </div>
    </TermWriteProvider>
  );
}
