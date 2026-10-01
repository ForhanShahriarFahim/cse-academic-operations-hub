import { INSTITUTION } from "./constants";
import type { PortalData, TeacherRow } from "./data";
import { draftRoutineSource, publishedRoutineSource } from "./routine-sources";
import type { RoutineSource } from "./routine-projection";
import { projectTeacherRoutine, teacherRoutineDiff, type TeacherRoutine } from "./teacher-routine";

export type RoutineChoice = "published" | "draft";

export interface ChosenSource {
  kind: RoutineChoice;
  source: RoutineSource;
  hasPublished: boolean;
}

/** The published version by default; the working draft when asked for or when nothing is published. */
export function chooseRoutineSource(data: PortalData, requested: string | string[] | undefined): ChosenSource {
  const published = publishedRoutineSource(data);
  const wantDraft = (Array.isArray(requested) ? requested[0] : requested) === "draft";
  if (published && !wantDraft) return { kind: "published", source: published, hasPublished: true };
  return { kind: "draft", source: draftRoutineSource(data), hasPublished: published != null };
}

export function teacherRoutineFor(data: PortalData, source: RoutineSource, teacher: TeacherRow): TeacherRoutine {
  return projectTeacherRoutine({
    source,
    teacher: { id: teacher.id, fullName: teacher.fullName, shortCode: teacher.shortCode, designation: teacher.designation, status: teacher.status },
    allocations: data.allocations,
    coverage: data.coverage,
  });
}

/** Changed, added or removed classes of a teacher in the working draft compared with the publication. */
export function draftChangesFor(data: PortalData, chosen: ChosenSource, teacherId: number): number {
  if (chosen.kind !== "published") return 0;
  return teacherRoutineDiff(data.meetings, chosen.source.meetings, teacherId).total;
}

/** Day index (0 = Saturday … 6 = Friday) of today in Asia/Dhaka. */
export function todayIndex(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: INSTITUTION.timeZone }).format(now);
  return ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(weekday);
}

/** Bulk-print status: a full routine, only work with no fixed time, or nothing to print. */
export function hasRoutineContent(routine: TeacherRoutine): "classes" | "no_fixed_time" | "none" {
  if (routine.programs.length || routine.otherDepartments.length) return "classes";
  return routine.noFixedTime.length || routine.credits.total > 0 ? "no_fixed_time" : "none";
}
