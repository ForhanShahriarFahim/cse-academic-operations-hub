/**
 * Id-based actions may only change records of the active term. Pages load only
 * the active term, so a record from another term reaches an action only through
 * a stale page or a crafted request; historical terms stay unchanged.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms, attendanceSessions, externalCommitments, extraLoadClasses, extraLoadManualSummaries,
  meetings, teachingGroups,
} from "@/db/schema";
import { stale } from "./action-result";

export type TermScopedRecord =
  | "teaching_group"
  | "meeting"
  | "external_commitment"
  | "extra_load_class"
  | "extra_load_manual_summary"
  | "attendance_session";

export const OUTSIDE_ACTIVE_TERM = stale(
  "This record belongs to a term that is not active, so it cannot be changed here. Reload the page.",
  "not_active_term",
);

/** The owning term; `null` for term-independent rows, `undefined` when the record does not exist. */
async function owningTermId(kind: TermScopedRecord, id: number): Promise<number | null | undefined> {
  const first = async (rows: Promise<Array<{ termId: number | null }>>) => (await rows)[0]?.termId;
  switch (kind) {
    case "teaching_group":
      return first(db.select({ termId: teachingGroups.termId }).from(teachingGroups).where(eq(teachingGroups.id, id)).limit(1));
    case "meeting":
      return first(db.select({ termId: teachingGroups.termId }).from(meetings)
        .innerJoin(teachingGroups, eq(meetings.teachingGroupId, teachingGroups.id)).where(eq(meetings.id, id)).limit(1));
    case "external_commitment":
      return first(db.select({ termId: externalCommitments.termId }).from(externalCommitments).where(eq(externalCommitments.id, id)).limit(1));
    case "extra_load_class":
      return first(db.select({ termId: extraLoadClasses.termId }).from(extraLoadClasses).where(eq(extraLoadClasses.id, id)).limit(1));
    case "extra_load_manual_summary":
      return first(db.select({ termId: extraLoadManualSummaries.termId }).from(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.id, id)).limit(1));
    case "attendance_session":
      return first(db.select({ termId: attendanceSessions.termId }).from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1));
  }
}

/**
 * True when the record belongs to the active term, is term-independent, or does
 * not exist (missing records keep each action's existing not-found behaviour).
 */
export async function isInActiveTerm(kind: TermScopedRecord, id: number): Promise<boolean> {
  const termId = await owningTermId(kind, id);
  if (termId == null) return true;
  const [active] = await db.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.status, "active")).limit(1);
  return active?.id === termId;
}
