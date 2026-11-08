/** ROM-01B: one weekly projection for directory, agenda, gap search and print. */
import type { PortalData, RoomRow } from "./data";
import { ROOM_CAPABILITIES, roomFit } from "./room-records";
import { validInterval, validWeekday } from "./room-lifecycle";
import { knownAudienceSize,knownAudienceSubtotal } from "./serialize";
import { STREAMS, streamPlan } from "./time-grid";
import { academicWeekday, civilDay, dateBounds, maintenanceOnDate } from "./room-maintenance";
export type Interval = { start: number; end: number };
export const roomPlanningStamp = (now = new Date()) => `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(now)} (Asia/Dhaka)`;
export function unionIntervals(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of intervals.filter((iv) => validInterval(iv.start, iv.end)).sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
export function subtractIntervals(windows: Interval[], bookings: Interval[]): Interval[] {
  let result = unionIntervals(windows);
  for (const cut of unionIntervals(bookings)) result = result.flatMap((iv) => cut.end <= iv.start || cut.start >= iv.end ? [iv] : [
    ...(iv.start < cut.start ? [{ start: iv.start, end: cut.start }] : []), ...(cut.end < iv.end ? [{ start: cut.end, end: iv.end }] : []),
  ]);
  return result;
}
export const intervalMinutes = (ivs: Interval[]) => ivs.reduce((sum, iv) => sum + iv.end - iv.start, 0);
type Basis = Pick<PortalData, "term" | "timeGrid" | "windows" | "meetings" | "externals" | "maintenance">;
export const intersectIntervals = (a: Interval[], b: Interval[]) => subtractIntervals(a, subtractIntervals(a, b));
export function parseOccupancyBasis(raw: { basis?: unknown; date?: unknown }, term: { startDate: string; endDate: string }) {
  const basis = raw.basis == null ? "weekly" : typeof raw.basis === "string" ? raw.basis : "invalid";
  const date = typeof raw.date === "string" ? raw.date : "";
  let error: string | null = null;
  if (!["weekly", "date"].includes(basis)) error = "Choose weekly pattern or check a date.";
  else if (basis === "date" && (civilDay(date) == null || civilDay(term.startDate) == null || civilDay(term.endDate) == null || date < term.startDate || date > term.endDate)) error = `Choose a real ISO date within ${term.startDate}–${term.endDate}, the active term. Your input is kept.`;
  return { basis, date, error };
}
export interface RoomBooking extends Interval { key: string; label: string; detail: string; effective: string | null; alerts: string[] }
export interface RoomUncertainty { key: string; day: number | null; label: string }
export function commonRoomWindows(data: Pick<Basis, "term" | "timeGrid" | "windows">, day: number) {
  const usable: Interval[] = [], warnings: string[] = [];
  for (const stream of STREAMS) {
    const plans = data.timeGrid.dayPlans.filter((p) => p.batchId == null && p.stream === stream && p.dayOfWeek === day);
    const plan = streamPlan(data.timeGrid, stream, day);
    if (!plan || plan.patternId == null) continue; // No stream day / closed day supplies no common interval.
    const pattern = data.timeGrid.patterns.find((p) => p.id === plan.patternId);
    const windows = data.windows.filter((w) => w.batchId == null && w.stream === stream && w.dayOfWeek === day && (w.termId == null || w.termId === data.term.id));
    if (plans.length !== 1 || !pattern || !Array.isArray(pattern.breaks) || !windows.length || windows.some((w) => !validInterval(w.startMinutes, w.endMinutes)) || pattern.breaks.some((b) => !b || typeof b.blocksClasses !== "boolean" || (b.blocksClasses && !validInterval(b.start, b.end)))) {
      warnings.push(`${stream}: common windows are not configured reliably; no free claim for this scope.`); continue;
    }
    usable.push(...subtractIntervals(windows.map((w) => ({ start: w.startMinutes, end: w.endMinutes })), pattern.breaks.filter((b) => b.blocksClasses)));
  }
  return { windows: unionIntervals(usable), warnings };
}
export function projectRoomOccupancy(data: Basis, room: Pick<RoomRow, "id" | "isActive" | "roomType" | "capabilities" | "capacity">, date?: string) {
  if (date && parseOccupancyBasis({ basis: "date", date }, data.term).error) throw new Error("Occupancy date must be within the active term.");
  const selectedDay = date ? academicWeekday(civilDay(date)!) : null;
  const bookings: Array<RoomBooking & { day: number }> = [], uncertainty: RoomUncertainty[] = [], information: string[] = [];
  const seen = new Set<number>();
  for (const meeting of data.meetings) {
    if (!meeting.rooms.some((r) => r.id === room.id) || seen.has(meeting.id)) continue;
    seen.add(meeting.id);
    if (date && !validWeekday(meeting.dayOfWeek)) { uncertainty.push({ key: `m${meeting.id}`, day: null, label: `Class #${meeting.id}: weekday unverified` }); continue; }
    if (date) {
      const context = data.maintenance?.meetingDates[meeting.id];
      const bounds = context ? dateBounds({ termStart: data.term.startDate, termEnd: data.term.endDate, ...context }) : null;
      if (!bounds) { uncertainty.push({ key: `m${meeting.id}`, day: validWeekday(meeting.dayOfWeek) ? meeting.dayOfWeek : null, label: `Class #${meeting.id}: date bounds unverified` }); continue; }
      if (meeting.dayOfWeek !== selectedDay || civilDay(date)! < bounds.start || civilDay(date)! > bounds.end) continue;
    }
    const label = `${meeting.courseCode} · ${[...new Map(meeting.audiences.map((a) => [a.batchId, `${a.stream}-${a.batchLabel}`])).values(), meeting.externalAudienceLabel].filter(Boolean).join(" + ") || "Audience unknown"}`;
    if (!validWeekday(meeting.dayOfWeek) || !validInterval(meeting.startMinutes, meeting.endMinutes)) { uncertainty.push({ key: `m${meeting.id}`, day: validWeekday(meeting.dayOfWeek) ? meeting.dayOfWeek : null, label: `${label}: invalid weekday/time` }); continue; }
    const audienceSize = meeting.audiences.length || meeting.externalAudienceLabel ? knownAudienceSize({ ...meeting, audiences: [...new Map(meeting.audiences.map((a) => [a.batchId, a])).values()] }) : null;
    const alerts = roomFit(room, { courseType: meeting.courseType, requiredRoomCapability: meeting.requiredRoomCapability, audienceSize,audienceKnownSubtotal:knownAudienceSubtotal(meeting) });
    const unverified=meeting.audiences.some(a=>a.countStatus==="unverified"||a.countStatus==="unknown");
    if (audienceSize == null || unverified || room.capacity == null) alerts.push(`Fit unverified: ${audienceSize == null ? "audience unknown" : unverified?"count estimate not confirmed":"seats unknown"}`);
    const dates = data.maintenance?.meetingDates[meeting.id] ?? data.meetings.find((m) => m.id === meeting.id) as typeof meeting & { effectiveFrom?: string | null; effectiveTo?: string | null };
    bookings.push({ key: `m${meeting.id}`, day: meeting.dayOfWeek, start: meeting.startMinutes, end: meeting.endMinutes, label, detail: `Class #${meeting.id} · full stored interval for every room role`, effective: dates.effectiveFrom || dates.effectiveTo ? `${dates.effectiveFrom ?? "Term start"} – ${dates.effectiveTo ?? "Term end"}` : null, alerts });
  }
  for (const external of data.externals.filter((e) => e.roomId === room.id)) {
    const label = `OD #${external.id} · ${external.counterpartDepartment} · ${external.courseLabel ?? external.kind}`;
    if (external.kind === "teaching") {
      information.push(`${label}: outgoing-teaching metadata, not a room-reservation interval.`);
      continue;
    }
    if (!["room_reservation", "combined"].includes(external.kind) || !validWeekday(external.dayOfWeek) || !validInterval(external.startMinutes, external.endMinutes)) { uncertainty.push({ key: `e${external.id}`, day: ["room_reservation", "combined"].includes(external.kind) && validWeekday(external.dayOfWeek) ? external.dayOfWeek : null, label: `${label}: unverified booking data` }); continue; }
    if (selectedDay == null || external.dayOfWeek === selectedDay) bookings.push({ key: `e${external.id}`, day: external.dayOfWeek, start: external.startMinutes!, end: external.endMinutes!, label, detail: `${external.verificationStatus} · reserves recorded time`, effective: null, alerts: ["OD suitability unverified"] });
  }
  const activeMaintenance = (data.maintenance?.entries ?? []).filter((e) => e.roomId === room.id && !e.cancelled && (date ? maintenanceOnDate(e, date) : e.endDate >= data.term.startDate && e.startDate <= data.term.endDate));
  const days = (selectedDay == null ? Array.from({ length: 7 }, (_, day) => day) : [selectedDay]).map((day) => {
    const common = commonRoomWindows(data, day);
    const events = bookings.filter((b) => b.day === day).sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
    const occupied = unionIntervals(events);
    const maintenance = date ? unionIntervals(activeMaintenance.map((e) => ({ start: e.startMinutes, end: e.endMinutes }))) : [];
    const available = subtractIntervals(common.windows, maintenance);
    const booked = intervalMinutes(occupied), usable = intervalMinutes(available);
    const commonUsable = intervalMinutes(common.windows), maintenanceMinutes = intervalMinutes(maintenance);
    const maintenanceWithinCommon = intervalMinutes(intersectIntervals(maintenance, common.windows));
    const duringMaintenance = intervalMinutes(intersectIntervals(occupied, maintenance));
    const outside = intervalMinutes(subtractIntervals(occupied, common.windows));
    const uncertain = uncertainty.some((u) => u.day == null || u.day === day) || common.warnings.length > 0;
    return { day, events, common: common.windows, available, maintenance, commonUsable, maintenanceMinutes, maintenanceWithinCommon, duringMaintenance, warnings: common.warnings, uncertain, booked, usable, outside, within: intervalMinutes(intersectIntervals(occupied, available)),
      gaps: room.isActive ? subtractIntervals(available, occupied) : [] };
  });
  const totals = days.reduce((sum, day) => ({ booked: sum.booked + day.booked, usable: sum.usable + day.usable, outside: sum.outside + day.outside, within: sum.within + day.within, commonUsable: sum.commonUsable + day.commonUsable, maintenanceMinutes: sum.maintenanceMinutes + day.maintenanceMinutes, maintenanceWithinCommon: sum.maintenanceWithinCommon + day.maintenanceWithinCommon, duringMaintenance: sum.duringMaintenance + day.duringMaintenance }), { booked: 0, usable: 0, outside: 0, within: 0, commonUsable: 0, maintenanceMinutes: 0, maintenanceWithinCommon: 0, duringMaintenance: 0 });
  return { days, totals, date: date ?? null, activeMaintenance, eventCount: bookings.length, uncertainty, information, utilization: totals.usable ? Math.round(totals.within / totals.usable * 100) : null };
}
export interface GapFilters { day: string; duration: string; capability: string; seats: string }
export function parseGapFilters(raw: Partial<Record<keyof GapFilters, unknown>>) {
  const scalar = (key: keyof GapFilters, fallback: string) => raw[key] == null ? fallback : typeof raw[key] === "string" ? raw[key] as string : JSON.stringify(raw[key]);
  const values = { day: scalar("day", "all"), duration: scalar("duration", "60"), capability: scalar("capability", ""), seats: scalar("seats", "") };
  const errors: Partial<Record<keyof GapFilters, string>> = {};
  if (values.day !== "all" && !/^[0-6]$/.test(values.day)) errors.day = "Choose All or an academic weekday.";
  if (!/^\d+$/.test(values.duration) || Number(values.duration) < 1 || Number(values.duration) > 1440) errors.duration = "Enter whole minutes from 1 to 1440.";
  if (values.capability && !(ROOM_CAPABILITIES as readonly string[]).includes(values.capability)) errors.capability = "Choose a listed capability.";
  if (values.seats && (!/^\d+$/.test(values.seats) || !Number.isSafeInteger(Number(values.seats)) || Number(values.seats) <= 0)) errors.seats = "Enter a positive whole number of seats.";
  return { values, errors };
}
export function roomGapResults(projection: ReturnType<typeof projectRoomOccupancy>, room: Pick<RoomRow, "isActive" | "capacity" | "capabilities">, parsed: ReturnType<typeof parseGapFilters>) {
  const { values, errors } = parsed;
  if (Object.keys(errors).length) return { reason: "Correct the filters to search potential gaps.", gaps: [] };
  if (!room.isActive) return { reason: "Inactive room: occupancy is retained, but no assignable gaps are offered.", gaps: [] };
  if (values.seats && room.capacity == null) return { reason: "Excluded: seats are unknown and cannot satisfy a minimum.", gaps: [] };
  if ((values.seats && room.capacity! < Number(values.seats)) || (values.capability && !room.capabilities.includes(values.capability))) return { reason: "This room does not match the requested seats/capability.", gaps: [] };
  const days = projection.days.filter((d) => values.day === "all" || d.day === Number(values.day));
  const gaps = days.flatMap((d) => d.gaps.filter((gap) => gap.end - gap.start >= Number(values.duration)).map((gap) => ({ ...gap, day: d.day, uncertain: d.uncertain })));
  return { reason: gaps.length ? projection.date ? "Potential gaps against recorded data for the selected date, after maintenance. Holidays and single-date class changes are not modeled." : "Potential gaps against recorded weekly data; check a date to resolve dated maintenance." : days.every((d) => !d.usable) ? days.some((d) => d.commonUsable > 0) ? "Closed by maintenance for the configured day." : "No common usable windows are configured for these days." : "No potential gap meets the minimum duration; windows are booked, closed or too short.", gaps };
}
