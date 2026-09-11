export interface ExtraLoadPolicy {
  theoryCreditHours: number;
  sessionalCreditHours: number;
  extraLoadThresholdCredits: number;
  extraClassRate: number;
  theoryAttendanceMarks: number;
  sessionalAttendanceMarks: number;
}

export const DEFAULT_ACADEMIC_POLICY: ExtraLoadPolicy = {
  theoryCreditHours: 3,
  sessionalCreditHours: 2,
  extraLoadThresholdCredits: 15,
  extraClassRate: 200,
  theoryAttendanceMarks: 10,
  sessionalAttendanceMarks: 5,
};

export function isExtraLoadEligible(assignedCredits: number, threshold: number) {
  return assignedCredits > threshold;
}

export function paymentForClasses(classCount: number, rate: number, amountOverride?: number | null) {
  return amountOverride == null ? classCount * rate : amountOverride;
}

const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) return `${TENS[Math.floor(value / 10)]}${value % 10 ? `-${ONES[value % 10]}` : ""}`;
  return `${ONES[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underThousand(value % 100)}` : ""}`;
}

/** Bangladesh-friendly amount wording (crore/lakh/thousand). */
export function amountInWords(amount: number): string {
  let value = Math.max(0, Math.round(amount));
  if (value === 0) return "Zero taka only";
  const chunks: string[] = [];
  const units: Array<[number, string]> = [[10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]];
  for (const [size, name] of units) {
    const count = Math.floor(value / size);
    if (count) { chunks.push(`${underThousand(count)} ${name}`); value %= size; }
  }
  if (value) chunks.push(underThousand(value));
  return `${chunks.join(" ")} taka only`;
}
