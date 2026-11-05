/** BAT-01A pure identity/count rules. No database or framework imports. */
import { isTimeGrid } from "./time-grid";
export type CountStatus = "unknown" | "unverified" | "verified";
export const batchIdentityKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export const batchLabel = (value: string) => value.trim().replace(/\s+/g, " ");
export const batchStates = ["active", "inactive", "graduated"] as const;
export function integerField(value: unknown, min = 1, max = 2147483647): number | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
export function note(value: unknown, limit = 300): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : null;
}
export function parseBatchIdentity(raw: Record<string, unknown>) {
  const errors: Record<string,string[]> = {};
  const label = typeof raw.label === "string" ? batchLabel(raw.label) : "";
  if (!label || label.length > 40 || /[\u0000-\u001f\u007f]/.test(String(raw.label))) errors.label = ["Enter a batch label of 1–40 characters without control characters."];
  if (raw.stream !== "HSC" && raw.stream !== "DIPLOMA") errors.stream = ["Choose HSC or Diploma."];
  const intake = typeof raw.intake === "string" ? raw.intake.trim() : "";
  if (intake.length > 120 || /[\u0000-\u001f\u007f]/.test(intake)) errors.intake = ["Use at most 120 characters without control characters."];
  const sortOrder = integerField(raw.sortOrder, -2147483648);
  if (sortOrder == null) errors.sortOrder = ["Enter a signed 32-bit whole number."];
  if (!note(raw.reason)) errors.reason = ["Enter a reason of 1–300 characters."];
  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, fields: { label, stream: raw.stream as "HSC"|"DIPLOMA", intake: intake || null, sortOrder: sortOrder! } };
}
export function countStatus(value: {studentCount: number|null; countVerifiedAt?: unknown; countVerifiedBy?: number|null}): CountStatus {
  return value.studentCount == null ? "unknown" : value.countVerifiedAt != null && value.countVerifiedBy != null ? "verified" : "unverified";
}
export const countLabel = (status?: CountStatus) => status === "verified" ? "Verified" : status === "unknown" ? "Unknown" : status === "unverified" ? "Estimate — unverified" : "Legacy confidence not stored";
export function lifecycleTarget(state: string, action: string): string | null {
  if (action === "deactivate" && state === "active") return "inactive";
  if (action === "graduate" && ["active","inactive"].includes(state)) return "graduated";
  if (action === "reactivate" && state === "inactive" || action === "restore" && state === "graduated") return "active";
  return null;
}
/** IDs and stream-qualified aliases only. Unknown shapes cannot prove absence. */
export function snapshotBatchEvidence(value: unknown, id: number, aliases: Array<{stream:string;label:string}>): "clear"|"reference"|"uncertain" {
  if (value == null) return "clear";
  if (typeof value !== "object" || Array.isArray(value)) return "uncertain";
  const v = value as Record<string, unknown>;
  if (v.schemaVersion != null && ![2,3,4].includes(v.schemaVersion as number)) return "uncertain";
  if (!Array.isArray(v.meetings) || typeof v.generatedAt !== "string" || !Number.isFinite(Date.parse(v.generatedAt)) || !Number.isInteger(v.versionNumber) || Number(v.versionNumber)<1) return "uncertain";
  if(v.schemaVersion==null){if(typeof v.termName!=="string")return "uncertain";}
  else if(!v.term||typeof v.term!=="object"||!Array.isArray(v.batches)||!Array.isArray(v.breaks)||!Array.isArray(v.issues)||!Array.isArray(v.externalCommitments))return "uncertain";
  if((v.schemaVersion===3||v.schemaVersion===4)&&(!v.metadata||typeof v.metadata!=="object"))return "uncertain";
  if(v.schemaVersion===4&&!isTimeGrid(v.timeGrid))return "uncertain";
  let uncertain = false;
  const ref = (item: unknown, audience = false) => {
    if (!item || typeof item !== "object") { uncertain = true; return false; }
    const row = item as Record<string,unknown>;
    const key = audience ? row.batchId : row.id, label = audience ? row.batchLabel : row.label;
    if (key === id || typeof label === "string" && aliases.some(a=>a.stream===row.stream && batchIdentityKey(a.label)===batchIdentityKey(label))) return true;
    if (!Number.isInteger(key) || typeof label !== "string" || !["HSC","DIPLOMA"].includes(String(row.stream))) uncertain = true;
    return false;
  };
  if (v.batches != null && !Array.isArray(v.batches)) return "uncertain";
  for (const b of Array.isArray(v.batches)?v.batches:[]) if (ref(b)) return "reference";
  for (const m of v.meetings) {
    if (!m || typeof m !== "object" || !Array.isArray(m.audiences)) { uncertain = true; continue; }
    for (const a of m.audiences) if (ref(a,true)) return "reference";
  }
  // Metadata can retain CR-only cohort references, even when no class is present.
  if (v.metadata && typeof v.metadata === "object") {
    const reps=(v.metadata as Record<string,unknown>).classRepresentatives;
    if (reps != null && !Array.isArray(reps)) uncertain=true;
    for (const r of Array.isArray(reps)?reps:[]) {
      if (!r || typeof r.stream!=="string" || typeof r.batchLabel!=="string") uncertain=true;
      else if (aliases.some(a=>a.stream===r.stream&&batchIdentityKey(a.label)===batchIdentityKey(r.batchLabel))) return "reference";
    }
  }
  return uncertain ? "uncertain" : "clear";
}
