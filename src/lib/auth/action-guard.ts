import { AuthenticationError, AuthorizationError, authorize, type Resource } from ".";
import type { Actor, Capability } from "./policy";

export type ActionDenied = { ok: false; message: string };

function denied(error: unknown): ActionDenied {
  if (error instanceof AuthenticationError) return { ok: false, message: "Sign in before making changes." };
  if (error instanceof AuthorizationError) return { ok: false, message: "You do not have permission to make this change." };
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
