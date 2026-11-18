"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid, type ActionResult } from "./action-result";
import { changeClassGroupInTransaction, type ClassGroupResult } from "./class-group-store";
import { getClassGroupChanges } from "./class-group-data";
import { startClassGroupsInTransaction } from "./class-group-start-store";

const SINGLE_FIELDS = ["command", "termId", "groupId", "courseId", "delivery", "meetings", "minutes", "provisional", "method", "externalLabel", "externalCount", "notes", "reason", "fingerprint", "confirmation"] as const;
const LIST_FIELDS = { offering: 200, teacherId: 30, units: 30 } as const;

export async function changeClassGroupAction(_previous: ActionResult | null, form: FormData): Promise<ClassGroupResult> {
  const actor = await actionActor("manage_class_groups");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = {};
  for (const field of SINGLE_FIELDS) {
    const values = form.getAll(field);
    if (values.length > 1 || values.some(value => typeof value !== "string")) return invalid("Submit each class-group field once as text.", { [field]: ["Repeated or file values are not supported."] });
    raw[field] = values[0];
  }
  const lists: Record<string, unknown[]> = {};
  for (const [field, limit] of Object.entries(LIST_FIELDS)) {
    const values = form.getAll(field);
    if (values.some(value => typeof value !== "string") || values.length > limit) return invalid("Review the cohorts and teachers and submit again.", { [field]: ["Unsupported selection."] });
    lists[field] = values;
  }
  let result: ClassGroupResult;
  try { result = await db.transaction(tx => changeClassGroupInTransaction(tx, actor, raw, { offerings: lists.offering, teacherIds: lists.teacherId, units: lists.units })); }
  catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    return code === "23503" ? invalid("This class group is in use and could not be changed. Review its current details.") : invalid("The class-group change could not be saved. Your input is kept. Try again.");
  }
  if (result.ok && result.message !== "Nothing changed.") revalidatePath("/", "layout");
  return result;
}
export async function loadClassGroupChangesAction(termId: number, before: number) { return getClassGroupChanges(termId, before); }

export async function startClassGroupsAction(form: FormData): Promise<ActionResult> {
  const actor = await actionActor("manage_class_groups");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = {};
  for (const field of ["termId", "sourceId", "fingerprint", "reason"]) {
    const values = form.getAll(field);
    if (values.length !== 1 || typeof values[0] !== "string") return invalid("Submit each review field once as text.");
    raw[field] = values[0];
  }
  const picks = form.getAll("group");
  let result: ActionResult;
  try {
    result = await db.transaction(tx => startClassGroupsInTransaction(tx, actor, raw, picks));
  } catch {
    return invalid("The selected class groups could not be saved. Your selections are kept. Try again.");
  }
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
