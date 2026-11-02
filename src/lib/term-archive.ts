import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scheduleVersions } from "@/db/schema";
import { authorize } from "./auth";
import { frozenPublication, frozenRoutineSource } from "./term-publication";

export async function getTermPublication(termId: number, versionId: number) {
  await authorize("view_internal_portal");
  if (!Number.isSafeInteger(termId) || termId < 1 || !Number.isSafeInteger(versionId) || versionId < 1) return null;
  const [row] = await db.select().from(scheduleVersions).where(and(eq(scheduleVersions.id,versionId),eq(scheduleVersions.termId,termId),inArray(scheduleVersions.state,["published","superseded"]))).limit(1);
  if (!row) return null;
  const snapshot = frozenPublication(row.snapshot,termId,row.versionNumber);
  if (!snapshot) return null;
  const publishedAt = row.publishedAt?.toISOString()??null;
  return { source:frozenRoutineSource(snapshot,publishedAt), metadata:snapshot.metadata, state:row.state };
}
