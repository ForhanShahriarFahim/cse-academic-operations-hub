import type { RoutineProjection } from "./routine-projection";
import { sharingLabel } from "./serialize";
import { DAY_NAMES, fmtRange24 } from "./time";

const HEADERS = [
  "source_status",
  "term",
  "publication_version",
  "effective_date",
  "snapshot_generated_at",
  "selected_stream",
  "selected_batch",
  "day",
  "start_time",
  "end_time",
  "course_code",
  "course_title",
  "course_type",
  "teachers",
  "rooms",
  "audiences",
  "shared_status",
  "is_exception",
  "exception_note",
  "validation_status",
  "warning_codes",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "term";
}

export function serializeRoutineCsv(projection: RoutineProjection): { body: string; filename: string } {
  const { source, selection } = projection;
  const selectedBatch = selection.batchId
    ? projection.availableBatches.find((batch) => batch.id === selection.batchId)
    : null;
  const sourceStatus = source.kind === "draft" ? "DRAFT — NOT OFFICIAL" : "PUBLISHED";
  const rows = projection.exportMeetings.map(({ meeting, validationStatus, warningCodes }) => {
    const time = fmtRange24(meeting.startMinutes, meeting.endMinutes).split("–");
    const localAudiences = meeting.audiences
      .map((audience) => `${audience.stream === "DIPLOMA" ? "DIP" : "HSC"}-${audience.batchLabel}`);
    if (meeting.externalAudienceLabel) localAudiences.push(meeting.externalAudienceLabel);
    return [
      sourceStatus,
      source.termName,
      source.versionNumber,
      source.effectiveFrom,
      source.generatedAt,
      selection.stream,
      selectedBatch ? `${selectedBatch.stream === "DIPLOMA" ? "DIP" : "HSC"}-${selectedBatch.label}` : "All batches",
      DAY_NAMES[meeting.dayOfWeek],
      time[0],
      time[1],
      meeting.courseCode,
      meeting.courseTitle,
      meeting.courseType,
      meeting.teachers.map((teacher) => teacher.shortCode).join(" + ") || "UT",
      meeting.rooms.map((room) => room.code).join(" + "),
      localAudiences.join(" + "),
      sharingLabel(meeting) ?? "",
      meeting.isException,
      meeting.exceptionNote,
      validationStatus,
      warningCodes.join(" | "),
    ];
  });

  const body = `\ufeff${[HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const stream = selection.stream.toLowerCase();
  const sourceSuffix = source.kind === "draft" ? "draft" : `v${source.versionNumber ?? "unknown"}`;
  const filename = `routine-${slug(source.termName)}-${stream}-${selection.view}-${sourceSuffix}.csv`;
  return { body, filename };
}
