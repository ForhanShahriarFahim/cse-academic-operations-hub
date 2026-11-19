import Link from "next/link";
import { redirect } from "next/navigation";
import { TermWriteProvider } from "@/components/term-write-context";
import { AttendanceManager } from "@/components/attendance-manager";
import { AttendanceFilters, AttendanceFocus, AttendanceLinkPending } from "@/components/attendance-navigation";
import { PageHeader } from "@/components/ui";
import { getAttendanceData } from "@/lib/academic-operations";
import { attendanceDirectory, attendanceEntry, attendanceSlotKey, attendanceToday, todayAttendanceSessions } from "@/lib/attendance-directory";
import { attendanceHref, attendanceId, attendanceLedgerHref, attendanceMarksHref, exactSlotSession, resolveAttendance, type AttendanceGroup, type AttendanceQuery } from "@/lib/attendance-selection";
import { requireActor } from "@/lib/auth";
import { getPortalData } from "@/lib/data";
import { rosterOutputQuery } from "@/lib/roster-output-links";
import { assertTermContext } from "@/lib/term-context";
import { fmtDate, fmtRange } from "@/lib/time";

export const dynamic = "force-dynamic";

const linkStyle = "text-sm font-semibold text-[var(--color-pine)] underline underline-offset-4";
const openStyle = "inline-flex min-h-11 items-center rounded-md border border-[var(--color-pine)] px-3 py-2 text-sm font-semibold text-[var(--color-pine)]";
const groupLabel = (group: AttendanceGroup) => `${group.courseCode} · ${group.courseTitle}`;

function GroupName({ group }: { group: AttendanceGroup }) {
  return <div className="min-w-0 [overflow-wrap:anywhere]">
    <strong>{groupLabel(group)}</strong>
    <p className="text-sm text-muted">{group.audience}</p>
  </div>;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<AttendanceQuery> }) {
  const query = await searchParams;
  const data = await getPortalData();
  const actor = await requireActor();
  const now = new Date();
  const access = attendanceEntry(actor, now);
  if (!access.teacher && !access.administrator) redirect("/forbidden");
  const { departments, batches, groups } = await attendanceDirectory(data, actor, now);
  const selection = resolveAttendance(query, access.teacher, departments, batches, groups);
  const source = selection.selected ? await getAttendanceData(selection.selected.id, { data, actor }) : null;
  const selected = source?.selectedGroup ? selection.selected : undefined;
  const today = access.teacher && ((!selected && selection.view === "mine") || query.slot !== undefined)
    ? attendanceToday(data, actor.teacherId, groups, now) : null;
  const slot = today?.slots.find(item => item.teachingGroupId === selected?.id
    && attendanceSlotKey(today.date, item) === query.slot);
  const sessionId = attendanceId(query.session);
  const explicitSession = source?.sessions.find(session => session.id === sessionId);
  const sessionUnavailable = query.session !== undefined && (!explicitSession || query.slot !== undefined);
  const slotUnavailable = query.slot !== undefined && !slot;
  const initialSessionId = sessionUnavailable || query.slot !== undefined ? 0 : explicitSession?.id;
  const todaySessions = today && !selected && selection.view === "mine"
    ? await todayAttendanceSessions(data.term.id, today.date, [...new Set(today.slots.map(item => item.teachingGroupId))]) : [];
  await assertTermContext(data.writeContext);

  const myClasses = <Link className={linkStyle} href="/attendance?view=mine" prefetch={false}>My classes<AttendanceLinkPending /></Link>;
  const findCourse = <Link className={linkStyle} href={attendanceHref({ view: "find", ...selection.filters })} prefetch={false}>
    {selected ? "Change group" : "Find a course"}<AttendanceLinkPending />
  </Link>;
  const focusTarget = slot ? "attendance-sessions" : explicitSession && !sessionUnavailable ? "roll-call" : "attendance-group";

  return <div className="min-w-0 space-y-4">
    <PageHeader context={`Classes · ${data.term.name}`} title="Attendance" />
    {selection.badFilters && <p role="status" className="ruled rounded-md p-3 text-sm">
      Some course choices are unavailable. Choose from the available filters.
    </p>}
    {(selection.badGroup || (selection.selected && !selected) || (!selected && (query.session !== undefined || query.slot !== undefined))) &&
      <p role="status" className="ruled rounded-md p-3 text-sm">This attendance link is unavailable. Choose a class or find a course.</p>}
    {selected && source?.selectedGroup ? <>
      <nav aria-label="Attendance views" className="flex flex-wrap gap-4">
        {access.teacher && myClasses}{findCourse}
        <Link className={linkStyle} prefetch={false} href={attendanceMarksHref(data.term.id, selected.id)}>Attendance marks</Link>
        <Link className={linkStyle} prefetch={false} href={attendanceLedgerHref(data.term.id, selected.id)}>Attendance ledger</Link>
      </nav>
      <div id="attendance-group" tabIndex={-1} className="min-w-0 scroll-mt-20 [overflow-wrap:anywhere]">
        <h2 className="font-display text-2xl font-semibold">{groupLabel(selected)}</h2>
        <p className="mt-1 text-sm text-muted">{data.term.name} · {selected.audience}</p>
      </div>
      {slot && !sessionUnavailable && <p role="status" className="ruled rounded-md p-3 text-sm">
        Weekly routine slot · {fmtDate(today?.date)} · {fmtRange(slot.startMinutes, slot.endMinutes)}. Choose a dated session or create one.
      </p>}
      {(sessionUnavailable || slotUnavailable) && <p role="status" className="ruled rounded-md p-3 text-sm">
        This attendance session or routine slot is unavailable. Choose a dated session.
      </p>}
      <TermWriteProvider value={data.writeContext}>
        <AttendanceManager key={`${data.writeContext.generation}:${selected.id}:${query.session ?? ""}:${query.slot ?? ""}`}
          selectedGroup={source.selectedGroup}
          teachers={data.teachers.filter(teacher => source.selectedGroup?.teacherIds.includes(teacher.id))
            .map(({ id, shortCode, fullName }) => ({ id, shortCode, fullName }))}
          roster={source.roster} sessions={source.sessions} summaries={source.summaries} maximum={source.maximum} maximumVersion={source.maximumVersion}
          termStart={data.term.startDate} termEnd={data.term.endDate}
          canManageRosters={source.canManageRosters} canTakeAttendance={source.canTakeAttendance} canReviewAttendance={source.canReviewAttendance} unsubmitted={source.unsubmitted}
          initialSessionId={initialSessionId}
          rollCallHref={source.canManageRosters || source.canTakeAttendance
            ? `/attendance/roster/print?${rosterOutputQuery(selected.id, data.writeContext)}` : undefined} />
      </TermWriteProvider>
      <AttendanceFocus key={`${selected.id}:${query.session ?? ""}:${query.slot ?? ""}`} target={focusTarget} />
    </> : selection.view === "mine" && today ? <section className="ruled min-w-0 space-y-4 rounded-lg p-4" aria-labelledby="my-classes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-classes" className="font-display text-xl font-semibold">My classes</h2>{findCourse}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">Today&apos;s classes</h3>
        <p className="text-sm text-muted">{fmtDate(today.date)} · Dhaka · {today.published ? "Published weekly routine" : "Working draft · Weekly routine"}</p>
        <p className="text-sm text-muted">Check for holidays and timetable changes before taking attendance.</p>
        {today.slots.length ? <ul className="divide-y divide-[var(--color-line)]">
          {today.slots.map(item => {
            const group = groups.find(group => group.id === item.teachingGroupId)!;
            const match = exactSlotSession(todaySessions, item);
            const time = fmtRange(item.startMinutes, item.endMinutes);
            const label = match ? "Open roll-call" : "Open class";
            return <li key={item.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(8rem,auto)_1fr_auto] sm:items-center">
              <div className="text-sm">{time}{item.rooms.length > 0 && <p className="text-muted">{item.rooms.map(room => room.code).join(" / ")}</p>}</div>
              <GroupName group={group} />
              <Link className={`${openStyle} justify-self-start`} prefetch={false}
                aria-label={`${label} for ${groupLabel(group)} at ${time}`}
                href={match ? attendanceHref({ group: group.id, session: match.id }, "roll-call")
                  : attendanceHref({ group: group.id, slot: attendanceSlotKey(today.date, item) }, "attendance-sessions")}>
                {label}<AttendanceLinkPending />
              </Link>
            </li>;
          })}
        </ul> : <p className="mt-2 text-sm">No classes on today&apos;s weekly routine. Check All my classes below.</p>}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">All my classes</h3>
        {groups.some(group => group.assigned) ? <ul className="divide-y divide-[var(--color-line)]">
          {groups.filter(group => group.assigned).map(group => <li key={group.id} className="py-2">
            <Link className={linkStyle} prefetch={false} href={attendanceHref({ group: group.id })}>
              <GroupName group={group} /><AttendanceLinkPending />
            </Link>
          </li>)}
        </ul> : <p className="mt-2 text-sm">You have no assigned teaching groups with attendance access in this term.</p>}
      </div>
    </section> : <section className="ruled min-w-0 space-y-4 rounded-lg p-4" aria-labelledby="find-course">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="find-course" className="font-display text-xl font-semibold">Find a course</h2>{access.teacher && myClasses}
      </div>
      <AttendanceFilters filters={selection.filters} options={selection.options} />
      {selection.matches.length ? <div>
        <h3 className="font-display text-lg font-semibold">Course / teaching group</h3>
        <ul className="divide-y divide-[var(--color-line)]">
          {selection.matches.map(group => {
            const duplicate = selection.matches.some(other => other.id !== group.id
              && groupLabel(other) === groupLabel(group) && other.audience === group.audience);
            return <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0"><GroupName group={group} />{duplicate && <p className="text-sm text-muted">Group {group.id}</p>}</div>
              <Link className={openStyle} prefetch={false} aria-label={`Open group for ${groupLabel(group)} · ${group.audience}${duplicate ? ` · Group ${group.id}` : ""}`}
                href={attendanceHref({ view: "find", ...selection.filters, group: group.id })}>Open group<AttendanceLinkPending /></Link>
            </li>;
          })}
        </ul>
      </div> : <p role="status" className="text-sm">
        {selection.filters.batch ? (selection.offered ? "No teaching groups with attendance access for this selection." : "No course offerings in this batch.")
          : departments.length === 0 ? "No teaching groups with attendance access are available in this term."
          : selection.filters.department && selection.options.stream.length === 0 ? "No course offerings are available in this department."
          : "Choose a department, stream and batch to find a course."}
      </p>}
    </section>}
  </div>;
}
