/**
 * Review data only (TCH-02): make the disposable review database publishable, publish it, and
 * leave one draft change for the linked review teacher.
 *
 * The Summer 2026 source has 13 room blockers (rooms double-booked, a clash with another
 * department's room reservation, classes in the wrong kind of room), so nothing can be published
 * and the published views cannot be reviewed. This moves each affected class to a free room that
 * the conflict engine accepts, at the same day and time with the same teachers and batches.
 * Any other kind of blocker stops the script: it never deletes classes or invents exceptions.
 *
 * Runs only from `npm run ux:review -- --publishable`, on a PGlite directory inside
 * .tmp/ux-review. The source file and the institutional database are never touched.
 */
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { auditEvents, meetingRooms, scheduleVersions } from "./schema";
import { analyzeSchedule, type Issue } from "../lib/conflicts";
import { getPortalDataForSeed, type PortalData } from "../lib/data";
import { buildSnapshot, type MeetingView, type RoomRef } from "../lib/serialize";

const REVIEW_ROOT = path.resolve(process.cwd(), ".tmp", "ux-review");
const ROOM_ISSUES = new Set<Issue["type"]>(["room_double_booking", "external_room_conflict", "incompatible_room", "capacity_violation"]);
const ACTOR = "UX review harness";

function assertDisposableTarget() {
  if (process.env.DATABASE_URL) throw new Error("Refusing: DATABASE_URL is set. This runs only on the disposable review PGlite copy.");
  const target = path.resolve(process.env.PGLITE_DATA_DIR ?? "");
  const relative = path.relative(REVIEW_ROOT, target);
  if (!process.env.PGLITE_DATA_DIR || relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error("Refusing: PGLITE_DATA_DIR must be inside .tmp/ux-review. Run `npm run ux:review -- --publishable`.");
  }
}

const analyze = (data: PortalData, meetings: MeetingView[]) =>
  analyzeSchedule({ meetings, externals: data.externals, breaks: data.breaks, grid: data.timeGrid, windows: data.windows });
const blockersOf = (issues: Issue[]) => issues.filter((issue) => issue.severity === "blocker");

function roomRef(room: PortalData["rooms"][number]): RoomRef {
  return { id: room.id, code: room.code, building: room.building, roomType: room.roomType, capabilities: room.capabilities, capacity: room.capacity };
}

/**
 * A free room for one of a meeting's rooms that leaves this meeting with no blockers and does
 * not add blockers anywhere else. Rooms of the same kind are tried first, then by code.
 */
function findRoomMove(data: PortalData, meeting: MeetingView, baseline: number) {
  const candidates = data.rooms
    .filter((room) => room.isActive && !meeting.rooms.some((current) => current.id === room.id))
    .sort((a, b) => Number(b.roomType === meeting.rooms[0]?.roomType) - Number(a.roomType === meeting.rooms[0]?.roomType) || a.code.localeCompare(b.code));
  for (const [index, current] of meeting.rooms.entries()) {
    for (const room of candidates) {
      const rooms = meeting.rooms.map((item, position) => (position === index ? roomRef(room) : item));
      const trial = data.meetings.map((item) => (item.id === meeting.id ? { ...item, rooms } : item));
      const blockers = blockersOf(analyze(data, trial));
      if (blockers.length < baseline && !blockers.some((issue) => issue.meetingIds.includes(meeting.id))) {
        return { from: current, to: room };
      }
    }
  }
  return null;
}

async function moveRoom(meetingId: number, fromRoomId: number, toRoomId: number) {
  await db.update(meetingRooms).set({ roomId: toRoomId })
    .where(and(eq(meetingRooms.meetingId, meetingId), eq(meetingRooms.roomId, fromRoomId)));
}

async function clearRoomBlockers(): Promise<string[]> {
  const moves: string[] = [];
  for (let pass = 0; pass < 50; pass++) {
    const data = await getPortalDataForSeed();
    const blockers = blockersOf(analyze(data, data.meetings));
    if (blockers.length === 0) return moves;
    const other = blockers.filter((issue) => !ROOM_ISSUES.has(issue.type));
    if (other.length) throw new Error(`Not a room problem, so not changed: ${other.map((issue) => `${issue.type} (${issue.title})`).join("; ")}`);
    const issue = blockers[0];
    // Move the later class first, so the class from the source's first listing keeps its room.
    const ids = [...issue.meetingIds].sort((a, b) => b - a);
    let moved = false;
    for (const id of ids) {
      const meeting = data.meetings.find((item) => item.id === id);
      if (!meeting) continue;
      const move = findRoomMove(data, meeting, blockers.length);
      if (!move) continue;
      await moveRoom(meeting.id, move.from.id, move.to.id);
      moves.push(`${meeting.courseCode} ${["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][meeting.dayOfWeek]}: ${move.from.code} → ${move.to.code} (${issue.type})`);
      moved = true;
      break;
    }
    if (!moved) throw new Error(`No free room clears: ${issue.title}`);
  }
  throw new Error("Room blockers did not clear after 50 moves.");
}

async function publishIfNone(): Promise<string> {
  const data = await getPortalDataForSeed();
  if (data.versions.some((version) => version.state === "published")) return "A published version already exists; not publishing again.";
  const issues = analyze(data, data.meetings);
  if (blockersOf(issues).length) throw new Error("Blockers remain; not publishing.");
  const [latest] = await db.select().from(scheduleVersions)
    .where(eq(scheduleVersions.termId, data.term.id)).orderBy(desc(scheduleVersions.versionNumber)).limit(1);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const snapshot = buildSnapshot({
    meetings: data.meetings,
    term: { id: data.term.id, name: data.term.name, academicYear: data.term.academicYear, effectiveFrom: data.term.effectiveFrom },
    versionNumber,
    batches: data.batches,
    breaks: data.breaks,
    externals: data.externals,
    issues,
    metadata: data.publicationMetadata,
    timeGrid: data.timeGrid,
  });
  await db.transaction(async (tx) => {
    const [version] = await tx.insert(scheduleVersions).values({
      termId: data.term.id, versionNumber, state: "published", effectiveFrom: data.term.effectiveFrom,
      publishedAt: new Date(), publishedBy: ACTOR, changeSummary: "Review test publication (rooms adjusted to clear blockers)", snapshot,
    }).returning();
    await tx.insert(auditEvents).values({
      actor: ACTOR, actorDisplayName: ACTOR, actorKind: "system", action: "publish", entity: "schedule_version", entityId: version.id,
      before: null, after: { versionNumber, state: "published", meetingCount: data.meetings.length }, detail: { version: versionNumber, warnings: issues.length, reviewOnly: true },
    });
  });
  return `Published version ${versionNumber} (${data.meetings.length} classes, ${issues.length} warnings).`;
}

/** One room change for the linked review teacher after publishing, so the draft-differs notice shows. */
async function draftChangeForReviewTeacher(): Promise<string> {
  const data = await getPortalDataForSeed();
  const published = data.publishedSnapshot;
  if (!published) return "No publication; no draft change made.";
  const differs = data.meetings.some((meeting) => {
    const before = published.meetings.find((item) => item.id === meeting.id);
    return !before || before.rooms.map((room) => room.id).join() !== meeting.rooms.map((room) => room.id).join();
  });
  if (differs) return "The draft already differs from the publication; no change made.";
  const counts = new Map<number, number>();
  for (const meeting of data.meetings) for (const teacher of meeting.teachers) counts.set(teacher.id, (counts.get(teacher.id) ?? 0) + 1);
  const teacherId = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const baseline = blockersOf(analyze(data, data.meetings)).length + 1;
  for (const meeting of data.meetings.filter((item) => item.teachers.some((teacher) => teacher.id === teacherId))) {
    const move = findRoomMove(data, meeting, baseline);
    if (!move) continue;
    await moveRoom(meeting.id, move.from.id, move.to.id);
    return `Draft change for the review teacher: ${meeting.courseCode} ${move.from.code} → ${move.to.code}.`;
  }
  return "No free room for a draft change; none made.";
}

async function main() {
  assertDisposableTarget();
  const moves = await clearRoomBlockers();
  console.log(moves.length ? `Room changes to clear blockers (review data only):\n  ${moves.join("\n  ")}` : "No blockers to clear.");
  console.log(await publishIfNone());
  console.log(await draftChangeForReviewTeacher());
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
