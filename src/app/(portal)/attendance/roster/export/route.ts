import { excelAttachment, prepareRoster, PRIVATE_ROSTER_CACHE, rosterCsv, rosterErrorResponse, rosterHeadings, RosterOutputError } from "@/lib/roster-output";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const format = params.format;
  try {
    if (format !== "csv" && format !== "xlsx") throw new RosterOutputError(400, "Choose CSV or Excel.");
    return await prepareRoster(params, format, ({ termId, groupId, rows }) => {
      const filename = `roster-term-${termId}-group-${groupId}.${format}`;
      if (format === "xlsx") return excelAttachment(filename, [rosterHeadings, ...rows.map(row => [row.studentCode, row.fullName, row.audience])]);
      return new Response(rosterCsv(rows), { headers: {
        "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": PRIVATE_ROSTER_CACHE, "X-Content-Type-Options": "nosniff",
      } });
    });
  } catch (error) { return rosterErrorResponse(error); }
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": PRIVATE_ROSTER_CACHE } });
}
