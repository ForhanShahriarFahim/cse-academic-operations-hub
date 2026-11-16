/** CRS-01B injected term-offering evidence and writes; no configured client import. */
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, auditEvents, batches, batchTermPlacements, courseOfferings, courses, departments, teachingGroupOfferings, termRollovers } from "@/db/schema";
import { hasCapability, type Actor } from "./auth/policy";
import { conflicted, denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { cohortName, compareCohort, newOfferingStatus, offeringInteger, offeringLive, offeringReason, offeringTermEditable, parsePick, proposeCohort, slotBasis, slotKey, type OfferingCohort, type OfferingComparison, type OfferingCourse, type OfferingFact, type ProposalItem } from "./offering-records";
import { lockTermContext } from "./term-lock";

export type OfferingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OfferingReader = Pick<OfferingTx, "select">;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export interface OfferingCourseView { id: number; code: string; title: string; credits: string; courseType: string; semester: number; isActive: boolean }
export interface OfferingRowView { id: number; course: OfferingCourseView; status: string; groups: number; comparison: OfferingComparison | null }
export interface OfferingCohortView {
  batchId: number; name: string; stream: string; semester: number | null; batchStatus: string; placed: boolean;
  fingerprint: string; hasBasis: boolean; basisCohorts: string[];
  offerings: OfferingRowView[];
  dropped: Array<{ course: OfferingCourseView; partial: boolean }>;
  proposal: Array<ProposalItem & { course: OfferingCourseView }>;
  counts: { offered: number; cancelled: number; ungrouped: number; carried: number; added: number; dropped: number; changed: number };
}
export interface TermOfferingsView {
  term: { id: number; name: string; status: string }; editable: boolean;
  sources: Array<{ id: number; name: string; status: string }>; source: { id: number; name: string; status: string } | null; preparedFromId: number | null;
  cohorts: OfferingCohortView[]; courses: OfferingCourseView[]; startFingerprint: string;
  totals: { offered: number; carried: number; added: number; dropped: number; changed: number; notStarted: number };
}
export interface OfferingResult extends ActionResult { fingerprint?: string }

const courseView = (course: typeof courses.$inferSelect): OfferingCourseView => ({ id: course.id, code: course.code, title: course.title, credits: course.credits, courseType: course.courseType, semester: course.semester, isActive: course.isActive });
const unknownCourse = (id: number): OfferingCourseView => ({ id, code: `Unknown course #${id}`, title: "Missing catalog record", credits: "0.0", courseType: "unknown", semester: 0, isActive: false });

async function placements(reader: OfferingReader, termId: number) {
  return reader.select({ b: batches, p: batchTermPlacements }).from(batchTermPlacements).innerJoin(batches, eq(batches.id, batchTermPlacements.batchId)).where(eq(batchTermPlacements.termId, termId)).orderBy(batches.sortOrder, batches.stream, batches.label, batches.id);
}

/**
 * One term's offerings with the comparison against a source term. `requested`
 * selects the comparison source; an unusable value falls back to the default
 * (the term this one was prepared from, else the latest earlier term).
 */
export async function termOfferings(reader: OfferingReader, termId: number, requested?: number | null): Promise<TermOfferingsView | null> {
  const terms = await reader.select().from(academicTerms).orderBy(academicTerms.startDate, academicTerms.id);
  const term = terms.find(candidate => candidate.id === termId); if (!term) return null;
  const sources = terms.filter(candidate => candidate.id !== term.id && ["active", "completed"].includes(candidate.status) && candidate.startDate < term.startDate);
  const [receipt] = await reader.select({ sourceTermId: termRollovers.sourceTermId }).from(termRollovers).where(eq(termRollovers.targetTermId, term.id));
  const preparedFromId = sources.some(candidate => candidate.id === receipt?.sourceTermId) ? receipt!.sourceTermId : null;
  const source = sources.find(candidate => candidate.id === requested) ?? sources.find(candidate => candidate.id === preparedFromId) ?? sources.at(-1) ?? null;

  const placed = await placements(reader, term.id);
  const rows = await reader.select().from(courseOfferings).where(eq(courseOfferings.termId, term.id)).orderBy(courseOfferings.id);
  const links = rows.length ? await reader.select({ offeringId: teachingGroupOfferings.offeringId, groupId: teachingGroupOfferings.teachingGroupId }).from(teachingGroupOfferings).where(inArray(teachingGroupOfferings.offeringId, rows.map(row => row.id))).orderBy(teachingGroupOfferings.id) : [];
  const groupsByOffering = new Map<number, number>();
  for (const link of links) groupsByOffering.set(link.offeringId, (groupsByOffering.get(link.offeringId) ?? 0) + 1);
  const catalog = await reader.select().from(courses).orderBy(courses.code, courses.id);
  const courseById = new Map(catalog.map(course => [course.id, courseView(course)]));
  const lite = new Map<number, OfferingCourse>(catalog.map(course => [course.id, { id: course.id, code: course.code, isActive: course.isActive, semester: course.semester }]));

  const sourcePlaced = source ? await placements(reader, source.id) : [];
  const sourceRows = source ? await reader.select().from(courseOfferings).where(eq(courseOfferings.termId, source.id)).orderBy(courseOfferings.id) : [];
  const sourceCohorts: OfferingCohort[] = sourcePlaced.map(({ b, p }) => ({ batchId: b.id, stream: b.stream, label: b.label, semester: p.semester }));
  const sourceFacts: OfferingFact[] = sourceRows.map(row => ({ id: row.id, courseId: row.courseId, batchId: row.batchId, status: row.status }));
  const basis = source ? slotBasis(sourceCohorts, sourceFacts) : new Map();

  // Legacy rows may reference a cohort without a placement in this term; show them read-only.
  const orphanIds = [...new Set(rows.map(row => row.batchId))].filter(id => !placed.some(({ b }) => b.id === id));
  const orphans = orphanIds.length ? await reader.select().from(batches).where(inArray(batches.id, orphanIds)).orderBy(batches.sortOrder, batches.stream, batches.label, batches.id) : [];
  const cohortRows = [...placed.map(({ b, p }) => ({ b, semester: p.semester as number | null })), ...orphans.map(b => ({ b, semester: null as number | null }))];

  const cohorts: OfferingCohortView[] = cohortRows.map(({ b, semester }) => {
    const here = rows.filter(row => row.batchId === b.id);
    const facts: OfferingFact[] = here.map(row => ({ id: row.id, courseId: row.courseId, batchId: row.batchId, status: row.status }));
    const slot = semester == null ? null : basis.get(slotKey({ stream: b.stream, semester })) ?? null;
    const comparison = compareCohort(slot, facts);
    const offerings = here.map(row => ({ id: row.id, course: courseById.get(row.courseId) ?? unknownCourse(row.courseId), status: row.status, groups: groupsByOffering.get(row.id) ?? 0, comparison: comparison.labels.get(row.id) ?? null }))
      .sort((a, b2) => a.course.code.localeCompare(b2.course.code) || a.id - b2.id);
    const offered = here.filter(row => offeringLive(row.status) || row.status === "completed");
    return {
      batchId: b.id, name: cohortName(b), stream: b.stream, semester, batchStatus: b.status, placed: semester != null,
      fingerprint: hash({ term: [term.id, term.status], batch: [b.id, b.status, semester], offerings: here.map(row => [row.id, row.courseId, row.status, groupsByOffering.get(row.id) ?? 0]) }),
      hasBasis: !!slot, basisCohorts: slot ? slot.cohorts.map(cohortName).sort() : [],
      offerings,
      dropped: comparison.dropped.map(courseId => ({ course: courseById.get(courseId) ?? unknownCourse(courseId), partial: slot!.courses.get(courseId)!.length < slot!.cohorts.length })).sort((a, b2) => a.course.code.localeCompare(b2.course.code)),
      proposal: proposeCohort(slot, facts, lite).map(item => ({ ...item, course: courseById.get(item.courseId) ?? unknownCourse(item.courseId) })),
      counts: { offered: offered.length, cancelled: here.filter(row => row.status === "cancelled").length, ungrouped: offered.filter(row => !groupsByOffering.get(row.id)).length, ...comparison.counts },
    };
  });
  const sum = (key: "offered" | "carried" | "added" | "dropped" | "changed") => cohorts.reduce((total, cohort) => total + cohort.counts[key], 0);
  return {
    term: { id: term.id, name: term.name, status: term.status }, editable: offeringTermEditable(term.status),
    sources: sources.map(candidate => ({ id: candidate.id, name: candidate.name, status: candidate.status })), source: source ? { id: source.id, name: source.name, status: source.status } : null, preparedFromId,
    cohorts, courses: catalog.map(courseView),
    // Binds a reviewed start to the source basis, destination placements/offerings and course availability.
    startFingerprint: hash({ term: [term.id, term.status], source: source?.id ?? null, sourceCohorts, sourceFacts, cohorts: cohorts.map(cohort => [cohort.batchId, cohort.batchStatus, cohort.semester, cohort.offerings.map(row => [row.id, row.course.id, row.status])]), active: catalog.map(course => [course.id, course.isActive]) }),
    totals: { offered: sum("offered"), carried: sum("carried"), added: sum("added"), dropped: sum("dropped"), changed: sum("changed"), notStarted: cohorts.filter(cohort => cohort.placed && !cohort.offerings.length).length },
  };
}

const STALE = "These offerings changed since you opened this page. Review the current list before saving.";
const reasonError = { reason: ["Use 1–300 plain-text characters without personal/student details."] };

async function audit(tx: OfferingTx, actor: Actor, action: string, termId: number, before: unknown, after: unknown, detail: Record<string, unknown>) {
  await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action, entity: "term_offerings", entityId: termId, before, after, detail });
}

/**
 * Standalone transaction only: shared context lock, then this term's row.
 * The shared lock serializes with exclusive catalog, cohort-lifecycle and
 * rollover writers; the row lock serializes offering editors of one term.
 */
export async function changeOfferingsInTransaction(tx: OfferingTx, actor: Actor, raw: Record<string, unknown>, picks: unknown[] = []): Promise<OfferingResult> {
  const [scope] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  if (!hasCapability(actor, "manage_offerings", scope?.id ?? null)) return denied("You do not have permission to manage term offerings.", "forbidden");
  await lockTermContext(tx, "share");
  const command = String(raw.command), termId = offeringInteger(raw.termId);
  if (!["start", "add", "cancel", "restore", "remove"].includes(command)) return invalid("Choose a supported offering action.");
  if (!termId) return invalid("Invalid term. Reload before saving.");
  const [term] = await tx.select().from(academicTerms).where(eq(academicTerms.id, termId)).for("update");
  if (!term) return stale("This academic term no longer exists.", "missing");
  if (!offeringTermEditable(term.status)) return conflicted("This term's offerings are read-only.", [{ severity: "blocker", title: "Term is not draft or active", detail: `${term.name} is ${term.status}. Its offerings are kept for reference and cannot be changed.` }]);
  const requestedSource = raw.sourceId == null || raw.sourceId === "" ? null : offeringInteger(raw.sourceId);
  if (raw.sourceId != null && raw.sourceId !== "" && !requestedSource) return invalid("Invalid source term. Reload before saving.");
  const view = (await termOfferings(tx, term.id, requestedSource))!;
  const reason = offeringReason(raw.reason);

  if (command === "start") {
    if (!view.source || requestedSource !== view.source.id) return invalid("Choose an earlier active or completed term to copy from.", { sourceId: ["This term cannot be used as the source."] });
    const chosen = picks.map(parsePick);
    if (!chosen.length || chosen.some(pick => !pick)) return invalid("Tick at least one course to offer.", { pick: ["Choose the courses to create."] });
    const unique = new Map(chosen.map(pick => [`${pick!.batchId}:${pick!.courseId}`, pick!]));
    if (raw.fingerprint !== view.startFingerprint) return { ...stale(STALE), fingerprint: view.startFingerprint };
    for (const pick of unique.values()) {
      const cohort = view.cohorts.find(candidate => candidate.batchId === pick.batchId);
      const item = cohort?.proposal.find(candidate => candidate.courseId === pick.courseId);
      if (!cohort || !cohort.placed || cohort.batchStatus !== "active" || !item?.selectable) return invalid("One of the ticked courses can no longer be offered. Review the current list.", { pick: ["Review the proposed courses."] });
    }
    if (!reason) return invalid("Enter a reason for this start.", reasonError);
    const status = newOfferingStatus(term.status), values = [...unique.values()];
    const created = await tx.insert(courseOfferings).values(values.map(pick => ({ termId: term.id, batchId: pick.batchId, courseId: pick.courseId, status }))).returning();
    const cohortCount = new Set(values.map(pick => pick.batchId)).size;
    await audit(tx, actor, "term_offerings.start", term.id, null, { created: created.length, cohorts: cohortCount, status }, { reason, sourceTermId: view.source.id, sourceTerm: view.source.name, offerings: created.map(row => ({ id: row.id, cohort: view.cohorts.find(cohort => cohort.batchId === row.batchId)!.name, course: view.courses.find(course => course.id === row.courseId)!.code })) });
    return succeeded(`${created.length} offering${created.length === 1 ? "" : "s"} created for ${cohortCount} cohort${cohortCount === 1 ? "" : "s"}. No class group, teacher or timetable was created.`, { entityId: term.id });
  }

  if (command === "add") {
    const batchId = offeringInteger(raw.batchId), courseId = offeringInteger(raw.courseId);
    if (!batchId || !courseId) return invalid("Choose a cohort and a course.", { ...(batchId ? {} : { batchId: ["Choose a cohort."] }), ...(courseId ? {} : { courseId: ["Choose a course."] }) });
    const cohort = view.cohorts.find(candidate => candidate.batchId === batchId);
    if (!cohort || !cohort.placed) return invalid("This cohort has no placement in this term.", { batchId: ["Choose a cohort placed in this term."] });
    if (cohort.batchStatus !== "active") return invalid("This cohort is not active.", { batchId: ["Only active cohorts can be offered courses."] });
    const course = view.courses.find(candidate => candidate.id === courseId);
    if (!course) return invalid("This course no longer exists.", { courseId: ["Choose a catalog course."] });
    if (!course.isActive) return invalid("This course is inactive and cannot be offered.", { courseId: ["Reactivate it in the catalog first, or choose another course."] });
    if (raw.fingerprint !== cohort.fingerprint) return { ...stale(STALE), fingerprint: cohort.fingerprint };
    const existing = cohort.offerings.find(row => row.course.id === courseId);
    if (existing && existing.status !== "cancelled") return invalid(`${course.code} is already offered to ${cohort.name} this term.`, { courseId: ["Already offered."] });
    const outOfSemester = course.semester !== cohort.semester;
    if (outOfSemester && raw.acknowledge !== "on") return invalid(`${course.code} is a semester ${course.semester} course; ${cohort.name} is in semester ${cohort.semester} this term. Tick the confirmation to offer it anyway.`, { acknowledge: ["Confirm this out-of-semester offering."] });
    if (outOfSemester && !reason) return invalid("Enter a reason for offering this course outside its curriculum semester.", reasonError);
    if (raw.reason != null && raw.reason !== "" && !reason) return invalid("Check the reason.", reasonError);
    const status = newOfferingStatus(term.status), detail = { reason, cohort: cohort.name, course: course.code, courseId, batchId, outOfSemester };
    if (existing) {
      await tx.update(courseOfferings).set({ status }).where(eq(courseOfferings.id, existing.id));
      await audit(tx, actor, "offering.restore", term.id, { status: "cancelled" }, { status }, { ...detail, offeringId: existing.id });
      return succeeded(`${course.code} was cancelled earlier and has been restored for ${cohort.name}.`, { entityId: existing.id });
    }
    const [created] = await tx.insert(courseOfferings).values({ termId: term.id, batchId, courseId, status }).returning();
    await audit(tx, actor, "offering.create", term.id, null, { status }, { ...detail, offeringId: created.id });
    return succeeded(`${course.code} is now offered to ${cohort.name}. No class group, teacher or timetable was created.`, { entityId: created.id });
  }

  const offeringId = offeringInteger(raw.offeringId);
  if (!offeringId) return invalid("Invalid offering. Reload before saving.");
  const cohort = view.cohorts.find(candidate => candidate.offerings.some(row => row.id === offeringId));
  const row = cohort?.offerings.find(candidate => candidate.id === offeringId);
  if (!cohort || !row) return stale("This offering no longer exists in this term.", "missing");
  if (raw.fingerprint !== cohort.fingerprint) return { ...stale(STALE), fingerprint: cohort.fingerprint };
  const detail = { reason, cohort: cohort.name, course: row.course.code, courseId: row.course.id, batchId: cohort.batchId, offeringId: row.id };
  const linked = () => conflicted("This offering is part of a class group and cannot be changed here.", [{ severity: "blocker", title: "Used by a class group", detail: `${row.course.code} for ${cohort.name} belongs to ${row.groups} class group${row.groups === 1 ? "" : "s"}. Changing who attends a class belongs to the class-group step.` }]);

  if (command === "cancel") {
    if (row.status === "cancelled") return succeeded("Nothing changed.", { entityId: row.id });
    if (!offeringLive(row.status)) return invalid(`An offering marked ${row.status} cannot be cancelled here.`);
    if (row.groups) return linked();
    if (!reason) return invalid("Enter a reason for cancelling.", reasonError);
    await tx.update(courseOfferings).set({ status: "cancelled" }).where(eq(courseOfferings.id, row.id));
    await audit(tx, actor, "offering.cancel", term.id, { status: row.status }, { status: "cancelled" }, detail);
    return succeeded(`${row.course.code} is cancelled for ${cohort.name}. It can be restored.`, { entityId: row.id });
  }
  if (command === "restore") {
    if (offeringLive(row.status)) return succeeded("Nothing changed.", { entityId: row.id });
    if (row.status !== "cancelled") return invalid(`An offering marked ${row.status} cannot be restored here.`);
    if (!row.course.isActive) return invalid(`${row.course.code} is inactive and cannot be offered. Reactivate it in the catalog first.`);
    if (!cohort.placed || cohort.batchStatus !== "active") return invalid(`${cohort.name} is not an active cohort placed in this term.`);
    if (!reason) return invalid("Enter a reason for restoring.", reasonError);
    const status = newOfferingStatus(term.status);
    await tx.update(courseOfferings).set({ status }).where(eq(courseOfferings.id, row.id));
    await audit(tx, actor, "offering.restore", term.id, { status: "cancelled" }, { status }, detail);
    return succeeded(`${row.course.code} is offered to ${cohort.name} again.`, { entityId: row.id });
  }
  // remove
  if (term.status !== "draft") return invalid("Offerings can be removed only while the term is a draft. Cancel it instead.");
  if (row.groups) return linked();
  if (raw.confirmation !== row.course.code) return invalid("Type the course code to confirm removal.", { confirmation: [`Type ${row.course.code} exactly.`] });
  if (!reason) return invalid("Enter a reason for removing.", reasonError);
  await tx.delete(courseOfferings).where(and(eq(courseOfferings.id, row.id), eq(courseOfferings.termId, term.id)));
  await audit(tx, actor, "offering.remove", term.id, { status: row.status }, null, detail);
  return succeeded(`${row.course.code} was removed from ${cohort.name}. The change history keeps this removal.`, { entityId: term.id });
}
