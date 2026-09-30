import { Fragment } from "react";
import { INSTITUTION } from "@/lib/constants";
import type { OfficialAppendixPage, OfficialRoutinePackage as Package } from "@/lib/official-routine-package";
import type { RoutineDayGroup, RoutineDayProjection } from "@/lib/routine-projection";
import { DAY_NAMES, fmtDate, fmtRange } from "@/lib/time";

interface SheetTable { day: RoutineDayProjection; group: RoutineDayGroup; label: string | null; withBookings: boolean; weight: number; main: boolean }
interface Sheet { stream: "HSC" | "DIPLOMA"; tables: SheetTable[]; capacity: number; continued: boolean }

/** Rows a table needs: two header rows, its batches, the bookings row and a caption. */
const weightOf = (table: Omit<SheetTable, "weight">) => table.group.rows.length + 2 + (table.withBookings ? 1 : 0) + (table.label ? 1 : 0);
/** Four eight-batch days (the Summer 2026 layout) fill one A4 HSC sheet. */
const HSC_SHEET_ROWS = 44;

/**
 * HSC routine sheets. Each day's main table stays on the first sheet, as
 * before term grids; extra period groups and extra days join it while they
 * fit at the same density, otherwise they continue on another sheet.
 */
function routineSheets(document: Package): Sheet[] {
  return document.routinePages.flatMap((page) => {
    const tables: SheetTable[] = page.days.flatMap((day) => day.groups.map((group, index) => {
      const table = { day, group, label: day.groups.length > 1 ? group.name : null, withBookings: index === 0, main: index === 0 && !day.exceptionOnly };
      return { ...table, weight: weightOf(table) };
    }));
    if (page.stream !== "HSC") return [{ stream: page.stream, tables, capacity: 0, continued: false }];
    const main = tables.filter((t) => t.main);
    const capacity = Math.max(HSC_SHEET_ROWS, main.reduce((sum, t) => sum + t.weight, 0));
    const sheets: Sheet[] = [{ stream: page.stream, tables: [], capacity, continued: false }];
    let used = main.reduce((sum, t) => sum + t.weight, 0);
    for (const table of tables) {
      if (table.main) { sheets[0].tables.push(table); continue; }
      if (used + table.weight > capacity) {
        sheets.push({ stream: page.stream, tables: [], capacity, continued: true });
        used = 0;
      }
      sheets[sheets.length - 1].tables.push(table);
      used += table.weight;
    }
    // Keep day order within each sheet.
    const order = new Map(page.days.map((day, index) => [day.dayOfWeek, index]));
    for (const sheet of sheets) sheet.tables.sort((a, b) => (order.get(a.day.dayOfWeek) ?? 0) - (order.get(b.day.dayOfWeek) ?? 0));
    return sheets;
  });
}

/** First HSC sheet: rows in proportion to table size, padded to capacity. Continuation sheets size rows to their content. */
function sheetRows(sheet: Sheet): string {
  const rows = sheet.tables.map((t) => `minmax(0, ${t.weight}fr)`);
  const used = sheet.tables.reduce((sum, t) => sum + t.weight, 0);
  if (sheet.capacity > used) rows.push(`minmax(0, ${sheet.capacity - used}fr)`);
  return rows.join(" ");
}

export function OfficialRoutinePackage({ document }: { document: Package }) {
  const sheets = routineSheets(document);
  const totalPages = sheets.length + document.appendixPages.length;
  return (
    <div className="official-package">
      {sheets.map((sheet, index) => (
        <OfficialPage key={`${sheet.stream}-${index}`} document={document} page={index + 1} totalPages={totalPages}
          title={`Program: B.Sc. in CSE (${sheet.stream === "HSC" ? "HSC" : "Diploma"})${sheet.continued ? " (continued)" : ""}`}>
          <div className={`official-routine-days ${sheet.stream === "HSC" && !sheet.continued ? "official-routine-days-hsc" : "official-routine-days-diploma"}`}
            style={sheet.stream === "HSC" && !sheet.continued ? { gridTemplateRows: sheetRows(sheet) } : undefined}>
            {sheet.tables.map((table) => (
              <CompactDayTable key={`${table.day.dayOfWeek}-${table.group.key}`} day={table.day} group={table.group} label={table.label} withBookings={table.withBookings} />
            ))}
          </div>
        </OfficialPage>
      ))}
      {document.appendixPages.map((page, appendixIndex) => {
        const pageNumber = sheets.length + appendixIndex + 1;
        return page.kind === "courses" ? (
          <OfficialPage key={page.kind} document={document} title="List of Course Offers in Different Semesters" page={pageNumber} totalPages={totalPages}>
            <CourseAppendix page={page} />
          </OfficialPage>
        ) : (
          <OfficialPage key={page.kind} document={document} title="Teachers, Class Representatives & Query Contacts" page={pageNumber} totalPages={totalPages}>
            <DirectoryAppendix page={page} />
          </OfficialPage>
        );
      })}
    </div>
  );
}

function OfficialPage({ document, title, page, totalPages, children }: {
  document: Package; title: string; page: number; totalPages: number; children: React.ReactNode;
}) {
  const source = document.source;
  return (
    <section className="official-package-page mx-auto overflow-hidden border border-[#777] bg-white shadow-sm print:border-0 print:shadow-none">
      <header className="official-package-header relative text-center">
        <p className="official-university">{INSTITUTION.universityName}</p>
        <p className="official-department">{INSTITUTION.departmentName}</p>
        <p className="official-term">Class Routine, {source.termName}</p>
        <p className="official-effective">Effective from {fmtDate(source.effectiveFrom)}</p>
        <h1>{title}</h1>
      </header>
      <div className="official-package-body">{children}</div>
      <footer className="official-package-footer">
        <span>NB = New Building | OD = Other Departments</span>
        <span>{source.kind === "draft" ? "DRAFT - NOT OFFICIAL" : `Publication v${source.versionNumber}`} | Page {page} of {totalPages}</span>
      </footer>
    </section>
  );
}

function CompactDayTable({ day, group, label, withBookings }: {
  day: RoutineDayProjection; group: RoutineDayGroup; label: string | null; withBookings: boolean;
}) {
  const rowCount = group.rows.length + (withBookings ? 1 : 0);
  return (
    <table className="official-compact-table">
      {label && <caption className="official-group-caption">{DAY_NAMES[day.dayOfWeek]} · {label}</caption>}
      <thead>
        <tr>
          <th className="official-day-heading" rowSpan={2}>Day</th>
          <th rowSpan={2}>Batch</th>
          {group.slots.map((slot, index) => (
            <Fragment key={slot.start}>
              <th>{fmtRange(slot.start, slot.end)}</th>
              {group.breaks.filter((item) => item.afterSlot === index).map((item) => (
                <th key={item.id} className="official-break-heading" rowSpan={2}>{item.name}</th>
              ))}
            </Fragment>
          ))}
        </tr>
        <tr>
          {group.slots.map((slot) => <th key={slot.start} className="official-slot-caption">{slot.start} - {slot.end}</th>)}
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row, rowIndex) => (
          <tr key={row.batch.id}>
            {rowIndex === 0 && <th className="official-day-spacer" rowSpan={rowCount}>{DAY_NAMES[day.dayOfWeek]}</th>}
            <th>
              {row.batch.label.replace("B", " B")}
              {row.unplanned && row.offGrid.map((item) => (
                <small key={item.meeting.id} className="official-unplanned">{item.meeting.courseCode} {fmtRange(item.meeting.startMinutes, item.meeting.endMinutes)} (no classes planned)</small>
              ))}
            </th>
            {row.slots.map((slot, slotIndex) => (
              <Fragment key={slot.start}>
                <td>
                  {slot.meetings.map((item) => {
                    const meeting = item.meeting;
                    return <div key={meeting.id} className={item.validationStatus === "blocker" ? "official-cell-blocker" : ""}>
                      <b>{meeting.courseCode}</b> ({meeting.teachers.map((teacher) => teacher.shortCode).join("/") || "UT"}) {meeting.rooms.map((room) => room.code).join("/") || "Room pending"}
                      {meeting.customTimeLabel && <small>{meeting.customTimeLabel}</small>}
                      {meeting.externalAudienceLabel && <small>{meeting.externalAudienceLabel}</small>}
                    </div>;
                  })}
                </td>
                {rowIndex === 0 && group.breaks.filter((item) => item.afterSlot === slotIndex).map((item) => (
                  <td key={item.id} className="official-break-body" rowSpan={rowCount}><span>{item.name}</span></td>
                ))}
              </Fragment>
            ))}
          </tr>
        ))}
        {withBookings && <tr className="official-od-row">
          <th>OD</th>
          {group.slots.map((slot) => (
            <td key={slot.start}>
              {day.externals
                .filter((item) => item.startMinutes != null && item.endMinutes != null && item.startMinutes < slot.end && item.endMinutes > slot.start)
                .map((item) => <div key={item.id}>{item.roomCode ?? item.teacherShortCode ?? "?"} ({item.counterpartDepartment})</div>)}
            </td>
          ))}
        </tr>}
      </tbody>
    </table>
  );
}

function CourseAppendix({ page }: { page: Extract<OfficialAppendixPage, { kind: "courses" }> }) {
  return (
    <div className="official-course-grid">
      {page.semesters.map((semester) => (
        <section key={semester.semester}>
          <h2>{ordinalSemester(semester.semester)} Semester</h2>
          <table className="official-appendix-table">
            <thead><tr><th>Course Code</th><th>Course Title</th><th>Credits</th></tr></thead>
            <tbody>{semester.courses.map((course) => (
              <tr key={course.code}><td>{course.code}</td><td>{course.title}</td><td>{course.credits.toFixed(2)}</td></tr>
            ))}</tbody>
            <tfoot><tr><th colSpan={2}>Total credit</th><th>{semester.courses.reduce((sum, course) => sum + course.credits, 0).toFixed(2)}</th></tr></tfoot>
          </table>
        </section>
      ))}
    </div>
  );
}

function DirectoryAppendix({ page }: { page: Extract<OfficialAppendixPage, { kind: "directory" }> }) {
  const midpoint = Math.ceil(page.teachers.length / 2);
  const teacherColumns = [page.teachers.slice(0, midpoint), page.teachers.slice(midpoint)];
  return (
    <div className="official-directory">
      <h2>List of Teachers</h2>
      <div className="official-teacher-columns">
        {teacherColumns.map((teachers, column) => (
          <table key={column} className="official-appendix-table">
            <thead><tr><th>SL</th><th>Teacher&apos;s Name</th><th>Code</th><th>Mobile / Email</th></tr></thead>
            <tbody>{teachers.map((teacher, index) => (
              <tr key={teacher.shortCode}>
                <td>{column * midpoint + index + 1}</td><td>{teacher.fullName}{teacher.designation ? ` (${teacher.designation})` : ""}</td>
                <td>{teacher.shortCode}</td><td>{teacher.phone ?? "-"}{teacher.email ? <small>{teacher.email}</small> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        ))}
      </div>
      <div className="official-cr-grid">
        {(["HSC", "DIPLOMA"] as const).map((stream) => (
          <section key={stream}>
            <h2>Class Representatives - {stream === "HSC" ? "B.Sc. in CSE (HSC)" : "B.Sc. in CSE (Diploma)"}</h2>
            <table className="official-appendix-table"><thead><tr><th>Batch</th><th>Name</th><th>Contact</th></tr></thead>
              <tbody>{page.classRepresentatives.filter((item) => item.stream === stream).map((item) => (
                <tr key={`${stream}-${item.batchLabel}`}><td>{item.batchLabel}</td><td>{item.fullName ?? "Not listed"}</td><td>{item.phone ?? "-"}</td></tr>
              ))}</tbody>
            </table>
          </section>
        ))}
      </div>
      <h2>For Any Query</h2>
      <div className="official-query-grid">
        {page.queryContacts.map((contact) => <div key={contact.fullName}><b>{contact.fullName}</b><span>{contact.designation}</span><span>Contact No: {contact.phone}</span></div>)}
      </div>
      {page.sourceReconciliations.some((item) => item.status === "open") && (
        <p className="official-source-note">Source review pending: {page.sourceReconciliations.filter((item) => item.status === "open").map((item) => item.detail).join(" ")}</p>
      )}
    </div>
  );
}

function ordinalSemester(value: number) {
  const year = Math.ceil(value / 2);
  const term = value % 2 === 1 ? "1st" : "2nd";
  const yearLabel = year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : "4th";
  return `${yearLabel} Year ${term}`;
}
