import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { academicTerms, scheduleVersions } from "@/db/schema";
import type { RoutineSource } from "./routine-projection";
import type { PublicationSnapshotV3, PublicationRoutineMetadata } from "./serialize";

function isPublishedSnapshot(value: unknown): value is PublicationSnapshotV3 {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 3 && typeof item.generatedAt === "string"
    && typeof item.versionNumber === "number" && Array.isArray(item.meetings)
    && Array.isArray(item.batches) && Array.isArray(item.breaks)
    && Array.isArray(item.externalCommitments) && Array.isArray(item.issues)
    && item.metadata != null && typeof item.metadata === "object";
}

export function publicMetadata(metadata: PublicationRoutineMetadata): PublicationRoutineMetadata {
  return {
    ...metadata,
    teachers: metadata.teachers.map((teacher) => ({ ...teacher, phone: null, email: null })),
    classRepresentatives: metadata.classRepresentatives.map((representative) => ({ ...representative, phone: null })),
    queryContacts: metadata.queryContacts.map((contact) => ({ ...contact, phone: "", email: null })),
  };
}

// No draft loader is reachable through this function. Public output is derived
// exclusively from the effective immutable publication row.
export async function getPublicRoutineData(): Promise<{ source: RoutineSource; metadata: PublicationRoutineMetadata } | null> {
  const [term] = await db.select({ id: academicTerms.id }).from(academicTerms)
    .where(eq(academicTerms.status, "active")).limit(1);
  if (!term) return null;
  const [version] = await db.select({ snapshot: scheduleVersions.snapshot, publishedAt: scheduleVersions.publishedAt })
    .from(scheduleVersions).where(and(eq(scheduleVersions.termId, term.id), eq(scheduleVersions.state, "published")))
    .orderBy(desc(scheduleVersions.versionNumber)).limit(1);
  if (!version || !isPublishedSnapshot(version.snapshot)) return null;
  const snapshot = version.snapshot;
  return {
    source: {
      kind: "published",
      termName: snapshot.term.name,
      effectiveFrom: snapshot.term.effectiveFrom,
      generatedAt: snapshot.generatedAt,
      versionNumber: snapshot.versionNumber,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      legacyContext: false,
      meetings: snapshot.meetings,
      batches: snapshot.batches,
      breaks: snapshot.breaks,
      externals: snapshot.externalCommitments,
      issues: snapshot.issues,
    },
    metadata: publicMetadata(snapshot.metadata),
  };
}
