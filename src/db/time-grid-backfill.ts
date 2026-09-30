/**
 * RUT-04 data backfill: gives every term that has no period patterns the grid
 * it was drawn with before term grids existed (the legacy Summer 2026 layout
 * plus the stored break rules), so screens and validation are unchanged.
 *
 * Batch-specific class hours become batch exceptions so the batch keeps its
 * days. A one-time conversion: once any term has patterns it does nothing, so
 * a term created later starts empty and is set up (or copied) in Days &
 * periods. Runs after the SQL migrations in one transaction, on PGlite and
 * PostgreSQL; repeating it changes nothing.
 *
 * Takes a database handle instead of opening one, so disposable safety runs
 * can call it without touching the configured database.
 */
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { legacyTimeGrid } from "../lib/time-grid-legacy";

export type GridDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const DAY_WORD = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export async function backfillTimeGrids(db: GridDb): Promise<number[]> {
  return db.transaction(async (tx) => {
    const converted = await tx.select({ id: schema.periodPatterns.id }).from(schema.periodPatterns).limit(1);
    if (converted.length) return [];
    const terms = await tx.select({ id: schema.academicTerms.id }).from(schema.academicTerms);
    const filled: number[] = [];
    for (const term of terms) {
      const rules = await tx.select().from(schema.breakRules);
      const legacy = legacyTimeGrid(rules);
      const idMap = new Map<number, number>();
      for (const pattern of legacy.patterns) {
        const [row] = await tx.insert(schema.periodPatterns).values({
          termId: term.id, name: pattern.name, periods: pattern.periods, breaks: pattern.breaks,
        }).returning({ id: schema.periodPatterns.id });
        idMap.set(pattern.id, row.id);
      }
      for (const plan of legacy.dayPlans) {
        await tx.insert(schema.dayPlans).values({
          termId: term.id, stream: plan.stream, batchId: null, dayOfWeek: plan.dayOfWeek,
          patternId: idMap.get(plan.patternId!)!,
        });
      }

      // Batch-specific class hours: keep that batch's days. Where the stream
      // teaches that day, the batch keeps the stream's periods; otherwise its
      // class hours become its periods (one period per window).
      const windows = await tx.select().from(schema.permittedWindows).where(and(
        isNotNull(schema.permittedWindows.batchId),
        or(eq(schema.permittedWindows.termId, term.id), isNull(schema.permittedWindows.termId)),
      ));
      const batchIds = [...new Set(windows.map((w) => w.batchId!))];
      const batchRows = batchIds.length
        ? await tx.select().from(schema.batches).where(inArray(schema.batches.id, batchIds))
        : [];
      const keys = new Map<string, typeof windows>();
      for (const window of windows) {
        const key = `${window.batchId}:${window.dayOfWeek}`;
        keys.set(key, [...(keys.get(key) ?? []), window]);
      }
      for (const [key, group] of keys) {
        const [batchId, day] = key.split(":").map(Number);
        const batch = batchRows.find((b) => b.id === batchId);
        if (!batch) continue;
        const stream = batch.stream === "DIPLOMA" ? "DIPLOMA" : "HSC";
        const streamOwn = legacy.dayPlans.find((p) => p.stream === stream && p.dayOfWeek === day);
        let patternId: number;
        if (streamOwn) {
          patternId = idMap.get(streamOwn.patternId!)!;
        } else {
          const periods = group.map((w) => ({ start: w.startMinutes, end: w.endMinutes })).sort((a, b) => a.start - b.start);
          const [row] = await tx.insert(schema.periodPatterns).values({
            termId: term.id,
            name: `${stream === "HSC" ? "HSC" : "DIP"}-${batch.label} ${DAY_WORD[day]}`,
            periods,
            breaks: [],
          }).returning({ id: schema.periodPatterns.id });
          patternId = row.id;
        }
        await tx.insert(schema.dayPlans).values({
          termId: term.id, stream, batchId, dayOfWeek: day, patternId,
          reason: group.find((w) => w.requiresExceptionNote)?.requiresExceptionNote
            ?? "Carried over from class hours set before term grids.",
        });
      }
      filled.push(term.id);
    }
    return filled;
  });
}
