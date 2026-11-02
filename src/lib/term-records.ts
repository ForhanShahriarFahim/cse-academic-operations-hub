export interface TermFields {
  name: string; academicYear: number; startDate: string; endDate: string; effectiveFrom: string | null;
}
export const POLICY_FIELDS = ["theoryCreditHours", "sessionalCreditHours", "extraLoadThresholdCredits", "extraClassRate", "theoryAttendanceMarks", "sessionalAttendanceMarks"] as const;
export const POLICY_LABELS: Record<typeof POLICY_FIELDS[number], string> = {
  theoryCreditHours: "Theory course credits", sessionalCreditHours: "Sessional course credits",
  extraLoadThresholdCredits: "Extra-load threshold", extraClassRate: "Payment per extra class (Tk)",
  theoryAttendanceMarks: "Theory attendance marks", sessionalAttendanceMarks: "Sessional attendance marks",
};
export function validTermDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1
    && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function termIdentityKey(name: string, year: number) { return `${name.trim().replace(/\s+/g, " ").toLowerCase()}\u0000${year}`; }
export function validateTermFields(input: Record<string, unknown>): { ok: true; fields: TermFields } | { ok: false; errors: Record<string, string[]> } {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const academicYear = Number(input.academicYear);
  const startDate = String(input.startDate ?? ""), endDate = String(input.endDate ?? "");
  const effectiveFrom = String(input.effectiveFrom ?? "").trim() || null;
  const errors: Record<string, string[]> = {};
  if (typeof input.name !== "string" || !name || [...name].length > 120) errors.name = ["Enter a term name of 1–120 characters."];
  if (!Number.isInteger(academicYear) || academicYear < 1 || academicYear > 9999) errors.academicYear = ["Enter an academic year from 1 to 9999."];
  if (!validTermDate(startDate)) errors.startDate = ["Enter a valid start date."];
  if (!validTermDate(endDate) || validTermDate(startDate) && endDate < startDate) errors.endDate = ["Enter a valid end date on or after the start date."];
  if (effectiveFrom && (!validTermDate(effectiveFrom) || effectiveFrom < startDate || effectiveFrom > endDate)) errors.effectiveFrom = ["Use a valid date within the term, or leave it blank."];
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields: { name, academicYear, startDate, endDate, effectiveFrom } };
}
export function validateStartingPolicy(input: Record<string, unknown>) {
  const errors: Record<string, string[]> = {};
  const values = {} as Record<typeof POLICY_FIELDS[number], string>;
  for (const key of POLICY_FIELDS) {
    const text = String(input[key] ?? "").trim();
    const rate = key === "extraClassRate";
    if (!(rate ? /^\d{1,8}(?:\.\d{1,2})?$/ : /^\d{1,3}(?:\.\d)?$/).test(text) || !Number.isFinite(Number(text))) {
      errors[key] = [rate ? "Enter 0–99,999,999.99, with at most two decimal places." : "Enter 0–999.9, with at most one decimal place."];
    } else values[key] = String(Number(text));
  }
  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, values };
}
