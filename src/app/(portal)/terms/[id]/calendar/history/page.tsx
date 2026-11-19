import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CalendarHistory } from "@/components/calendar/calendar-forms";
import { getCalendarChanges, getTermCalendar, requireCalendarEditor } from "@/lib/calendar-data";

export const dynamic = "force-dynamic";

export default async function CalendarHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCalendarEditor(`/terms/${id}/calendar/history`);
  const data = await getTermCalendar(id);
  if (!data) notFound();
  return <div className="mx-auto min-w-0 max-w-[860px]">
    <Link className="text-sm underline" href={`/terms/${data.term.id}/calendar`}>← Academic calendar</Link>
    <PageHeader context={`${data.term.name} / Academic calendar`} title="Change history" description="Calendar changes for this term, newest first. Times are shown in Asia/Dhaka." />
    <CalendarHistory termId={data.term.id} initial={await getCalendarChanges(data.term.id)} />
  </div>;
}
