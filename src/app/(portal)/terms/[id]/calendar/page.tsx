import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarRange, CalendarX, CircleHelp } from "lucide-react";
import { Notice, PageHeader } from "@/components/ui";
import { buttonClass, inputClass } from "@/components/account/styles";
import { EntrySummary, SourceRef } from "@/components/calendar/calendar-view";
import { getTermCalendar } from "@/lib/calendar-data";
import { civilDate, dateRange, dhakaToday, kindLabel, longDate, lookupDate, type LookupStatus } from "@/lib/calendar-records";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<LookupStatus, { icon: typeof CalendarCheck; className: string }> = {
  teaching: { icon: CalendarCheck, className: "border-[var(--color-pine)] bg-[var(--color-pine-tint)]" },
  suspended: { icon: CalendarX, className: "border-[var(--color-clay)] bg-[var(--color-clay-tint)]" },
  outside_teaching: { icon: CalendarRange, className: "border-[var(--color-line)] bg-wash" },
  outside_term: { icon: CalendarRange, className: "border-[var(--color-line)] bg-wash" },
  no_teaching_dates: { icon: CircleHelp, className: "border-[var(--color-gold)] bg-[var(--color-gold-tint)]" },
};

export default async function TermCalendarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params, search = await searchParams;
  const data = await getTermCalendar(id);
  if (!data) notFound();
  const { term, teaching, entries, canEdit, editor } = data, base = `/terms/${term.id}/calendar`;
  const asked = typeof search.date === "string" ? search.date.slice(0, 20) : null;
  const date = asked == null ? dhakaToday() : civilDate(asked);
  const lookup = date ? lookupDate(date, term, teaching, entries) : null;
  const done = typeof search.done === "string" ? search.done.slice(0, 300) : null;
  const style = lookup ? STATUS_STYLE[lookup.status] : null, Icon = style?.icon;
  return <div className="mx-auto min-w-0 max-w-[1080px]">
    <Link href={`/terms/${term.id}`} className="mb-3 inline-block text-sm underline">← {term.name}</Link>
    <PageHeader context={`Terms / ${term.name} · ${term.status}`} title="Academic calendar"
      description="Regular teaching dates and dated notices for this term. Weekly routines, attendance and publications keep using their own records."
      actions={<><Link className={buttonClass.secondary} href={`${base}/print`}>Print calendar</Link>{editor && <Link className={buttonClass.secondary} href={`${base}/history`}>Change history</Link>}{canEdit && <Link className={buttonClass.primary} href={`${base}/new`}>Add calendar entry</Link>}</>} />
    {done && <Notice tone="success" className="mb-4">{done}</Notice>}
    {!data.editable && <Notice className="mb-4" title="Read-only calendar">{term.name} is {term.status}. Its calendar is shown as recorded and cannot be changed.</Notice>}
    {data.editable && !editor && <Notice className="mb-4" title="View only">You can view and print this calendar. Changing it needs a university-wide term management role.</Notice>}
    {canEdit && term.status === "draft" && <Notice className="mb-4">This is a draft term. Its calendar can be prepared before activation; saving it does not activate or publish anything.</Notice>}

    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section aria-labelledby="cal-teaching" className="ruled min-w-0 rounded-lg p-4 sm:p-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">Term dates {dateRange(term.startDate, term.endDate)}</p>
        <h2 id="cal-teaching" className="font-display mt-1 text-[18px] font-semibold tracking-tight">Regular teaching dates</h2>
        {teaching
          ? <><p className="font-display mt-2 text-[22px] font-semibold leading-tight">{dateRange(teaching.start, teaching.end)}</p><p className="mt-2 text-[13px] text-ink-2">Source · <SourceRef source={teaching.source} url={teaching.sourceUrl} /></p></>
          : <p className="mt-2 text-[14px]">Teaching dates have not been recorded.</p>}
        {canEdit && <p className="mt-4"><Link className={buttonClass.secondary} href={`${base}/teaching`}>{teaching ? "Edit teaching dates" : "Record teaching dates"}</Link></p>}
      </section>

      <section aria-labelledby="cal-check" className="ruled min-w-0 rounded-lg p-4 sm:p-5">
        <h2 id="cal-check" className="font-display text-[18px] font-semibold tracking-tight">Check a date</h2>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 basis-48 gap-1.5 text-[13.5px]"><label htmlFor="cal-date" className="font-semibold">Date in Asia/Dhaka</label><input id="cal-date" name="date" type="date" className={inputClass} defaultValue={date ?? ""} aria-invalid={!date || undefined} aria-describedby={!date ? "cal-date-error" : undefined} /></div>
          <button className={buttonClass.secondary} type="submit">Check</button>
        </form>
        <div aria-live="polite">
          {!date && <p id="cal-date-error" className="mt-3 text-[13px] font-semibold text-[var(--color-clay)]">Enter a real date, for example 2027-03-10.</p>}
          {lookup && style && Icon && <div className={`mt-3 rounded-md border-l-4 px-3 py-2.5 ${style.className}`}>
            <p className="flex items-center gap-2 text-[14.5px] font-semibold"><Icon size={17} strokeWidth={2} aria-hidden="true" />{lookup.label}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">{longDate(lookup.date)}{asked == null ? " · today" : ""}</p>
            {lookup.entries.length > 0 && <ul className="mt-2 grid gap-1 text-[13px]">{lookup.entries.map(entry => <li key={entry.id} className="break-words"><strong>{entry.title}</strong> · {kindLabel(entry.kind)}{lookup.closures.includes(entry) ? " · closes regular classes" : ""}</li>)}</ul>}
            {lookup.status === "teaching" && <p className="mt-2 text-[12.5px] text-muted">The calendar does not record weekends or individual meetings. Check the weekly routine for classes on this day.</p>}
          </div>}
        </div>
      </section>
    </div>

    <section aria-labelledby="cal-entries" className="ruled mt-5 min-w-0 rounded-lg">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div><p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{entries.length} entr{entries.length === 1 ? "y" : "ies"}</p><h2 id="cal-entries" className="font-display text-[18px] font-semibold tracking-tight">Calendar entries</h2></div>
        <p className="text-[12.5px] text-muted">In date order</p>
      </header>
      <div className="px-4 pb-4">
        {!entries.length && <p className="pt-4 text-sm">No calendar entries have been recorded for this term.</p>}
        <ul className="divide-y divide-[var(--color-line-soft)]">{entries.map(entry => <li key={entry.id} className="grid min-w-0 gap-x-6 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <EntrySummary entry={entry} />
          {canEdit && <p className="text-[12.5px] sm:text-right"><Link className="font-semibold text-[var(--color-pine)] underline" href={`${base}/${entry.id}`}>Edit<span className="sr-only"> {entry.title}, {dateRange(entry.startDate, entry.endDate)}</span></Link></p>}
        </li>)}</ul>
      </div>
    </section>
    <p className="mt-5 max-w-[80ch] text-[12.5px] text-muted">An exam period does not say that any individual exam takes place or is cancelled. Day swaps, CSV import and copying from a previous term are not part of this calendar yet.</p>
  </div>;
}
