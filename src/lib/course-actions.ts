"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid, type ActionResult } from "./action-result";
import { COURSE_FIELDS } from "./course-records";
import { saveCourseInTransaction, type CourseResult } from "./course-store";
import { getCourseChanges } from "./course-data";

export async function saveCourseAction(_previous: ActionResult | null, form: FormData): Promise<CourseResult> {
  const actor = await actionActor("manage_catalog");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = {};
  for (const field of [...COURSE_FIELDS, "courseId", "revision", "command", "reason", "fingerprint", "acknowledge", "confirmation"]) {
    const values = form.getAll(field);
    if (values.length > 1 || values.some(value => typeof value !== "string")) return invalid("Submit each catalog field once as text.", { [field]: ["Repeated or file values are not supported."] });
    raw[field] = values[0];
  }
  let result: CourseResult;
  try { result = await db.transaction(tx => saveCourseInTransaction(tx, actor, raw)); }
  catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    return code === "23505" ? invalid("This course code is already in use.", { code: ["Choose another code."] }) : invalid("The course change could not be saved. Your input is kept. Try again.");
  }
  if (result.ok && result.message !== "Nothing changed.") revalidatePath("/", "layout");
  return result;
}
export async function loadCourseChangesAction(id: number, before: number) { return getCourseChanges(id, before); }
