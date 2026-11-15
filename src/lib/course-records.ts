/** CRS-01A catalog rules. No database or framework initialization. */
import { isTimeGrid } from "./time-grid";

export const COURSE_FIELDS = ["code", "title", "credits", "courseType", "owningDepartmentId", "semester", "needsLab", "requiredRoomCapability"] as const;
export type CourseField = typeof COURSE_FIELDS[number];
export const COURSE_LABELS: Record<CourseField, string> = { code: "Code", title: "Title", credits: "Academic credits", courseType: "Type", owningDepartmentId: "Owning department", semester: "Curriculum semester", needsLab: "Lab required", requiredRoomCapability: "Specialist requirement" };
export const COURSE_TYPES = { theory: "Theory", sessional: "Sessional", thesis: "Thesis or project" };
export const COURSE_CAPABILITIES = ["computer", "microprocessor", "networking", "laboratory"] as const;
export interface CourseFields { code: string; title: string; credits: string; courseType: string; owningDepartmentId: number | null; semester: number; needsLab: boolean; requiredRoomCapability: string | null }
export interface CourseRecord extends CourseFields { id: number; revision: number; isActive: boolean }
export const courseKey = (value: string) => value.trim().toUpperCase();
export function courseReturnQuery(search: { q?: string; status?: string }) {
  const query = new URLSearchParams();
  if (typeof search.q === "string") query.set("q", search.q.slice(0, 200));
  if (typeof search.status === "string" && ["active", "inactive", "all"].includes(search.status)) query.set("status", search.status);
  return query.toString();
}
export const courseCodeCandidate = (value: string) => courseKey(value).replace(/^([A-Z]{2,8}) ([0-9]{4}(?:\([A-Z]\))?)$/, "$1-$2");
export function courseInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const number = Number(value); return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}
export function courseText(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
export const courseDraft = (record: CourseFields | null): Record<CourseField, string> => ({ code: record?.code ?? "", title: record?.title ?? "", credits: record?.credits ?? "", courseType: record?.courseType ?? "", owningDepartmentId: record ? record.owningDepartmentId == null ? "unknown" : String(record.owningDepartmentId) : "", semester: record ? String(record.semester) : "", needsLab: record?.needsLab ? "true" : "false", requiredRoomCapability: record?.requiredRoomCapability ?? "" });

export function parseCourse(raw: Record<string, unknown>, departments: Set<number>, existing: CourseRecord | null) {
  const errors: Record<string, string[]> = {};
  const previous = courseDraft(existing);
  const values = existing ? Object.fromEntries(COURSE_FIELDS.map(field => [field, existing[field]])) as unknown as CourseFields : {} as CourseFields;
  for (const field of COURSE_FIELDS) {
    // Preserve unsupported imported values verbatim when unchanged; never canonicalize in passing.
    if (existing && raw[field] === previous[field]) continue;
    const value = raw[field];
    if (typeof value !== "string") { errors[field] = ["Submit this field once as text."]; continue; }
    switch (field) {
      case "code": {
        const code = courseCodeCandidate(value);
        if (!/^[A-Z]{2,8}-[0-9]{4}(\([A-Z]\))?$/.test(code) || code.length > 16) errors.code = ["Use 2–8 letters, a hyphen (or one space), four digits and an optional (A) suffix."];
        else values.code = code;
        break;
      }
      case "title": { const title = courseText(value, 200); if (!title) errors.title = ["Enter a plain-text title of 1–200 characters."]; else values.title = title; break; }
      case "credits": {
        if (!/^[0-9]+(\.[0-9])?$/.test(value) || Number(value) <= 0 || Number(value) > 999.9) errors.credits = ["Use a decimal greater than 0 and at most 999.9, with at most one decimal place."];
        else values.credits = Number(value).toFixed(1);
        break;
      }
      case "courseType": if (!Object.hasOwn(COURSE_TYPES, value)) errors.courseType = ["Choose Theory, Sessional or Thesis or project."]; else values.courseType = value; break;
      case "owningDepartmentId": { const id = courseInteger(value); if (value === "unknown") values.owningDepartmentId = null; else if (id && departments.has(id)) values.owningDepartmentId = id; else errors.owningDepartmentId = ["Deliberately choose an existing department or Unknown."]; break; }
      case "semester": { const semester = courseInteger(value); if (!semester || semester > 8) errors.semester = ["Choose curriculum semester 1–8."]; else values.semester = semester; break; }
      case "requiredRoomCapability": if (value === "") values.requiredRoomCapability = null; else if ((COURSE_CAPABILITIES as readonly string[]).includes(value)) values.requiredRoomCapability = value; else errors.requiredRoomCapability = ["Choose a supported specialist requirement or None."]; break;
      case "needsLab": if (!["true", "false"].includes(value)) errors.needsLab = ["Invalid lab flag."]; else values.needsLab = value === "true"; break;
    }
  }
  const changedAcademic = !existing || COURSE_FIELDS.some(field => field !== "title" && values[field] !== existing[field]);
  if (changedAcademic && Object.hasOwn(COURSE_TYPES, values.courseType) && values.needsLab !== (values.courseType === "sessional")) errors.needsLab = ["Sessional requires Lab; Theory and Thesis or project do not set the standalone Lab flag."];
  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, fields: values };
}

/** Supported snapshot shapes only. Reference and uncertainty are independent facts. */
export function snapshotCourseEvidence(value: unknown, id: number, aliases: string[]): { reference: boolean; uncertain: boolean } {
  if (value == null) return { reference: false, uncertain: false };
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!object(value)) return { reference: false, uncertain: true };
  const v = value;
  let uncertain = !Array.isArray(v.meetings) || typeof v.generatedAt !== "string" || !Number.isFinite(Date.parse(v.generatedAt)) || !Number.isInteger(v.versionNumber) || Number(v.versionNumber) < 1;
  if (v.schemaVersion == null) uncertain ||= typeof v.termName !== "string";
  else {
    uncertain ||= ![2, 3, 4].includes(Number(v.schemaVersion)) || typeof v.schemaVersion !== "number" || !object(v.term) || !Array.isArray(v.batches) || !Array.isArray(v.breaks) || !Array.isArray(v.issues) || !Array.isArray(v.externalCommitments);
    if (v.schemaVersion === 3 || v.schemaVersion === 4) uncertain ||= !object(v.metadata) || !Array.isArray(v.metadata.courses);
    if (v.schemaVersion === 4) uncertain ||= !isTimeGrid(v.timeGrid);
  }
  let reference = false;
  const inspect = (row: unknown, metadata: boolean) => {
    if (!object(row)) { uncertain = true; return; }
    const code = metadata ? row.code : row.courseCode;
    const key = row.courseId ?? (metadata ? row.id : undefined);
    if (key != null && (!Number.isSafeInteger(key) || Number(key) <= 0)) uncertain = true;
    if (typeof code !== "string" || !code.trim()) uncertain = true;
    if (key === id || typeof code === "string" && aliases.some(alias => courseKey(alias) === courseKey(code))) reference = true;
  };
  for (const row of Array.isArray(v.meetings) ? v.meetings : []) inspect(row, false);
  if (object(v.metadata)) {
    if (!Array.isArray(v.metadata.courses)) uncertain = true;
    for (const row of Array.isArray(v.metadata.courses) ? v.metadata.courses : []) inspect(row, true);
  }
  return { reference, uncertain };
}
