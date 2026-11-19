import Link from "next/link";
import type { ReactNode } from "react";
import { TableRegion } from "@/components/ui";
import { LEDGER_STATUS_LETTERS, LEDGER_STATUS_WORDS, ledgerTime, type Ledger } from "@/lib/attendance-ledger";
import { stateLabel } from "@/lib/attendance-lifecycle";
import { fmtDate } from "@/lib/time";

/** Shared ATT-05 renderers. The screen and A4 print both take the one projection from `buildLedger`. */

const linkStyle = "font-semibold text-[var(--color-pine)] underline underline-offset-4";
export const percentText = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}%`;
export const phaseText = (phase: string) => phase === "final" ? "Final" : "Midterm";
const shortDate = (iso: string) => fmtDate(iso).replace(/ \d{4}$/, "");

export function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 inline-block rounded-full border border-[var(--color-gold)] px-2 text-xs font-medium text-[var(--color-gold-text)]">{children}</span>;
}

export function LedgerSummary({ summary }: { summary: Ledger["summary"] }) {
  const items: Array<[string, ReactNode, ReactNode?]> = [
    ["Classes held", summary.classesHeld],
    ["Teachers", summary.teachers, summary.notRecorded ? `+ ${summary.notRecorded} not recorded` : undefined],
    ["Present + late", summary.attended, `of ${summary.eligible} eligible`],
    ["Attendance", percentText(summary.percentage)],
    ["Absent", summary.absent],
    ["Excused", summary.excused],
  ];
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary for this view">
    {items.map(([label, value, note]) => <div key={label} className="rounded-md border border-[var(--color-line)] bg-[var(--color-sheet)] px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>)}
  </dl>;
}

export function LedgerNotes({ summary }: { summary: Ledger["summary"] }) {
  if (!summary.provisional && !summary.voided) return null;
  return <p className="rounded-md border border-[var(--color-gold)] bg-gold-tint p-3 text-sm">
    {summary.provisional > 0 && `${summary.provisional} draft or reopened ${summary.provisional === 1 ? "session is" : "sessions are"} provisional. `}
    {summary.voided > 0 && `${summary.voided} voided ${summary.voided === 1 ? "session is" : "sessions are"} listed and excluded from totals.`}
  </p>;
}

export function SessionsTable({ ledger, openHref }: { ledger: Ledger; openHref?: (sessionId: number) => string }) {
  if (!ledger.rows.length) return <p role="status" className="text-sm">No attendance sessions in this view.</p>;
  return <TableRegion label={`Sessions, ${ledger.rows.length} rows`} maxHeight="72vh" className="rounded-md border border-[var(--color-line)]">
    <table className="ledger stack">
      <caption className="sr-only">Attendance sessions in date and time order. Voided sessions are excluded from totals.</caption>
      <thead><tr>
        <th scope="col">Date</th><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Phase</th><th scope="col">Teacher</th>
        <th scope="col" className="num">Present</th><th scope="col" className="num">Late</th><th scope="col" className="num">Absent</th>
        <th scope="col" className="num">Excused</th><th scope="col" className="num">Not captured</th><th scope="col" className="num">Attendance</th>
        <th scope="col">Status</th>
      </tr></thead>
      <tbody>{ledger.rows.map(row => {
        const muted = row.voided ? "text-muted" : "";
        const count = (value: number | null | undefined) => value == null ? "—" : value;
        return <tr key={row.id} className={muted}>
          <th scope="row" className="font-semibold">{fmtDate(row.date)}</th>
          <td data-label="Day">{row.day}</td>
          <td data-label="Time">{ledgerTime(row.startMinutes, row.endMinutes) || "Time not recorded"}</td>
          <td data-label="Phase">{phaseText(row.phase)}</td>
          <td data-label="Teacher" title={row.teacherName ?? undefined}>{row.teacherId == null ? "Not recorded" : row.teacherCode}</td>
          <td data-label="Present" className="num">{count(row.counts?.present)}</td>
          <td data-label="Late" className="num">{count(row.counts?.late)}</td>
          <td data-label="Absent" className="num">{count(row.counts?.absent)}</td>
          <td data-label="Excused" className="num">{count(row.counts?.excused)}</td>
          <td data-label="Not captured" className={`num ${row.notCaptured == null ? "empty-sm" : ""}`}>{count(row.notCaptured)}</td>
          <td data-label="Attendance" className="num">{percentText(row.percentage)}</td>
          <td data-label="Status" className="wrap">
            {stateLabel(row.state)}{row.provisional && <Tag>Provisional</Tag>}
            {row.voided && <span className="block text-xs">Excluded · {row.voidReason}</span>}
            {openHref && !row.voided && <Link prefetch={false} className={`${linkStyle} block w-fit text-sm`} href={openHref(row.id)}
              aria-label={`Open session on ${fmtDate(row.date)}${ledgerTime(row.startMinutes, row.endMinutes) ? ` at ${ledgerTime(row.startMinutes, row.endMinutes)}` : ""}`}>Open session</Link>}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </TableRegion>;
}

export function StatusCell({ status }: { status: keyof typeof LEDGER_STATUS_WORDS | null }) {
  return status ? <><span aria-hidden="true">{LEDGER_STATUS_LETTERS[status]}</span><span className="sr-only">{LEDGER_STATUS_WORDS[status]}</span></>
    : <><span aria-hidden="true">—</span><span className="sr-only">Not captured</span></>;
}

export function StudentMatrix({ ledger, studentHref }: { ledger: Ledger; studentHref?: (row: Ledger["matrix"][number]) => string | undefined }) {
  if (!ledger.matrix.length) return <p role="status" className="text-sm">No students with enrollment or captured attendance in this view.</p>;
  return <>
    <p className="text-sm text-muted">{ledger.columns.length} {ledger.columns.length === 1 ? "session" : "sessions"} · P present, L late, A absent, E excused, — not captured</p>
    <TableRegion label="Student by session matrix" maxHeight="72vh" className="relative rounded-md border border-[var(--color-line)]">
      <table className="ledger">
        <caption className="sr-only">Each student&apos;s recorded status for every non-voided session in this view, with attended and eligible totals.</caption>
        <thead><tr>
          <th scope="col">Student</th>
          {ledger.columns.map(column => <th key={column.id} scope="col" className="text-center">
            {shortDate(column.date)}<span className="block text-[11px] font-normal">{ledgerTime(column.startMinutes, column.endMinutes) || "No time"}</span>
            <span className="block text-[11px] font-normal">{phaseText(column.phase)}{column.provisional ? " · prov." : ""}</span>
          </th>)}
          <th scope="col" className="num">Attended</th><th scope="col" className="num">Attendance</th>
        </tr></thead>
        <tbody>{ledger.matrix.map(row => {
          const href = studentHref?.(row);
          return <tr key={row.id}>
            <th scope="row" className="min-w-[9rem] max-w-[16rem] !whitespace-normal [overflow-wrap:normal]">
              {href ? <Link prefetch={false} className={linkStyle} href={href}>{row.name}</Link> : <span className="font-semibold">{row.name}</span>}
              <span className="block text-xs text-muted">{row.code}{row.notOnRoster && <Tag>Not on current roster</Tag>}</span>
            </th>
            {row.cells.map((cell, index) => <td key={ledger.columns[index].id} className="text-center">
              <StatusCell status={cell} />
            </td>)}
            <td className="num">{row.attended} / {row.eligible}</td>
            <td className="num">{percentText(row.percentage)}</td>
          </tr>;
        })}</tbody>
      </table>
    </TableRegion>
  </>;
}
