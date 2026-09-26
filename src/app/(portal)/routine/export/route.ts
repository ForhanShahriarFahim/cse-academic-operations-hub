import { getPortalData } from "@/lib/data";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { serializeRoutineCsv } from "@/lib/routine-csv";
import { draftRoutineSource } from "@/lib/routine-sources";
import { can, getOptionalActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getOptionalActor();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!await can(actor, "view_internal_portal")) return Response.json({ error: "Access denied." }, { status: 403 });
  const data = await getPortalData();
  const source = draftRoutineSource(data);
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = parseRoutineSelection(params, source.batches, { strict: true });
  if (parsed.errors.length > 0) {
    return Response.json({ errors: parsed.errors }, { status: 400 });
  }
  const csv = serializeRoutineCsv(projectRoutine({ source, selection: parsed.selection }));
  return new Response(csv.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
