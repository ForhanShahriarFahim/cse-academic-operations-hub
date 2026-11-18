import { and, eq } from "drizzle-orm";
import { db, inDatabaseTransaction } from "@/db";
import { academicTerms, batches, courseOfferings, courses, teachingGroupOfferings, teachingGroups } from "@/db/schema";
import { can, getOptionalActor } from "./auth";
import { currentRoster } from "./current-roster";
import { assertTermContext, lockTermContext } from "./term-context";
import { ActiveTermUnavailable } from "./term-state";
import { parseTermWriteContext } from "./term-context-value";
import { positiveId, studentAudit } from "./student-store";
import { writeStudentWorkbook, XLSX_CONTENT_TYPE } from "./student-workbook";

export const PRIVATE_ROSTER_CACHE = "private, no-store, max-age=0";
export const rosterHeadings = ["Student ID", "Student Name", "Audience Type"];
type OutputFormat = "csv" | "xlsx" | "print";
type RosterQuery = { group?: unknown; term?: unknown; generation?: unknown };
export class RosterOutputError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function withRosterOutput<T>(query: RosterQuery, allowAttendance: boolean,
  work: (target: { actor: NonNullable<Awaited<ReturnType<typeof getOptionalActor>>>; term: typeof academicTerms.$inferSelect; groupId: number }) => Promise<T>) {
  const actor = await getOptionalActor();
  if (!actor) throw new RosterOutputError(401, "Sign in to continue.");
  const groupId = positiveId(query.group);
  const termId = positiveId(query.term);
  const context = parseTermWriteContext({ activeTermId: termId,
    generation: typeof query.generation === "string" && /^\d+$/.test(query.generation) ? Number(query.generation) : null });
  if (!groupId || !context) throw new RosterOutputError(400, "Reopen the roster from Attendance and try again.");
  try {
    return await db.transaction(tx => inDatabaseTransaction(tx, async () => {
      await lockTermContext(tx, "share");
      const { term } = await assertTermContext(context, tx);
      await tx.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, term.id)).for("share");
      const target = { kind: "teaching_group", teachingGroupId: groupId } as const;
      if (!await can(actor, "manage_rosters", target) && !(allowAttendance && await can(actor, "take_attendance", target))) {
        throw new RosterOutputError(403, "You do not have access to this roster.");
      }
      const [group] = await tx.select({ id: teachingGroups.id }).from(teachingGroups)
        .where(and(eq(teachingGroups.id, groupId), eq(teachingGroups.termId, term.id)));
      if (!group) throw new RosterOutputError(409, "Reopen the roster from Attendance and try again.");
      return work({ actor, term, groupId });
    }));
  } catch (error) {
    if (error instanceof ActiveTermUnavailable) throw new RosterOutputError(409, "The academic term changed. Reopen Attendance and try again.");
    throw error;
  }
}

export type RosterRow = { studentCode: string; fullName: string; audience: string };

function csvCell(text: string) {
  const safe = /^[\s\u0000-\u001f\u200b-\u200f\ufeff]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rosterCsv(rows: RosterRow[]) {
  return "\uFEFF" + [rosterHeadings, ...rows.map(({ studentCode, fullName, audience }) => [studentCode, fullName, audience])]
    .map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function excelAttachment(filename: string, rows: readonly (readonly string[])[]) {
  return new Response(new Uint8Array(writeStudentWorkbook(rows)), { headers: {
    "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": PRIVATE_ROSTER_CACHE,
    "X-Content-Type-Options": "nosniff",
  } });
}

export function rosterErrorResponse(error: unknown) {
  const message = error instanceof RosterOutputError ? error.message : "The roster file could not be prepared. Reopen the roster and try again.";
  return Response.json({ error: message }, { status: error instanceof RosterOutputError ? error.status : 503,
    headers: { "Cache-Control": PRIVATE_ROSTER_CACHE } });
}

async function rosterPrintContext(groupId: number, termId: number) {
  const [group] = await db.select({ courseCode: courses.code, courseTitle: courses.title, external: teachingGroups.externalAudienceLabel })
    .from(teachingGroups).innerJoin(courses, eq(courses.id, teachingGroups.courseId))
    .where(and(eq(teachingGroups.id, groupId), eq(teachingGroups.termId, termId)));
  if (!group) throw new RosterOutputError(409, "Reopen the roster from Attendance and try again.");
  const linked = await db.select({ stream: batches.stream, label: batches.label }).from(teachingGroupOfferings)
    .innerJoin(courseOfferings, eq(courseOfferings.id, teachingGroupOfferings.offeringId))
    .innerJoin(batches, eq(batches.id, courseOfferings.batchId))
    .where(and(eq(teachingGroupOfferings.teachingGroupId, groupId), eq(courseOfferings.termId, termId)))
    .orderBy(teachingGroupOfferings.id);
  const audiences = linked.map(({ stream, label }) => `${stream === "HSC" ? "HSC" : "DIP"}-${label}`);
  if (group.external) audiences.push(group.external);
  return { courseCode: group.courseCode, courseTitle: group.courseTitle, audience: [...new Set(audiences)].join(" + ") };
}

export function prepareRoster<T>(query: RosterQuery, format: OutputFormat,
  render: (data: { termId: number; termName: string; groupId: number; rows: RosterRow[]; heading: Awaited<ReturnType<typeof rosterPrintContext>> | null }) => T) {
  return withRosterOutput(query, format === "print", async ({ actor, term, groupId }) => {
    const rows = (await currentRoster(term.id, groupId)).map(({ studentCode, fullName, enrollment }) =>
      ({ studentCode, fullName, audience: enrollment.audienceType }));
    const heading = format === "print" ? await rosterPrintContext(groupId, term.id) : null;
    const output = render({ termId: term.id, termName: term.name, groupId, rows, heading });
    if (format !== "print" || rows.length) {
      await studentAudit(actor, "student.roster_output", "teaching_group", groupId, { format, termId: term.id, rowCount: rows.length });
    }
    return output;
  });
}
