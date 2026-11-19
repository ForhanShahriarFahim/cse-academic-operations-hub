import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { percentText, phaseText } from "@/components/attendance-ledger";
import { PrintRoutineButton } from "@/components/teacher-routine/print-button";
import { PageHeader } from "@/components/ui";
import {
  LEDGER_STATUS_LETTERS, ledgerBlocks, ledgerFilterQuery, ledgerFilterText, ledgerTime, type Ledger,
} from "@/lib/attendance-ledger";
import { stateLabel } from "@/lib/attendance-lifecycle";
import { getAttendanceLedger } from "@/lib/attendance-ledger-data";
import { attendanceId, attendanceLedgerHref, type AttendanceQuery } from "@/lib/attendance-selection";
import { fmtDate } from "@/lib/time";
import styles from "./ledger-print.module.css";

export const dynamic = "force-dynamic";

const shortDate = (iso: string) => fmtDate(iso).replace(/ \d{4}$/, "");

function Heading({ title, lines, colSpan }: { title: string; lines: string[]; colSpan: number }) {
  return <tr><th colSpan={colSpan} className={styles.heading} scope="colgroup">
    <h2 className="font-display font-semibold">{title}</h2>
    {lines.map(line => <p key={line}>{line}</p>)}
  </th></tr>;
}

function notesLine(summary: Ledger["summary"]) {
  return `Classes held ${summary.classesHeld} · Present + late ${summary.attended} of ${summary.eligible} eligible · Attendance ${percentText(summary.percentage)}`
    + (summary.provisional ? ` · ${summary.provisional} provisional` : "") + (summary.voided ? ` · ${summary.voided} voided (excluded)` : "");
}

export default async function AttendanceLedgerPrintPage({ searchParams }: { searchParams: Promise<AttendanceQuery> }) {
  const query = await searchParams;
  const termId = attendanceId(query.term), groupId = attendanceId(query.group);
  if (!termId || !groupId) notFound();
  const report = await getAttendanceLedger(termId, groupId, query);
  if (report.kind === "sign-in") redirect("/login");
  if (report.kind === "denied") redirect("/forbidden");
  if (report.kind !== "ledger") notFound();

  const { term, group, view, filters, teacherOptions, ledger } = report;
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Asia/Dhaka" }).format(new Date());
  const lines = [
    `${term.name} · ${group.courseCode} · ${group.courseTitle}`,
    `Group ${group.id}${group.audience ? ` · ${group.audience}` : ""}`,
    `Filters: ${ledgerFilterText(filters, teacherOptions, fmtDate)} · Generated ${generated}`,
    notesLine(ledger.summary),
  ];
  const back = attendanceLedgerHref(termId, groupId, { view: view === "sessions" ? undefined : view, ...ledgerFilterQuery(filters, term) });
  const blocks = ledgerBlocks(ledger.columns.map((column, index) => ({ column, index })));

  return <div className="space-y-4">
    <div className="no-print space-y-3">
      <Link className="underline" href={back}>Back to attendance ledger</Link>
      <PageHeader title={view === "sessions" ? "Printable attendance ledger" : "Printable student matrix"}
        description={view === "sessions" ? "Use A4 portrait in the print dialog, or choose Save as PDF." : "Use A4 landscape in the print dialog, or choose Save as PDF. Sessions print in blocks of up to 16."}
        actions={<PrintRoutineButton label="Print or save as PDF" />} />
    </div>
    {view === "sessions" ? <section className={`${styles.sheet} ${styles.portrait}`} aria-label="Attendance ledger sheet">
      <table className={styles.table}>
        <thead>
          <Heading title="Attendance ledger · Sessions" lines={lines} colSpan={12} />
          <tr>{["Date", "Day", "Time", "Phase", "Teacher", "P", "L", "A", "E", "NC", "%", "Status"].map(label =>
            <th key={label} scope="col" className={label.length <= 2 ? styles.num : undefined}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {ledger.rows.map(row => <tr key={row.id} className={row.voided ? styles.voided : undefined}>
            <th scope="row">{fmtDate(row.date)}</th><td>{row.day}</td><td>{ledgerTime(row.startMinutes, row.endMinutes) || "—"}</td>
            <td>{phaseText(row.phase)}</td><td>{row.teacherId == null ? "Not recorded" : row.teacherCode}</td>
            {([row.counts?.present, row.counts?.late, row.counts?.absent, row.counts?.excused, row.notCaptured] as const).map((value, index) =>
              <td key={index} className={styles.num}>{value ?? "—"}</td>)}
            <td className={styles.num}>{percentText(row.percentage)}</td>
            <td>{stateLabel(row.state)}{row.provisional ? " · provisional" : ""}{row.voided ? ` · excluded: ${row.voidReason ?? ""}` : ""}</td>
          </tr>)}
          {!ledger.rows.length && <tr><td colSpan={12}>No attendance sessions in this view.</td></tr>}
          <tr><th scope="row" colSpan={5}>Total · {ledger.summary.classesHeld} {ledger.summary.classesHeld === 1 ? "class" : "classes"} held</th>
            {[ledger.summary.present, ledger.summary.late, ledger.summary.absent, ledger.summary.excused].map((value, index) =>
              <td key={index} className={styles.num}>{value}</td>)}
            <td /><td className={styles.num}>{percentText(ledger.summary.percentage)}</td><td />
          </tr>
        </tbody>
      </table>
      <p className={styles.muted}>P present · L late · A absent · E excused · NC not captured on the current roster. Attendance = (P + L) ÷ (P + L + A).</p>
    </section> : <section className={`${styles.sheet} ${styles.landscape}`} aria-label="Student matrix sheet">
      {blocks.map((block, number) => {
        const last = number === blocks.length - 1;
        const span = 2 + block.length + (last ? 2 : 0);
        return <table key={number} className={styles.table}>
          <thead>
            <Heading title={`Attendance ledger · Students${blocks.length > 1 ? ` · block ${number + 1} of ${blocks.length}` : ""}`}
              lines={[...lines, ...(block.length ? [`Sessions ${block[0].index + 1}–${block[block.length - 1].index + 1} of ${ledger.columns.length}`] : [])]} colSpan={span} />
            <tr>
              <th scope="col">Student ID</th><th scope="col" className={styles.name}>Student name</th>
              {block.map(({ column }) => <th key={column.id} scope="col" className={styles.cell}>
                {shortDate(column.date)}<br />{ledgerTime(column.startMinutes, column.endMinutes).slice(0, 5) || "—"}<br />{column.phase === "final" ? "Fin" : "Mid"}
              </th>)}
              {last && <><th scope="col" className={styles.num}>Attended</th><th scope="col" className={styles.num}>%</th></>}
            </tr>
          </thead>
          <tbody>
            {ledger.matrix.map(row => <tr key={row.id}>
              <th scope="row">{row.code}</th>
              <td>{row.name}{row.notOnRoster ? " (not on current roster)" : ""}</td>
              {block.map(({ column, index }) => <td key={column.id} className={styles.cell}>{row.cells[index] ? LEDGER_STATUS_LETTERS[row.cells[index]] : "—"}</td>)}
              {last && <><td className={styles.num}>{row.attended} / {row.eligible}</td><td className={styles.num}>{percentText(row.percentage)}</td></>}
            </tr>)}
            {!ledger.matrix.length && <tr><td colSpan={span}>No students with enrollment or captured attendance in this view.</td></tr>}
          </tbody>
        </table>;
      })}
      <p className={styles.muted}>P present · L late · A absent · E excused · — not captured. Voided sessions are not shown.</p>
    </section>}
  </div>;
}
