import { analyzeSchedule, type BreakRule, type PermittedWindow } from "./conflicts";
import { knownAudienceSize, type MeetingView, type RoomRef, type TeacherRef } from "./serialize";

export interface AutoScheduleGroup {
  teachingGroupId: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  courseCredits: number;
  owningDepartmentCode: string | null;
  requiredRoomCapability: string | null;
  deliveryMode: string;
  pendingReconciliation: boolean;
  externalAudienceLabel: string | null;
  externalStudentCount: number | null;
  audiences: MeetingView["audiences"];
  teachers: TeacherRef[];
  expectedWeeklyMinutes: number | null;
  requiredMeetings: number;
  scheduledMeetings: number;
  scheduledMinutes: number;
  status: string;
}

export interface AutoScheduleSuggestion {
  key: string;
  teachingGroupId: number;
  courseCode: string;
  courseTitle: string;
  audience: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  teacherIds: number[];
  teacherCodes: string[];
  roomId: number;
  roomCode: string;
  warnings: string[];
}

export interface AutoSchedulePlan {
  suggestions: AutoScheduleSuggestion[];
  skipped: Array<{ teachingGroupId: number; courseCode: string; audience: string; reason: string }>;
}

function audienceLabel(group: AutoScheduleGroup) {
  const local = group.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "DIP"}-${a.batchLabel}`);
  if (group.externalAudienceLabel) local.push(group.externalAudienceLabel);
  return local.join(" + ") || "external / unassigned";
}

function allowedByAudience(windows: PermittedWindow[], group: AutoScheduleGroup, day: number, start: number, end: number) {
  return group.audiences.every((audience) => {
    const specific = windows.filter((window) => window.batchId === audience.batchId && window.dayOfWeek === day);
    const applicable = specific.length ? specific : windows.filter((window) => window.batchId == null && window.stream === audience.stream && window.dayOfWeek === day);
    return applicable.some((window) => start >= window.startMinutes && end <= window.endMinutes);
  });
}

function roomOrder(group: AutoScheduleGroup, rooms: RoomRef[]) {
  const size = knownAudienceSize({ ...group, id: -1, dayOfWeek: 0, startMinutes: 0, endMinutes: 1, isException: false, exceptionNote: null, customTimeLabel: null, highlightColor: null, rooms: [] });
  return rooms
    .filter((room) => group.courseType !== "sessional" || room.roomType === "lab")
    .filter((room) => !group.requiredRoomCapability || room.capabilities.includes(group.requiredRoomCapability))
    .filter((room) => size == null || room.capacity == null || room.capacity >= size)
    .sort((a, b) => {
      const aTheoryPenalty = group.courseType === "theory" && a.roomType === "lab" ? 1 : 0;
      const bTheoryPenalty = group.courseType === "theory" && b.roomType === "lab" ? 1 : 0;
      const aSpecialistPenalty = a.capabilities.includes("microprocessor") || a.capabilities.includes("networking") ? 1 : 0;
      const bSpecialistPenalty = b.capabilities.includes("microprocessor") || b.capabilities.includes("networking") ? 1 : 0;
      return aTheoryPenalty - bTheoryPenalty || aSpecialistPenalty - bSpecialistPenalty || (a.capacity ?? 9999) - (b.capacity ?? 9999) || a.code.localeCompare(b.code);
    });
}

/** Deterministic first-fit suggestions. Nothing is written until the user applies the plan. */
export function suggestSchedule(input: {
  meetings: MeetingView[];
  groups: AutoScheduleGroup[];
  rooms: RoomRef[];
  externals: Parameters<typeof analyzeSchedule>[0]["externals"];
  breaks: BreakRule[];
  windows: PermittedWindow[];
}): AutoSchedulePlan {
  const suggestions: AutoScheduleSuggestion[] = [];
  const skipped: AutoSchedulePlan["skipped"] = [];
  const working = [...input.meetings];
  let tempId = -10_000;
  const groups = [...input.groups].sort((a, b) => (a.courseType === "sessional" ? -1 : 0) - (b.courseType === "sessional" ? -1 : 0) || a.courseCode.localeCompare(b.courseCode));

  for (const group of groups) {
    const audience = audienceLabel(group);
    if (group.deliveryMode === "teacher_managed") continue;
    const remainingMeetings = Math.max(0, group.requiredMeetings - group.scheduledMeetings);
    if (remainingMeetings === 0) continue;
    if (group.teachers.length === 0) {
      skipped.push({ teachingGroupId: group.teachingGroupId, courseCode: group.courseCode, audience, reason: "No teacher is assigned (vacancy)." });
      continue;
    }
    if (group.expectedWeeklyMinutes == null) {
      skipped.push({ teachingGroupId: group.teachingGroupId, courseCode: group.courseCode, audience, reason: "Weekly contact minutes are not configured." });
      continue;
    }
    const remainingMinutes = Math.max(0, group.expectedWeeklyMinutes - group.scheduledMinutes);
    const duration = Math.max(15, Math.ceil(remainingMinutes / remainingMeetings / 15) * 15);
    const rooms = roomOrder(group, input.rooms);
    if (rooms.length === 0) {
      skipped.push({ teachingGroupId: group.teachingGroupId, courseCode: group.courseCode, audience, reason: `No active room meets the ${group.requiredRoomCapability ?? group.courseType} requirement and known capacity.` });
      continue;
    }

    for (let occurrence = 0; occurrence < remainingMeetings; occurrence++) {
      let chosen: MeetingView | null = null;
      let chosenWarnings: string[] = [];
      dayLoop: for (let day = 0; day <= 6; day++) {
        for (let start = 480; start + duration <= 1080; start += 15) {
          const end = start + duration;
          if (!allowedByAudience(input.windows, group, day, start, end)) continue;
          for (const room of rooms) {
            const candidate: MeetingView = {
              id: tempId,
              teachingGroupId: group.teachingGroupId,
              dayOfWeek: day,
              startMinutes: start,
              endMinutes: end,
              courseCode: group.courseCode,
              courseTitle: group.courseTitle,
              courseType: group.courseType,
              courseCredits: group.courseCredits,
              requiredRoomCapability: group.requiredRoomCapability,
              owningDepartmentCode: group.owningDepartmentCode,
              deliveryMode: group.deliveryMode,
              isException: false,
              exceptionNote: null,
              customTimeLabel: null,
              highlightColor: null,
              pendingReconciliation: group.pendingReconciliation,
              teachers: group.teachers,
              rooms: [room],
              audiences: group.audiences,
              externalAudienceLabel: group.externalAudienceLabel,
              externalStudentCount: group.externalStudentCount,
            };
            const candidateIssues = analyzeSchedule({ meetings: [...working, candidate], externals: input.externals, breaks: input.breaks, windows: input.windows }).filter((issue) => issue.meetingIds.includes(tempId));
            if (candidateIssues.some((issue) => issue.severity === "blocker")) continue;
            chosen = candidate;
            chosenWarnings = candidateIssues.filter((issue) => issue.severity === "warning").map((issue) => issue.title);
            break dayLoop;
          }
        }
      }
      if (!chosen) {
        skipped.push({ teachingGroupId: group.teachingGroupId, courseCode: group.courseCode, audience, reason: `No clash-free ${duration}-minute placement is available in the configured days/windows.` });
        break;
      }
      working.push(chosen);
      suggestions.push({
        key: `${group.teachingGroupId}-${occurrence}`,
        teachingGroupId: group.teachingGroupId,
        courseCode: group.courseCode,
        courseTitle: group.courseTitle,
        audience,
        dayOfWeek: chosen.dayOfWeek,
        startMinutes: chosen.startMinutes,
        endMinutes: chosen.endMinutes,
        teacherIds: chosen.teachers.map((teacher) => teacher.id),
        teacherCodes: chosen.teachers.map((teacher) => teacher.shortCode),
        roomId: chosen.rooms[0].id,
        roomCode: chosen.rooms[0].code,
        warnings: chosenWarnings,
      });
      tempId--;
    }
  }
  return { suggestions, skipped };
}

