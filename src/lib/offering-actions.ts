"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid, type ActionResult } from "./action-result";
import { changeOfferingsInTransaction, type OfferingResult } from "./offering-store";
import { getOfferingChanges } from "./offering-data";

const SINGLE_FIELDS = ["command", "termId", "sourceId", "batchId", "courseId", "offeringId", "fingerprint", "reason", "acknowledge", "confirmation"] as const;

export async function changeOfferingsAction(_previous: ActionResult | null, form: FormData): Promise<OfferingResult> {
  const actor = await actionActor("manage_offerings");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = {};
  for (const field of SINGLE_FIELDS) {
    const values = form.getAll(field);
    if (values.length > 1 || values.some(value => typeof value !== "string")) return invalid("Submit each offering field once as text.", { [field]: ["Repeated or file values are not supported."] });
    raw[field] = values[0];
  }
  // Only the reviewed start step carries several ticks; each is "<cohort>:<course>" text.
  const picks = form.getAll("pick");
  if (picks.some(value => typeof value !== "string") || picks.length > 2000) return invalid("Review the ticked courses and submit again.", { pick: ["Unsupported selection."] });
  let result: OfferingResult;
  try { result = await db.transaction(tx => changeOfferingsInTransaction(tx, actor, raw, picks)); }
  catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    return code === "23505" ? invalid("That course is already offered to this cohort. Review the current list.") : invalid("The offering change could not be saved. Your input is kept. Try again.");
  }
  if (result.ok && result.message !== "Nothing changed.") revalidatePath("/", "layout");
  return result;
}
export async function loadOfferingChangesAction(termId: number, before: number) { return getOfferingChanges(termId, before); }
