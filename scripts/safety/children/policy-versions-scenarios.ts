/** SET-01B: real policy actions, loaders and outputs; only the request/provider boundary is stubbed. */
import assert from "node:assert/strict";
import { asc, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";
import type { TermWriteContext } from "../../../src/lib/term-context-value";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const academic = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const operations = loadApp<typeof import("../../../src/lib/academic-operations")>("src/lib/academic-operations.ts");
const policy = loadApp<typeof import("../../../src/lib/policy-actions")>("src/lib/policy-actions.ts");
const store = loadApp<typeof import("../../../src/lib/policy-store")>("src/lib/policy-store.ts");
const data = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const terms = loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
const reads = loadApp<typeof import("../../../src/lib/term-data")>("src/lib/term-data.ts");
const { dhakaToday } = loadApp<typeof import("../../../src/lib/room-lifecycle")>("src/lib/room-lifecycle.ts");

const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f; };
const ok = (r: ActionResult) => { assert.equal(r.ok, true, `${r.message} ${JSON.stringify(r.outcome)}`); return r; };
const kind = (r: ActionResult) => r.outcome?.kind;
const ADMIN = "admin@example.invalid", APPROVER = "approver@example.invalid";

async function main() {
  const lines: string[] = [];
  signInAs(ADMIN);
  let token: TermWriteContext = (await context.captureActiveContext()).writeContext;
  const termId = token.activeTermId!;
  const [admin] = await db.select().from(s.portalUsers).where(eq(s.portalUsers.email, ADMIN));
  const [approver] = await db.insert(s.portalUsers).values({ email: APPROVER, displayName: "Synthetic Approver", status: "active" }).returning();
  await db.insert(s.roleAssignments).values({ userId: approver.id, role: "academic_administrator", grantedByUserId: admin.id });
  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.email, "teacher-a@example.invalid"));
  const [teacherA] = await db.select().from(s.teachers).orderBy(asc(s.teachers.id));
  const [merged] = await db.select().from(s.teachingGroups).orderBy(asc(s.teachingGroups.id));
  const versions = () => db.select().from(s.academicPolicyVersions).orderBy(asc(s.academicPolicyVersions.id));
  const snapshot = async () => JSON.stringify([await versions(), await db.select().from(s.academicPolicies).orderBy(asc(s.academicPolicies.id)),
    await db.select().from(s.extraLoadClasses).orderBy(asc(s.extraLoadClasses.id)), await db.select().from(s.auditEvents).orderBy(asc(s.auditEvents.id))]);
  const noWrite = async (work: () => Promise<ActionResult>) => { const before = await snapshot(); const result = await work(); assert.equal(await snapshot(), before, `wrote despite ${result.message}`); return result; };
  const proposal = (patch: Record<string, unknown>) => form({ extraClassRate: "200", extraLoadThresholdCredits: "15", theoryAttendanceMarks: "10", sessionalAttendanceMarks: "5", reason: "Synthetic verification only", ...patch });
  const fingerprintFor = async (id: number) => {
    const current = (await store.loadTermPolicy(token.activeTermId!))!; const row = current.history.find(item => item.id === id);
    if (!row) return "0".repeat(64); // a proposal outside the active term has no reviewable impact
    return store.proposalImpact(current, { effectiveFrom: row.effectiveFrom, figures: row.figures }, await store.impactInput(await data.getPortalData(), dhakaToday())).fingerprint;
  };
  const decide = async (id: number, command: "approve" | "reject" | "withdraw", extra: { note?: string; fingerprint?: string } = {}) =>
    policy.decidePolicyChangeAction(id, { command, fingerprint: command === "withdraw" ? undefined : extra.fingerprint ?? await fingerprintFor(id), note: extra.note }, token);
  const latest = async () => (await versions()).at(-1)!;
  const teacherAmount = (extra: Awaited<ReturnType<typeof operations.getExtraLoadData>>) => extra.teacherSummaries.find(row => row.teacher.id === teacherA.id)!;
  const createClass = (classDate: string) => academic.createExtraLoadClassAction(form({ teacherId: teacherA.id, teachingGroupId: merged.id, classDate, startTime: "16:00", endTime: "17:00" }), token);

  // AC-06: before any version, figures equal the baseline exactly.
  let extra = await operations.getExtraLoadData();
  assert.equal(extra.policyVersion, 1); assert.equal(teacherAmount(extra).amount, 200); assert.equal(extra.manualSummaries[0].amount, 1000);
  assert.deepEqual(extra.versionsUsed.map(v => v.version), [1]);
  let marks = await operations.getAttendanceData(merged.id);
  assert.equal(marks.maximum, 10); assert.equal(marks.maximumVersion, 1);
  lines.push("Before any version, payments (Tk 200 per class, manual override Tk 1,000) and the theory maximum (10, Version 1) equal the baseline.");

  // AC-02: authority. A teacher cannot propose or preview; nobody approves their own proposal.
  signInAs("teacher-a@example.invalid");
  assert.equal(kind(await noWrite(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-07-05", extraClassRate: "300" }), token))), "permission");
  assert.equal(kind(await noWrite(() => policy.previewPolicyChangeAction(proposal({ effectiveFrom: "2026-07-05", extraClassRate: "300" }), token))), "permission");
  signInAs(ADMIN);
  // Preview writes nothing and reports eligibility change for the lower threshold.
  const preview = await noWrite(() => policy.previewPolicyChangeAction(proposal({ effectiveFrom: "2026-07-05", extraClassRate: "300", extraLoadThresholdCredits: "2" }), token)) as Awaited<ReturnType<typeof policy.previewPolicyChangeAction>>;
  ok(preview); assert.deepEqual(preview.preview!.impact!.payments.classIds, [], "the fixture class on 4 July keeps its rate");
  assert.ok(preview.preview!.impact!.threshold.changed.some(row => row.teacherId === teacherA.id && row.after));
  assert.equal(kind(await noWrite(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-06-01", extraClassRate: "300" }), token))), "validation", "the baseline owns the term start");
  assert.equal(kind(await noWrite(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-07-05" }), token))), "validation", "a no-op proposal is refused");
  ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-07-05", extraClassRate: "300", extraLoadThresholdCredits: "2" }), token));
  const v2 = await latest(); assert.equal(v2.status, "proposed"); assert.equal(v2.proposedByUserId, admin.id);
  assert.equal(kind(await noWrite(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-08-01", extraClassRate: "310" }), token))), "conflict", "one open proposal per term");
  assert.equal(kind(await noWrite(() => decide(v2.id, "approve"))), "permission", "self-approval refused");
  extra = await operations.getExtraLoadData(); assert.equal(extra.policy!.extraClassRate, 200, "nothing changes while proposed");
  signInAs(APPROVER);
  assert.equal(kind(await noWrite(() => decide(v2.id, "approve", { fingerprint: "0".repeat(64) }))), "stale");
  assert.equal(kind(await noWrite(() => decide(v2.id, "withdraw"))), "permission", "only the proposer withdraws");
  ok(await decide(v2.id, "approve"));
  const approvedV2 = (await versions()).find(row => row.id === v2.id)!;
  assert.equal(approvedV2.status, "approved"); assert.equal(approvedV2.version, 2); assert.equal(approvedV2.decidedByUserId, approver.id);
  const actions = (await db.select().from(s.auditEvents).where(eq(s.auditEvents.entity, "academic_policy_version"))).map(row => row.action);
  assert.deepEqual(actions, ["policy.propose", "policy.approve"]);
  lines.push("Teachers cannot propose or preview; previews write nothing; the baseline date, no-op and second open proposal are refused; the proposer cannot approve or be bypassed by another person's withdrawal; a wrong fingerprint is stale; a second administrator approves and both steps are audited.");

  // AC-03: dates decide. Threshold on the class date; mixed rates per teacher.
  signInAs(ADMIN);
  const refused = await noWrite(() => createClass("2026-06-20"));
  assert.equal(refused.ok, false); assert.match(refused.message, /2026-06-20 starts above 15/);
  ok(await createClass("2026-07-10"));
  extra = await operations.getExtraLoadData();
  assert.equal(teacherAmount(extra).amount, 500, "4 July at Tk 200 plus 10 July at Tk 300");
  assert.deepEqual(teacherAmount(extra).rates.sort(), [200, 300]);
  assert.deepEqual(extra.classes.map(row => [row.classDate, row.rate, row.policyVersion]), [["2026-07-04", 200, 1], ["2026-07-10", 300, 2]]);
  assert.deepEqual(extra.versionsUsed.map(v => v.version), [1, 2]); assert.equal(extra.manualSummaries[0].amount, 1000, "override untouched");
  lines.push("Eligibility uses the threshold in force on the class date (refused on 20 June under 15 h, accepted on 10 July under 2 h); each class is priced on its date, giving Tk 500 across Version 1 and 2; overrides are untouched.");

  // AC-04: the preview equals the approved result; a changed impact refuses without a write.
  ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-07-08", extraClassRate: "350", extraLoadThresholdCredits: "2" }), token));
  const v3 = await latest();
  signInAs(APPROVER);
  const before = await fingerprintFor(v3.id);
  signInAs(ADMIN); ok(await createClass("2026-07-12")); signInAs(APPROVER);
  assert.equal(kind(await noWrite(() => decide(v3.id, "approve", { fingerprint: before }))), "stale", "a class recorded after the review changes the impact");
  const current = (await store.loadTermPolicy(termId))!;
  const impact = store.proposalImpact(current, { effectiveFrom: v3.effectiveFrom, figures: current.open!.figures }, await store.impactInput(await data.getPortalData(), dhakaToday())).impact!;
  assert.deepEqual([impact.payments.totalBefore, impact.payments.totalAfter], [600, 700], "10 and 12 July reprice from Tk 300 to Tk 350");
  assert.equal(kind(await noWrite(() => decide(v3.id, "reject"))), "validation", "rejection needs a note");
  ok(await decide(v3.id, "reject", { note: "Not approved by the synthetic council." }));
  for (const [label, statement] of [
    ["decided row edit", `update academic_policy_versions set extra_class_rate=1 where id=${v3.id}`],
    ["decided row reopen", `update academic_policy_versions set status='proposed', decided_at=null, decided_by_user_id=null, decision_note=null where id=${v3.id}`],
    ["delete", `delete from academic_policy_versions where id=${v2.id}`],
    ["self-approved row", `insert into academic_policy_versions(term_id, version, status, effective_from, extra_load_threshold_credits, extra_class_rate, theory_attendance_marks, sessional_attendance_marks, reason, proposed_by_user_id, proposal_fingerprint, decided_by_user_id, decided_at, decision_fingerprint) values (${termId}, 9, 'approved', '2026-09-20', 1, 1, 1, 1, 'x', ${admin.id}, 'x', ${admin.id}, now(), 'x')`],
    ["untrimmed reason", `insert into academic_policy_versions(term_id, effective_from, extra_load_threshold_credits, extra_class_rate, theory_attendance_marks, sessional_attendance_marks, reason, proposed_by_user_id, proposal_fingerprint) values (${termId}, '2026-09-20', 1, 1, 1, 1, ' x ', ${admin.id}, 'x')`],
  ] as const) await assert.rejects(db.execute(sql.raw(statement)), Error, label);
  // Approve a version whose preview matches what the outputs then show.
  signInAs(ADMIN); ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-07-11", extraClassRate: "325", extraLoadThresholdCredits: "2" }), token));
  const v4 = await latest(); signInAs(APPROVER);
  const live = (await store.loadTermPolicy(termId))!;
  const expected = store.proposalImpact(live, { effectiveFrom: v4.effectiveFrom, figures: live.open!.figures }, await store.impactInput(await data.getPortalData(), dhakaToday())).impact!;
  ok(await decide(v4.id, "approve"));
  extra = await operations.getExtraLoadData();
  assert.equal(teacherAmount(extra).amount, 200 + 300 + 325, "4 July (V1), 10 July (V2), 12 July (V3)");
  assert.equal(expected.payments.totalAfter, extra.classes.filter(row => expected.payments.classIds.includes(row.id)).reduce((sum, row) => sum + row.rate!, 0));
  lines.push("A class recorded after the review makes approval stale with no write; rejection needs a note; decided, deleted, self-approved and untrimmed rows are refused by the database; an approved preview equals the priced outputs afterwards.");

  // Attendance maximum is whole-term, as of the evaluation date (the term end for this fixture).
  signInAs(ADMIN); ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-09-01", extraClassRate: "325", extraLoadThresholdCredits: "2", theoryAttendanceMarks: "12" }), token));
  const v5 = await latest(); signInAs(APPROVER); ok(await decide(v5.id, "approve"));
  marks = await operations.getAttendanceData(merged.id);
  assert.equal(marks.maximum, 12); assert.equal(marks.maximumVersion, 4);
  assert.ok(marks.summaries.every(row => row.maximum === 12));
  lines.push("An approved attendance maximum applies to the whole term from its evaluation date and names its version.");

  // AC-05: an audit failure rolls the approval back; withdrawal is the proposer's.
  signInAs(ADMIN); ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-09-10", extraClassRate: "400", extraLoadThresholdCredits: "2", theoryAttendanceMarks: "12" }), token));
  const v6 = await latest(); signInAs(APPROVER);
  const print = await fingerprintFor(v6.id);
  await db.execute(sql`insert into safe01_fault values (true)`);
  const faultBefore = await snapshot();
  await assert.rejects(decide(v6.id, "approve", { fingerprint: print }));
  assert.equal(await snapshot(), faultBefore); await db.execute(sql`delete from safe01_fault`);
  signInAs(ADMIN); ok(await decide(v6.id, "withdraw"));
  assert.equal((await versions()).find(row => row.id === v6.id)!.status, "withdrawn");
  assert.equal(kind(await academic.updateAcademicPolicyAction(form({ extraClassRate: "999" }), token)), "conflict", "no in-place edit");
  lines.push("An audit-insert failure during approval leaves versions, baseline and audit unchanged; the proposer withdraws; the in-place edit refuses.");

  // A term switch makes the outgoing open proposal stale; then a missing baseline is recorded through review.
  ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2026-09-15", extraClassRate: "410", extraLoadThresholdCredits: "2", theoryAttendanceMarks: "12" }), token));
  const outgoing = await latest();
  const created = ok(await terms.createTermAction(null, form({ name: "Policy next term", academicYear: 2027, startDate: "2027-01-02", endDate: "2027-04-30" })));
  const nextId = (created.outcome as { entityId: number }).entityId;
  ok(await terms.saveStartingPolicyAction(null, form({ termId: nextId, revision: 1, theoryCreditHours: "3", sessionalCreditHours: "2", extraLoadThresholdCredits: "15", extraClassRate: "220", theoryAttendanceMarks: "10", sessionalAttendanceMarks: "5" })));
  const review = (await reads.activationEvidence(nextId))!;
  ok(await terms.activateTermAction(null, form({ termId: nextId, revision: review.target.term.revision, generation: review.context.generation, previousActiveId: review.active?.term.id ?? "", fingerprint: review.fingerprint, reason: "Synthetic verification only", acknowledge: "on" })));
  assert.equal((await versions()).find(row => row.id === outgoing.id)!.status, "stale");
  assert.equal(kind(await noWrite(() => decide(outgoing.id, "approve"))), "stale", "old page context is refused");
  token = (await context.captureActiveContext()).writeContext;
  assert.equal(kind(await noWrite(() => decide(outgoing.id, "approve"))), "stale", "a stale proposal cannot be approved in the new term");
  await db.delete(s.academicPolicies).where(eq(s.academicPolicies.termId, nextId));
  extra = await operations.getExtraLoadData(); assert.equal(extra.policyMissing, true);
  assert.equal(kind(await noWrite(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2027-02-01" }), token))), "validation", "a baseline starts on the term start");
  ok(await policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2027-01-02", extraClassRate: "230" }), token));
  const baseline = await latest(); signInAs(APPROVER); ok(await decide(baseline.id, "approve"));
  assert.equal((await versions()).find(row => row.id === baseline.id)!.version, 1);
  const recorded = (await db.select().from(s.academicPolicies).where(eq(s.academicPolicies.termId, nextId)))[0];
  assert.equal(Number(recorded.extraClassRate), 230);
  const view = await operations.getTermPolicyView((await data.getPortalData()).term);
  assert.equal(view.current!.version, 1); assert.equal(view.figures!.extraClassRate, 230);
  lines.push("Activation marks the outgoing term's open proposal stale and it can never be approved; a term without a baseline prices nothing until a term-start baseline proposal is approved by a second person, which records Version 1.");

  // AC-07: concurrent decisions and proposals on independent PostgreSQL connections.
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) : null;
  const control = pool ? await pool.connect() : null;
  const barrier = 61051;
  const waitFor = async (query: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (Number((await pool!.query(query)).rows[0].count) > 0) return; await new Promise(resolve => setTimeout(resolve, 15)); }
    assert.fail("Policy race did not reach the expected lock wait");
  };
  async function race(first: () => Promise<ActionResult>, second: () => Promise<ActionResult>) {
    if (!pool || !control) return Promise.all([first(), second()]);
    await control.query(`select pg_advisory_lock(${barrier})`);
    await pool.query(`create function set1b_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${barrier});return new;end$$;create trigger set1b_barrier before insert or update on academic_policy_versions for each row execute function set1b_barrier()`);
    try {
      const one = first();
      await waitFor("select count(*) from pg_stat_activity where datname=current_database() and wait_event='advisory'");
      const two = second();
      await waitFor("select count(*) from pg_stat_activity a where a.datname=current_database() and exists(select 1 from pg_stat_activity b where b.pid=any(pg_blocking_pids(a.pid)) and b.wait_event='advisory')");
      await control.query(`select pg_advisory_unlock(${barrier})`);
      return await Promise.all([one, two]);
    } finally {
      await control.query(`select pg_advisory_unlock(${barrier})`);
      await pool.query("drop trigger set1b_barrier on academic_policy_versions;drop function set1b_barrier()");
    }
  }
  try {
    const outcome = (pair: ActionResult[]) => pair.map(result => result.ok ? "ok" : kind(result)).sort();
    signInAs(ADMIN);
    const proposals = await race(() => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2027-02-01", extraClassRate: "240" }), token),
      () => policy.proposePolicyChangeAction(proposal({ effectiveFrom: "2027-02-02", extraClassRate: "250" }), token));
    assert.deepEqual(outcome(proposals), ["conflict", "ok"]);
    assert.equal((await versions()).filter(row => row.status === "proposed").length, 1);
    const open = await latest(); signInAs(APPROVER);
    const print2 = await fingerprintFor(open.id); const events = (await db.select().from(s.auditEvents)).length;
    const approvals = await race(() => decide(open.id, "approve", { fingerprint: print2 }), () => decide(open.id, "approve", { fingerprint: print2 }));
    assert.deepEqual(outcome(approvals), ["ok", "stale"]);
    assert.equal((await db.select().from(s.auditEvents)).length, events + 1, "exactly one approval is audited");
    lines.push(`${pool ? "PostgreSQL independent connections with an observed lock wait" : "PGlite queued calls"}: two simultaneous proposals leave exactly one open; two simultaneous approvals commit and audit exactly once, the other is stale.`);
  } finally { control?.release(); await pool?.end(); }

  report({ lines });
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
