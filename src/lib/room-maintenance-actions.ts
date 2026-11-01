"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid } from "./action-result";
import { saveMaintenanceInTransaction, type MaintenanceResult } from "./room-maintenance-transaction";

export async function saveMaintenanceAction(_previous: MaintenanceResult | null, form: FormData): Promise<MaintenanceResult> {
  const actor = await actionActor("manage_rooms");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = {};
  for (const field of ["roomId", "revision", "action", "entryId", "entryRevision", "startDate", "endDate", "startMinutes", "endMinutes", "reason", "correctionReason", "fingerprint", "acknowledge", "confirmCancellation"]) {
    const values = form.getAll(field);
    if (values.length > 1 || values.some((v) => typeof v !== "string")) return invalid("Submit each maintenance field once as text.");
    raw[field] = values[0];
  }
  raw.weekdays = form.getAll("weekdays");
  if ((raw.weekdays as unknown[]).some((v) => typeof v !== "string")) return invalid("Choose academic weekdays as text values.");
  let result: MaintenanceResult;
  try { result = await db.transaction((tx) => saveMaintenanceInTransaction(tx, actor, raw)); }
  catch { return invalid("Maintenance could not be saved. Your input is kept. Try again."); }
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
