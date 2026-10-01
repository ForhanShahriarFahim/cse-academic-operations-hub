import { analyzeSchedule } from "./conflicts";
import type { PortalData } from "./data";
import type { RoutineSource } from "./routine-projection";
import { legacyTimeGrid } from "./time-grid-legacy";

export function draftRoutineSource(data: PortalData): RoutineSource {
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    windows: data.windows,
  });
  return {
    kind: "draft",
    termName: data.term.name,
    effectiveFrom: data.term.effectiveFrom,
    generatedAt: new Date().toISOString(),
    versionNumber: null,
    legacyContext: false,
    meetings: data.meetings,
    batches: data.batches,
    breaks: data.breaks,
    timeGrid: data.timeGrid,
    externals: data.externals,
    issues,
  };
}

export function publishedRoutineSource(data: PortalData): RoutineSource | null {
  const snapshot = data.publishedSnapshot;
  if (!snapshot) return null;
  const published = data.versions.find((version) => version.state === "published");
  const issues = data.publishedSnapshotLegacy
    ? analyzeSchedule({
        meetings: snapshot.meetings,
        externals: snapshot.externalCommitments,
        breaks: snapshot.breaks,
        windows: data.windows,
      })
    : snapshot.issues;
  return {
    kind: "published",
    termName: snapshot.term.name,
    effectiveFrom: snapshot.term.effectiveFrom,
    generatedAt: snapshot.generatedAt,
    versionNumber: snapshot.versionNumber,
    publishedAt: published?.publishedAt ?? null,
    legacyContext: data.publishedSnapshotLegacy,
    meetings: snapshot.meetings,
    batches: snapshot.batches,
    breaks: snapshot.breaks,
    timeGrid: snapshot.timeGrid ?? legacyTimeGrid(snapshot.breaks),
    externals: snapshot.externalCommitments,
    issues,
  };
}
