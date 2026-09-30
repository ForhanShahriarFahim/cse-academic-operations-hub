/**
 * Production-path action probe: `action-probe.ts <email|-> <operation> [json]`.
 * Runs one real action or loader as the signed-in portal user (or anonymously)
 * and reports its result or the error it threw.
 */
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as AuthModule from "../../../src/lib/auth";
import type * as ActionsModule from "../../../src/lib/actions";
import type * as AcademicActionsModule from "../../../src/lib/academic-actions";
import type * as AdminActionsModule from "../../../src/lib/auth/admin-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function run(operation: string, argument: unknown): Promise<unknown> {
  switch (operation) {
    case "whoami": {
      const actor = await loadApp<typeof AuthModule>("src/lib/auth/index.ts").getOptionalActor();
      return { actorId: actor?.id ?? null };
    }
    case "upsertStudent":
      return loadApp<typeof AcademicActionsModule>("src/lib/academic-actions.ts").upsertStudentAction(form(argument as Record<string, string>));
    case "publish":
      return loadApp<typeof ActionsModule>("src/lib/actions.ts").publishAction(String(argument));
    case "autoSchedule":
      return loadApp<typeof AcademicActionsModule>("src/lib/academic-actions.ts").applyAutoScheduleAction();
    case "invite":
      await loadApp<typeof AdminActionsModule>("src/lib/auth/admin-actions.ts").inviteUserAction(form(argument as Record<string, string>));
      return { ok: true };
    default:
      throw new Error(`Unknown operation ${operation}`);
  }
}

async function main() {
  const [email, operation, json] = process.argv.slice(2);
  signInAs(email === "-" ? null : email);
  try {
    report({ result: await run(operation, json ? JSON.parse(json) : undefined) });
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause?.message;
    report({ error: { name: error instanceof Error ? error.name : "Error", message: cause ?? (error instanceof Error ? error.message : String(error)) } });
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
