import { Fragment } from "react";
import { INSTITUTION } from "@/lib/constants";
import type { OfficialAppendixPage, OfficialRoutinePackage as Package } from "@/lib/official-routine-package";
import type { RoutineDayProjection } from "@/lib/routine-projection";
import { DAY_NAMES, fmtDate, fmtRange } from "@/lib/time";

export function OfficialRoutinePackage({ document }: { document: Package }) {
  const totalPages = document.routinePages.length + document.appendixPages.length;
  return (
    <div className="official-package">
      {document.routinePages.map((page, index) => (
        <OfficialPage key={page.stream} document={document} title={`Program: B.Sc. in CSE (${page.stream === "HSC" ? "HSC" : "Diploma"})`} page={index + 1} totalPages={totalPages}>
          <div className={`official-routine-days ${page.stream === "HSC" ? "official-routine-days-hsc" : "official-routine-days-diploma"}`}>
            {page.days.map((day) => <CompactDayTable key={day.dayOfWeek} day={day} />)}
          </div>
        </OfficialPage>
      ))}
      {document.appendixPages.map((page, appendixIndex) => {
        const pageNumber = document.routinePages.length + appendixIndex + 1;
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

function CompactDayTable({ day }: { day: RoutineDayProjection }) {
  return (
    <table className="official-compact-table">
      <thead>
        <tr>
          <th className="official-day-heading" rowSpan={2}>Day</th>
          <th rowSpan={2}>Batch</th>
          {day.slots.map((slot, index) => (
            <Fragment key={slot.start}>
              <th>{fmtRange(slot.start, slot.end)}</th>
              {day.breaks.filter((item) => item.afterSlot === index).map((item) => (
                <th key={item.id} className="official-break-heading" rowSpan={2}>{item.name}</th>
              ))}
            </Fragment>
          ))}
        </tr>
        <tr>
          {day.slots.map((slot) => <th key={slot.start} className="official-slot-caption">{slot.start} - {slot.end}</th>)}
        </tr>
      </thead>
      <tbody>
        {day.rows.map((row, rowIndex) => (
          <tr key={row.batch.id}>
            {rowIndex === 0 && <th className="official-day-spacer" rowSpan={day.rows.length + 1}>{DAY_NAMES[day.dayOfWeek]}</th>}
            <th>{row.batch.label.replace("B", " B")}</th>
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
                {rowIndex === 0 && day.breaks.filter((item) => item.afterSlot === slotIndex).map((item) => (
                  <td key={item.id} className="official-break-body" rowSpan={day.rows.length + 1}><span>{item.name}</span></td>
                ))}
              </Fragment>
            ))}
          </tr>
        ))}
        <tr className="official-od-row">
          <th>OD</th>
          {day.slots.map((slot) => (
            <td key={slot.start}>
              {day.externals
                .filter((item) => item.startMinutes != null && item.endMinutes != null && item.startMinutes < slot.end && item.endMinutes > slot.start)
                .map((item) => <div key={item.id}>{item.roomCode ?? item.teacherShortCode ?? "?"} ({item.counterpartDepartment})</div>)}
            </td>
          ))}
        </tr>
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
