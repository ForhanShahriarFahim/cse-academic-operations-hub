import { Fragment } from "react";
import { AlertTriangle, Asterisk, Clock3, Landmark } from "lucide-react";
import { INSTITUTION } from "@/lib/constants";
import type { ProjectedMeeting, ProjectedSlot, RoutineDayGroup, RoutineDayProjection, RoutineProjection } from "@/lib/routine-projection";
import { sharingLabel } from "@/lib/serialize";
import { DAY_NAMES, DAY_SHORT, fmtDate, fmtRange, fmtRange24, overlaps } from "@/lib/time";

export function RoutineDocument({
  projection,
  printOnly = false,
}: {
  projection: RoutineProjection;
  printOnly?: boolean;
}) {
  const { source, selection } = projection;
  return (
    <div className={`${printOnly ? "print-only" : ""} space-y-5`}>
      {projection.days.map((day, dayIndex) => (
        <section key={day.dayOfWeek} className="routine-print-day print-surface rounded-lg border border-[var(--color-line)] bg-sheet shadow-sm"
          aria-labelledby={`routine-day-${day.dayOfWeek}`}>
          <header className="border-b-2 border-[var(--color-pine)] px-6 pb-4 pt-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--color-pine)] text-[var(--color-pine)]">
              <Landmark size={23} strokeWidth={1.6} />
            </div>
            <h1 className="font-display text-[20px] font-bold tracking-tight text-[var(--color-ink)]">{INSTITUTION.universityName}</h1>
            <p className="mt-0.5 text-[12px] font-medium text-ink-2">{INSTITUTION.departmentName}</p>
            <h2 id={`routine-day-${day.dayOfWeek}`} className="mt-2 text-[13px] font-semibold tracking-wide text-[var(--color-pine)]">
              Class Routine — {INSTITUTION.programme} ({selection.stream === "HSC" ? "HSC Stream" : "Diploma Stream"}) — {DAY_NAMES[day.dayOfWeek]}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {source.termName} · {DAY_NAMES[day.dayOfWeek]} · Effective {fmtDate(source.effectiveFrom)} · {source.kind === "draft" ? "DRAFT — NOT OFFICIAL" : `Publication v${source.versionNumber}`}
            </p>
            {source.kind === "draft" && (
              <p className="mx-auto mt-2 w-fit rounded bg-[var(--color-clay)] px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-white">DRAFT — NOT OFFICIAL</p>
            )}
            {source.legacyContext && (
              <p className="mx-auto mt-2 max-w-2xl rounded border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-1.5 text-[10px] text-gold-text">
                Legacy publication context: meetings are immutable; supporting batch, break and OD context predates snapshot v2.
              </p>
            )}
          </header>

          <div role="region" aria-label="Routine table" tabIndex={0} className="table-region hidden overflow-x-auto md:block print:block">
            {day.groups.length === 0 && (
              <p className="p-8 text-center text-[11px] text-muted">No periods are set for this day.</p>
            )}
            {day.groups.map((group, groupIndex) => (
              <GroupTable key={group.key} group={group} day={day} showLabel={day.groups.length > 1} withBookings={groupIndex === 0} />
            ))}
          </div>

          <div className="px-4 py-4 md:hidden print:hidden">
            {day.groups.flatMap((group) => group.rows).map((row) => {
              const items = uniqueMeetings([row.offGrid, ...row.slots.map((slot) => slot.meetings)]);
              return <div key={row.batch.id} className="mb-3 last:mb-0">
                <p className="font-mono text-[12px] font-bold text-[var(--color-pine)]">{row.batch.stream === "HSC" ? "HSC" : "DIP"}-{row.batch.label}</p>
                {items.length === 0 ? <p className="mt-1 text-[10.5px] text-muted">No classes</p> : <ul className="mt-1 space-y-1.5">{items.map((item) => (
                  <li key={item.meeting.id} className="rounded-md border border-[var(--color-line-soft)] bg-white px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-mono font-semibold">{item.meeting.courseCode}</span> · <span className="font-mono text-[var(--color-pine)]">{fmtRange(item.meeting.startMinutes, item.meeting.endMinutes)}</span>
                    <span className="block text-[10.5px] text-muted">{item.meeting.teachers.map((teacher) => teacher.shortCode).join("+") || "UT"} · {item.meeting.rooms.map((room) => room.code).join("/") || "Room pending"}</span>
                  </li>
                ))}</ul>}
              </div>;
            })}
          </div>

          <footer className="border-t border-[var(--color-line)] px-6 py-4">
            <div className="grid gap-2 text-[9.5px] leading-relaxed text-muted md:grid-cols-2 print:grid-cols-2">
              <p>* Exact/custom times are authoritative even when they differ from a display column.</p>
              <p>Shared labels denote one canonical physical class serving multiple audiences.</p>
              <p>Validation: {projection.issueCount.blockers} blockers · {projection.issueCount.warnings} advisories.</p>
              <p>Generated {new Date(source.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: INSTITUTION.timeZone })}.</p>
            </div>
            <div className="mt-7 grid grid-cols-3 gap-6 text-center text-[10px] text-ink-2">
              {["Course Coordinator, CSE", "Head, Dept. of CSE", "Registrar"].map((role) => <div key={role} className="min-w-0"><div className="mx-auto mb-1 h-px w-full max-w-36 bg-[#9a947e]" /><p className="font-semibold">{role}</p></div>)}
            </div>
          </footer>
          {dayIndex < projection.days.length - 1 && <div className="no-print h-1" />}
        </section>
      ))}
    </div>
  );
}

function GroupTable({ group, day, showLabel, withBookings }: {
  group: RoutineDayGroup;
  day: RoutineDayProjection;
  showLabel: boolean;
  withBookings: boolean;
}) {
  const slots = group.slots;
  const breaksAfter = (index: number) => group.breaks.filter((item) => item.afterSlot === index);
  return (
    <table className="routine-table text-[11px]">
      {showLabel && (
        <caption className="routine-group-caption px-2 pb-1 pt-3 text-left text-[10.5px] font-semibold text-[var(--color-ink)]">
          {group.name}
          <span className="ml-2 font-normal text-muted">{group.rows.map((row) => `${row.batch.stream === "HSC" ? "HSC" : "DIP"}-${row.batch.label}`).join(" · ")}</span>
        </caption>
      )}
      <thead><tr>
        <th className="w-[72px] px-2 py-2 text-left"><span className="micro-label">Batch</span></th>
        <th className="w-[104px] px-2 py-2 text-left"><span className="micro-label">Custom</span></th>
        {slots.map((slot, index) => (
          <Fragment key={slot.start}>
            <th className="min-w-[116px] px-2 py-2 text-center">
              <span className="font-mono text-[11px] font-semibold text-[var(--color-pine)]">{fmtRange24(slot.start, slot.end)}</span>
              <span className="block text-[9px] font-normal text-muted">{fmtRange(slot.start, slot.end)}</span>
            </th>
            {breaksAfter(index).map((item) => (
              <th key={item.id} className="break-column w-[30px] px-0 py-2 text-center">
                <span className="inline-block rotate-180 text-[8px] font-bold uppercase tracking-[0.16em] text-muted [writing-mode:vertical-rl]">{item.name}</span>
              </th>
            ))}
          </Fragment>
        ))}
      </tr></thead>
      <tbody>
        {group.rows.map((row, rowIndex) => (
          <tr key={row.batch.id} className={rowIndex % 2 ? "bg-wash" : "bg-sheet"}>
            <td className="px-2 py-1.5">
              <p className="font-mono text-[11.5px] font-bold">{row.batch.stream === "HSC" ? "HSC" : "DIP"}-{row.batch.label}</p>
              <p className="text-[9px] text-muted">{row.unplanned ? "No classes planned this day" : `Semester ${row.batch.semester ?? "?"}`}</p>
            </td>
            <td className="px-1.5 py-1.5">{row.offGrid.map((item) => <RoutineMeeting key={item.meeting.id} item={item} />)}</td>
            {row.slots.map((slot, index) => (
              <Fragment key={slot.start}>
                <td className="px-1.5 py-1.5 align-top">
                  {slot.meetings.map((item) => <RoutineMeeting key={item.meeting.id} item={item} slot={slot} />)}
                  {slot.continuations.map((item) => <p key={item.meeting.id} className="mt-1 text-[8px] italic text-muted">◂ {item.meeting.courseCode} continues</p>)}
                </td>
                {breaksAfter(index).map((item) => <td key={item.id} className="break-column w-[30px]" />)}
              </Fragment>
            ))}
          </tr>
        ))}
        {group.rows.length === 0 && (
          <tr><td colSpan={slots.length + 2} className="p-8 text-center text-[11px] text-muted">No batches match this selection.</td></tr>
        )}
        {withBookings && (
          <tr className="bg-wash">
            <td className="px-2 py-1.5"><p className="font-mono text-[11px] font-bold text-[var(--color-clay)]">OD</p><p className="text-[8px] text-muted">Other Depts.</p></td>
            <td className="px-1.5 py-1.5">
              {day.externals.filter((item) => !slots.some((slot) => overlaps(item.startMinutes!, item.endMinutes!, slot.start, slot.end))).map((item) => <ExternalChip key={item.id} item={item} />)}
            </td>
            {slots.map((slot, index) => (
              <Fragment key={slot.start}>
                <td className="px-1.5 py-1.5 align-top">
                  {day.externals.filter((item) => overlaps(item.startMinutes!, item.endMinutes!, slot.start, slot.end)).map((item) => <ExternalChip key={item.id} item={item} />)}
                </td>
                {breaksAfter(index).map((item) => <td key={item.id} className="break-column w-[30px]" />)}
              </Fragment>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function uniqueMeetings(groups: ProjectedMeeting[][]): ProjectedMeeting[] {
  const map = new Map<number, ProjectedMeeting>();
  for (const group of groups) for (const item of group) map.set(item.meeting.id, item);
  return [...map.values()].sort((a, b) => a.meeting.startMinutes - b.meeting.startMinutes || a.meeting.id - b.meeting.id);
}

function RoutineMeeting({ item, slot }: { item: ProjectedMeeting; slot?: ProjectedSlot }) {
  const meeting = item.meeting;
  const shared = sharingLabel(meeting);
  const custom = meeting.customTimeLabel != null || !slot || meeting.startMinutes !== slot.start || meeting.endMinutes !== slot.end;
  return <div className={`mb-1 rounded border px-1.5 py-1 last:mb-0 ${item.validationStatus === "blocker" ? "border-[var(--color-clay)] bg-[var(--color-clay)]/[0.06]" : shared ? "border-[var(--color-gold)]/40 bg-[var(--color-gold)]/[0.06]" : "border-[var(--color-line)] bg-white"}`}>
    <p className="flex items-center gap-1"><span className="font-mono text-[10.5px] font-bold">{meeting.courseCode}</span>{meeting.isException && <Asterisk size={9} className="text-gold-text" />}{item.validationStatus !== "clear" && <AlertTriangle size={9} className={item.validationStatus === "blocker" ? "text-[var(--color-clay)]" : "text-gold-text"} />}</p>
    <p className="font-mono text-[9px] text-ink-2">{meeting.teachers.map((teacher) => teacher.shortCode).join("+") || "UT"} · {meeting.rooms.map((room) => room.code).join("/") || "—"}</p>
    {shared && <p className="text-[8px] font-semibold text-gold-text">{shared}</p>}
    {custom && <p className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-[var(--color-pine)]/10 px-1 text-[8px] font-bold text-[var(--color-pine)]"><Clock3 size={8} /> {meeting.customTimeLabel ?? fmtRange(meeting.startMinutes, meeting.endMinutes)}</p>}
  </div>;
}

function ExternalChip({ item }: { item: RoutineProjection["days"][number]["externals"][number] }) {
  return <div className="mb-1 rounded border border-[var(--color-clay)]/25 bg-white/70 px-1.5 py-1 text-[9px] last:mb-0">
    <b className="font-mono text-[var(--color-clay)]">{item.counterpartDepartment}</b> — {item.kind === "room_reservation" ? `room ${item.roomCode ?? "?"}` : item.teacherShortCode ?? item.roomCode ?? "details pending"}
    <span className="block font-mono text-[8px] text-muted">{fmtRange(item.startMinutes!, item.endMinutes!)}</span>
  </div>;
}
