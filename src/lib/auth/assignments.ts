import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";

type AssignmentDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Role assignments in force at `now`: started, and not yet ended. Kept free of
 * request and provider imports so the BUG-29 checks run this exact predicate
 * against disposable databases.
 */
export function selectActiveAssignments(db: AssignmentDb, userId: number, now: Date) {
  const { roleAssignments } = schema;
  return db.select().from(roleAssignments).where(and(
    eq(roleAssignments.userId, userId),
    lte(roleAssignments.activeFrom, now),
    or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, now)),
  ));
}
