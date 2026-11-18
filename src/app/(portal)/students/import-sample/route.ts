import { can, getOptionalActor } from "@/lib/auth";
import { excelAttachment, rosterErrorResponse, RosterOutputError, withRosterOutput } from "@/lib/roster-output";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if ("group" in query) {
      return await withRosterOutput(query, false, async () => excelAttachment("roster-import-sample.xlsx", [
        ["Student ID", "Student Name", "Department", "Audience Type"], ["00141", "Example Student", "CSE", "local"],
      ]));
    }
    const actor = await getOptionalActor();
    if (!actor) throw new RosterOutputError(401, "Sign in to continue.");
    if (!await can(actor, "manage_students")) throw new RosterOutputError(403, "You do not have access to student imports.");
    return excelAttachment("student-import-sample.xlsx", [
      ["Student ID", "Student Name", "Department"], ["00141", "Example Student", "CSE"],
    ]);
  } catch (error) { return rosterErrorResponse(error); }
}
