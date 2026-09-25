import { projectRoutine, type RoutineDayProjection, type RoutineSource } from "./routine-projection";
import type { PublicationRoutineMetadata } from "./serialize";

export interface OfficialRoutinePage {
  kind: "routine";
  stream: "HSC" | "DIPLOMA";
  days: RoutineDayProjection[];
}

export type OfficialAppendixPage =
  | {
      kind: "courses";
      semesters: Array<{ semester: number; courses: PublicationRoutineMetadata["courses"] }>;
    }
  | {
      kind: "directory";
      teachers: PublicationRoutineMetadata["teachers"];
      classRepresentatives: PublicationRoutineMetadata["classRepresentatives"];
      queryContacts: PublicationRoutineMetadata["queryContacts"];
      sourceReconciliations: PublicationRoutineMetadata["sourceReconciliations"];
    };

export interface OfficialRoutinePackage {
  source: RoutineSource;
  routinePages: OfficialRoutinePage[];
  appendixPages: OfficialAppendixPage[];
}

export function buildOfficialRoutinePackage({
  source,
  metadata,
}: {
  source: RoutineSource;
  metadata: PublicationRoutineMetadata;
}): OfficialRoutinePackage {
  const routinePages: OfficialRoutinePage[] = (["HSC", "DIPLOMA"] as const).map((stream) => ({
    kind: "routine",
    stream,
    days: projectRoutine({ source, selection: { stream, view: "week", day: stream === "HSC" ? 0 : 6 } }).days,
  }));

  const semesters = [...new Set(metadata.courses.map((course) => course.semester))]
    .sort((a, b) => a - b)
    .map((semester) => ({
      semester,
      courses: metadata.courses
        .filter((course) => course.semester === semester)
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));

  return {
    source,
    routinePages,
    appendixPages: [
      { kind: "courses", semesters },
      {
        kind: "directory",
        teachers: metadata.teachers
          .filter((teacher) => teacher.status !== "unresolved")
          .sort((a, b) => a.shortCode.localeCompare(b.shortCode)),
        classRepresentatives: [...metadata.classRepresentatives].sort((a, b) => a.sortOrder - b.sortOrder),
        queryContacts: [...metadata.queryContacts].sort((a, b) => a.sortOrder - b.sortOrder),
        sourceReconciliations: metadata.sourceReconciliations,
      },
    ],
  };
}
