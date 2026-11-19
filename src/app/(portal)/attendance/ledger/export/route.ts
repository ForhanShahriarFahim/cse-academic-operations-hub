import { ledgerCsv, ledgerFilename, ledgerFilterText } from "@/lib/attendance-ledger";
import { getAttendanceLedger } from "@/lib/attendance-ledger-data";
import { attendanceId } from "@/lib/attendance-selection";
import { PRIVATE_ROSTER_CACHE } from "@/lib/roster-output";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": PRIVATE_ROSTER_CACHE, "X-Content-Type-Options": "nosniff" };
const refuse = (status: number, message: string) => new Response(message, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });

/** ATT-05 CSV for the requested tab and filters; the same projection as the screen (D-5). */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const termId = attendanceId(query.term), groupId = attendanceId(query.group);
  if (!termId || !groupId) return refuse(404, "Attendance ledger not found.");
  const report = await getAttendanceLedger(termId, groupId, query);
  if (report.kind === "sign-in") return refuse(401, "Sign in to download the attendance ledger.");
  if (report.kind === "denied") return refuse(403, "You do not have access to this attendance ledger.");
  if (report.kind !== "ledger") return refuse(404, "Attendance ledger not found.");
  const { term, group, view, filters, teacherOptions, ledger } = report;
  const body = ledgerCsv(view, ledger, {
    term: term.name, course: `${group.courseCode} · ${group.courseTitle}`, audience: group.audience, groupId: group.id,
    filters: ledgerFilterText(filters, teacherOptions, iso => iso),
    generated: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date()) + " (Dhaka)",
  });
  return new Response(body, { headers: {
    ...headers, "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${ledgerFilename(view, termId, groupId, filters)}"`,
  } });
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", ...headers } });
}
