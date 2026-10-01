import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyNote, Notice, PageHeader, Panel, StatCard, TableRegion } from "@/components/ui";
import { IndividualRoutineSheets, sheetDate } from "@/components/teacher-routine/sheet";
import { PrintRoutineButton } from "@/components/teacher-routine/print-button";
import type { RoutineChoice } from "@/lib/teacher-routine-data";
import { unitsText, type AgendaItem, type TeacherRoutine, type TeacherTable } from "@/lib/teacher-routine";
import { DAY_NAMES } from "@/lib/time";

const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} m`;

export interface TeacherRoutineScreenProps {
  routine: TeacherRoutine;
  kind: RoutineChoice;
  hasPublished: boolean;
  /** Page path the Published / Working draft links point at. */
  basePath: string;
  draftChanges: number;
  today: number;
  printedAt: string;
  context: string;
  intro: ReactNode;
  back?: ReactNode;
}

export function TeacherRoutineScreen({ routine, kind, hasPublished, basePath, draftChanges, today, printedAt, context, intro, back }: TeacherRoutineScreenProps) {
  const { teacher, source, figures } = routine;
  const nothing = routine.programs.length === 0;
  return (
    <div>
      <div className="no-print">
        {back}
        <PageHeader
          context={context}
          title={teacher.fullName}
          description={intro}
          actions={<>
            <SourceSwitch kind={kind} hasPublished={hasPublished} basePath={basePath} />
            <PrintRoutineButton />
          </>}
        />

        {kind === "published" && draftChanges > 0 ? (
          <Notice tone="warn" className="mb-4">
            The working draft changes {draftChanges === 1 ? "1 of these classes" : `${draftChanges} of these classes`}. Changes take effect only when a new version is published.{" "}
            <Link href={`${basePath}?source=draft`} className="font-semibold underline underline-offset-2">See the working draft</Link>
          </Notice>
        ) : null}
        {kind === "draft" ? (
          <Notice tone="info" className="mb-4">
            {hasPublished
              ? "This is the working draft. It is not official until it is published, and prints are marked as a draft."
              : "Nothing is published yet for this term, so this is the working draft. Prints are marked as a draft."}
          </Notice>
        ) : null}
        {teacher.status !== "active" ? <Notice tone="info" className="mb-4">This teacher record is {teacher.status.replaceAll("_", " ")}.</Notice> : null}

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total credit hours" value={unitsText(routine.credits.total)} sub="Theory 3, one-credit lab 2" />
          <StatCard label="Classes a week" value={figures.classes} sub={figures.days === 1 ? "On 1 day" : `Across ${figures.days} days`} />
          <StatCard label="Teaching time" value={hours(figures.minutes)} sub="Scheduled classes only" />
          <StatCard label="Courses" value={figures.courses} sub={routine.noFixedTime.length ? `Plus ${routine.noFixedTime.length} with no fixed time` : "With a fixed time"} />
        </div>

        <Panel title="Weekly routine" sub={source.kind === "published"
          ? `Publication v${source.versionNumber}, effective ${sheetDate(source.effectiveFrom) ?? "date not set"}`
          : "Working draft"} flush>
          {nothing ? (
            <div className="p-4"><EmptyNote>No classes with a fixed time in this routine.</EmptyNote></div>
          ) : (
            <>
              <div className="max-sm:hidden">
                {routine.programs.map((program) => (
                  <section key={program.key} aria-label={program.title} className="px-4 pb-4">
                    <div className="flex items-baseline justify-between gap-3 pb-2 pt-3.5">
                      <h3 className="font-display text-[15px] font-semibold">{program.title}</h3>
                      <span className="text-[12.5px] text-muted">{program.classCount === 1 ? "1 class" : `${program.classCount} classes`}</span>
                    </div>
                    <div className="space-y-3">
                      {program.tables.map((table) => <WeekTable key={table.key} table={table} label={`${program.title}, ${table.days.map((day) => DAY_NAMES[day.dayOfWeek]).join(" and ")}`} />)}
                    </div>
                  </section>
                ))}
              </div>
              <Agenda routine={routine} today={today} />
            </>
          )}
        </Panel>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <Panel title={`How the ${unitsText(routine.credits.total)} credit hours add up`} sub="Approved workload records for this term, as on the Workload page" actions={<Link href="/workload" className="text-[13px] font-medium text-[var(--color-pine)] underline-offset-2 hover:underline">Workload</Link>} flush>
            {routine.credits.items.length ? (
              <TableRegion label="Credit hours by course">
                <table className="ledger">
                  <thead><tr><th scope="col">Course</th><th scope="col">Batch</th><th scope="col" className="max-sm:hidden">Type</th><th scope="col" className="num">Credit hours</th></tr></thead>
                  <tbody>
                    {routine.credits.items.map((item) => (
                      <tr key={item.key}>
                        <td className="font-mono text-[12.5px] font-semibold">{item.code}</td>
                        <td>{item.audience}</td>
                        <td className="max-sm:hidden">{item.kind}</td>
                        <td className="num">{unitsText(item.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={2} className="font-semibold">Total</td><td className="max-sm:hidden" /><td className="num font-semibold">{unitsText(routine.credits.total)}</td></tr></tfoot>
                </table>
              </TableRegion>
            ) : <div className="p-4"><EmptyNote>No approved workload records for this teacher in this term.</EmptyNote></div>}
          </Panel>

          <div className="space-y-5">
            <Panel title="No fixed time">
              {routine.noFixedTime.length ? (
                <ul className="divide-y divide-[var(--color-line-soft)] text-[13.5px]">
                  {routine.noFixedTime.map((item) => (
                    <li key={item.key} className="py-2 first:pt-0 last:pb-0">
                      <span className="font-mono text-[12.5px] font-semibold">{item.code}</span> {item.title} · {item.audience}
                      <span className="block text-[12.5px] text-muted">Arranged by the teacher with the students.</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-muted">None.</p>}
            </Panel>
            <Panel title="Other departments">
              {routine.otherDepartments.length ? (
                <ul className="divide-y divide-[var(--color-line-soft)] text-[13.5px]">
                  {routine.otherDepartments.map((item) => (
                    <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                      {item.course ? <span className="font-mono text-[12.5px] font-semibold">{item.course} </span> : null}
                      Department of {item.department}
                      {item.dayOfWeek != null ? ` · ${DAY_NAMES[item.dayOfWeek]}` : ""}{item.time ? ` ${item.time}` : ""}{item.room ? ` · ${item.room}` : ""}
                      <span className="block text-[12.5px] text-muted">{item.verified ? "Verified." : `Not yet verified (${item.status.replaceAll("_", " ")}).`}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-muted">None recorded.</p>}
            </Panel>
          </div>
        </div>
      </div>

      <div className="teacher-routine-print-only">
        <div className="teacher-routine-sheets">
          <IndividualRoutineSheets routine={routine} printedAt={printedAt} />
        </div>
      </div>
    </div>
  );
}

function SourceSwitch({ kind, hasPublished, basePath }: { kind: RoutineChoice; hasPublished: boolean; basePath: string }) {
  const item = "inline-flex min-h-8 items-center whitespace-nowrap rounded-[5px] px-3 text-[13px] font-medium";
  return (
    <nav aria-label="Which routine" className="inline-flex rounded-[7px] border border-[var(--color-line)] bg-sheet p-0.5 max-sm:w-full">
      {hasPublished ? (
        <Link href={`${basePath}?source=published`} aria-current={kind === "published" ? "page" : undefined}
          className={`${item} max-sm:flex-1 max-sm:justify-center ${kind === "published" ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>Published</Link>
      ) : (
        <span aria-disabled="true" className={`${item} max-sm:flex-1 max-sm:justify-center text-muted`}>Not published yet</span>
      )}
      <Link href={`${basePath}?source=draft`} aria-current={kind === "draft" ? "page" : undefined}
        className={`${item} max-sm:flex-1 max-sm:justify-center ${kind === "draft" ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>Working draft</Link>
    </nav>
  );
}

function WeekTable({ table, label }: { table: TeacherTable; label: string }) {
  return (
    <TableRegion label={label}>
      <table className="teacher-week">
        <colgroup>
          <col className="teacher-week-day" />
          <col className="teacher-week-batch" />
          {table.periods.map((period) => <col key={period.start} />)}
          {table.otherTimes ? <col /> : null}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Batch</th>
            {table.periods.map((period) => <th key={period.start} scope="col" className="font-mono">{period.label}</th>)}
            {table.otherTimes ? <th scope="col">Other times</th> : null}
          </tr>
        </thead>
        <tbody>
          {table.days.map((day) => day.rows.map((row, rowIndex) => (
            <tr key={`${day.dayOfWeek}-${row.batchLabel}-${row.moreBatches.join("+")}`}>
              {rowIndex === 0 ? <th scope="rowgroup" rowSpan={day.rows.length} className="teacher-week-dayname">{DAY_NAMES[day.dayOfWeek]}</th> : null}
              <th scope="row" className="teacher-week-batchname">
                {row.batchLabel}
                {row.moreBatches.map((label) => <small key={label}>+ {label}</small>)}
              </th>
              {row.cells.map((cell, index) => (
                <td key={index} colSpan={cell.span > 1 ? cell.span : undefined} className={cell.classes.length ? "teacher-week-class" : undefined}>
                  {cell.classes.map((item) => (
                    <div key={item.meetingId} title={item.title}>
                      <b>{item.code}</b>
                      <span>{item.rooms}{item.note ? <em> · {item.note}</em> : null}</span>
                      {item.time ? <i>{item.time}</i> : null}
                      {item.coTeachers.length ? <i>with {item.coTeachers.join(", ")}</i> : null}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          )))}
        </tbody>
      </table>
    </TableRegion>
  );
}

/** Phone view: the same classes day by day, starting today. */
function Agenda({ routine, today }: { routine: TeacherRoutine; today: number }) {
  const order = Array.from({ length: 7 }, (_, index) => (today + index) % 7);
  const days = order.filter((day) => day === today || routine.teachingDays.includes(day) || routine.agenda.some((item) => item.dayOfWeek === day));
  return (
    <div className="sm:hidden">
      {days.map((day) => {
        const items = routine.agenda.filter((item) => item.dayOfWeek === day);
        return (
          <section key={day} aria-label={DAY_NAMES[day]} className="border-t border-[var(--color-line)] px-4 py-3 first:border-t-0">
            <h3 className="font-display flex items-baseline gap-2 text-[15px] font-semibold">
              {DAY_NAMES[day]}
              {day === today ? <span className="rounded bg-pine-tint px-1.5 text-[11.5px] font-semibold text-[var(--color-pine)]">Today</span> : null}
            </h3>
            {items.length ? (
              <ol className="mt-1 divide-y divide-[var(--color-line-soft)]">
                {items.map((item) => <AgendaRow key={item.key} item={item} />)}
              </ol>
            ) : <p className="mt-1 text-[13px] text-muted">No classes.</p>}
          </section>
        );
      })}
    </div>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 py-2">
      <span className="font-mono text-[12.5px] leading-snug text-ink-2">
        {item.time.includes(" – ") ? <>{item.time.split(" – ")[0]} –<br />{item.time.split(" – ")[1]}</> : item.time}
      </span>
      <div className="min-w-0 text-[13px]">
        <span className="font-mono font-semibold text-[var(--color-pine)]">{item.code}</span> · {item.audience}
        <span className="block text-ink-2">{item.rooms}{item.note ? ` · ${item.note.toLowerCase()}` : ""}</span>
        {item.coTeachers.length ? <span className="block text-[12px] text-gold-text">with {item.coTeachers.join(", ")}</span> : null}
      </div>
    </li>
  );
}
