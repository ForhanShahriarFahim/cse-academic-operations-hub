import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ClassGroupHistory } from "@/components/class-groups/class-group-forms";
import { getClassGroupChanges, getTermClassGroups, requireClassGroupEditor } from "@/lib/class-group-data";
import { classGroupQuery } from "@/lib/class-group-records";

export const dynamic = "force-dynamic";

export default async function ClassGroupHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  await requireClassGroupEditor(`/terms/${id}/groups/history`);
  const data = await getTermClassGroups(id);
  if (!data) notFound();
  return <div className="mx-auto max-w-[980px] min-w-0">
    <Link className="text-sm underline" href={`/terms/${data.term.id}/groups${classGroupQuery(await searchParams)}`}>← Class groups</Link>
    <PageHeader context={`Class groups / ${data.term.name}`} title="Change history" description="Class-group changes for this term, newest first. Times are shown in Asia/Dhaka." />
    <ClassGroupHistory termId={data.term.id} initial={await getClassGroupChanges(data.term.id)} />
  </div>;
}
