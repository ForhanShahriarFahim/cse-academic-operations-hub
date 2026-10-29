/** ROM-01B: calendar and snapshot evidence, independent of host timezone/database. */
import { canonicalRoomCode, positiveInteger, protectedRoom } from "./room-records";
import { isTimeGrid } from "./time-grid";

const DAY = 86_400_000;
function dateDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / DAY : null;
}
export const dhakaToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const validWeekday = (day: unknown): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6;
export const validInterval = (start: unknown, end: unknown): boolean => typeof start === "number" && typeof end === "number" && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 1440 && end > start;
export interface FutureBounds { termStart: string | null; termEnd: string | null; effectiveFrom?: string | null; effectiveTo?: string | null; dayOfWeek: number | null }
export type FutureUse = { kind: "past" } | { kind: "uncertain"; reason: string } | { kind: "future"; firstDate: string };
export function futureOccurrence(use: FutureBounds, today: string): FutureUse {
  const start = dateDay(use.termStart), end = dateDay(use.termEnd), now = dateDay(today);
  const from = use.effectiveFrom == null ? start : dateDay(use.effectiveFrom);
  const to = use.effectiveTo == null ? end : dateDay(use.effectiveTo);
  if (start == null || end == null || now == null || from == null || to == null || start > end || (use.effectiveFrom != null && use.effectiveTo != null && from > to)) return { kind: "uncertain", reason: "Missing or invalid date bounds; correct the source record before deactivating." };
  if (!validWeekday(use.dayOfWeek)) return { kind: "uncertain", reason: "Weekday is missing or invalid." };
  const lower = Math.max(now, start, from), upper = Math.min(end, to);
  if (lower > upper) return { kind: "past" };
  // Epoch Thursday is academic day 5 (Saturday = 0). Integer UTC days avoid local/DST arithmetic.
  const first = lower + (use.dayOfWeek - ((lower + 5) % 7) + 7) % 7;
  return first <= upper ? { kind: "future", firstDate: new Date(first * DAY).toISOString().slice(0, 10) } : { kind: "past" };
}
export function futureOD(use: FutureBounds & { kind: string; startMinutes: number | null; endMinutes: number | null }, today: string): FutureUse {
  // An expired valid term needs no timing correction. Other ambiguous room-associated records fail closed.
  const bounds = futureOccurrence({ ...use, dayOfWeek: 0 }, today);
  if (dateDay(use.termEnd) != null && dateDay(use.termStart) != null && use.termStart! <= use.termEnd! && use.termEnd! < today) return { kind: "past" };
  if (bounds.kind === "uncertain") return bounds;
  if (!["teaching", "room_reservation", "combined"].includes(use.kind) || !validInterval(use.startMinutes, use.endMinutes) || !validWeekday(use.dayOfWeek)) return { kind: "uncertain", reason: "Unverified room-associated OD use; correct or remove its kind, weekday and timing in the OD register." };
  return futureOccurrence(use, today);
}

export type LifecycleCommand = { roomId: number; revision: number; action: "deactivate" | "reactivate" | "delete"; reason: string; confirmation: string };
export function lifecycleCommand(raw: Record<string, unknown>): LifecycleCommand | null {
  const roomId = positiveInteger(raw.roomId), revision = positiveInteger(raw.revision);
  if (!roomId || !revision || typeof raw.action !== "string" || !["deactivate", "reactivate", "delete"].includes(raw.action) || typeof raw.reason !== "string" || (raw.confirmation != null && typeof raw.confirmation !== "string")) return null;
  const reason = raw.reason.trim();
  if (!reason || reason.length > 300) return null;
  return { roomId, revision, action: raw.action as LifecycleCommand["action"], reason, confirmation: typeof raw.confirmation === "string" ? raw.confirmation : "" };
}
const object = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);
/** Exact structured references only. Unknown persisted shapes refuse deletion conservatively. */
export function snapshotRoomEvidence(snapshot: unknown, roomId: number, aliases: string[]): "clear" | "reference" | "uncertain" {
  if (snapshot == null) return "clear"; // Unpopulated draft version.
  if (!object(snapshot) || !Array.isArray(snapshot.meetings)) return "uncertain";
  const version = snapshot.schemaVersion;
  if (version != null && ![2, 3, 4].includes(version as number)) return "uncertain";
  if (typeof snapshot.generatedAt !== "string" || !Number.isInteger(snapshot.versionNumber) || (snapshot.versionNumber as number) < 1) return "uncertain";
  if (version == null && (typeof snapshot.termName !== "string" || !(snapshot.effectiveFrom === null || typeof snapshot.effectiveFrom === "string"))) return "uncertain";
  if (version != null && (!object(snapshot.term) || !Array.isArray(snapshot.batches) || !Array.isArray(snapshot.breaks) || !Array.isArray(snapshot.issues) || !Array.isArray(snapshot.externalCommitments))) return "uncertain";
  if ((version === 3 || version === 4) && !object(snapshot.metadata)) return "uncertain";
  if (version === 4 && !isTimeGrid(snapshot.timeGrid)) return "uncertain";
  const codes = new Set(aliases.map(canonicalRoomCode));
  const reference = (id: unknown, code: unknown) => id === roomId || (typeof code === "string" && codes.has(canonicalRoomCode(code)));
  let uncertain = false;
  for (const meeting of snapshot.meetings) {
    if (!object(meeting) || !Array.isArray(meeting.rooms)) { uncertain = true; continue; }
    for (const room of meeting.rooms) {
      if (!object(room)) { uncertain = true; continue; }
      if (reference(room.id, room.code)) return "reference";
      if (!Number.isInteger(room.id) || typeof room.code !== "string") uncertain = true;
    }
  }
  if (snapshot.externalCommitments != null && !Array.isArray(snapshot.externalCommitments)) uncertain = true;
  for (const external of Array.isArray(snapshot.externalCommitments) ? snapshot.externalCommitments : []) {
    if (!object(external)) { uncertain = true; continue; }
    if (reference(external.roomId, external.roomCode)) return "reference";
    if (!(external.roomId === null || Number.isInteger(external.roomId)) || !(external.roomCode === null || typeof external.roomCode === "string")) uncertain = true;
  }
  return uncertain ? "uncertain" : "clear";
}
export function deletionReasons(room: { code: string; isDraft: boolean }, totals: { meetings: number; externals: number; snapshots: number; uncertainSnapshots: number }): string[] {
  return [!room.isDraft && "Retained records cannot be permanently deleted. Deactivate when safe.", protectedRoom(room.code) && "Source-protected identities must be retained.", totals.meetings > 0 && `${totals.meetings} class reference(s), including historical/cancelled use.`, totals.externals > 0 && `${totals.externals} OD reference(s).`, totals.snapshots > 0 && `${totals.snapshots} saved snapshot reference(s).`, totals.uncertainSnapshots > 0 && `${totals.uncertainSnapshots} saved snapshot(s) have unsupported or ambiguous room evidence.`].filter((reason): reason is string => typeof reason === "string");
}
