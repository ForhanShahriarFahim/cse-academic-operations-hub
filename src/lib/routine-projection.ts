import { dayGroups, streamDays, isExceptionOnlyDay, type Stream, type TimeGrid } from "./time-grid";
import type { BreakRule, Issue } from "./conflicts";
import type { ExternalCommitmentView, MeetingView } from "./serialize";
import { overlaps } from "./time";

export type RoutineView = "day" | "week";

/** One period column. */
export interface SlotDef { start: number; end: number }

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
  /** Periods and days this source is drawn with (stored, or legacy for older publications). */
  timeGrid: TimeGrid;
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
  /** The batch has classes this day but no periods (no plan, or a "No classes" exception). */
  unplanned?: boolean;
}

/** Batches that share one period pattern on a day, drawn under one header row. */
export interface RoutineDayGroup {
  key: string;
  name: string;
  isStreamDefault: boolean;
  slots: SlotDef[];
  breaks: ProjectedBreak[];
  rows: ProjectedBatchRow[];
}

export interface RoutineDayProjection {
  dayOfWeek: number;
  /** The stream's own group first. A day with one group reads exactly like a single table. */
  groups: RoutineDayGroup[];
  /** The stream has no plan this day; only batches with an extra-day exception teach. */
  exceptionOnly: boolean;
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
  source: Pick<RoutineSource, "batches" | "timeGrid">,
  options: { strict?: boolean } = {},
): { selection: RoutineSelection; errors: string[] } {
  const batches = source.batches;
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

  const validDays = streamDays(source.timeGrid, stream);
  const rawDay = one(params.day);
  const parsedDay = rawDay == null || rawDay === "" ? validDays[0] : Number(rawDay);
  const day = Number.isInteger(parsedDay) && validDays.includes(parsedDay) ? parsedDay : validDays[0] ?? 0;
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
  const grid = source.timeGrid;
  const days = streamDays(grid, selection.stream);
  const selectedDays = selection.view === "week" ? days : days.includes(selection.day) ? [selection.day] : days.slice(0, 1);
  const dayOrder = new Map(days.map((day, index) => [day, index]));
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

  const projectedDays = selectedDays.map<RoutineDayProjection>((dayOfWeek) => {
    const dayMeetings = exportMeetings.filter((item) => item.meeting.dayOfWeek === dayOfWeek);
    const meetingsOf = (batch: RoutineBatch) => dayMeetings.filter((item) =>
      item.meeting.audiences.some((audience) => audience.batchId === batch.id));

    const groups = dayGroups(grid, selection.stream, dayOfWeek, selectedBatches).map<RoutineDayGroup>((group) => {
      const slots: SlotDef[] = group.pattern.periods.map(({ start, end }) => ({ start, end }));
      const breaks = group.pattern.breaks
        .map<ProjectedBreak>((item, index) => {
          let afterSlot = -1;
          slots.forEach((slot, slotIndex) => { if (slot.end <= item.start) afterSlot = slotIndex; });
          return {
            id: index + 1, name: item.name, scope: "stream", stream: selection.stream, dayOfWeek,
            startMinutes: item.start, endMinutes: item.end, afterSlot,
          };
        })
        .filter((item) => item.afterSlot >= 0 && item.afterSlot < slots.length - 1);
      return {
        key: String(group.pattern.id),
        name: group.pattern.name,
        isStreamDefault: group.isStreamDefault,
        slots,
        breaks,
        rows: group.batches.map((batch) => batchRow(batch, meetingsOf(batch), slots)),
      };
    });

    // Classes for batches with no periods this day stay visible, at their exact times.
    const placed = new Set(groups.flatMap((group) => group.rows.map((row) => row.batch.id)));
    const unplanned = selectedBatches.filter((batch) => !placed.has(batch.id) && meetingsOf(batch).length > 0);
    if (unplanned.length) {
      if (groups.length === 0) groups.push({ key: "none", name: "No periods set", isStreamDefault: false, slots: [], breaks: [], rows: [] });
      const host = groups[0];
      for (const batch of unplanned) {
        host.rows.push({ batch, offGrid: meetingsOf(batch), slots: host.slots.map((slot) => ({ ...slot, meetings: [], continuations: [] })), unplanned: true });
      }
    }

    return {
      dayOfWeek,
      groups,
      exceptionOnly: isExceptionOnlyDay(grid, selection.stream, dayOfWeek),
      externals: source.externals
        .filter((item) => item.dayOfWeek === dayOfWeek && item.startMinutes != null && item.endMinutes != null)
        .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0) || a.id - b.id),
    };
  });

  return {
    source,
    selection,
    availableBatches,
    days: projectedDays,
    exportMeetings,
    issueCount: {
      blockers: source.issues.filter((issue) => issue.severity === "blocker").length,
      warnings: source.issues.filter((issue) => issue.severity === "warning").length,
    },
  };
}

function batchRow(batch: RoutineBatch, batchMeetings: ProjectedMeeting[], slots: SlotDef[]): ProjectedBatchRow {
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
    return { ...slot, meetings, continuations: overlapping.filter((item) => !meetings.includes(item)) };
  });
  return { batch, offGrid, slots: projectedSlots };
}
