/**
 * SET-01B — reads for effective-dated term policy. Pages, outputs and server
 * actions share these so an impact preview and the figures after approval are
 * computed from the same data and functions.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  academicPolicies, academicPolicyVersions, academicTerms, attendanceRecords, attendanceSessions,
  extraLoadClasses, extraLoadManualSummaries, portalUsers, roleAssignments,
} from "@/db/schema";
import { ROLE_CAPABILITIES } from "./auth/policy";
import type { PortalData } from "./data";
import { dhakaToday } from "./room-lifecycle";
import { allocationTotals } from "./workload";
import {
  buildTimeline, figuresOf, policyImpact, versionOn, withProposal, type ImpactInput, type PolicyFigures, type PolicyImpact, type PolicyTimeline,
} from "./policy-versions";

const POLICY_LOCK = 61041;
/** Policy decisions take the exclusive per-term lock; extra-load writers take it shared so a preview cannot miss a concurrent claim. */
export async function lockTermPolicy(termId: number, mode: "exclusive" | "share" = "exclusive") {
  await db.execute(mode === "exclusive"
    ? sql`select pg_advisory_xact_lock(${POLICY_LOCK}::integer, ${termId}::integer)`
    : sql`select pg_advisory_xact_lock_shared(${POLICY_LOCK}::integer, ${termId}::integer)`);
}

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PolicyHistoryRow {
  id: number; version: number | null; status: string; effectiveFrom: string; figures: PolicyFigures; reason: string;
  proposedById: number; proposedBy: string; proposedAt: string;
  decidedById: number | null; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
}

export interface TermPolicy {
  term: { id: number; name: string; startDate: string; endDate: string; status: string };
  /** Null when the term has no recorded baseline row: nothing is priced or marked from defaults. */
  timeline: PolicyTimeline | null;
  baseline: { figures: PolicyFigures; theoryCreditHours: number; sessionalCreditHours: number; updatedAt: string } | null;
  history: PolicyHistoryRow[];
  open: PolicyHistoryRow | null;
}

export async function loadTermPolicy(termId: number, reader: Reader = db): Promise<TermPolicy | null> {
  const [term] = await reader.select({ id: academicTerms.id, name: academicTerms.name, startDate: academicTerms.startDate, endDate: academicTerms.endDate, status: academicTerms.status })
    .from(academicTerms).where(eq(academicTerms.id, termId)).limit(1);
  if (!term) return null;
  const [baselineRow] = await reader.select().from(academicPolicies).where(eq(academicPolicies.termId, termId)).limit(1);
  const rows = await reader.select().from(academicPolicyVersions).where(eq(academicPolicyVersions.termId, termId))
    .orderBy(asc(academicPolicyVersions.proposedAt), asc(academicPolicyVersions.id));
  const userIds = [...new Set(rows.flatMap((row) => [row.proposedByUserId, row.decidedByUserId]).filter((id): id is number => id != null))];
  const users = userIds.length ? await reader.select({ id: portalUsers.id, name: portalUsers.displayName }).from(portalUsers).where(inArray(portalUsers.id, userIds)) : [];
  const name = (id: number | null) => id == null ? null : users.find((user) => user.id === id)?.name ?? "Unknown user";
  const history: PolicyHistoryRow[] = rows.map((row) => ({
    id: row.id, version: row.version, status: row.status, effectiveFrom: row.effectiveFrom, figures: figuresOf(row), reason: row.reason,
    proposedById: row.proposedByUserId, proposedBy: name(row.proposedByUserId)!, proposedAt: row.proposedAt.toISOString(),
    decidedById: row.decidedByUserId, decidedBy: name(row.decidedByUserId), decidedAt: row.decidedAt?.toISOString() ?? null, decisionNote: row.decisionNote,
  }));
  const approved = history.filter((row) => row.status === "approved").map((row) => ({ id: row.id, version: row.version!, effectiveFrom: row.effectiveFrom, figures: row.figures }));
  const baseline = baselineRow ? {
    figures: figuresOf(baselineRow), theoryCreditHours: Number(baselineRow.theoryCreditHours), sessionalCreditHours: Number(baselineRow.sessionalCreditHours),
    updatedAt: baselineRow.updatedAt.toISOString(),
  } : null;
  return {
    term, baseline, history: [...history].reverse(),
    timeline: baseline ? buildTimeline(term, baseline.figures, approved) : null,
    open: history.find((row) => row.status === "proposed") ?? null,
  };
}

/** Civil date of a recorded timestamp in Asia/Dhaka. */
export const recordedDate = (at: Date) => dhakaToday(at);

/** Everything a policy change can affect in the active term, read at one point in time. */
export async function impactInput(data: PortalData, today: string, reader: Reader = db): Promise<ImpactInput> {
  const termId = data.term.id;
  const teacherName = new Map(data.teachers.map((teacher) => [teacher.id, teacher.fullName]));
  const [classes, manual, marks, locked] = [
    await reader.select({ id: extraLoadClasses.id, teacherId: extraLoadClasses.teacherId, classDate: extraLoadClasses.classDate })
      .from(extraLoadClasses).where(eq(extraLoadClasses.termId, termId)).orderBy(asc(extraLoadClasses.id)),
    await reader.select().from(extraLoadManualSummaries).where(eq(extraLoadManualSummaries.termId, termId)).orderBy(asc(extraLoadManualSummaries.id)),
    await reader.select({
      groupId: attendanceSessions.teachingGroupId, studentId: attendanceRecords.studentId,
      attended: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))`.mapWith(Number),
      counted: sql<number>`count(*) filter (where ${attendanceRecords.status} <> 'excused')`.mapWith(Number),
    }).from(attendanceRecords).innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .where(and(eq(attendanceSessions.termId, termId), ne(attendanceSessions.status, "voided")))
      .groupBy(attendanceSessions.teachingGroupId, attendanceRecords.studentId)
      .orderBy(asc(attendanceSessions.teachingGroupId), asc(attendanceRecords.studentId)),
    await reader.select({ groupId: attendanceSessions.teachingGroupId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(attendanceSessions).where(and(eq(attendanceSessions.termId, termId), eq(attendanceSessions.status, "locked")))
      .groupBy(attendanceSessions.teachingGroupId),
  ];
  const groups = new Map(data.coverage.map((group) => [group.teachingGroupId, group]));
  const byGroup = new Map<number, ImpactInput["attendance"][number]>();
  for (const row of marks) {
    const group = groups.get(row.groupId);
    const entry = byGroup.get(row.groupId) ?? {
      groupId: row.groupId, courseCode: group?.courseCode ?? "Unknown course", audience: group?.audience ?? "", courseType: group?.courseType ?? "theory",
      lockedSessions: locked.find((item) => item.groupId === row.groupId)?.count ?? 0, students: [],
    };
    (entry.students as Array<{ studentId: number; attended: number; counted: number }>).push({ studentId: row.studentId, attended: row.attended, counted: row.counted });
    byGroup.set(row.groupId, entry);
  }
  return {
    term: data.term, today,
    classes: classes.map((row) => ({ ...row, teacherName: teacherName.get(row.teacherId) ?? "Unknown teacher" })),
    manual: manual.map((row) => ({ id: row.id, teacherName: row.teacherName, classCount: row.classCount,
      rateOverride: row.rateOverride == null ? null : Number(row.rateOverride), amountOverride: row.amountOverride == null ? null : Number(row.amountOverride),
      recordedDate: recordedDate(row.createdAt) })),
    workloads: [...allocationTotals(data.allocations)].map(([teacherId, total]) => ({ teacherId, teacherName: teacherName.get(teacherId) ?? "Unknown teacher", units: total.workloadUnits })),
    attendance: [...byGroup.values()],
  };
}

export const fingerprintOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Preview for a proposal against the current approved timeline. A missing baseline compares against nothing recorded. */
export function proposalImpact(policy: TermPolicy, proposal: { effectiveFrom: string; figures: PolicyFigures }, input: ImpactInput): { impact: PolicyImpact | null; fingerprint: string } {
  const before = policy.timeline;
  const impact = before ? policyImpact(before, withProposal(before, proposal), input) : null;
  const evidence = {
    termId: policy.term.id, proposal, approved: policy.history.filter((row) => row.status === "approved").map((row) => row.id).sort((a, b) => a - b),
    baseline: policy.baseline?.figures ?? null, impact,
    // A recorded baseline covers everything recorded so far; fingerprint the counts it will price.
    recorded: before ? null : { classes: input.classes.map((row) => row.id), manual: input.manual.map((row) => row.id), groups: input.attendance.map((row) => row.groupId) },
  };
  return { impact, fingerprint: fingerprintOf(evidence) };
}

/** Active accounts that currently hold `approve_policy` (any department scope). Used only to explain an empty approver pool. */
export async function policyApproverIds(now = new Date()): Promise<number[]> {
  const roles = (Object.entries(ROLE_CAPABILITIES) as Array<[string, readonly string[]]>).filter(([, caps]) => caps.includes("approve_policy")).map(([role]) => role);
  const rows = await db.selectDistinct({ id: portalUsers.id }).from(roleAssignments).innerJoin(portalUsers, eq(portalUsers.id, roleAssignments.userId))
    .where(and(eq(portalUsers.status, "active"), inArray(roleAssignments.role, roles), isNull(roleAssignments.departmentId), lte(roleAssignments.activeFrom, now),
      or(isNull(roleAssignments.activeTo), gt(roleAssignments.activeTo, now))));
  return rows.map((row) => row.id).sort((a, b) => a - b);
}

/** For each history row, the figures in force on its date without it (null when the term had no baseline). */
export function priorFigures(policy: TermPolicy): Record<number, PolicyFigures | null> {
  const baseline = policy.baseline?.figures;
  const approved = policy.history.filter((row) => row.status === "approved").map((row) => ({ id: row.id, version: row.version!, effectiveFrom: row.effectiveFrom, figures: row.figures }));
  return Object.fromEntries(policy.history.map((row) => {
    if (!baseline || row.version === 1) return [row.id, null];
    const without = buildTimeline(policy.term, baseline, approved.filter((item) => item.id !== row.id));
    return [row.id, versionOn(without, row.effectiveFrom).figures];
  }));
}
