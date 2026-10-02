import { ROLE_CAPABILITIES, isRole, type Capability, type Role } from "./policy";

/** AUTH-02 effective-access summary: roles with dates and what they allow, in plain words. */

export const ROLE_LABELS: Record<Role, string> = {
  system_administrator: "System administrator",
  academic_administrator: "Academic administrator",
  routine_coordinator: "Routine coordinator",
  department_approver: "Department approver",
  teacher: "Teacher",
  accounts_officer: "Accounts officer",
  read_only_viewer: "Read-only viewer",
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_internal_portal: "Open the internal portal",
  view_private_contacts: "See private teacher contacts",
  manage_users: "Manage accounts, sign-in and roles",
  manage_teachers: "Add and edit teacher records",
  manage_policy: "Change academic policies and settings",
  manage_routine: "Edit the routine",
  approve_publication: "Approve and publish the routine",
  manage_external_commitments: "Record external commitments",
  run_auto_schedule: "Run the automatic scheduler",
  manage_rosters: "Manage student rosters",
  take_attendance: "Take attendance",
  submit_extra_load: "Submit extra class load",
  review_extra_load: "Review extra class load claims",
  view_payment_reports: "See payment reports",
};

/** Roles whose grants are not narrowed to a teacher's own groups or classes (as in `can`). */
const PRIVILEGED: readonly Role[] = ["system_administrator", "academic_administrator"];

export type RoleState = "current" | "scheduled" | "ended";

export interface AssignmentRow {
  id: number;
  role: string;
  departmentId: number | null;
  activeFrom: Date;
  activeTo: Date | null;
}

export interface RoleEntry extends AssignmentRow {
  role: Role;
  label: string;
  scope: string;
  state: RoleState;
}

export interface CapabilityLine {
  capability: Capability;
  label: string;
  /** Where or for what the permission applies, or null when it needs no qualifier. */
  detail: string | null;
}

export interface AccessSummary {
  roles: RoleEntry[];
  now: CapabilityLine[];
  /** Permissions that scheduled roles add, grouped by the date they start. */
  later: Array<{ from: Date; lines: CapabilityLine[] }>;
}

export interface SummaryWording {
  /** For example "Only for groups you teach". */
  assignedGroups: string;
  /** For example "Only your own classes". */
  ownClasses: string;
}

const DEFAULT_WORDING: SummaryWording = { assignedGroups: "Only for groups they teach", ownClasses: "Only their own classes" };

export function roleState(row: Pick<AssignmentRow, "activeFrom" | "activeTo">, now: Date): RoleState {
  if (row.activeTo != null && row.activeTo <= now) return "ended";
  return row.activeFrom > now ? "scheduled" : "current";
}

function scopeText(role: Role, departmentId: number | null, departments: ReadonlyMap<number, string>): string {
  if (departmentId != null) return departments.get(departmentId) ?? `Department ${departmentId}`;
  return role === "teacher" ? "All departments, for assigned groups" : "All departments";
}

function capabilityLines(entries: RoleEntry[], departments: ReadonlyMap<number, string>, wording: SummaryWording): CapabilityLine[] {
  const lines: CapabilityLine[] = [];
  for (const capability of Object.keys(CAPABILITY_LABELS) as Capability[]) {
    const granting = entries.filter((entry) => (ROLE_CAPABILITIES[entry.role] as readonly string[]).includes(capability));
    if (!granting.length) continue;
    const broad = granting.filter((entry) => PRIVILEGED.includes(entry.role) || !["take_attendance", "submit_extra_load"].includes(capability));
    let detail: string | null;
    if (!broad.length) detail = capability === "take_attendance" ? wording.assignedGroups : wording.ownClasses;
    else if (broad.some((entry) => entry.departmentId == null)) detail = capability === "view_internal_portal" ? null : "All departments";
    else detail = [...new Set(broad.map((entry) => departments.get(entry.departmentId!) ?? `Department ${entry.departmentId}`))].join(", ");
    lines.push({ capability, label: CAPABILITY_LABELS[capability], detail });
  }
  return lines;
}

export function summarizeAccess(
  rows: AssignmentRow[],
  departments: ReadonlyMap<number, string>,
  now: Date,
  wording: SummaryWording = DEFAULT_WORDING,
): AccessSummary {
  const order: Record<RoleState, number> = { current: 0, scheduled: 1, ended: 2 };
  const roles = rows.filter((row) => isRole(row.role)).map((row): RoleEntry => {
    const role = row.role as Role;
    return { ...row, role, label: ROLE_LABELS[role], scope: scopeText(role, row.departmentId, departments), state: roleState(row, now) };
  }).sort((a, b) => order[a.state] - order[b.state] || a.activeFrom.getTime() - b.activeFrom.getTime() || a.id - b.id);

  const current = roles.filter((entry) => entry.state === "current");
  const nowLines = capabilityLines(current, departments, wording);
  const held = new Set(nowLines.map((line) => `${line.capability}|${line.detail}`));
  const later: AccessSummary["later"] = [];
  const starts = [...new Set(roles.filter((entry) => entry.state === "scheduled").map((entry) => entry.activeFrom.getTime()))].sort((a, b) => a - b);
  for (const start of starts) {
    const from = new Date(start);
    const inForce = roles.filter((entry) => entry.state !== "ended" && entry.activeFrom <= from && (entry.activeTo == null || entry.activeTo > from));
    const added = capabilityLines(inForce, departments, wording).filter((line) => !held.has(`${line.capability}|${line.detail}`));
    for (const line of added) held.add(`${line.capability}|${line.detail}`);
    if (added.length) later.push({ from, lines: added });
  }
  return { roles, now: nowLines, later };
}
