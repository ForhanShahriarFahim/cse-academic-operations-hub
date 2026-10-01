import { INSTITUTION } from "@/lib/constants";
import { teacherSheetLayout, type SheetTablePart } from "@/lib/teacher-routine-sheet";
import { termText, unitsText, type TeacherClass, type TeacherRoutine } from "@/lib/teacher-routine";
import { DAY_NAMES } from "@/lib/time";

/** "14 August 2026" for a date, or the Asia/Dhaka date (and time) of a timestamp. */
export function sheetDate(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const value = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime && !dateOnly ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
    timeZone: dateOnly ? "UTC" : INSTITUTION.timeZone,
  }).format(value).replace(" at ", ", ").replace(/\b(am|pm)\b/, (suffix) => suffix.toUpperCase());
}

/** One teacher's Individual Class Routine as A4 portrait sheets (TCH-02). */
export function IndividualRoutineSheets({ routine, printedAt }: { routine: TeacherRoutine; printedAt: string }) {
  const layout = teacherSheetLayout(routine);
  const source = routine.source;
  const draft = source.kind === "draft";
  const term = termText(source.termName);
  const printed = sheetDate(printedAt, draft);
  return (
    <>
      {layout.pages.map((page, pageIndex) => (
        <section key={pageIndex} className="teacher-routine-sheet" aria-label={`Individual Class Routine, ${routine.teacher.fullName}, page ${pageIndex + 1} of ${layout.pages.length}`}>
          <header className="teacher-routine-head">
            {draft
              ? <p className="teacher-routine-mark teacher-routine-mark-draft">Draft — not official<small>Working draft · {sheetDate(source.generatedAt, true)}</small></p>
              : <p className="teacher-routine-mark"><small>Effective from</small>{sheetDate(source.effectiveFrom) ?? "Date not set"}<br />Publication v{source.versionNumber}</p>}
            <p className="teacher-routine-dept">{INSTITUTION.departmentName}</p>
            <p className="teacher-routine-uni">{INSTITUTION.universityName}, Bogura.</p>
            <h2 className="teacher-routine-title">Individual Class Routine</h2>
            <p className="teacher-routine-who">
              Course Teacher: <b>{routine.teacher.fullName}</b> <span>({routine.teacher.shortCode})</span>
              <br />Total Credit Hours: <b>{unitsText(routine.credits.total)}</b>
            </p>
          </header>

          <div className="teacher-routine-body">
            {page.blocks.map((block, index) => {
              if (block.kind === "program") {
                const name = block.program.key === "OTHER" ? `${block.program.title}, ${term}` : `Program: ${block.program.title}, ${term}`;
                return <h3 key={index} className="teacher-routine-program">{name}{block.continued ? " (continued)" : ""}</h3>;
              }
              if (block.kind === "table") return <SheetTable key={index} part={block.part} />;
              return <SheetLists key={index} routine={routine} />;
            })}
            {routine.programs.length === 0 && pageIndex === 0
              ? <p className="teacher-routine-empty">No classes with a fixed time in this routine.</p>
              : null}
          </div>

          <footer className="teacher-routine-foot">
            <p>
              {draft
                ? <>NB = New Building · This is a working draft. Classes may change<br />before the routine is published. Do not circulate.</>
                : <>NB = New Building · Total Credit Hours counts a theory course as 3<br />and a one-credit lab as 2, as on the Workload page.</>}
            </p>
            <p className="teacher-routine-page">
              {draft ? "Working draft" : `Publication v${source.versionNumber}`} · printed {printed}
              <br /><b>Page {pageIndex + 1} of {layout.pages.length}</b>
            </p>
          </footer>
        </section>
      ))}
    </>
  );
}

function SheetTable({ part }: { part: SheetTablePart }) {
  const { table } = part;
  const columns = table.periods.length + (table.otherTimes ? 1 : 0);
  // Group the part's rows by day, so the DAY cell spans that day's rows.
  const days: Array<{ dayOfWeek: number; rows: Array<{ row: SheetTablePart["table"]["days"][number]["rows"][number]; height: number }> }> = [];
  part.rows.forEach((ref, index) => {
    const day = table.days[ref.day];
    const current = days[days.length - 1];
    const entry = { row: day.rows[ref.row], height: part.rowHeights[index] };
    if (current && current.dayOfWeek === day.dayOfWeek) current.rows.push(entry);
    else days.push({ dayOfWeek: day.dayOfWeek, rows: [entry] });
  });
  return (
    <table className="teacher-routine-table">
      <colgroup>
        <col className="teacher-routine-col-day" />
        <col className="teacher-routine-col-batch" />
        {Array.from({ length: columns }, (_, index) => <col key={index} />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">DAY</th>
          <th scope="col">BATCH</th>
          {table.periods.map((period) => <th key={period.start} scope="col" className="teacher-routine-time">{headerTime(period.label)}</th>)}
          {table.otherTimes ? <th scope="col" className="teacher-routine-time">Other times</th> : null}
        </tr>
      </thead>
      <tbody>
        {days.map((day) => day.rows.map(({ row, height }, rowIndex) => (
          <tr key={`${day.dayOfWeek}-${row.batchLabel}-${row.moreBatches.join("+")}`} style={{ height: `${height}mm` }}>
            {rowIndex === 0 ? <th scope="rowgroup" rowSpan={day.rows.length} className="teacher-routine-day">{DAY_NAMES[day.dayOfWeek].toUpperCase()}</th> : null}
            <th scope="row" className="teacher-routine-batch">
              {row.batchLabel}
              {row.moreBatches.map((label) => <small key={label}>+ {label}</small>)}
            </th>
            {row.cells.map((cell, cellIndex) => (
              <td key={cellIndex} colSpan={cell.span > 1 ? cell.span : undefined}>
                {cell.classes.map((item) => <SheetClass key={item.meetingId} item={item} />)}
              </td>
            ))}
          </tr>
        )))}
      </tbody>
    </table>
  );
}

/** "9:30 – 10:45 AM" → "09:30 AM –" / "10:45 AM", as the template prints period headings. */
function headerTime(label: string) {
  const [from, to] = label.split(" – ");
  const suffix = to?.slice(-2) ?? "";
  const pad = (value: string) => value.replace(/^(\d):/, "0$1:");
  const start = /(AM|PM)$/.test(from) ? from : `${from} ${suffix}`;
  return <>{pad(start)} –<br />{pad(to ?? "")}</>;
}

function SheetClass({ item }: { item: TeacherClass }) {
  return (
    <div className="teacher-routine-class">
      <b>{item.code}</b>
      <span>{item.rooms}{item.note ? <em> · {item.note}</em> : null}</span>
      {item.time ? <i>{item.time}</i> : null}
      {item.coTeachers.length ? <i>with {item.coTeachers.join(", ")}</i> : null}
    </div>
  );
}

function SheetLists({ routine }: { routine: TeacherRoutine }) {
  return (
    <div className="teacher-routine-lists">
      <div>
        <h4>No fixed time</h4>
        <ul>
          {routine.noFixedTime.length
            ? routine.noFixedTime.map((item) => <li key={item.key}><b>{item.code}</b> {item.title} · {item.audience} · arranged by the teacher</li>)
            : <li>None</li>}
        </ul>
      </div>
      <div>
        <h4>Other departments</h4>
        <ul>
          {routine.otherDepartments.length
            ? routine.otherDepartments.map((item) => (
              <li key={item.id}>
                {item.course ? <b>{item.course}</b> : null}{item.course ? " · " : ""}Department of {item.department}
                {item.dayOfWeek != null ? ` · ${DAY_NAMES[item.dayOfWeek]}` : ""}
                {item.time ? ` ${item.time}` : ""}
                {item.room ? ` · ${item.room}` : ""}
                {item.verified ? "" : " · not yet verified"}
              </li>
            ))
            : <li>None recorded</li>}
        </ul>
      </div>
    </div>
  );
}

