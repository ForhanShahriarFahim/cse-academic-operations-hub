import { Fragment } from "react";
import { INSTITUTION } from "@/lib/constants";
import type { OfficialAppendixPage, OfficialRoutinePackage as Package } from "@/lib/official-routine-package";
import { contactsSheets, type ContactsBlock, type ContactsSheet } from "@/lib/official-contacts-sheets";
import { routineSheets, type SheetCell, type SheetClass, type SheetTable } from "@/lib/official-routine-sheets";
import { DAY_NAMES } from "@/lib/time";

const legend = (contactsPage: number) => <>NB = New Building · OD = rooms used by other departments<br />Teacher codes are listed on page {contactsPage}.</>;
const STREAM_NAME = { HSC: "B.Sc. in CSE (HSC)", DIPLOMA: "B.Sc. in CSE (Diploma)" } as const;

/** "14 August 2026" for a date, or the Asia/Dhaka date of a timestamp. */
function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const value = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: dateOnly ? "UTC" : INSTITUTION.timeZone }).format(value);
}

function dayRange(days: number[]): string {
  const names = days.map((day) => DAY_NAMES[day]);
  return names.length > 2 ? `${names[0]} to ${names[names.length - 1]}` : names.join(" and ");
}

interface SheetSpec { key: string; label: string; program: string; title: string; note?: string; foot: React.ReactNode; body: React.ReactNode; compact?: boolean }

const continuedNote = (index: number, count: number) => count > 1
  ? `Sheet ${index + 1} of ${count} · ${index + 1 < count ? "continued on the next sheet" : "continued from the previous sheet"}`
  : undefined;

export function OfficialRoutinePackage({ document }: { document: Package }) {
  const routine = document.routinePages.map((page) => ({ page, sheets: routineSheets(page.days) }));
  const appendix = document.appendixPages.map((page) => ({ page, contacts: page.kind === "directory" ? contactsSheets(page) : null }));
  // Page of the first contacts sheet, for the routine sheets' legend (BUG-54 D-2).
  let contactsPage = routine.reduce((sum, item) => sum + item.sheets.length, 0) + 1;
  for (const item of appendix) {
    if (item.contacts) break;
    contactsPage += 1;
  }

  const specs: SheetSpec[] = routine.flatMap(({ page, sheets }) => {
    return sheets.map((sheet, index) => ({
      key: `${page.stream}-${index}`,
      label: "Program",
      program: STREAM_NAME[page.stream],
      title: sheet.days.length ? `Weekly Class Routine: ${dayRange(sheet.days)}` : "Weekly Class Routine",
      note: continuedNote(index, sheets.length),
      foot: legend(contactsPage),
      body: sheet.tables.length
        ? sheet.tables.map((table) => <DayTable key={`${table.dayOfWeek}-${table.continued ? table.rows[0]?.batchLabel : "main"}`} table={table} />)
        : <p className="official-empty">No classes are planned for this program.</p>,
    }));
  });
  for (const { page, contacts } of appendix) {
    if (page.kind === "courses") {
      specs.push({ key: page.kind, label: "Courses offered", program: "B.Sc. in CSE (HSC and Diploma)", title: `Courses Offered in ${document.source.termName}, by Year and Semester`, foot: "Totals are credits per semester.", body: <CourseAppendix page={page} /> });
      continue;
    }
    (contacts ?? []).forEach((sheet, index, sheets) => specs.push({
      key: `${page.kind}-${index}`, label: "Contacts", program: "B.Sc. in CSE (HSC and Diploma)", title: "Teachers, Class Representatives and Query Contacts",
      note: continuedNote(index, sheets.length), foot: "Teacher codes match the routine pages.", body: <ContactsAppendix sheet={sheet} />, compact: sheet.compact,
    }));
  }
  return (
    <div className="official-package" role="region" aria-label="Official routine package, A4 sheets" tabIndex={0}>
      {specs.map((spec, index) => (
        <OfficialSheet key={spec.key} document={document} spec={spec} page={index + 1} totalPages={specs.length} />
      ))}
    </div>
  );
}

function OfficialSheet({ document, spec, page, totalPages }: { document: Package; spec: SheetSpec; page: number; totalPages: number }) {
  const source = document.source;
  const draft = source.kind === "draft";
  const issued = longDate(source.publishedAt ?? source.generatedAt);
  return (
    <section className={spec.compact ? "official-sheet official-compact" : "official-sheet"} aria-label={`${spec.program}: ${spec.title}, page ${page} of ${totalPages}`}>
      {draft && <div className="official-watermark" aria-hidden="true" />}
      <header className="official-sheet-head">
        <div className="official-tag official-tag-left"><small>{spec.label}</small><strong>{spec.program}</strong></div>
        <div className="official-institution">
          <p className="official-university">{INSTITUTION.universityName}</p>
          <p className="official-department">{INSTITUTION.departmentName}</p>
          <p className="official-doc">Class Routine · {source.termName}</p>
        </div>
        <div className="official-tag official-tag-right">
          <small>Effective from</small><strong>{longDate(source.effectiveFrom) ?? "Not set"}</strong>
          {draft ? <b>DRAFT: NOT OFFICIAL</b> : <span>Publication v{source.versionNumber}</span>}
        </div>
      </header>
      <div className="official-sheet-main">
        <div className="official-sheet-title"><h2>{spec.title}</h2>{spec.note && <span>{spec.note}</span>}</div>
        <div className="official-sheet-body">{spec.body}</div>
      </div>
      <footer className="official-sheet-foot">
        <p>{spec.foot}</p>
        <p className="official-page">
          {draft
            ? `Draft printed ${longDate(source.generatedAt) ?? ""} · not for the notice board`
            : `Publication v${source.versionNumber}${issued ? ` · issued ${issued}` : ""}`}
          {" · "}<b>Page {page} of {totalPages}</b>
        </p>
      </footer>
    </section>
  );
}

function ClassBlock({ item }: { item: SheetClass }) {
  return (
    <div className="official-class">
      <b>{item.code}</b> ({item.teachers})
      <span>{item.rooms}{item.note && <small> · {item.note}</small>}{item.time && <i> · {item.time}</i>}</span>
    </div>
  );
}

function Cell({ cell }: { cell: SheetCell }) {
  const span = cell.span > 1 ? cell.span : undefined;
  if (cell.kind === "classes") return <td colSpan={span}>{cell.classes.map((item, index) => <ClassBlock key={`${item.code}-${index}`} item={item} />)}</td>;
  return (
    <td className="official-own" colSpan={span}>
      <div className="official-own-row">
        {cell.segments.map((segment) => (
          <div key={segment.start} className="official-segment">
            <span className="official-segment-time">{segment.time}</span>
            <div className="official-segment-classes">{segment.classes.map((item, index) => <ClassBlock key={`${item.code}-${index}`} item={item} />)}</div>
          </div>
        ))}
      </div>
    </td>
  );
}

function DayTable({ table }: { table: SheetTable }) {
  const bodyRows = table.rows.length + (table.od ? 1 : 0);
  const breaksAfter = (slot: number) => table.breaks.filter((item) => item.afterSlot === slot);
  const breakCells = (slot: number) => breaksAfter(slot).map((item) => (
    <td key={`break-${item.afterSlot}`} className="official-break" rowSpan={bodyRows}><span className="official-vertical">{item.label}</span></td>
  ));
  const dayName = `${DAY_NAMES[table.dayOfWeek]}${table.continued ? " (cont.)" : ""}`;
  const dayCell = <th className="official-day" rowSpan={bodyRows} scope="rowgroup"><span className="official-vertical">{dayName}</span></th>;
  return (
    <table className="official-routine" data-estimate-mm={table.height.toFixed(1)}>
      <thead>
        <tr>
          <th className="official-col-day" scope="col">Day</th>
          <th className="official-col-batch" scope="col">Batch</th>
          {table.slots.map((label, index) => (
            <Fragment key={index}>
              <th scope="col">{label}</th>
              {breaksAfter(index).map((item) => <th key={item.afterSlot} className="official-col-break official-break"><span className="official-vertical">Break</span></th>)}
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => {
          let slot = 0;
          return (
            <tr key={row.batchLabel}>
              {rowIndex === 0 && dayCell}
              <th className="official-batch" scope="row">{row.batchLabel.replace(/B$/, " B")}</th>
              {row.cells.map((cell, index) => {
                slot += cell.span;
                return <Fragment key={index}><Cell cell={cell} />{rowIndex === 0 && breakCells(slot - 1)}</Fragment>;
              })}
            </tr>
          );
        })}
        {table.od && (
          <tr className="official-od">
            {table.rows.length === 0 && dayCell}
            <th scope="row">OD</th>
            {table.od.map((entries, index) => (
              <Fragment key={index}>
                <td>{entries.map((entry, entryIndex) => <Fragment key={entryIndex}>{entryIndex > 0 && <br />}{entry}</Fragment>)}</td>
                {table.rows.length === 0 && breakCells(index)}
              </Fragment>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

const YEAR = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

function CourseAppendix({ page }: { page: Extract<OfficialAppendixPage, { kind: "courses" }> }) {
  return (
    <div className="official-years">
      {page.semesters.map((semester) => {
        const year = Math.ceil(semester.semester / 2);
        const total = semester.courses.reduce((sum, course) => sum + course.credits, 0);
        return (
          <table key={semester.semester} className="official-plain"
            style={{ gridColumn: ((year - 1) % 4) + 1, gridRow: Math.floor((year - 1) / 4) * 2 + (semester.semester % 2 === 1 ? 1 : 2) }}>
            <colgroup><col style={{ width: "15mm" }} /><col /><col style={{ width: "12mm" }} /></colgroup>
            <thead>
              <tr className="official-band"><th colSpan={3}>{YEAR[year - 1] ?? `${year}th`} Year, {semester.semester % 2 === 1 ? "1st" : "2nd"} Semester</th></tr>
              <tr><th scope="col">Code</th><th scope="col">Course title</th><th scope="col" className="official-num">Credits</th></tr>
            </thead>
            <tbody>{semester.courses.map((course) => (
              <tr key={course.code}><td>{course.code}</td><td>{course.title}</td><td className="official-num">{course.credits.toFixed(2)}</td></tr>
            ))}</tbody>
            <tfoot><tr><th colSpan={2}>Total credits</th><th className="official-num">{total.toFixed(2)}</th></tr></tfoot>
          </table>
        );
      })}
    </div>
  );
}

function ContactsAppendix({ sheet }: { sheet: ContactsSheet }) {
  return <div className="official-directory">{sheet.blocks.map((block, index) => <ContactsPart key={`${block.kind}-${index}`} block={block} />)}</div>;
}

function ContactsPart({ block }: { block: ContactsBlock }) {
  if (block.kind === "teachers") {
    return (
      <div className="official-span">
        <p className="official-section-label">{block.continued ? "Teachers (continued)" : "Teachers"}</p>
        <div className="official-directory official-teacher-columns">
          {block.columns.map((column, index) => (
            <table key={index} className="official-plain" data-estimate-mm={column.height.toFixed(1)}>
              <colgroup><col style={{ width: "6mm" }} /><col /><col style={{ width: "11mm" }} /><col style={{ width: "19mm" }} /><col style={{ width: "41mm" }} /></colgroup>
              <thead><tr><th scope="col" className="official-num">SL</th><th scope="col">Teacher</th><th scope="col">Code</th><th scope="col">Mobile</th><th scope="col">Email</th></tr></thead>
              <tbody>{column.teachers.map((teacher) => (
                <tr key={teacher.shortCode}>
                  <td className="official-num">{teacher.sl}</td>
                  <td>{teacher.fullName}{teacher.designation && <small>, {teacher.designation}</small>}</td>
                  <td>{teacher.shortCode}</td><td>{teacher.phone ?? "-"}</td><td>{teacher.email ?? ""}</td>
                </tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "representatives") {
    return block.tables.map((table) => (
      <div key={table.stream}>
        <p className="official-section-label">Class representatives, {STREAM_NAME[table.stream]}</p>
        <table className="official-plain" data-estimate-mm={table.height.toFixed(1)}>
          <colgroup><col style={{ width: "12mm" }} /><col /><col style={{ width: "22mm" }} /></colgroup>
          <thead><tr><th scope="col">Batch</th><th scope="col">Class representative</th><th scope="col">Mobile</th></tr></thead>
          <tbody>{table.rows.map((item) => (
            <tr key={item.batchLabel}><td>{item.batchLabel.replace(/B$/, " B")}</td><td>{item.fullName ?? <i>Not listed</i>}</td><td>{item.phone ?? ""}</td></tr>
          ))}</tbody>
        </table>
      </div>
    ));
  }
  return (
    <div className="official-span">
      <p className="official-section-label">For any query</p>
      <div className="official-contacts" data-estimate-mm={block.boxesHeight.toFixed(1)}>
        {block.contacts.map((contact) => (
          <div key={contact.fullName}><b>{contact.fullName}</b>{contact.designation}<br />Mobile {contact.phone}{contact.email && <><br />{contact.email}</>}</div>
        ))}
      </div>
    </div>
  );
}
