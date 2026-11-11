/** Production extra-load/policy actions and loaders; only request/provider dependencies are stubbed. */
import assert from "node:assert/strict";
import { asc, eq, sql } from "drizzle-orm";
import { loadApp, report, signInAs, RedirectSignal } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";
import { computeWorkloads } from "../../../src/lib/workload";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const actions = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const operations = loadApp<typeof import("../../../src/lib/academic-operations")>("src/lib/academic-operations.ts");
const form = (values: Record<string, unknown>) => {
  const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f;
};
const ok = (r: ActionResult) => assert.equal(r.ok, true, r.message);

async function main() {
  const lines: string[] = [];
  signInAs("admin@example.invalid");
  const token = (await context.captureActiveContext()).writeContext;
  const [group, lab] = await db.select().from(s.teachingGroups).orderBy(asc(s.teachingGroups.id));
  const [teacherA, teacherB, teacherC] = await db.select().from(s.teachers).orderBy(asc(s.teachers.id));
  const allocations = await db.select().from(s.workloadAllocations).orderBy(asc(s.workloadAllocations.id));
  const theoryAllocation = allocations[0];
  await db.update(s.courses).set({ credits: "14.0" }).where(eq(s.courses.id, group.courseId));
  await db.update(s.workloadAllocations).set({ units: "14.00" }).where(eq(s.workloadAllocations.id, theoryAllocation.id));
  await db.update(s.workloadAllocations).set({ units: "2.00" }).where(eq(s.workloadAllocations.id, allocations[1].id));
  await db.update(s.teachers).set({ advisoryLoadUnits: "30.0" }).where(eq(s.teachers.id, teacherA.id));
  const create = (values: Record<string, unknown> = {}, writeContext = token) => actions.createExtraLoadClassAction(form({
    teacherId: teacherA.id, teachingGroupId: group.id, classDate: "2026-07-08", startTime: "09:00", endTime: "10:00", ...values,
  }), writeContext);
  const records = () => db.select().from(s.extraLoadClasses).orderBy(asc(s.extraLoadClasses.id));
  const audits = () => db.select().from(s.auditEvents).orderBy(asc(s.auditEvents.id));
  const policies = () => db.select().from(s.academicPolicies).orderBy(asc(s.academicPolicies.id));
  const snapshot = async () => JSON.stringify([await records(), await audits(), await policies()]);
  const noWrite = async (work: () => Promise<ActionResult>) => { const before = await snapshot(); const result = await work(); assert.equal(await snapshot(), before); return result; };
  let source = await operations.getExtraLoadData();
  assert.equal(source.loads.get(teacherA.id), 16, "14 theory + sessional allocated 2 must be 16, not catalog 15");
  const workload = computeWorkloads(source.data.meetings, source.data.allocations, () => false, () => 30).get(teacherA.id)!;
  assert.equal(workload.workloadUnits, 16); assert.equal(workload.catalogCredits, 15);
  ok(await create());
  await db.update(s.workloadAllocations).set({ units: "13.00" }).where(eq(s.workloadAllocations.id, theoryAllocation.id));
  assert.equal((await noWrite(() => create())).ok, false, "exactly 15 refuses");
  await db.update(s.workloadAllocations).set({ units: "13.01" }).where(eq(s.workloadAllocations.id, theoryAllocation.id));
  ok(await create({ classDate: "2026-07-09" }));
  await db.update(s.workloadAllocations).set({ units: "12.99" }).where(eq(s.workloadAllocations.id, theoryAllocation.id));
  const refused = await noWrite(() => create());
  assert.equal(refused.ok, false); assert.match(refused.message, /14\.99/);
  lines.push("Catalog 15/workload 16 teacher submits; exactly 15 refuses, 15.01 submits, 14.99 refusal is precise, and own advisory limit 30 does not change eligibility.");

  await db.update(s.externalCommitments).set({ credits: "99.0", verificationStatus: "pending" });
  source = await operations.getExtraLoadData();
  assert.equal(source.loads.get(teacherB.id), 4, "split 1 + external allocation 3, not raw external 99");
  assert.equal(source.teacherSummaries.find(row => row.teacher.id === teacherB.id)!.hasUnverifiedExternal, true);
  await db.delete(s.workloadAllocations).where(eq(s.workloadAllocations.teacherId, teacherA.id));
  source = await operations.getExtraLoadData();
  assert.equal(source.loads.get(teacherA.id) ?? 0, 0, "meeting-only assignment has zero workload");
  assert.equal(source.teacherSummaries.find(row => row.teacher.id === teacherA.id)!.classCount, 3, "existing claims retained at zero workload");
  const ranged = await operations.getExtraLoadData("2026-07-08", "2026-07-08");
  assert.equal(ranged.teacherSummaries.find(row => row.teacher.id === teacherA.id)!.amount, 200);
  assert.equal(ranged.classes.length, 1); assert.equal(ranged.manualSummaries[0].amount, 1000);
  // An unscheduled allocation and the existing split both count, without group/meeting reconstruction.
  const [unscheduled] = await db.insert(s.teachingGroups).values({ termId: token.activeTermId, courseId: lab.courseId }).returning();
  await db.insert(s.workloadAllocations).values({ termId: token.activeTermId, teacherId: teacherA.id, teachingGroupId: unscheduled.id, units: "16.00" });
  await db.insert(s.externalCommitments).values({ termId: token.activeTermId, teacherId: teacherA.id,
    kind: "teaching", completenessLevel: "C", counterpartDepartment: "EEE", credits: "99.0", verificationStatus: "pending" });
  source = await operations.getExtraLoadData();
  assert.equal(source.loads.get(teacherA.id), 16);
  const expected = computeWorkloads(source.data.meetings, source.data.allocations, () => false);
  for (const [id, units] of source.loads) assert.equal(units, expected.get(id)!.workloadUnits);
  lines.push("Merged audiences do not multiply units; split/external allocations agree with workload, raw external 99 is ignored, pending verification is exposed, unscheduled allocation counts, and existing zero-load claims/date-filtered payments/manual overrides survive.");

  await db.update(s.academicPolicies).set({ theoryCreditHours: "4.5", sessionalCreditHours: "7.5" });
  const beforePolicy = (await policies())[0];
  const policyForm = { extraLoadThresholdCredits: "15", extraClassRate: "201.25", theoryAttendanceMarks: "10", sessionalAttendanceMarks: "5", theoryCreditHours: "999.9", sessionalCreditHours: "999.9" };
  ok(await actions.updateAcademicPolicyAction(form(policyForm), token));
  let policy = (await policies())[0];
  assert.equal(policy.theoryCreditHours, beforePolicy.theoryCreditHours); assert.equal(policy.sessionalCreditHours, beforePolicy.sessionalCreditHours);
  assert.equal(Number(policy.extraClassRate), 201.25);
  assert.equal((await audits()).at(-1)!.action, "policy.update");
  assert.equal((await noWrite(() => actions.updateAcademicPolicyAction(form({ ...policyForm, extraClassRate: "-1" }), token))).ok, false);
  await db.execute(sql`insert into safe01_fault values (true)`);
  const beforeFault = await snapshot();
  await assert.rejects(create(), error => /SAFE-01 injected audit failure/.test(String((error as { cause?: { message?: string } }).cause?.message ?? error)));
  assert.equal(await snapshot(), beforeFault);
  await assert.rejects(actions.updateAcademicPolicyAction(form({ ...policyForm, extraClassRate: "202" }), token));
  assert.equal(await snapshot(), beforeFault);
  await db.execute(sql`delete from safe01_fault`);
  ok(await create());
  // Missing-policy compatibility still supplies legacy defaults, while editable values are explicit.
  await db.delete(s.academicPolicies).where(eq(s.academicPolicies.termId, token.activeTermId!));
  ok(await actions.updateAcademicPolicyAction(form(policyForm), token));
  policy = (await policies())[0]; assert.equal(Number(policy.theoryCreditHours), 3); assert.equal(Number(policy.sessionalCreditHours), 2);
  lines.push("Active policy preserves legacy fields despite forged replacements, saves/validates supported fields, audits atomically, and restores compatibility defaults only when the policy row is missing. Injected audit failure rolls back both claim and policy writes; retry succeeds.");

  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.email, "teacher-a@example.invalid"));
  signInAs("teacher-a@example.invalid");
  source = await operations.getExtraLoadData();
  assert.deepEqual(source.teacherSummaries.map(row => row.teacher.id), [teacherA.id]);
  assert.deepEqual([...source.loads.keys()], [teacherA.id], "no other teacher load is returned to the teacher");
  assert.equal(source.loads.get(teacherA.id), 16, "teacher view uses all their allocations, not just visible groups");
  assert.ok(source.classes.every(row => row.teacherId === teacherA.id)); assert.equal(source.manualSummaries.length, 0);
  ok(await create({ teachingGroupId: unscheduled.id }));
  assert.equal((await noWrite(() => create({ teacherId: teacherB.id }))).ok, false);
  assert.equal((await noWrite(() => actions.updateAcademicPolicyAction(form(policyForm), token))).ok, false);
  signInAs("admin@example.invalid");
  assert.equal((await noWrite(() => create({}, { ...token, generation: token.generation + 1 }))).outcome?.kind, "stale");
  const [other] = await db.insert(s.academicTerms).values({ name: "Load other term", academicYear: 2027, startDate: "2027-01-01", endDate: "2027-05-01", status: "draft" }).returning();
  const [otherGroup] = await db.insert(s.teachingGroups).values({ termId: other.id, courseId: group.courseId }).returning();
  await db.insert(s.workloadAllocations).values({ termId: other.id, teachingGroupId: otherGroup.id, teacherId: teacherA.id, units: "99.00" });
  assert.equal((await operations.getExtraLoadData()).loads.get(teacherA.id), 16);
  assert.equal((await noWrite(() => create({ teachingGroupId: otherGroup.id }))).ok, false);
  assert.equal((await noWrite(() => create({ teacherId: teacherC.id }))).ok, false);
  const [viewer] = await db.insert(s.portalUsers).values({ email: "load-viewer@example.invalid", displayName: "Synthetic Viewer", status: "active" }).returning();
  await db.insert(s.roleAssignments).values({ userId: viewer.id, role: "read_only_viewer" });
  signInAs(viewer.email);
  assert.equal((await noWrite(() => create())).outcome?.kind, "permission");
  await assert.rejects(operations.getExtraLoadData(), error => error instanceof RedirectSignal && error.location === "/forbidden");
  signInAs(null);
  assert.equal((await noWrite(() => create())).outcome?.kind, "permission");
  lines.push("Teacher-only summaries/loads/claims remain scoped and unscheduled assignments submit; forged other-teacher, viewer, anonymous, unassigned, wrong-term and stale requests write nothing. Another term's 99-unit allocation does not affect eligibility.");
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });

