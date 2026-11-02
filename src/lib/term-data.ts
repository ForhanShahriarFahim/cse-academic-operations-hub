import { createHash } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, databaseReadBatch } from "@/db";
import { academicTerms, academicPolicies, meetings, teachingGroups, batchTermPlacements, periodPatterns, dayPlans, scheduleVersions } from "@/db/schema";
import { authorize } from "./auth";
import { readTermContext } from "./term-context";
import { validateStartingPolicy, validateTermFields } from "./term-records";
import { isPublishedSnapshot } from "./public-routine";

// Setup-only policy/grid/windows and audit do not freeze draft identity. All
// other direct term FKs protect both direct and indirect business descendants.
const PROTECTED_TABLES = ["batch_term_placements", "class_representatives", "department_contacts", "routine_source_reconciliations", "course_offerings", "teaching_groups", "course_enrollments", "attendance_sessions", "extra_load_classes", "extra_load_manual_summaries", "external_commitments", "workload_allocations", "schedule_versions"] as const;
export async function termProtectedUse(termId: number) {
  const counts = await databaseReadBatch(PROTECTED_TABLES.map(table => async () => {
    const result = await db.execute<{ count: number }>(sql`select count(*)::int as count from ${sql.identifier(table)} where term_id = ${termId}`);
    return { table, count: Number(result.rows[0]?.count ?? 0) };
  }));
  return counts.filter(item => item.count > 0);
}
export async function getTermSummary(termId: number) {
  if (!Number.isSafeInteger(termId) || termId < 1) return null;
  const [term] = await db.select().from(academicTerms).where(eq(academicTerms.id, termId)).limit(1);
  if (!term) return null;
  const [policies, uses, classes, placements, patterns, plans, versions] = await databaseReadBatch([
    () => db.select().from(academicPolicies).where(eq(academicPolicies.termId, termId)).limit(1),
    () => termProtectedUse(termId),
    () => db.select({ count: count() }).from(meetings).innerJoin(teachingGroups, eq(meetings.teachingGroupId, teachingGroups.id)).where(eq(teachingGroups.termId, termId)),
    () => db.select({ count: count() }).from(batchTermPlacements).where(eq(batchTermPlacements.termId, termId)),
    () => db.select({ count: count() }).from(periodPatterns).where(eq(periodPatterns.termId, termId)),
    () => db.select({ count: count() }).from(dayPlans).where(eq(dayPlans.termId, termId)),
    () => db.select({ id: scheduleVersions.id, versionNumber: scheduleVersions.versionNumber, state: scheduleVersions.state, publishedAt: scheduleVersions.publishedAt, snapshot: scheduleVersions.snapshot })
      .from(scheduleVersions).where(eq(scheduleVersions.termId, termId)).orderBy(desc(scheduleVersions.versionNumber))
  ]);
  const policy = policies[0] ?? null;
  const ready = validateTermFields(term).ok && policy != null && validateStartingPolicy(policy).ok;
  return { term, policy, uses, editable: term.status === "draft" && !uses.length, ready,
    counts: { classes: classes[0].count, placements: placements[0].count, patterns: patterns[0].count, dayPlans: plans[0].count },
    versions: versions.map(({snapshot,...version}) => ({ ...version, available: isPublishedSnapshot(snapshot), publishedAt: version.publishedAt?.toISOString() ?? null })),
  };
}
export async function getTermDirectory() {
  await authorize("view_internal_portal");
  const terms = await db.select().from(academicTerms).orderBy(desc(academicTerms.academicYear), desc(academicTerms.startDate), desc(academicTerms.id));
  return terms;
}
export async function getTermWorkspace(termId: number) {
  await authorize("view_internal_portal");
  return getTermSummary(termId);
}
export async function activationEvidence(termId: number) {
  const context = await readTermContext();
  const target = await getTermSummary(termId);
  if (!target) return null;
  const active = context.state.kind === "one" ? await getTermSummary(context.state.term.id) : null;
  const evidence = { generation: context.generation, activeState: context.state.kind, activeId: active?.term.id ?? null,
    active: active && { term: active.term, counts: active.counts, versions: active.versions },
    target: { term: target.term, policy: target.policy, counts: target.counts, versions: target.versions, uses: target.uses },
  };
  return { target, active, context, fingerprint: createHash("sha256").update(JSON.stringify(evidence)).digest("hex") };
}
export async function hasIdentityDuplicate(name: string, academicYear: number, excludeId?: number) {
  const rows = await db.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms).where(and(eq(academicTerms.academicYear, academicYear)));
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  return rows.some(row => row.id !== excludeId && row.name.trim().replace(/\s+/g, " ").toLowerCase() === key);
}
