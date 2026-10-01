import { getPublicRoutineData } from "@/lib/public-routine";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { serializeRoutineCsv } from "@/lib/routine-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await getPublicRoutineData();
  const source = data?.source ?? null;
  if (!source) return Response.json({ error: "No published routine." }, { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = parseRoutineSelection(params, source, { strict: true });
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
