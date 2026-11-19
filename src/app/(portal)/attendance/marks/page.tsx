import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import {
  ATTENDANCE_CALCULATION, ATTENDANCE_PHASES, ATTENDANCE_PHASE_LABELS, type AttendancePhase,
} from "@/lib/attendance";
import { isUnsubmitted, stateLabel } from "@/lib/attendance-lifecycle";
import { getAttendanceMarks } from "@/lib/attendance-marks";
import { attendanceHref, attendanceId, attendanceMarksHref as marksHref, type AttendanceQuery } from "@/lib/attendance-selection";
import { versionLabel } from "@/lib/policy-versions";
import { fmtDate, fmtRange } from "@/lib/time";

const linkStyle = "text-sm font-semibold text-[var(--color-pine)] underline underline-offset-4";

const percentageText = (percentage: number | null) => percentage == null ? "—" : `${percentage.toFixed(1)}%`;
const markText = (mark: number | null, maximum: number | null) => mark == null ? "Mark unavailable" : `${mark.toFixed(2)} / ${maximum}`;

export default async function AttendanceMarksPage({ searchParams }: { searchParams: Promise<AttendanceQuery> }) {
  const query = await searchParams;
  const termId = attendanceId(query.term);
  const groupId = attendanceId(query.group);
  const studentId = attendanceId(query.student);
  const phase = query.phase ?? "semester";
  if (!termId || (query.group !== undefined && !groupId) || (query.student !== undefined && (!studentId || !groupId))
    || !ATTENDANCE_PHASES.includes(phase as AttendancePhase)) notFound();
  const selectedPhase = phase as AttendancePhase;
  const report = await getAttendanceMarks({ termId, groupId, studentId, phase: selectedPhase });
  if (report.kind === "sign-in") redirect("/login");
  if (report.kind === "denied") redirect("/forbidden");
  if (report.kind === "missing") notFound();

  if (report.kind === "groups") return <div className="space-y-4">
    <Link className={linkStyle} href={`/terms/${termId}`}>Back to term</Link>
    <PageHeader context={report.term.name} title="Attendance marks" />
    <section className="ruled rounded-lg p-4" aria-labelledby="attendance-marks-groups">
      <h2 id="attendance-marks-groups" className="font-display text-lg font-semibold">Choose a class group</h2>
      {report.groups.length ? <ul className="divide-y divide-[var(--color-line)]">
        {report.groups.map(group => <li key={group.id} className="py-3 [overflow-wrap:anywhere]">
          <Link className={linkStyle} prefetch={false} href={marksHref(termId, group.id)}>
            {group.courseCode} · {group.courseTitle} · {group.audience || "Group"} #{group.id}
          </Link>
        </li>)}
      </ul> : <p className="mt-2 text-sm">No class groups with attendance access are available for this term.</p>}
    </section>
  </div>;

  const { term, group, rows, maximum, version, evaluationDate, effectiveFrom, provisional, evidence } = report;
  const completed = term.status === "completed";
  const phaseLabel = ATTENDANCE_PHASE_LABELS[selectedPhase];
  const student = studentId === undefined ? undefined : rows[0];
  const returnHref = student ? marksHref(termId, group.id, selectedPhase)
    : completed ? marksHref(termId) : attendanceHref({ group: group.id }, "attendance-group");

  return <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
    <Link className={linkStyle} href={returnHref}>
      {student ? `Back to ${phaseLabel.toLowerCase()} marks` : completed ? "Back to class groups" : "Back to attendance and roll-call"}
    </Link>
    <PageHeader context={`${term.name} · ${completed ? "Completed term" : "Working marks"}`}
      title={student ? student.name : `${phaseLabel} attendance marks`} />
    <div className="space-y-1">
      <p className="font-semibold">{group.courseCode} · {group.courseTitle}{group.audience && ` · ${group.audience}`}</p>
      <p className="text-sm text-muted">
        {group.courseType === "sessional" ? "Lab / sessional" : "Theory"} · {version == null
          ? "Mark unavailable because this term has no recorded policy."
          : `Out of ${maximum} · ${versionLabel(version)} effective ${fmtDate(effectiveFrom)} · evaluated ${fmtDate(evaluationDate)}`}
      </p>
    </div>
    <nav aria-label="Attendance phase" className="flex flex-wrap gap-2">
      {ATTENDANCE_PHASES.map(item => <Link key={item} href={marksHref(termId, group.id, item, studentId)} prefetch={false}
        aria-current={item === selectedPhase ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold ${item === selectedPhase
          ? "border-[var(--color-pine)] bg-pine-tint text-[var(--color-pine)]" : "border-[var(--color-line)] bg-white"}`}>
        {ATTENDANCE_PHASE_LABELS[item]}
      </Link>)}
    </nav>
    {selectedPhase !== "semester" && <p className="text-sm text-muted">Phase marks are progress estimates out of the term maximum. The semester uses the combined counts.</p>}
    {provisional > 0 && <p className="rounded-md border border-[var(--color-gold)] bg-gold-tint p-3 text-sm">
      Includes {provisional} draft or reopened {provisional === 1 ? "session" : "sessions"} in this view.
    </p>}
    <p className="text-sm text-muted">{ATTENDANCE_CALCULATION}</p>
    {student ? <>
      <section aria-labelledby="mark-calculation" className="ruled rounded-lg p-4">
        <h2 id="mark-calculation" className="font-display text-lg font-semibold">Mark calculation</h2>
        <p className="text-sm text-muted">{student.code} · {phaseLabel}</p>
        <p className="mt-2">{student.attended} attended / {student.total} eligible · {percentageText(student.percentage)} · <strong>{markText(student.mark, maximum)}</strong></p>
        {student.total === 0 ? <p className="text-sm">No eligible sessions. The calculation contributes zero when a policy is recorded.</p>
          : maximum != null && <p className="text-sm">{student.attended} ÷ {student.total} × {maximum} = {student.mark?.toFixed(2)} after rounding.</p>}
      </section>
      <section aria-labelledby="dated-sessions" className="ruled rounded-lg p-4">
        <h2 id="dated-sessions" className="font-display text-lg font-semibold">Dated sessions</h2>
        {evidence.length ? <ul className="divide-y divide-[var(--color-line)]">
          {evidence.map(session => <li className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(9rem,1fr)_1fr_1fr]" key={session.sessionId}>
            <strong>{fmtDate(session.date)}{session.startMinutes != null && session.endMinutes != null
              && ` · ${fmtRange(session.startMinutes, session.endMinutes)}`}</strong>
            <span className="capitalize">{session.phase} · {session.recordedStatus ?? "Uncaptured"} · {stateLabel(session.state)}
              {session.total > 0 && isUnsubmitted(session.state) && " (provisional)"}</span>
            <span>{session.total === 0 ? "Excluded · " : ""}{session.explanation}</span>
          </li>)}
        </ul> : <p className="mt-2 text-sm">No dated sessions in this view.</p>}
      </section>
    </> : <section aria-labelledby="student-marks" className="ruled rounded-lg p-4">
      <h2 id="student-marks" className="font-display text-lg font-semibold">Student marks</h2>
      {!report.sessionCount && <p className="mt-2 text-sm text-muted">No dated sessions in this view.</p>}
      {rows.length ? <ul className="divide-y divide-[var(--color-line)]">
        {rows.map(row => <li key={row.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
          <div><Link className={linkStyle} prefetch={false} href={marksHref(termId, group.id, selectedPhase, row.id)}>{row.name}</Link>
            <p className="text-xs text-muted">{row.code}</p></div>
          <p>{row.attended} / {row.total} eligible{row.total === 0 && <span className="block text-xs text-muted">No eligible sessions</span>}</p>
          <p><span className="text-muted">Attendance </span>{percentageText(row.percentage)}</p>
          <p><span className="text-muted">Mark </span><strong>{markText(row.mark, maximum)}</strong></p>
        </li>)}
      </ul> : <p className="mt-2 text-sm">No students with attendance evidence or enrollment in this group.</p>}
    </section>}
  </div>;
}
