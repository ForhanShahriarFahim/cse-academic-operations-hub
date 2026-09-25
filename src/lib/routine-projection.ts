import { daysForStream, slotsFor, type SlotDef, type Stream } from "./constants";
import type { BreakRule, Issue } from "./conflicts";
import type { ExternalCommitmentView, MeetingView } from "./serialize";
import { overlaps } from "./time";

export type RoutineView = "day" | "week";

export interface RoutineBatch {
  id: number;
  stream: Stream;
  label: string;
  semester: number | null;
  studentCount: number | null;
  sortOrder: number;
}

export interface RoutineSelection {
  stream: Stream;
  view: RoutineView;
  day: number;
  batchId?: number;
}

export interface RoutineSource {
  kind: "draft" | "published";
  termName: string;
  effectiveFrom: string | null;
  generatedAt: string;
  versionNumber: number | null;
  publishedAt?: string | null;
  legacyContext: boolean;
  meetings: MeetingView[];
  batches: RoutineBatch[];
  breaks: BreakRule[];
  externals: ExternalCommitmentView[];
  issues: Issue[];
}

export interface ProjectedMeeting {
  meeting: MeetingView;
  validationStatus: "blocker" | "warning" | "clear";
  warningCodes: Issue["type"][];
}

export interface ProjectedSlot extends SlotDef {
  meetings: ProjectedMeeting[];
  continuations: ProjectedMeeting[];
}

export interface ProjectedBreak extends BreakRule {
  afterSlot: number;
}

export interface ProjectedBatchRow {
  batch: RoutineBatch;
  offGrid: ProjectedMeeting[];
  slots: ProjectedSlot[];
}

export interface RoutineDayProjection {
  dayOfWeek: number;
  slots: SlotDef[];
  breaks: ProjectedBreak[];
  rows: ProjectedBatchRow[];
  externals: ExternalCommitmentView[];
}

export interface RoutineProjection {
  source: RoutineSource;
  selection: RoutineSelection;
  availableBatches: RoutineBatch[];
  days: RoutineDayProjection[];
  exportMeetings: ProjectedMeeting[];
  issueCount: { blockers: number; warnings: number };
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseRoutineSelection(
  params: SearchParams,
  batches: RoutineBatch[],
  options: { strict?: boolean } = {},
): { selection: RoutineSelection; errors: string[] } {
  const errors: string[] = [];
  const rawStream = one(params.stream);
  const stream: Stream = rawStream === "DIPLOMA" ? "DIPLOMA" : "HSC";
  if (options.strict && rawStream != null && rawStream !== "HSC" && rawStream !== "DIPLOMA") {
    errors.push("stream must be HSC or DIPLOMA");
  }

  const rawView = one(params.view);
  const view: RoutineView = rawView === "week" ? "week" : "day";
  if (options.strict && rawView != null && rawView !== "day" && rawView !== "week") {
    errors.push("view must be day or week");
  }

  const validDays = daysForStream(stream);
  const rawDay = one(params.day);
  const parsedDay = rawDay == null || rawDay === "" ? validDays[0] : Number(rawDay);
  const day = Number.isInteger(parsedDay) && validDays.includes(parsedDay) ? parsedDay : validDays[0];
  if (options.strict && rawDay != null && (!Number.isInteger(parsedDay) || !validDays.includes(parsedDay))) {
    errors.push("day is not valid for the selected stream");
  }

  const rawBatch = one(params.batch);
  let batchId: number | undefined;
  if (rawBatch != null && rawBatch !== "" && rawBatch !== "all") {
    const parsedBatch = Number(rawBatch);
    const batch = batches.find((candidate) => candidate.id === parsedBatch && candidate.stream === stream);
    if (Number.isInteger(parsedBatch) && batch) batchId = parsedBatch;
    else if (options.strict) errors.push("batch is not valid for the selected stream");
  }

  return { selection: { stream, view, day, ...(batchId ? { batchId } : {}) }, errors };
}

function issueProjection(meeting: MeetingView, issues: Issue[]): ProjectedMeeting {
  const related = issues.filter((issue) => issue.meetingIds.includes(meeting.id));
  const validationStatus = related.some((issue) => issue.severity === "blocker")
    ? "blocker"
    : related.some((issue) => issue.severity === "warning")
      ? "warning"
      : "clear";
  return {
    meeting,
    validationStatus,
    warningCodes: [...new Set(related.map((issue) => issue.type))].sort(),
  };
}

function meetingOrder(dayOrder: Map<number, number>) {
  return (a: ProjectedMeeting, b: ProjectedMeeting) =>
    (dayOrder.get(a.meeting.dayOfWeek) ?? 99) - (dayOrder.get(b.meeting.dayOfWeek) ?? 99)
    || a.meeting.startMinutes - b.meeting.startMinutes
    || a.meeting.endMinutes - b.meeting.endMinutes
    || a.meeting.courseCode.localeCompare(b.meeting.courseCode)
    || a.meeting.id - b.meeting.id;
}

export function projectRoutine({
  source,
  selection,
}: {
  source: RoutineSource;
  selection: RoutineSelection;
}): RoutineProjection {
  const streamDays = daysForStream(selection.stream);
  const selectedDays = selection.view === "week" ? streamDays : [streamDays.includes(selection.day) ? selection.day : streamDays[0]];
  const dayOrder = new Map(streamDays.map((day, index) => [day, index]));
  const availableBatches = source.batches
    .filter((batch) => batch.stream === selection.stream)
    .sort((a, b) => b.sortOrder - a.sortOrder || a.label.localeCompare(b.label));
  const selectedBatches = selection.batchId
    ? availableBatches.filter((batch) => batch.id === selection.batchId)
    : availableBatches;

  const projectedById = new Map<number, ProjectedMeeting>();
  for (const meeting of source.meetings) {
    const inStream = meeting.audiences.some((audience) => audience.stream === selection.stream);
    const inBatch = selection.batchId == null || meeting.audiences.some((audience) => audience.batchId === selection.batchId);
    if (!inStream || !inBatch || !selectedDays.includes(meeting.dayOfWeek)) continue;
    projectedById.set(meeting.id, issueProjection(meeting, source.issues));
  }
  const exportMeetings = [...projectedById.values()].sort(meetingOrder(dayOrder));

  const days = selectedDays.map<RoutineDayProjection>((dayOfWeek) => {
    const slots = slotsFor(selection.stream, dayOfWeek);
    const projectedBreaks = source.breaks
      .filter((item) =>
        (item.dayOfWeek == null || item.dayOfWeek === dayOfWeek)
        && (item.scope === "institution" || item.stream == null || item.stream === selection.stream),
      )
      .map<ProjectedBreak>((item) => {
        let afterSlot = -1;
        slots.forEach((slot, index) => {
          if (slot.end <= item.startMinutes) afterSlot = index;
        });
        return { ...item, afterSlot };
      })
      .filter((item) => item.afterSlot >= 0 && item.afterSlot < slots.length - 1);

    const dayMeetings = exportMeetings.filter((item) => item.meeting.dayOfWeek === dayOfWeek);
    const rows = selectedBatches.map<ProjectedBatchRow>((batch) => {
      const batchMeetings = dayMeetings.filter((item) =>
        item.meeting.audiences.some((audience) => audience.batchId === batch.id),
      );
      const offGrid = batchMeetings.filter((item) =>
        !slots.some((slot) => overlaps(item.meeting.startMinutes, item.meeting.endMinutes, slot.start, slot.end)),
      );
      const projectedSlots = slots.map<ProjectedSlot>((slot) => {
        const overlapping = batchMeetings.filter((item) =>
          overlaps(item.meeting.startMinutes, item.meeting.endMinutes, slot.start, slot.end),
        );
        const meetings = overlapping.filter((item) => {
          const first = slots.find((candidate) =>
            overlaps(item.meeting.startMinutes, item.meeting.endMinutes, candidate.start, candidate.end),
          );
          return first?.start === slot.start;
        });
        return {
          ...slot,
          meetings,
          continuations: overlapping.filter((item) => !meetings.includes(item)),
        };
      });
      return { batch, offGrid, slots: projectedSlots };
    });

    return {
      dayOfWeek,
      slots,
      breaks: projectedBreaks,
      rows,
      externals: source.externals
        .filter((item) => item.dayOfWeek === dayOfWeek && item.startMinutes != null && item.endMinutes != null)
        .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0) || a.id - b.id),
    };
  });

  return {
    source,
    selection,
    availableBatches,
    days,
    exportMeetings,
    issueCount: {
      blockers: source.issues.filter((issue) => issue.severity === "blocker").length,
      warnings: source.issues.filter((issue) => issue.severity === "warning").length,
    },
  };
}
