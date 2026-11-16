/** CRS-01B term-offering rules. No database or framework initialization. */

export const OFFERING_STATUS_LABELS: Record<string, string> = { planned: "Planned", open: "Open", cancelled: "Cancelled", completed: "Completed" };
export const offeringStatusLabel = (status: string) => OFFERING_STATUS_LABELS[status] ?? `${status} (unsupported)`;
/** Planned and open both mean "offered"; a completed offering was offered. */
export const offeringLive = (status: string) => status === "planned" || status === "open";
export const offeringOffered = (status: string) => offeringLive(status) || status === "completed";
export const offeringTermEditable = (status: string) => status === "draft" || status === "active";
export const newOfferingStatus = (termStatus: string) => termStatus === "draft" ? "planned" : "open";

export interface OfferingCohort { batchId: number; stream: string; label: string; semester: number }
export interface OfferingFact { id: number; courseId: number; batchId: number; status: string }
export interface OfferingCourse { id: number; code: string; isActive: boolean; semester: number }
export type OfferingComparison = "carried" | "added" | "changed";
export type ProposalReason = "carried" | "partial" | "existing" | "cancelled_here" | "inactive";
export interface ProposalItem { courseId: number; reason: ProposalReason; selectable: boolean; ticked: boolean; sourceCohorts: string[] }
export interface SlotBasis { cohorts: OfferingCohort[]; courses: Map<number, number[]> }

export const cohortName = (cohort: { stream: string; label: string }) => `${cohort.stream === "DIPLOMA" ? "DIP" : cohort.stream}-${cohort.label}`;
export const slotKey = (cohort: { stream: string; semester: number }) => `${cohort.stream}|${cohort.semester}`;

/**
 * What a source term offered at each stream + curriculum semester. Only known,
 * non-cancelled offerings count; a cohort that sat in the slot without any
 * offering still makes its slot exist and makes every course "partial".
 */
export function slotBasis(cohorts: OfferingCohort[], offerings: OfferingFact[]): Map<string, SlotBasis> {
  const basis = new Map<string, SlotBasis>(), byBatch = new Map(cohorts.map(cohort => [cohort.batchId, cohort]));
  for (const cohort of cohorts) {
    const slot = basis.get(slotKey(cohort)) ?? { cohorts: [], courses: new Map<number, number[]>() };
    slot.cohorts.push(cohort); basis.set(slotKey(cohort), slot);
  }
  for (const offering of offerings) {
    const cohort = byBatch.get(offering.batchId);
    if (!cohort || !offeringOffered(offering.status)) continue;
    const courses = basis.get(slotKey(cohort))!.courses, batches = courses.get(offering.courseId) ?? [];
    if (!batches.includes(offering.batchId)) batches.push(offering.batchId);
    courses.set(offering.courseId, batches);
  }
  return basis;
}

/** Null basis means the source had no cohort in this slot: nothing is proposed. */
export function proposeCohort(basis: SlotBasis | null, here: OfferingFact[], courses: Map<number, OfferingCourse>): ProposalItem[] {
  if (!basis) return [];
  const existing = new Map(here.map(offering => [offering.courseId, offering]));
  const names = new Map(basis.cohorts.map(cohort => [cohort.batchId, cohortName(cohort)]));
  return [...basis.courses.entries()].map(([courseId, batches]) => {
    const course = courses.get(courseId), current = existing.get(courseId);
    const all = batches.length === basis.cohorts.length;
    const reason: ProposalReason = current ? current.status === "cancelled" ? "cancelled_here" : "existing" : !course?.isActive ? "inactive" : all ? "carried" : "partial";
    const selectable = reason === "carried" || reason === "partial";
    return { courseId, reason, selectable, ticked: reason === "carried", sourceCohorts: batches.map(id => names.get(id) ?? `#${id}`).sort() };
  }).sort((a, b) => (courses.get(a.courseId)?.code ?? "").localeCompare(courses.get(b.courseId)?.code ?? "") || a.courseId - b.courseId);
}

/** Live comparison of one cohort against its slot basis. Never stored. */
export function compareCohort(basis: SlotBasis | null, here: OfferingFact[]) {
  const labels = new Map<number, OfferingComparison | null>(), counts = { carried: 0, added: 0, dropped: 0, changed: 0 };
  if (!basis) { for (const offering of here) labels.set(offering.id, null); return { labels, dropped: [] as number[], counts, available: false }; }
  for (const offering of here) {
    const inBasis = basis.courses.has(offering.courseId);
    const label: OfferingComparison | null = offeringOffered(offering.status) ? inBasis ? "carried" : "added" : offering.status === "cancelled" && inBasis ? "changed" : null;
    labels.set(offering.id, label); if (label) counts[label] += 1;
  }
  const present = new Set(here.map(offering => offering.courseId));
  const dropped = [...basis.courses.keys()].filter(courseId => !present.has(courseId));
  counts.dropped = dropped.length;
  return { labels, dropped, counts, available: true };
}

export function offeringInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const number = Number(value); return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}
export function offeringReason(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 300 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
/** A start-step tick is "<batchId>:<courseId>"; anything else is refused. */
export function parsePick(value: unknown): { batchId: number; courseId: number } | null {
  if (typeof value !== "string") return null;
  const parts = value.split(":"); if (parts.length !== 2) return null;
  const batchId = offeringInteger(parts[0]), courseId = offeringInteger(parts[1]);
  return batchId && courseId ? { batchId, courseId } : null;
}
export const OFFERING_COMMANDS = ["start", "add", "cancel", "restore", "remove"] as const;
export type OfferingCommand = typeof OFFERING_COMMANDS[number];
export const OFFERING_ACTION_LABELS: Record<string, string> = { "offering.create": "Offering added", "offering.cancel": "Offering cancelled", "offering.restore": "Offering restored", "offering.remove": "Offering removed", "term_offerings.start": "Started from a previous term" };

export const OFFERING_STATUS_FILTERS = ["all", "offered", "cancelled"] as const;
export const OFFERING_COMPARISON_FILTERS = ["any", "carried", "added", "changed"] as const;
export const OFFERING_COMPARISON_LABELS: Record<OfferingComparison, string> = { carried: "Carried", added: "Added", changed: "Changed" };
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
/** Validated list filters; unknown values fall back to defaults and never reach a query. */
export function offeringFilters(search: Record<string, string | string[] | undefined>) {
  const status = one(search.status), compare = one(search.compare), stream = one(search.stream);
  return {
    q: (one(search.q) ?? "").slice(0, 200),
    stream: stream === "HSC" || stream === "DIPLOMA" ? stream : "all",
    status: (OFFERING_STATUS_FILTERS as readonly string[]).includes(status ?? "") ? status! : "all",
    compare: (OFFERING_COMPARISON_FILTERS as readonly string[]).includes(compare ?? "") ? compare! : "any",
    cohort: offeringInteger(one(search.cohort)),
    source: offeringInteger(one(search.source)),
  };
}
/** Return link that keeps the reader's filters and comparison source. */
export function offeringQuery(search: Record<string, string | string[] | undefined>, extra: Record<string, string> = {}) {
  const filters = offeringFilters(search), query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.stream !== "all") query.set("stream", filters.stream);
  if (filters.status !== "all") query.set("status", filters.status);
  if (filters.compare !== "any") query.set("compare", filters.compare);
  if (filters.cohort) query.set("cohort", String(filters.cohort));
  if (filters.source) query.set("source", String(filters.source));
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : "";
}
