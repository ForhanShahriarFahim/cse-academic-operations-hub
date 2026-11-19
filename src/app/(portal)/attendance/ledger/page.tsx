import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LedgerNotes, LedgerSummary, SessionsTable, StudentMatrix } from "@/components/attendance-ledger";
import { PageHeader } from "@/components/ui";
import { ledgerFilterQuery, ledgerFilterText, type LedgerView } from "@/lib/attendance-ledger";
import { getAttendanceLedger } from "@/lib/attendance-ledger-data";
import { attendanceHref, attendanceId, attendanceLedgerHref, attendanceMarksHref, type AttendanceQuery } from "@/lib/attendance-selection";
import { fmtDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const linkStyle = "text-sm font-semibold text-[var(--color-pine)] underline underline-offset-4";
const fieldStyle = "min-h-11 rounded-md border border-[var(--color-line)] bg-[var(--color-sheet)] px-2 text-sm";

export default async function AttendanceLedgerPage({ searchParams }: { searchParams: Promise<AttendanceQuery> }) {
  const query = await searchParams;
  const termId = attendanceId(query.term), groupId = attendanceId(query.group);
  if (!termId || !groupId) notFound();
  const report = await getAttendanceLedger(termId, groupId, query);
  if (report.kind === "sign-in") redirect("/login");
  if (report.kind === "denied") redirect("/forbidden");
  if (report.kind !== "ledger") notFound();

  const { term, group, view, filters, invalid, teacherOptions, ledger, canOpenSessions } = report;
  const completed = term.status === "completed";
  const kept = ledgerFilterQuery(filters, term);
  const href = (next: LedgerView, path: "" | "/export" | "/print" = "") => attendanceLedgerHref(termId, groupId, { view: next === "sessions" ? undefined : next, ...kept }, path);
  const marksPhase = filters.phase === "all" ? "semester" : filters.phase;

  return <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
    <Link className={linkStyle} prefetch={false} href={completed ? attendanceMarksHref(termId) : attendanceHref({ group: groupId }, "attendance-group")}>
      {completed ? "Back to class groups" : "Back to attendance and roll-call"}
    </Link>
    <PageHeader context={`${term.name} · ${completed ? "Completed term · read-only" : "Working ledger"}`} title="Attendance ledger"
      actions={<>
        <Link prefetch={false} className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-pine)] px-3 text-sm font-semibold text-[var(--color-pine)]"
          href={href(view, "/print")}>Print {view === "sessions" ? "ledger" : "matrix"}</Link>
        <a className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-pine)] px-3 text-sm font-semibold text-[var(--color-pine)]"
          href={href(view, "/export")}>Download CSV</a>
      </>} />
    <div className="space-y-1">
      <p className="font-semibold">{group.courseCode} · {group.courseTitle}{group.audience && ` · ${group.audience}`}</p>
      <p className="text-sm text-muted">Group {group.id} · <Link className={linkStyle} prefetch={false} href={attendanceMarksHref(termId, groupId, marksPhase)}>Attendance marks</Link></p>
    </div>
    {invalid && <p role="status" className="ruled rounded-md p-3 text-sm">Some filters were invalid, so the whole term is shown. Choose filters from the form.</p>}

    <nav aria-label="Ledger view" className="flex flex-wrap gap-2">
      {(["sessions", "students"] as const).map(item => <Link key={item} href={href(item)} prefetch={false}
        aria-current={item === view ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold ${item === view
          ? "border-[var(--color-pine)] bg-pine-tint text-[var(--color-pine)]" : "border-[var(--color-line)] bg-[var(--color-sheet)]"}`}>
        {item === "sessions" ? "Sessions" : "Students"}
      </Link>)}
    </nav>

    <form method="get" action="/attendance/ledger" aria-label="Filter ledger" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="term" value={termId} /><input type="hidden" name="group" value={groupId} />
      {view !== "sessions" && <input type="hidden" name="view" value={view} />}
      <label className="grid gap-1 text-sm font-semibold">Phase
        <select name="phase" defaultValue={filters.phase} className={fieldStyle}>
          <option value="all">All phases</option><option value="midterm">Midterm</option><option value="final">Final</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">Teacher
        <select name="teacher" defaultValue={String(filters.teacher)} className={fieldStyle}>
          <option value="all">All teachers</option>
          {teacherOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">From
        <input type="date" name="from" defaultValue={filters.from} min={term.startDate} max={term.endDate} className={fieldStyle} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">To
        <input type="date" name="to" defaultValue={filters.to} min={term.startDate} max={term.endDate} className={fieldStyle} />
      </label>
      <button type="submit" className="min-h-11 rounded-md bg-[var(--color-pine)] px-4 text-sm font-semibold text-white">Apply filters</button>
      <Link className={`${linkStyle} min-h-11 content-center`} prefetch={false} href={attendanceLedgerHref(termId, groupId, { view: view === "sessions" ? undefined : view })}>Clear filters</Link>
    </form>
    <p className="text-sm text-muted">Showing {ledgerFilterText(filters, teacherOptions, fmtDate)}.</p>

    <LedgerSummary summary={ledger.summary} />
    <LedgerNotes summary={ledger.summary} />
    <section aria-labelledby="ledger-view" className="min-w-0 space-y-3">
      <h2 id="ledger-view" className="font-display text-lg font-semibold">{view === "sessions" ? "Sessions" : "Students"}</h2>
      {view === "sessions"
        ? <SessionsTable ledger={ledger} openHref={canOpenSessions ? sessionId => attendanceHref({ group: groupId, session: sessionId }, "roll-call") : undefined} />
        : <StudentMatrix ledger={ledger} studentHref={row => completed || !row.notOnRoster ? attendanceMarksHref(termId, groupId, marksPhase, row.id) : undefined} />}
      <p className="text-sm text-muted">Attendance = (present + late) ÷ (present + late + absent). Excused and not-captured students are not counted, and voided sessions are excluded from totals.</p>
    </section>
  </div>;
}
