import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { PrintedAt } from "@/components/calendar/printed-at";
import { SourceRef, effectText } from "@/components/calendar/calendar-view";
import { getTermCalendar } from "@/lib/calendar-data";
import { dateRange, kindLabel } from "@/lib/calendar-records";

export const dynamic = "force-dynamic";

const now = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

/** Authenticated internal A4 copy of the saved calendar: no edit controls, no history. */
export default async function CalendarPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTermCalendar(id);
  if (!data) notFound();
  const { term, teaching, entries } = data;
  return <div className="min-w-0">
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link className="text-sm underline" href={`/terms/${term.id}/calendar`}>← Academic calendar</Link>
      <PrintButton />
    </div>
    <article className="term-calendar-sheet" aria-label={`Academic calendar, ${term.name}`}>
      <header className="term-calendar-head">
        <div><p className="term-calendar-inst">Pundra University of Science &amp; Technology</p><p>Department of Computer Science &amp; Engineering</p></div>
        <p className="text-right">{term.name} · {term.status}<br />Internal calendar copy</p>
      </header>
      <h1 className="term-calendar-title">Academic calendar — {term.name}</h1>
      <dl className="term-calendar-facts">
        <div><dt>Term dates</dt><dd>{dateRange(term.startDate, term.endDate)}</dd></div>
        <div><dt>Regular teaching dates</dt><dd>{teaching ? dateRange(teaching.start, teaching.end) : "Teaching dates have not been recorded."}</dd></div>
        {teaching && <div><dt>Source</dt><dd><SourceRef source={teaching.source} url={teaching.sourceUrl} print /></dd></div>}
      </dl>
      <table className="term-calendar-table">
        <thead><tr><th scope="col">Dates</th><th scope="col">Entry</th><th scope="col">Regular classes</th><th scope="col">Source</th></tr></thead>
        <tbody>
          {entries.map(entry => <tr key={entry.id}><td>{dateRange(entry.startDate, entry.endDate)}</td><td><strong>{entry.title}</strong><br />{kindLabel(entry.kind)}</td><td>{effectText(entry)}</td><td><SourceRef source={entry.source} url={entry.sourceUrl} print /></td></tr>)}
          {!entries.length && <tr><td colSpan={4}>No calendar entries have been recorded for this term.</td></tr>}
        </tbody>
      </table>
      <footer className="term-calendar-foot"><span>An exam period does not say that any individual exam takes place or is cancelled.</span><span><PrintedAt initial={now()} /></span></footer>
    </article>
  </div>;
}
