import { AuthenticationError, AuthorizationError, authorize, type Resource } from ".";
import type { Actor, Capability } from "./policy";
import { denied as deniedResult, type ActionResult } from "../action-result";

export type ActionDenied = ActionResult & { ok: false };

function denied(error: unknown): ActionDenied {
  if (error instanceof AuthenticationError) return deniedResult("Sign in before making changes.", "unauthenticated");
  if (error instanceof AuthorizationError) return deniedResult("You do not have permission to make this change.", "forbidden");
  throw error;
}

export async function guardAction(capability: Capability, resource?: Resource): Promise<ActionDenied | null> {
  try { await authorize(capability, resource); return null; }
  catch (error) { return denied(error); }
}

export async function actionActor(capability: Capability, resource?: Resource): Promise<Actor | ActionDenied> {
  try { return await authorize(capability, resource); }
  catch (error) { return denied(error); }
}
