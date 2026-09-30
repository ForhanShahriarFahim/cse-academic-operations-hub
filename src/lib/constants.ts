/**
 * Institution configuration — values read from the corrected v2.0 spec.
 *
 * Items marked provisional are pending institutional decisions (spec §31)
 * and are displayed as such in the UI. Periods, teaching days and breaks are
 * term data (RUT-04, `src/lib/time-grid.ts`), not constants.
 */

export const INSTITUTION = {
  universityName: "Pundra University of Science & Technology",
  departmentName: "Department of Computer Science & Engineering",
  programme: "B.Sc. in CSE",
  // Branding acronym pending confirmation — do not print "PUST" as official.
  acronymProvisional: "PUST (provisional)",
  timeZone: "Asia/Dhaka",
} as const;

export const TERM = {
  name: "Summer 2026",
  academicYear: 2026,
  startDate: "2026-07-19",
  endDate: "2026-11-30",
  effectiveFrom: "2026-08-14", // printed effective date from supplied routine
} as const;

export { STREAMS, type Stream } from "./time-grid";

/** Advisory threshold for workload units (configurable; no universal 18 max). */
export const WORKLOAD_ADVISORY_UNITS = 15;
