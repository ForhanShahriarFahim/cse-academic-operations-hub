export const ROLE_CAPABILITIES = {
  system_administrator: ["view_internal_portal", "view_private_contacts", "manage_users", "manage_policy", "manage_routine", "approve_publication", "manage_external_commitments", "run_auto_schedule", "manage_rosters", "take_attendance", "submit_extra_load", "review_extra_load", "view_payment_reports"],
  academic_administrator: ["view_internal_portal", "view_private_contacts", "manage_policy", "manage_rosters", "take_attendance", "review_extra_load", "view_payment_reports"],
  routine_coordinator: ["view_internal_portal", "view_private_contacts", "manage_routine", "manage_external_commitments", "run_auto_schedule"],
  department_approver: ["view_internal_portal", "view_private_contacts", "approve_publication"],
  teacher: ["view_internal_portal", "take_attendance", "submit_extra_load"],
  accounts_officer: ["view_internal_portal", "review_extra_load", "view_payment_reports"],
  read_only_viewer: ["view_internal_portal"],
} as const;

export type Role = keyof typeof ROLE_CAPABILITIES;
export type Capability = (typeof ROLE_CAPABILITIES)[Role][number];
export const ROLES = Object.keys(ROLE_CAPABILITIES) as Role[];

export interface Assignment {
  role: Role;
  departmentId: number | null;
  activeFrom: Date;
  activeTo: Date | null;
}

export interface Actor {
  id: number;
  email: string;
  displayName: string;
  teacherId: number | null;
  assignments: Assignment[];
}

export function isRole(value: string): value is Role {
  return Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, value);
}

export function hasCapability(actor: Actor, capability: Capability, departmentId: number | null, now = new Date()): boolean {
  return actor.assignments.some((assignment) =>
    assignment.activeFrom <= now
    && (assignment.activeTo == null || assignment.activeTo > now)
    && (assignment.departmentId == null || departmentId != null && assignment.departmentId === departmentId)
    && (ROLE_CAPABILITIES[assignment.role] as readonly string[]).includes(capability)
  );
}
