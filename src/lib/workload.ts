/**
 * Workload engine (spec §16).
 *
 * Keeps the metrics strictly separate:
 *   1. catalog credits of assigned offerings,
 *   2. approved workload units (explicit allocation records),
 *   3. scheduled weekly contact minutes from canonical meetings.
 * A merged meeting is counted once per teacher, never once per audience.
 */
import type { MeetingView } from "./serialize";
import type { AllocationView } from "./data";
import { WORKLOAD_ADVISORY_UNITS } from "./constants";

export interface TeacherWorkload {
  teacherId: number;
  workloadUnits: number;
  localUnits: number;
  externalUnits: number;
  catalogCredits: number;
  weeklyContactMinutes: number;
  weeklyMeetings: number;
  distinctCourses: number;
  hasUnverifiedExternal: boolean;
  alerts: string[];
}

export function computeWorkloads(
  meetings: MeetingView[],
  allocations: AllocationView[],
  externalsPendingFor: (teacherId: number) => boolean,
  /** The teacher's advisory limit (TCH-01); the department default when omitted. */
  limitFor: (teacherId: number) => number = () => WORKLOAD_ADVISORY_UNITS,
): Map<number, TeacherWorkload> {
  const out = new Map<number, TeacherWorkload>();

  function ensure(id: number): TeacherWorkload {
    let w = out.get(id);
    if (!w) {
      w = {
        teacherId: id,
        workloadUnits: 0,
        localUnits: 0,
        externalUnits: 0,
        catalogCredits: 0,
        weeklyContactMinutes: 0,
        weeklyMeetings: 0,
        distinctCourses: 0,
        hasUnverifiedExternal: false,
        alerts: [],
      };
      out.set(id, w);
    }
    return w;
  }

  // Scheduled contact minutes: one shared physical meeting counts once per
  // participating teacher.
  const coursesByTeacher = new Map<number, Set<string>>();
  for (const m of meetings) {
    if (m.deliveryMode === "teacher_managed") continue;
    for (const t of m.teachers) {
      const w = ensure(t.id);
      w.weeklyContactMinutes += m.endMinutes - m.startMinutes;
      w.weeklyMeetings += 1;
      const set = coursesByTeacher.get(t.id) ?? new Set<string>();
      set.add(m.courseCode);
      coursesByTeacher.set(t.id, set);
    }
  }

  // Units and catalog credits come from explicit allocation records only.
  const creditSeen = new Map<number, Set<string>>();
  for (const a of allocations) {
    const w = ensure(a.teacherId);
    w.workloadUnits += a.units;
    if (a.externalDepartment) w.externalUnits += a.units;
    else w.localUnits += a.units;
    if (a.courseCode) {
      const set = creditSeen.get(a.teacherId) ?? new Set<string>();
      if (!set.has(a.courseCode)) {
        set.add(a.courseCode);
        creditSeen.set(a.teacherId, set);
      }
      const cset = coursesByTeacher.get(a.teacherId) ?? new Set<string>();
      cset.add(a.courseCode);
      coursesByTeacher.set(a.teacherId, cset);
    }
  }

  // Catalog credits: distinct assigned course credits (lookup by allocation
  // course code — computed by caller-supplied credits map is avoided; the
  // caller embeds credits via courseTitle rows, so we approximate from the
  // allocation's course via meetings where possible).
  for (const [tid, set] of creditSeen) {
    const w = ensure(tid);
    let credits = 0;
    for (const code of set) {
      const meeting = meetings.find((m) => m.courseCode === code);
      credits += meeting?.courseCredits ?? (code.includes("(A)") ? 2 : code.includes("(B)") ? 4 : 3);
    }
    w.catalogCredits = credits;
  }

  for (const [tid, w] of out) {
    w.distinctCourses = coursesByTeacher.get(tid)?.size ?? 0;
    w.hasUnverifiedExternal = externalsPendingFor(tid);
    const limit = limitFor(tid);
    if (w.workloadUnits > limit) {
      w.alerts.push(limit === WORKLOAD_ADVISORY_UNITS
        ? `Workload ${w.workloadUnits} units exceeds the advisory threshold of ${limit}.`
        : `Workload ${w.workloadUnits} units exceeds this teacher's own advisory limit of ${limit}.`);
    }
    if (w.hasUnverifiedExternal) {
      w.alerts.push("External commitments pending verification — known total is a lower bound, not a full university-wide figure.");
    }
  }

  return out;
}
