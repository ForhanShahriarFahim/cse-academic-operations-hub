/**
 * Production-path term scenario child. Commands:
 *   view <email>            — real loaders, workload and both CSV routes for the active term
 *   publish <email> <text>  — real publishAction for the active term
 *   cross-term <email> <json> — id-based actions against rows of another term
 */
import { createHash } from "node:crypto";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as DataModule from "../../../src/lib/data";
import type * as OperationsModule from "../../../src/lib/academic-operations";
import type * as PublicModule from "../../../src/lib/public-routine";
import type * as WorkloadModule from "../../../src/lib/workload";
import type * as ActionsModule from "../../../src/lib/actions";
import type * as AcademicActionsModule from "../../../src/lib/academic-actions";

type RouteModule = { GET(request: Request): Promise<Response> };

const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);

/** CSV rows without the per-request generation timestamp, for parity comparisons. */
async function csvSummary(route: RouteModule, query: string) {
  const response = await route.GET(new Request(`http://safe01.invalid/export?${query}`));
  const body = response.status === 200 ? await response.text() : "";
  const [header = "", ...rows] = body.trim().split(/\r?\n/).filter(Boolean);
  const columns = header.split(",");
  const generatedAt = columns.indexOf("snapshot_generated_at");
  const stable = rows.map((row) => row.split(",").filter((_, index) => index !== generatedAt).join(","));
  const values = (name: string) => [...new Set(rows.map((row) => row.split(",")[columns.indexOf(name)]))].sort();
  return {
    status: response.status,
    rows: rows.length,
    terms: values("term"),
    courses: values("course_code"),
    digest: createHash("sha256").update(stable.join("\n")).digest("hex").slice(0, 16),
  };
}

async function view() {
  const { getPortalData } = loadApp<typeof DataModule>("src/lib/data.ts");
  const { getAttendanceData, getExtraLoadData } = loadApp<typeof OperationsModule>("src/lib/academic-operations.ts");
  const { getPublicRoutineData } = loadApp<typeof PublicModule>("src/lib/public-routine.ts");
  const { computeWorkloads } = loadApp<typeof WorkloadModule>("src/lib/workload.ts");
  const internalCsv = loadApp<RouteModule>("src/app/(portal)/routine/export/route.ts");
  const publicCsv = loadApp<RouteModule>("src/app/public/routine/export/route.ts");

  const data = await getPortalData();
  const attendance = [];
  for (const group of data.coverage) {
    const result = await getAttendanceData(group.teachingGroupId);
    attendance.push({
      groupId: group.teachingGroupId,
      roster: result.roster.map((student) => student.studentCode),
      sessions: result.sessions.map((session) => ({ id: session.id, date: session.classDate, records: session.records.length })),
      marks: result.summaries.map((summary) => [summary.studentId, summary.mark, summary.maximum]),
    });
  }
  const extra = await getExtraLoadData();
  const workloads = computeWorkloads(data.meetings, data.allocations, () => false);
  const published = await getPublicRoutineData();
  report({
    term: { id: data.term.id, name: data.term.name },
    meetings: sortNumbers(data.meetings.map((meeting) => meeting.id)),
    meetingCourses: [...new Set(data.meetings.map((meeting) => meeting.courseCode))].sort(),
    audiences: data.meetings.flatMap((meeting) => meeting.audiences.map((audience) => `${meeting.courseCode}:${audience.stream}-${audience.batchLabel}@${audience.semester}`)).sort(),
    groups: sortNumbers(data.coverage.map((group) => group.teachingGroupId)),
    batches: data.batches.map((batch) => `${batch.stream}-${batch.label}@${batch.semester}`).sort(),
    allocations: sortNumbers(data.allocations.map((allocation) => allocation.id)),
    externals: sortNumbers(data.externals.map((external) => external.id)),
    windows: sortNumbers(data.windows.map((window) => window.id)),
    versions: data.versions.map((version) => `${version.versionNumber}:${version.state}`),
    publishedSnapshotTerm: data.publishedSnapshot?.term.name ?? null,
    representatives: data.classRepresentatives.map((representative) => representative.fullName),
    contacts: data.queryContacts.map((contact) => contact.fullName),
    reconciliations: data.sourceReconciliations.map((item) => item.detail),
    attendance,
    extraLoad: {
      rate: extra.policy.extraClassRate,
      classes: sortNumbers(extra.classes.map((row) => row.id)),
      manual: sortNumbers(extra.manualSummaries.map((row) => row.id)),
      summaries: extra.teacherSummaries.map((row) => [row.teacher.shortCode, row.assignedCredits, row.classCount, row.amount]),
    },
    workloads: [...workloads.values()].map((row) => [row.teacherId, row.workloadUnits, row.weeklyContactMinutes]).sort(),
    publicRoutine: published ? { term: published.source.termName, version: published.source.versionNumber } : null,
    csv: {
      internalHsc: await csvSummary(internalCsv, "stream=HSC&view=week"),
      internalDiploma: await csvSummary(internalCsv, "stream=DIPLOMA&view=week"),
      publicHsc: await csvSummary(publicCsv, "stream=HSC&view=week"),
    },
  });
}

async function publish(summary: string) {
  const { publishAction } = loadApp<typeof ActionsModule>("src/lib/actions.ts");
  report(await publishAction(summary));
}

/** Each action is attempted against rows of a term that is not active. */
async function crossTerm(ids: Record<string, number>) {
  const actions = loadApp<typeof ActionsModule>("src/lib/actions.ts");
  const academic = loadApp<typeof AcademicActionsModule>("src/lib/academic-actions.ts");
  const meetingForm = new FormData();
  meetingForm.set("teachingGroupId", String(ids.teachingGroupId));
  meetingForm.set("dayOfWeek", "3");
  meetingForm.set("startTime", "2:00 PM");
  meetingForm.set("endTime", "3:15 PM");
  meetingForm.append("teacherIds", String(ids.teacherId));
  meetingForm.append("roomIds", String(ids.roomId));
  const attempts: Array<[string, () => Promise<{ ok: boolean; message: string }>]> = [
    ["createMeeting", () => actions.createMeetingAction(meetingForm)],
    ["moveMeeting", () => actions.moveMeetingAction(ids.meetingId, 3, 900, 975)],
    ["updateMeeting", () => actions.updateMeetingAction(ids.meetingId, { dayOfWeek: 3, startMinutes: 900, endMinutes: 975, teacherIds: [ids.teacherId], roomIds: [ids.roomId], isException: false, exceptionNote: null })],
    ["deleteMeeting", () => actions.deleteMeetingAction(ids.meetingId)],
    ["verifyExternal", () => actions.verifyExternalAction(ids.externalId)],
    ["deleteExternal", () => actions.deleteExternalAction(ids.externalId)],
    ["deletePermittedWindow", () => academic.deletePermittedWindowAction(ids.windowId)],
    ["deleteExtraLoadClass", () => academic.deleteExtraLoadClassAction(ids.extraLoadClassId)],
    ["deleteManualTopSheetRow", () => academic.deleteManualTopSheetRowAction(ids.manualSummaryId)],
    ["saveAttendance", () => academic.saveAttendanceAction(ids.attendanceSessionId, [{ studentId: ids.studentId, status: "excused" }])],
    ["deleteAttendanceSession", () => academic.deleteAttendanceSessionAction(ids.attendanceSessionId)],
  ];
  const results: Record<string, { ok: boolean; message: string; outcome?: unknown; threw?: boolean }> = {};
  for (const [name, attempt] of attempts) {
    try {
      const result = await attempt();
      results[name] = { ok: result.ok, message: result.message, ...("outcome" in result ? { outcome: result.outcome } : {}) };
    } catch (error) {
      const cause = (error as { cause?: { message?: string } }).cause?.message;
      results[name] = { ok: false, threw: true, message: cause ?? (error instanceof Error ? error.message : String(error)) };
    }
  }
  report(results);
}

async function main() {
  const [command, email, argument] = process.argv.slice(2);
  signInAs(email);
  if (command === "view") await view();
  else if (command === "publish") await publish(argument ?? "");
  else if (command === "cross-term") await crossTerm(JSON.parse(argument));
  else throw new Error(`Unknown command ${command}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
