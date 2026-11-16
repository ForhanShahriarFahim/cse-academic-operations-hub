import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { OfferingHistory } from "@/components/offerings/offering-forms";
import { getOfferingChanges, getTermOfferings, requireOfferingEditor } from "@/lib/offering-data";
import { offeringQuery } from "@/lib/offering-records";

export const dynamic = "force-dynamic";

export default async function OfferingHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  await requireOfferingEditor(`/terms/${id}/offerings/history`);
  const data = await getTermOfferings(id);
  if (!data) notFound();
  return <div className="mx-auto max-w-[980px] min-w-0">
    <Link className="text-sm underline" href={`/terms/${data.term.id}/offerings${offeringQuery(await searchParams)}`}>← Term offerings</Link>
    <PageHeader context={`Term offerings / ${data.term.name}`} title="Change history" description="Offering changes for this term, newest first. Times are shown in Asia/Dhaka." />
    <OfferingHistory termId={data.term.id} initial={await getOfferingChanges(data.term.id)} />
  </div>;
}
