import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase } from "../fingerprint";
import { setAuditInsertFault } from "../faults";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const { startClassGroupsAction } = loadApp<typeof import("../../../src/lib/class-group-actions")>("src/lib/class-group-actions.ts");
const { getClassGroupStartReview } = loadApp<typeof import("../../../src/lib/class-group-start-store")>("src/lib/class-group-start-store.ts");
const { getClassGroupChanges } = loadApp<typeof import("../../../src/lib/class-group-data")>("src/lib/class-group-data.ts");
const client = (db as unknown as { $client: import("../database").Queryable }).$client;

async function main() {
  signInAs("admin@example.invalid");
  const [source] = await db.select().from(s.academicTerms);
  const [target] = await db.insert(s.academicTerms).values({ name: "Fall 2026", academicYear: 2026, startDate: "2026-10-15", endDate: "2027-02-15", status: "draft" }).returning();
  const [theory, lab] = await db.select().from(s.courses).orderBy(s.courses.id);
  const [merged, sessional] = await db.select().from(s.teachingGroups).orderBy(s.teachingGroups.id);
  const [next] = await db.insert(s.batches).values({ stream: "HSC", label: "23X", sortOrder: 4 }).returning();
  const [diploma] = await db.select().from(s.batches).where(eq(s.batches.stream, "DIPLOMA"));
  await db.insert(s.batchTermPlacements).values([{ termId: target.id, batchId: next.id, semester: 7 }, { termId: target.id, batchId: diploma.id, semester: 3 }]);
  const targetOffers = await db.insert(s.courseOfferings).values([
    { termId: target.id, batchId: next.id, courseId: theory.id, status: "planned" },
    { termId: target.id, batchId: diploma.id, courseId: theory.id, status: "planned" },
    { termId: target.id, batchId: next.id, courseId: lab.id, status: "planned" },
  ]).returning();
  const review = async () => (await getClassGroupStartReview(db, target.id, null))!.review!;
  const row = async (id: number) => (await review()).rows.find(item => item.sourceGroupId === id)!;
  const apply = async (fingerprint: string, ids: number[], reason = "Synthetic carry-forward") => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ termId: target.id, sourceId: source.id, fingerprint, reason })) form.set(key, String(value));
    for (const id of ids) form.append("group", String(id));
    return startClassGroupsAction(form);
  };
  const unchanged = async (work: () => ReturnType<typeof apply>, outcome: string, allowSequenceAdvance = false) => {
    const before = await fingerprintDatabase(client);
    const result = await work();
    assert.equal(result.outcome?.kind, outcome, result.message);
    const after = await fingerprintDatabase(client);
    // PostgreSQL sequences can advance even when every inserted row rolls back.
    if (allowSequenceAdvance) assert.deepEqual(after.tables, before.tables);
    else assert.deepEqual(after, before);
  };
  assert.equal((await getClassGroupStartReview(db, target.id, target.id))?.review, null);
  assert.match((await row(merged.id)).problems.join(), /outside audience/);
  await db.update(s.teachingGroups).set({ externalAudienceLabel: null, notes: "Historical only" }).where(eq(s.teachingGroups.id, merged.id));
  assert.deepEqual((await row(merged.id)).offeringIds, targetOffers.slice(0, 2).map(item => item.id));
  assert.equal((await row(merged.id)).selectable, true);
  await db.update(s.courseOfferings).set({ status: "cancelled" }).where(eq(s.courseOfferings.id, targetOffers[1].id));
  assert.match((await row(merged.id)).problems.join(), /No eligible destination offering/);
  await db.update(s.courseOfferings).set({ status: "planned" }).where(eq(s.courseOfferings.id, targetOffers[1].id));
  const [other] = await db.insert(s.batches).values({ stream: "HSC", label: "23Y", sortOrder: 5 }).returning();
  await db.insert(s.batchTermPlacements).values({ termId: target.id, batchId: other.id, semester: 7 });
  const [ambiguous] = await db.insert(s.courseOfferings).values({ termId: target.id, batchId: other.id, courseId: theory.id, status: "planned" }).returning();
  assert.match((await row(merged.id)).problems.join(), /ambiguous/);
  await db.delete(s.courseOfferings).where(eq(s.courseOfferings.id, ambiguous.id));

  const earlier = await review();
  const teacherId = (await row(merged.id)).previous.rows[0].teacherId;
  await db.update(s.teachers).set({ status: "inactive" }).where(eq(s.teachers.id, teacherId));
  assert.match((await row(merged.id)).problems.join(), /Unavailable teachers/);
  await unchanged(() => apply(earlier.fingerprint, [merged.id]), "stale");
  await db.update(s.teachers).set({ status: "active" }).where(eq(s.teachers.id, teacherId));
  const token = (await review()).fingerprint;
  await unchanged(() => apply(token, [merged.id, merged.id]), "validation");
  await unchanged(() => apply(token, [merged.id, 2147483000]), "validation");
  await unchanged(() => apply(token, [merged.id], ""), "validation");
  signInAs(null);
  await unchanged(() => apply(token, [merged.id]), "permission");
  signInAs("admin@example.invalid");
  const faultHandle = { exec: async (sql: string) => {
    if ("exec" in client) await (client as unknown as { exec: (sql: string) => Promise<unknown> }).exec(sql);
    else await client.query(sql);
  } };
  await setAuditInsertFault(faultHandle, true);
  try { await unchanged(() => apply(token, [merged.id, sessional.id]), "validation", true); }
  finally { await setAuditInsertFault(faultHandle, false); }

  const before = await fingerprintDatabase(client);
  const result = await apply(token, [merged.id]);
  assert.ok(result.ok, result.message);
  const after = await fingerprintDatabase(client);
  const written = new Set(["public.teaching_groups", "public.teaching_group_offerings", "public.teaching_requirements", "public.workload_allocations", "public.audit_events"]);
  for (const key of Object.keys(before.tables)) if (!written.has(key)) assert.deepEqual(after.tables[key], before.tables[key], key);
  const existing = await row(merged.id);
  assert.equal(existing.comparison, "carried");
  assert.equal(existing.selectable, false);
  assert.equal((await row(sessional.id)).selectable, true);
  const [only] = await db.select().from(s.teachingGroups).where(eq(s.teachingGroups.termId, target.id));
  assert.equal(only.notes, null);
  assert.equal(only.externalAudienceLabel, null);
  const changes = await getClassGroupChanges(target.id);
  assert.equal(changes.changes.length, 1);
  assert.equal(changes.changes[0].started?.source, source.name);
  assert.equal(changes.changes[0].started?.groups[0].snapshot.audience.length, 2);
  await unchanged(() => apply(token, [merged.id]), "stale");
  await db.update(s.workloadAllocations).set({ units: "2.75" }).where(and(eq(s.workloadAllocations.teachingGroupId, only.id), eq(s.workloadAllocations.teacherId, teacherId)));
  assert.equal((await row(merged.id)).comparison, "changed");
  assert.equal((await row(merged.id)).current?.rows[0].units, 275);
  assert.ok((await apply((await review()).fingerprint, [sessional.id])).ok);
  report({ lines: [
    "Merged audience projection follows the term slots, including a changed cohort and a repeating cohort. Absent/cancelled, ambiguous, external and unavailable-teacher cases refused.",
    "Real action rejects stale, duplicate, forged, unapproved and anonymous submissions. Injected audit failure rolls back the whole selection.",
    "Selected apply preserves unrelated tables, records one history receipt and stays repeatable. Exact comparison reports carried allocations and a unit-only change.",
  ] });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
