/**
 * BUG-27 (#27) production-path child: the real class and external-commitment
 * deletes, signed in as an administrator, on the pinned owned database.
 *   run <adminEmail> <json ids> — prints each action's result as one JSON report
 */
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as ActionsModule from "../../../src/lib/actions";
import type { ActionResult } from "../../../src/lib/action-result";

const { deleteMeetingAction, deleteExternalAction } = loadApp<typeof ActionsModule>("src/lib/actions.ts");

async function run(ids: { meetingId: number; externalId: number }) {
  const results: Record<string, ActionResult | { threw: true; message: string }> = {};
  const attempt = async (name: string, action: () => Promise<ActionResult>) => {
    try {
      results[name] = await action();
    } catch (error) {
      results[name] = { threw: true, message: (error as { cause?: { message?: string } }).cause?.message ?? String(error) };
    }
  };
  await attempt("deleteMeeting", () => deleteMeetingAction(ids.meetingId));
  await attempt("deleteExternal", () => deleteExternalAction(ids.externalId));
  report(results);
}

const [command, email, argument] = process.argv.slice(2);
signInAs(email);
if (command === "run") {
  run(JSON.parse(argument)).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
