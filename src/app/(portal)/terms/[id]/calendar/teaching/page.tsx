import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { TeachingForm } from "@/components/calendar/calendar-forms";
import { getTermCalendar, requireCalendarEditor } from "@/lib/calendar-data";

export const dynamic = "force-dynamic";

export default async function TeachingDatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCalendarEditor(`/terms/${id}/calendar/teaching`);
  const data = await getTermCalendar(id);
  if (!data) notFound();
  const back = `/terms/${data.term.id}/calendar`;
  return <div className="mx-auto min-w-0 max-w-[760px]">
    <Link className="text-sm underline" href={back}>← Academic calendar</Link>
    <PageHeader context={`${data.term.name} / Academic calendar`} title={data.teaching ? "Edit teaching dates" : "Record teaching dates"} description="The first and last regular class days for the whole term audience, from an approved notice or term document." />
    {data.editable ? <TeachingForm term={data.term} revision={data.revision} teaching={data.teaching} returnHref={back} /> : <Notice title="Read-only calendar">{data.term.name} is {data.term.status}. Its calendar cannot be changed.</Notice>}
  </div>;
}
