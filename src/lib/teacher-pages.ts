/** TCH-01: shared server helpers for the teacher editing pages. */
import { redirect } from "next/navigation";
import { can, getOptionalActor } from "./auth";
import { fmtInstant } from "./auth/display";
import type { TeacherFormValues } from "@/components/teachers/teacher-form";
import type { TeacherRecord } from "./teacher-data";
import { getTeacherChanges } from "./teacher-data";

/** The signed-in teacher editor, or a redirect to sign in or to the forbidden page. */
export async function requireTeacherEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await can(actor, "manage_teachers")) redirect("/forbidden");
  return { actor, privateContacts: await can(actor, "view_private_contacts") };
}

export function formValues(record: TeacherRecord | null, privateContacts: boolean): TeacherFormValues {
  return {
    shortCode: record?.shortCode ?? "",
    fullName: record?.status === "unresolved" ? "" : record?.fullName ?? "",
    designation: record?.designation ?? "",
    employmentType: record?.employmentType ?? "",
    homeDepartmentId: record?.homeDepartmentId != null ? String(record.homeDepartmentId) : "",
    email: record?.email ?? "",
    phonePrivate: privateContacts ? record?.phonePrivate ?? "" : "",
    advisoryLoadUnits: record?.advisoryLoadUnits != null ? String(Number(record.advisoryLoadUnits)) : "",
    notes: record?.status === "unresolved" ? "" : record?.notes ?? "",
  };
}

/** "Last saved today, 2:05 pm by Farzana Rahman." from the newest change. */
export async function lastSavedLine(teacherId: number): Promise<string | null> {
  const [latest] = (await getTeacherChanges(teacherId)).filter((change) => change.action.startsWith("teacher."));
  return latest ? `Last saved ${fmtInstant(latest.at)} by ${latest.actor}.` : null;
}
