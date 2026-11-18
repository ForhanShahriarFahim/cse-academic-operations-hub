import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { academicTerms, batches, batchTermPlacements, courseOfferings, courses, departments, teachers, teachingGroupOfferings, teachingGroups, teachingRequirements, termRollovers, workloadAllocations } from "@/db/schema";
import { denied, invalid, stale, succeeded } from "./action-result";
import { hasCapability, type Actor } from "./auth/policy";
import { allocationMethod, creditingOf, formatUnits, groupInteger, groupReason, groupTermEditable, parseDelivery, parseRequirement, parseTeachers, storedUnits } from "./class-group-records";
import { auditClassGroup, insertClassGroup, type ClassGroupReader, type ClassGroupTx } from "./class-group-store";
import { WORKLOAD_ADVISORY_UNITS } from "./constants";
import { cohortName, offeringLive, offeringOffered, slotKey } from "./offering-records";
import { lockTermContext } from "./term-lock";

function byKey<T, K>(rows: T[], key: (row: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const id = key(row);
    const existing = grouped.get(id);
    if (existing) existing.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

async function readStartFacts(db: ClassGroupReader, targetId: number, sourceId: number) {
  const termIds = [targetId, sourceId];
  const groups = await db.select({ group: teachingGroups, course: { code: courses.code, title: courses.title, active: courses.isActive } })
    .from(teachingGroups).innerJoin(courses, eq(teachingGroups.courseId, courses.id))
    .where(inArray(teachingGroups.termId, termIds)).orderBy(courses.code, teachingGroups.id);
  const offerings = await db.select({ offering: courseOfferings, batch: batches, semester: batchTermPlacements.semester })
    .from(courseOfferings).innerJoin(batches, eq(courseOfferings.batchId, batches.id))
    .leftJoin(batchTermPlacements, and(eq(batchTermPlacements.batchId, batches.id), eq(batchTermPlacements.termId, courseOfferings.termId)))
    .where(inArray(courseOfferings.termId, termIds)).orderBy(courseOfferings.id);
  const groupIds = groups.map(({ group }) => group.id);
  const offeringIds = offerings.map(({ offering }) => offering.id);
  const links = await db.select().from(teachingGroupOfferings)
    .where(or(groupIds.length ? inArray(teachingGroupOfferings.teachingGroupId, groupIds) : undefined,
      offeringIds.length ? inArray(teachingGroupOfferings.offeringId, offeringIds) : undefined) ?? eq(teachingGroupOfferings.id, 0))
    .orderBy(teachingGroupOfferings.id);
  const requirements = groupIds.length ? await db.select().from(teachingRequirements)
    .where(inArray(teachingRequirements.teachingGroupId, groupIds)).orderBy(teachingRequirements.id) : [];
  const allocations = groupIds.length ? await db.select({
    allocation: workloadAllocations, code: teachers.shortCode, name: teachers.fullName, status: teachers.status, limit: teachers.advisoryLoadUnits,
  }).from(workloadAllocations).innerJoin(teachers, eq(workloadAllocations.teacherId, teachers.id))
    .where(inArray(workloadAllocations.teachingGroupId, groupIds)).orderBy(workloadAllocations.teacherId, workloadAllocations.id) : [];
  const targetAllocations = await db.select({ teacherId: workloadAllocations.teacherId, units: workloadAllocations.units })
    .from(workloadAllocations).where(eq(workloadAllocations.termId, targetId)).orderBy(workloadAllocations.id);
  return { groups, offerings, links, requirements, allocations, targetAllocations };
}

type StartFacts = Awaited<ReturnType<typeof readStartFacts>>;

function projectGroups(facts: StartFacts, targetId: number, sourceId: number) {
  const { groups, offerings, links, requirements, allocations, targetAllocations } = facts;
  const memberLinks = byKey(links, link => link.teachingGroupId);
  const holders = byKey(links, link => link.offeringId);
  const offeringById = new Map(offerings.map(row => [row.offering.id, row]));
  type Offering = StartFacts["offerings"][number];
  const slot = ({ offering, batch, semester }: Offering) => semester == null ? null : offering.courseId + "|" + slotKey({ stream: batch.stream, semester });
  const priorSlots = byKey(offerings.filter(row => row.offering.termId === sourceId && offeringOffered(row.offering.status) && holders.has(row.offering.id)), slot);
  const targetSlots = byKey(offerings.filter(row => row.offering.termId === targetId && offeringLive(row.offering.status) && row.batch.status === "active"), slot);
  const teacherRows = byKey(allocations, row => row.allocation.teachingGroupId);
  const requirementRows = byKey(requirements, row => row.teachingGroupId);
  const totals = new Map<number, number>();
  for (const row of targetAllocations) totals.set(row.teacherId, (totals.get(row.teacherId) ?? 0) + (storedUnits(row.units) ?? 0));
  const describeTeachers = (group: StartFacts["groups"][number]["group"]) => {
    const rows = teacherRows.get(group.id) ?? [];
    const parsed = parseTeachers(rows.map(row => String(row.allocation.teacherId)), rows.map(row => row.allocation.units));
    const method = rows[0]?.allocation.allocationMethod ?? null;
    const valid = parsed.ok && method === allocationMethod(rows.length, creditingOf(method))
      && rows.every(({ allocation }) => allocation.termId === group.termId && allocation.externalCommitmentId == null && allocation.allocationMethod === method);
    return { valid, method, rows: rows.map(({ allocation, code, name, status, limit }) => ({
      teacherId: allocation.teacherId, code, name, status, units: storedUnits(allocation.units) ?? 0,
      total: totals.get(allocation.teacherId) ?? 0,
      limit: storedUnits(limit ?? WORKLOAD_ADVISORY_UNITS) ?? WORKLOAD_ADVISORY_UNITS * 100,
    })) };
  };
  const signature = (value: ReturnType<typeof describeTeachers>) => JSON.stringify([value.method, value.rows.map(row => [row.teacherId, row.units])]);
  const matched = new Set<number>();
  const rows = groups.filter(({ group }) => group.termId === sourceId).map(({ group, course }) => {
    const problems: string[] = [];
    const priorAudience: string[] = [];
    const destination: Offering[] = [];
    const members = memberLinks.get(group.id) ?? [];
    if (!members.length) problems.push("The source group has no linked cohort.");
    for (const link of members) {
      const row = offeringById.get(link.offeringId);
      if (!row || row.offering.termId !== sourceId || row.offering.courseId !== group.courseId) {
        problems.push("The source group has a broken offering link.");
        continue;
      }
      const name = cohortName(row.batch);
      priorAudience.push(name);
      const key = slot(row);
      if (!key || !offeringOffered(row.offering.status)) {
        problems.push(name + " has no usable source placement or offering.");
        continue;
      }
      const candidates = targetSlots.get(key) ?? [];
      if (priorSlots.get(key)?.length !== 1 || holders.get(row.offering.id)?.length !== 1 || candidates.length > 1) {
        problems.push(name + " has an ambiguous match for " + row.batch.stream + " semester " + row.semester + ".");
      } else if (!candidates.length) {
        problems.push("No eligible destination offering matches " + row.batch.stream + " semester " + row.semester + ".");
      } else {
        destination.push(candidates[0]);
      }
    }
    const offeringIds = destination.map(row => row.offering.id);
    const destinationAudience = destination.map(row => cohortName(row.batch));
    const occupancy = offeringIds.map(id => holders.get(id) ?? []);
    const holder = occupancy[0]?.[0]?.teachingGroupId;
    const exact = !problems.length && holder && occupancy.every(rows => rows.length === 1 && rows[0].teachingGroupId === holder)
      && memberLinks.get(holder)?.length === offeringIds.length
      ? groups.find(item => item.group.id === holder && item.group.termId === targetId && item.group.courseId === group.courseId) : undefined;
    if (exact) matched.add(exact.group.id);
    else if (occupancy.some(rows => rows.length)) problems.push("A matched offering is already in a different class group. Review the audience.");

    const previous = describeTeachers(group);
    const current = exact ? describeTeachers(exact.group) : null;
    const comparableAudience = exact && exact.group.externalAudienceLabel === group.externalAudienceLabel
      && exact.group.externalStudentCount === group.externalStudentCount;
    const comparison = comparableAudience && current?.valid && previous.valid
      ? signature(previous) === signature(current) ? "carried" : "changed" : null;
    if (group.externalAudienceLabel !== null || group.externalStudentCount !== null) problems.push("The source group has an outside audience.");
    if (group.pendingReconciliation) problems.push("The source group is marked for reconciliation.");
    if (!course.active) problems.push("The course is inactive.");
    if (!previous.valid) problems.push("The source teacher allocations need review.");
    const unavailable = previous.rows.filter(teacher => teacher.status !== "active");
    if (unavailable.length) problems.push("Unavailable teachers: " + unavailable.map(teacher => teacher.code).join(", ") + ".");

    const delivery = parseDelivery(group.deliveryMode);
    const [requirement, duplicate] = requirementRows.get(group.id) ?? [];
    const parsed = delivery && requirement && !duplicate && ["approved", "provisional"].includes(requirement.status)
      && (delivery !== "teacher_managed" || (requirement.expectedWeeklyMinutes === null && requirement.requiredMeetingsPerWeek === 1))
      ? parseRequirement(delivery, String(requirement.requiredMeetingsPerWeek), requirement.expectedWeeklyMinutes === null ? "" : String(requirement.expectedWeeklyMinutes), requirement.status === "provisional" ? "on" : "")
      : null;
    if (!parsed?.ok) problems.push("The source delivery or weekly requirement needs review.");
    return {
      sourceGroupId: group.id, courseId: group.courseId, course, priorAudience, destinationAudience, offeringIds,
      destinationGroupId: exact?.group.id ?? null, comparison, previous, current, delivery,
      requirement: parsed?.ok ? parsed.requirement : null, problems,
      selectable: !exact && !problems.length,
    };
  });
  const unmatched = groups.filter(({ group }) => group.termId === targetId && !matched.has(group.id))
    .map(({ group, course }) => ({
      id: group.id, code: course.code,
      audience: (memberLinks.get(group.id) ?? []).flatMap(link => {
        const row = offeringById.get(link.offeringId);
        return row ? [cohortName(row.batch)] : [];
      }),
    }));
  return { rows, unmatched };
}

export async function getClassGroupStartReview(db: ClassGroupReader, targetId: number, requestedSource: number | null, lockTeachers?: ClassGroupTx) {
  const terms = await db.select({ id: academicTerms.id, name: academicTerms.name, status: academicTerms.status, startDate: academicTerms.startDate })
    .from(academicTerms).orderBy(academicTerms.startDate, academicTerms.id);
  const target = terms.find(term => term.id === targetId);
  if (!target) return null;
  const sources = terms.filter(term => term.startDate < target.startDate && ["active", "completed"].includes(term.status));
  const [receipt] = await db.select({ id: termRollovers.sourceTermId }).from(termRollovers).where(eq(termRollovers.targetTermId, targetId));
  const source = requestedSource === null ? sources.find(term => term.id === receipt?.id) ?? sources.at(-1)
    : sources.find(term => term.id === requestedSource);
  const editable = groupTermEditable(target.status);
  if (!source || !editable) return { target, sources, source, editable, review: null };
  let facts = await readStartFacts(db, targetId, source.id);
  if (lockTeachers) {
    const teacherIds = [...new Set(facts.allocations.map(row => row.allocation.teacherId))];
    if (teacherIds.length) {
      await lockTeachers.select({ id: teachers.id }).from(teachers).where(inArray(teachers.id, teacherIds)).orderBy(teachers.id).for("update");
      facts = await readStartFacts(db, targetId, source.id);
    }
  }
  const projection = projectGroups(facts, targetId, source.id);
  const offeringEvidence = facts.offerings.map(({ offering, batch, semester }) => [offering, batch.stream, batch.label, batch.status, semester]);
  const fingerprint = createHash("sha256").update(JSON.stringify([target, source, projection, offeringEvidence, facts.links])).digest("hex");
  return { target, sources, source, editable, review: {
    ...projection, fingerprint, hasOfferings: facts.offerings.some(row => row.offering.termId === targetId && offeringLive(row.offering.status)),
  } };
}

export async function startClassGroupsInTransaction(tx: ClassGroupTx, actor: Actor, raw: Record<string, unknown>, picks: unknown[]) {
  const [scope] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  if (!hasCapability(actor, "manage_class_groups", scope?.id ?? null)) return denied("You do not have permission to start class groups.", "forbidden");
  const termId = groupInteger(raw.termId);
  const sourceId = groupInteger(raw.sourceId);
  const selected = new Set(picks.map(groupInteger));
  const reason = groupReason(raw.reason);
  if (!termId || !sourceId || termId === sourceId || typeof raw.fingerprint !== "string") return invalid("Open a valid class-group review.");
  if (!reason) return invalid("Enter a reason using 1–300 plain-text characters.", { reason: ["Enter a reason."] });
  if (!selected.size || selected.has(null) || selected.size !== picks.length) return invalid("Select one or more distinct groups from the review.");

  await lockTermContext(tx, "share");
  await tx.select({ id: academicTerms.id }).from(academicTerms).where(inArray(academicTerms.id, [termId, sourceId])).orderBy(academicTerms.id).for("update");
  const data = await getClassGroupStartReview(tx, termId, sourceId, tx);
  if (!data?.review || !data.source || data.review.fingerprint !== raw.fingerprint) {
    return stale("Source or destination details changed. Reload the review and select the groups again.");
  }
  const chosen = data.review.rows.filter(row => selected.has(row.sourceGroupId));
  if (chosen.length !== selected.size || chosen.some(row => !row.selectable)) return invalid("Select only eligible groups from this review.");
  const groups = [];
  for (const row of chosen) {
    const { previous, course, sourceGroupId, destinationAudience, delivery, requirement } = row;
    if (!delivery || !requirement) throw new Error("A validated group requires a delivery and a weekly requirement.");
    const groupId = await insertClassGroup(tx, { termId, courseId: row.courseId, deliveryMode: delivery }, row.offeringIds, requirement, previous.rows, previous.method);
    groups.push({
      sourceGroupId, groupId, course: course.code, audience: destinationAudience, deliveryMode: delivery, requirement,
      teachers: previous.rows.map(teacher => ({ teacherId: teacher.teacherId, code: teacher.code, units: formatUnits(teacher.units) })), method: previous.method,
    });
  }
  await auditClassGroup(tx, actor, "term_class_groups.start", termId, null, { count: groups.length, groups },
    { reason, sourceTermId: sourceId, sourceTerm: data.source.name, destinationTermId: termId, destinationTerm: data.target.name });
  const merged = groups.filter(group => group.audience.length > 1).length;
  return succeeded("Created " + groups.length + (groups.length === 1 ? " class group" : " class groups") + (merged ? " (" + merged + " merged)" : "") + ".", { entityId: termId });
}
