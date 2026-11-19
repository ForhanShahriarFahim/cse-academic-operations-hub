import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/calendar/calendar-forms";
import { getTermCalendar, requireCalendarEditor } from "@/lib/calendar-data";

export const dynamic = "force-dynamic";

export default async function NewCalendarEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCalendarEditor(`/terms/${id}/calendar/new`);
  const data = await getTermCalendar(id);
  if (!data) notFound();
  const back = `/terms/${data.term.id}/calendar`;
  return <div className="mx-auto min-w-0 max-w-[760px]">
    <Link className="text-sm underline" href={back}>← Academic calendar</Link>
    <PageHeader context={`${data.term.name} / Academic calendar`} title="Add calendar entry" description="A dated holiday, class suspension or exam period from an approved notice that applies across the term audience." />
    {data.editable ? <EntryForm term={data.term} revision={data.revision} returnHref={back} /> : <Notice title="Read-only calendar">{data.term.name} is {data.term.status}. Its calendar cannot be changed.</Notice>}
  </div>;
}
