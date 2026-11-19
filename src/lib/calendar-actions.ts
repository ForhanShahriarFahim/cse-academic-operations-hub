"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid } from "./action-result";
import { changeCalendarInTransaction, type CalendarResult } from "./calendar-store";
import { getCalendarChanges } from "./calendar-data";

const FIELDS = ["command", "termId", "revision", "entryId", "kind", "title", "startDate", "endDate", "regularClasses", "source", "sourceUrl", "teachingStart", "teachingEnd", "reason"] as const;

export async function changeCalendarAction(_previous: CalendarResult | null, form: FormData): Promise<CalendarResult> {
  const actor = await actionActor("manage_terms");
  if ("ok" in actor) return actor;
  if (!(form instanceof FormData)) return invalid("Submit a valid calendar form.");
  const raw: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const values = form.getAll(field);
    if (values.length > 1 || values.some(value => typeof value !== "string")) return invalid("Submit each calendar field once as text.", { [field]: ["Repeated or file values are not supported."] });
    raw[field] = values[0];
  }
  let result: CalendarResult;
  try { result = await db.transaction(tx => changeCalendarInTransaction(tx, actor, raw)); }
  catch (error) {
    const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return invalid("This entry is already in the calendar.", { title: ["An entry with this type, title and dates is already recorded."] });
    return invalid("The calendar could not be saved. Your entries are kept. Try again.");
  }
  if (result.ok && result.message !== "Nothing changed.") revalidatePath("/", "layout");
  return result;
}
export async function loadCalendarChangesAction(termId: number, before: number) { return getCalendarChanges(termId, before); }
