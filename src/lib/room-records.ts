/** ROM-01A (#5): directory rules; no database or framework imports. */
export const ROOM_CAPABILITIES = ["theory", "computer", "microprocessor", "networking", "laboratory"] as const;
export const ROOM_FIELDS = ["code", "building", "roomType", "capabilities", "capacity", "owningDepartmentId", "notes"] as const;
export type RoomField = typeof ROOM_FIELDS[number];
export const ROOM_LABELS: Record<RoomField, string> = {
  code: "Room code", building: "Building", roomType: "Room type", capabilities: "Capabilities",
  capacity: "Seats", owningDepartmentId: "Owning department", notes: "Notes",
};
export interface RoomFields {
  code: string; building: string; roomType: string; capabilities: string[];
  capacity: number | null; owningDepartmentId: number | null; notes: string | null;
}
export type RoomRecord = RoomFields & { id: number; revision: number; isActive: boolean };
export const canonicalRoomCode = (code: string) => code.trim().toUpperCase();
const controlled = (token: string) => (ROOM_CAPABILITIES as readonly string[]).includes(token);
export const legacyCapabilities = (tokens: string[]) => tokens.filter((token) => !controlled(token));
export function protectedRoom(code: string): string[] | null {
  const canonical = canonicalRoomCode(code).replace(/^NB-/, "");
  if (["406", "407", "408"].includes(canonical)) return ["computer", "theory"];
  return canonical === "505" ? ["computer", "microprocessor", "networking", "theory"] : null;
}
export function positiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}
export function normalizeRoom(raw: Record<string, unknown>, departmentIds: ReadonlySet<number>, existing: RoomFields | null = null):
  { ok: true; fields: RoomFields } | { ok: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const fail = (key: RoomField, message: string) => { (errors[key] ??= []).push(message); };
  for (const key of ROOM_FIELDS) {
    if (key !== "capabilities" && key in raw && typeof raw[key] !== "string") fail(key, `Submit ${ROOM_LABELS[key].toLowerCase()} as text.`);
  }
  const text = (key: RoomField) => typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  const code = canonicalRoomCode(text("code"));
  if (code.length > 30 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) fail("code", "Use 1–30 letters or digits, with single hyphens between segments.");
  const building = text("building");
  if (!building || building.length > 80) fail("building", "Enter a building, up to 80 characters.");
  const roomType = text("roomType");
  if (!["classroom", "lab"].includes(roomType)) fail("roomType", "Choose Classroom or Lab.");
  const submitted = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  if (!Array.isArray(raw.capabilities) || submitted.some((token) => typeof token !== "string" || !controlled(token))) {
    fail("capabilities", "Choose only the listed capabilities. Earlier extra capabilities are kept automatically.");
  }
  // Extra tokens are copied exclusively from the stored record, verbatim and in order.
  const capabilities = [...ROOM_CAPABILITIES.filter((token) => submitted.includes(token)), ...legacyCapabilities(existing?.capabilities ?? [])];
  const capacityText = text("capacity");
  const capacity = capacityText ? positiveInteger(capacityText) : null;
  if (capacityText && capacity == null) fail("capacity", "Enter a whole number from 1 to 2,147,483,647, or leave blank for unknown.");
  const ownerText = text("owningDepartmentId");
  const owningDepartmentId = ownerText ? positiveInteger(ownerText) : null;
  if (ownerText && (owningDepartmentId == null || !departmentIds.has(owningDepartmentId))) fail("owningDepartmentId", "Choose an existing department, or leave blank.");
  const notesUntouched = existing != null && raw.notes === (existing.notes ?? "");
  const notes = notesUntouched ? existing!.notes : text("notes") || null;
  if (!notesUntouched && notes && notes.length > 1000) fail("notes", "Keep notes to 1,000 characters.");
  const minima = existing ? protectedRoom(existing.code) : null;
  if (minima) {
    if (code !== canonicalRoomCode(existing!.code)) fail("code", "This source-protected room keeps its code. A correction needs a separate owner decision.");
    if (roomType !== "lab") fail("roomType", "This source-protected room must remain a Lab.");
    if (minima.some((token) => !capabilities.includes(token))) fail("capabilities", `Keep the protected capabilities: ${minima.join(", ")}.`);
  }
  // A rename or creation into a protected identity must also meet its minima.
  const targetMinima = protectedRoom(code);
  if (targetMinima && (roomType !== "lab" || targetMinima.some((token) => !capabilities.includes(token)))) fail("capabilities", `This protected code requires Lab and ${targetMinima.join(", ")}.`);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields: { code, building, roomType, capabilities, capacity, owningDepartmentId, notes } };
}
const comparable = (field: RoomField, value: unknown) => field === "capabilities" && Array.isArray(value)
  ? JSON.stringify([...value].sort()) : JSON.stringify(value ?? null);
export function roomChanges(before: RoomFields, after: RoomFields) {
  const fields = ROOM_FIELDS.filter((field) => comparable(field, before[field]) !== comparable(field, after[field]));
  const pick = (record: RoomFields) => Object.fromEntries(fields.map((field) => [field, record[field]]));
  return { fields, before: pick(before), after: pick(after) };
}
export interface RoomMeetingUse {
  id: number; teachingGroupId: number; termName: string; courseCode: string; courseType: string;
  requiredRoomCapability: string | null; audience: string; audienceSize: number | null;
  dayOfWeek: number; startMinutes: number; endMinutes: number; roomRole: string;
  audienceEvidence?: Array<{ label: string; count: number | null }>;
}
export interface RoomODUse {
  id: number; termName: string; counterpartDepartment: string; kind: string; courseLabel: string | null;
  dayOfWeek?: number | null; startMinutes?: number | null; endMinutes?: number | null; audienceLabel?: string | null;
}
export interface RoomReferences { meetings: RoomMeetingUse[]; externals: RoomODUse[] }
export interface RoomImpactItem { severity: "blocker" | "warning" | "existing"; title: string; detail: string; href: string }
export function roomFit(room: Pick<RoomFields, "roomType" | "capabilities" | "capacity">, use: Pick<RoomMeetingUse, "courseType" | "requiredRoomCapability" | "audienceSize">): string[] {
  const reasons: string[] = [];
  if (use.courseType === "sessional" && room.roomType !== "lab") reasons.push("Sessional requires a Lab");
  if (use.requiredRoomCapability && !room.capabilities.includes(use.requiredRoomCapability)) reasons.push(`Requires ${use.requiredRoomCapability}`);
  if (use.audienceSize != null && room.capacity != null && use.audienceSize > room.capacity) reasons.push(`Audience ${use.audienceSize} exceeds ${room.capacity} seats`);
  return reasons;
}
export function assessRoomEdit(before: RoomFields, after: RoomFields, refs: RoomReferences): RoomImpactItem[] {
  const suitabilityChanged = roomChanges(before, after).fields.some((field) => ["roomType", "capabilities", "capacity"].includes(field));
  const items: RoomImpactItem[] = [];
  for (const use of refs.meetings) {
    const context = `${use.termName} · ${use.courseCode} · ${use.audience} · ${use.roomRole}`;
    const push = (severity: RoomImpactItem["severity"], title: string) => items.push({ severity, title, detail: context, href: "/routine" });
    if (use.courseType === "sessional" && after.roomType !== "lab") push(before.roomType === "lab" ? "blocker" : "existing", "Sessional requires a Lab");
    if (use.requiredRoomCapability && !after.capabilities.includes(use.requiredRoomCapability)) push(before.capabilities.includes(use.requiredRoomCapability) ? "blocker" : "existing", `Requires ${use.requiredRoomCapability}`);
    if (use.audienceSize != null && after.capacity != null && after.capacity < use.audienceSize) {
      const worse = before.capacity == null || before.capacity >= use.audienceSize || after.capacity < before.capacity;
      push(worse ? "blocker" : "existing", `Audience ${use.audienceSize} exceeds ${after.capacity} seats`);
    }
    if (before.capacity != null && after.capacity == null) push("blocker", "Known seats cannot be cleared while an active class uses this room");
    if (suitabilityChanged && (use.audienceSize == null || after.capacity == null)) push("warning", `Fit unverified: ${use.audienceSize == null ? "audience unknown" : "seats unknown"}`);
    if (suitabilityChanged && use.requiredRoomCapability && !controlled(use.requiredRoomCapability)) push("warning", `Specialist requirement outside the controlled vocabulary: ${use.requiredRoomCapability}`);
  }
  if (suitabilityChanged) for (const use of refs.externals) items.push({ severity: "warning", title: "OD suitability unverified", detail: `${use.termName} · ${use.counterpartDepartment} · ${use.courseLabel ?? use.kind} · no enforceable course/headcount evidence`, href: "/od" });
  return items;
}
