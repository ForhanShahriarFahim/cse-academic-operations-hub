import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { EntryForm, RemoveEntryForm } from "@/components/calendar/calendar-forms";
import { getTermCalendar, requireCalendarEditor } from "@/lib/calendar-data";
import { calendarInteger } from "@/lib/calendar-store";
import { kindLabel } from "@/lib/calendar-records";

export const dynamic = "force-dynamic";

export default async function CalendarEntryPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  await requireCalendarEditor(`/terms/${id}/calendar/${entryId}`);
  const data = await getTermCalendar(id);
  const entry = data?.entries.find(item => item.id === calendarInteger(entryId));
  if (!data || !entry) notFound();
  const back = `/terms/${data.term.id}/calendar`;
  return <div className="mx-auto min-w-0 max-w-[760px]">
    <Link className="text-sm underline" href={back}>← Academic calendar</Link>
    <PageHeader context={`${data.term.name} / Academic calendar`} title={`Edit ${kindLabel(entry.kind).toLowerCase()}`} description={entry.title} />
    {data.editable ? <div className="grid gap-5">
      <EntryForm term={data.term} revision={data.revision} entry={entry} returnHref={back} />
      <RemoveEntryForm term={data.term} revision={data.revision} entry={entry} returnHref={back} />
    </div> : <Notice title="Read-only calendar">{data.term.name} is {data.term.status}. Its calendar cannot be changed.</Notice>}
  </div>;
}
