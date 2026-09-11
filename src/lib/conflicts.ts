/**
 * Conflict and validation engine (spec §15).
 *
 * Pure functions over serialized views. Uses exact minute-level half-open
 * intervals — slot IDs are never the basis of conflict detection. Engine
 * output feeds the draft validator, the routine builder, and the
 * publication gate (blockers must be resolved before publishing).
 */
import { overlaps, fmtRange, DAY_NAMES } from "./time";
import { knownAudienceSize, meetingStreams, type MeetingView, type ExternalCommitmentView } from "./serialize";

export interface BreakRule {
  id: number; name: string; scope: string; stream: string | null;
  dayOfWeek: number | null; startMinutes: number; endMinutes: number;
}

export interface PermittedWindow {
  id: number; termId: number | null; batchId: number | null; stream: string; dayOfWeek: number;
  startMinutes: number; endMinutes: number; note: string | null;
}

export interface Issue {
  id: string;
  severity: "blocker" | "warning";
  type:
    | "teacher_double_booking"
    | "room_double_booking"
    | "audience_overlap"
    | "external_teacher_conflict"
    | "external_room_conflict"
    | "break_conflict"
    | "outside_permitted_window"
    | "window_exception_in_use"
    | "capacity_violation"
    | "capacity_unverified"
    | "incompatible_room"
    | "tight_transition"
    | "pending_reconciliation";
  title: string;
  detail: string;
  dayOfWeek: number;
  meetingIds: number[];
}

export interface EngineInput {
  meetings: MeetingView[];
  externals: ExternalCommitmentView[];
  breaks: BreakRule[];
  windows: PermittedWindow[];
}

function refRangesTouch(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aEnd === bStart || bEnd === aStart;
}

export function analyzeSchedule(input: EngineInput): Issue[] {
  const issues: Issue[] = [];
  const byDay = new Map<number, MeetingView[]>();
  for (const m of input.meetings) {
    const arr = byDay.get(m.dayOfWeek) ?? [];
    arr.push(m);
    byDay.set(m.dayOfWeek, arr);
  }

  const seenPair = new Set<string>();
  for (const [day, dayMeetings] of byDay) {
    for (let i = 0; i < dayMeetings.length; i++) {
      for (let j = i + 1; j < dayMeetings.length; j++) {
        const a = dayMeetings[i];
        const b = dayMeetings[j];
        const pairKey = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
        if (seenPair.has(pairKey)) continue;
        if (!overlaps(a.startMinutes, a.endMinutes, b.startMinutes, b.endMinutes)) {
          // Tight-transition advisory: adjacent classes in different buildings.
          if (refRangesTouch(a.startMinutes, a.endMinutes, b.startMinutes, b.endMinutes)) {
            const shared = a.teachers.filter((t) => b.teachers.some((u) => u.id === t.id));
            for (const t of shared) {
              const aB = a.rooms[0]?.building ?? "?";
              const bB = b.rooms[0]?.building ?? "?";
              if (aB !== bB) {
                issues.push({
                  id: `tight-${t.id}-${a.id}-${b.id}`,
                  severity: "warning",
                  type: "tight_transition",
                  title: `Tight transition for ${t.shortCode}`,
                  detail: `${t.fullName} has back-to-back classes in different buildings (${aB} → ${bB}) on ${DAY_NAMES[day]} with no travel buffer.`,
                  dayOfWeek: day,
                  meetingIds: [a.id, b.id],
                });
              }
            }
          }
          continue;
        }
        seenPair.add(pairKey);

        // Shared canonical event safety: one meeting row can never conflict
        // with itself, but two rows of the same teaching group overlapping
        // is a data error.
        if (a.teachingGroupId === b.teachingGroupId) {
          issues.push({
            id: `dup-${a.id}-${b.id}`,
            severity: "blocker",
            type: "audience_overlap",
            title: "Duplicate physical event for one teaching group",
            detail: `${a.courseCode} has two overlapping meeting rows — shared classes must be stored once.`,
            dayOfWeek: day,
            meetingIds: [a.id, b.id],
          });
          continue;
        }

        // Teacher double-booking.
        const sharedTeachers = a.teachers.filter((t) => b.teachers.some((u) => u.id === t.id));
        for (const t of sharedTeachers) {
          issues.push({
            id: `tdb-${t.id}-${a.id}-${b.id}`,
            severity: "blocker",
            type: "teacher_double_booking",
            title: `Teacher double-booked: ${t.shortCode}`,
            detail: `${t.fullName} is required in ${a.courseCode} (${fmtRange(a.startMinutes, a.endMinutes)}) and ${b.courseCode} (${fmtRange(b.startMinutes, b.endMinutes)}) on ${DAY_NAMES[day]}.`,
            dayOfWeek: day,
            meetingIds: [a.id, b.id],
          });
        }

        // Room double-booking.
        const sharedRooms = a.rooms.filter((r) => b.rooms.some((u) => u.id === r.id));
        for (const r of sharedRooms) {
          issues.push({
            id: `rdb-${r.id}-${a.id}-${b.id}`,
            severity: "blocker",
            type: "room_double_booking",
            title: `Room double-booked: ${r.code}`,
            detail: `${r.code} hosts both ${a.courseCode} and ${b.courseCode} during overlapping intervals on ${DAY_NAMES[day]}.`,
            dayOfWeek: day,
            meetingIds: [a.id, b.id],
          });
        }

        // Overlapping student audiences.
        const sharedBatches = a.audiences.filter((x) => b.audiences.some((y) => y.batchId === x.batchId));
        for (const bt of sharedBatches) {
          issues.push({
            id: `aov-${bt.batchId}-${a.id}-${b.id}`,
            severity: "blocker",
            type: "audience_overlap",
            title: `Student clash: ${bt.stream === "HSC" ? "HSC" : "Diploma"}-${bt.batchLabel}`,
            detail: `Batch ${bt.stream}-${bt.batchLabel} is expected in ${a.courseCode} and ${b.courseCode} at the same time on ${DAY_NAMES[day]}.`,
            dayOfWeek: day,
            meetingIds: [a.id, b.id],
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Per-meeting checks
  // ---------------------------------------------------------------------
  for (const m of input.meetings) {
    const streams = meetingStreams(m);

    // External commitments (OD).
    for (const e of input.externals) {
      if (e.dayOfWeek == null || e.startMinutes == null || e.endMinutes == null) continue;
      if (e.dayOfWeek !== m.dayOfWeek) continue;
      if (!overlaps(m.startMinutes, m.endMinutes, e.startMinutes, e.endMinutes)) continue;

      if ((e.kind === "teaching" || e.kind === "combined") && e.teacherId != null) {
        const t = m.teachers.find((x) => x.id === e.teacherId);
        if (t) {
          issues.push({
            id: `etc-${e.id}-${m.id}`,
            severity: "blocker",
            type: "external_teacher_conflict",
            title: `Outgoing teaching clash: ${t.shortCode}`,
            detail: `${t.fullName} is committed to ${e.counterpartDepartment}${e.courseLabel ? ` (${e.courseLabel})` : ""} on ${DAY_NAMES[m.dayOfWeek]} ${fmtRange(e.startMinutes, e.endMinutes)} — overlaps ${m.courseCode}.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        }
      }
      if ((e.kind === "room_reservation" || e.kind === "combined") && e.roomId != null) {
        const r = m.rooms.find((x) => x.id === e.roomId);
        if (r) {
          issues.push({
            id: `erc-${e.id}-${m.id}`,
            severity: "blocker",
            type: "external_room_conflict",
            title: `External reservation clash: ${r.code}`,
            detail: `${r.code} is reserved by ${e.counterpartDepartment} on ${DAY_NAMES[m.dayOfWeek]} ${fmtRange(e.startMinutes, e.endMinutes)} — overlaps ${m.courseCode}. Room-only OD entries block the room, not an invented teacher.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        }
      }
    }

    // Breaks. Institution scope applies to all; stream scope by audience.
    for (const br of input.breaks) {
      if (br.dayOfWeek != null && br.dayOfWeek !== m.dayOfWeek) continue;
      if (br.scope === "stream" && br.stream && !streams.includes(br.stream as "HSC" | "DIPLOMA")) continue;
      if (!overlaps(m.startMinutes, m.endMinutes, br.startMinutes, br.endMinutes)) continue;
      issues.push({
        id: `brk-${br.id}-${m.id}`,
        severity: "blocker",
        type: "break_conflict",
        title: `Scheduled during ${br.name}`,
        detail: `${m.courseCode} overlaps ${br.name} (${fmtRange(br.startMinutes, br.endMinutes)}) on ${DAY_NAMES[m.dayOfWeek]} — applies to ${br.scope === "institution" ? "all streams" : br.stream}.`,
        dayOfWeek: m.dayOfWeek,
        meetingIds: [m.id],
      });
    }

    // Permitted windows, per concrete audience. A batch-specific policy
    // replaces the stream default for that batch/day (for example HSC-24B
    // may meet Friday without enabling Friday for every HSC batch).
    for (const audience of m.audiences) {
      const specific = input.windows.filter((x) => x.batchId === audience.batchId && x.dayOfWeek === m.dayOfWeek);
      const applicable = specific.length > 0
        ? specific
        : input.windows.filter((x) => x.batchId == null && x.stream === audience.stream && x.dayOfWeek === m.dayOfWeek);
      const w = applicable.find((x) => m.startMinutes >= x.startMinutes && m.endMinutes <= x.endMinutes);
      const s = audience.stream;
      const dayName = DAY_NAMES[m.dayOfWeek];
      if (applicable.length === 0) {
        if (m.isException) {
          issues.push({
            id: `wex-${audience.batchId}-${m.id}`,
            severity: "warning",
            type: "window_exception_in_use",
            title: `Approved ${s}-${audience.batchLabel} ${dayName} exception in use`,
            detail: `${m.courseCode} runs outside the regular ${s} teaching days with an approved exception (${m.exceptionNote ?? "no note"}). Policy remains provisional pending institutional decision.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        } else {
          issues.push({
            id: `wob-${audience.batchId}-${m.id}`,
            severity: "blocker",
            type: "outside_permitted_window",
            title: `${s}-${audience.batchLabel} has no permitted window on ${dayName}`,
            detail: `${m.courseCode} is scheduled for ${s}-${audience.batchLabel} on ${dayName}, which is outside its configured teaching days and has no approved exception.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        }
      } else if (!w) {
        const configured = applicable.map((x) => fmtRange(x.startMinutes, x.endMinutes)).join(" or ");
        if (m.isException) {
          issues.push({
            id: `wex2-${audience.batchId}-${m.id}`,
            severity: "warning",
            type: "window_exception_in_use",
            title: `Approved exception outside ${s} window`,
            detail: `${m.courseCode} (${fmtRange(m.startMinutes, m.endMinutes)}) exceeds the ${s}-${audience.batchLabel} permitted window (${configured}) under an approved exception.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        } else {
          issues.push({
            id: `wob2-${audience.batchId}-${m.id}`,
            severity: "blocker",
            type: "outside_permitted_window",
            title: `Outside ${s}-${audience.batchLabel} permitted window`,
            detail: `${m.courseCode} (${fmtRange(m.startMinutes, m.endMinutes)}) falls outside the ${s}-${audience.batchLabel} window ${configured} on ${dayName}.`,
            dayOfWeek: m.dayOfWeek,
            meetingIds: [m.id],
          });
        }
      }
    }

    // Capacity.
    const size = knownAudienceSize(m);
    for (const r of m.rooms) {
      if (m.courseType === "sessional" && r.roomType !== "lab") {
        issues.push({
          id: `rtyp-${m.id}-${r.id}`,
          severity: "blocker",
          type: "incompatible_room",
          title: `Sessional in non-lab room`,
          detail: `${m.courseCode} (sessional) is placed in ${r.code} (${r.roomType}).`,
          dayOfWeek: m.dayOfWeek,
          meetingIds: [m.id],
        });
      }
      if (m.requiredRoomCapability && !r.capabilities.includes(m.requiredRoomCapability)) {
        issues.push({
          id: `rcap-${m.id}-${r.id}`,
          severity: "blocker",
          type: "incompatible_room",
          title: `Room capability mismatch`,
          detail: `${m.courseCode} requires ${m.requiredRoomCapability}, but ${r.code} is configured for ${r.capabilities.join(", ") || "no named capabilities"}.`,
          dayOfWeek: m.dayOfWeek,
          meetingIds: [m.id],
        });
      }
      if (size == null) {
        issues.push({
          id: `capu-${m.id}-${r.id}`,
          severity: "warning",
          type: "capacity_unverified",
          title: `Unverified audience size in ${r.code}`,
          detail: `Audience size for ${m.courseCode} is unknown (${r.code} seats ${r.capacity ?? "?"}). Unknown is not zero — verify before unconditional approval.`,
          dayOfWeek: m.dayOfWeek,
          meetingIds: [m.id],
        });
      } else if (r.capacity != null && size > r.capacity) {
        issues.push({
          id: `capv-${m.id}-${r.id}`,
          severity: "blocker",
          type: "capacity_violation",
          title: `Capacity exceeded: ${r.code}`,
          detail: `${m.courseCode} expects ${size} students in ${r.code} (capacity ${r.capacity}).`,
          dayOfWeek: m.dayOfWeek,
          meetingIds: [m.id],
        });
      }
    }

    if (m.pendingReconciliation) {
      issues.push({
        id: `prc-${m.id}`,
        severity: "warning",
        type: "pending_reconciliation",
        title: `Timing reconciliation pending: ${m.courseCode}`,
        detail: `Cross-stream views disagreed on this class's timing. It is stored as one canonical event; confirm the authoritative time before official publication.`,
        dayOfWeek: m.dayOfWeek,
        meetingIds: [m.id],
      });
    }
  }

  return issues.sort((a, b) =>
    (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1) ||
    a.dayOfWeek - b.dayOfWeek ||
    a.title.localeCompare(b.title),
  );
}
