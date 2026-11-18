import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PrintRoutineButton } from "@/components/teacher-routine/print-button";
import { prepareRoster, RosterOutputError } from "@/lib/roster-output";
import styles from "./roll-call.module.css";

export const dynamic = "force-dynamic";

const audienceLabels: Record<string, string> = { local: "Local", external: "External", merged: "Merged audience" };

export default async function RollCallPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  let sheet;
  try { sheet = await prepareRoster(query, "print", data => data); }
  catch (error) {
    if (error instanceof RosterOutputError && error.status === 401) redirect("/login");
    if (error instanceof RosterOutputError && error.status === 403) redirect("/forbidden");
    return <div className="no-print space-y-3">
      <PageHeader title="Printable roll-call" description={error instanceof RosterOutputError ? error.message : "The roll-call could not be prepared. Reopen the roster and try again."} />
      <Link className="underline" href="/attendance">Back to attendance</Link>
    </div>;
  }
  const { termName, groupId, rows, heading } = sheet;
  const backToRoster = query.from === "roster";
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Asia/Dhaka" }).format(new Date());
  return <div className="space-y-4">
    <div className="no-print space-y-3">
      <Link className="underline" href={`/attendance${backToRoster ? "/roster" : ""}?group=${groupId}`}>Back to {backToRoster ? "roster" : "attendance"}</Link>
      <PageHeader title="Printable roll-call" description={rows.length ? "Use A4 portrait in the print dialog." : "This group has no active roster members."}
        actions={rows.length ? <PrintRoutineButton label="Print roll-call" /> : undefined} />
    </div>
    {rows.length > 0 && <section className={styles.sheet} aria-label="Roll-call sheet">
      <table className={styles.table}>
        <colgroup><col className={styles.code} /><col className={styles.name} /><col className={styles.audience} /><col /></colgroup>
        <thead>
          <tr><td colSpan={4} className={styles.heading}>
            <h2 className="font-display text-xl font-semibold">Roll-call</h2>
            <p>{termName} · {heading?.courseCode} · {heading?.courseTitle}</p>
            <p>Group {groupId}{heading?.audience ? ` · ${heading.audience}` : ""}</p>
            <p>Class date ____________________ <span className={styles.generated}>Generated {generated}</span></p>
          </td></tr>
          <tr><th scope="col">Student ID</th><th scope="col">Student Name</th><th scope="col">Audience</th><th scope="col">Mark</th></tr>
        </thead>
        <tbody>{rows.map(row => <tr key={row.studentCode}>
          <td>{row.studentCode}</td><td>{row.fullName}</td><td>{audienceLabels[row.audience] ?? row.audience}</td><td />
        </tr>)}</tbody>
      </table>
    </section>}
  </div>;
}
