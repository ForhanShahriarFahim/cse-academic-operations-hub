"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarCheck,
  Clock3,
  ShieldAlert,
  Users,
  Scale,
  DoorOpen,
  GraduationCap,
  BookOpen,
  ArrowLeftRight,
  ScrollText,
  Globe,
  ListChecks,
  ClipboardCheck,
  ReceiptText,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  required?: string[];
  /** Shown only to accounts linked to a teacher record. */
  linkedTeacher?: boolean;
}

export const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/my-routine", label: "My routine", icon: CalendarCheck, linkedTeacher: true },
    ],
  },
  {
    label: "Routine",
    items: [
      { href: "/routine", label: "Routine builder", icon: CalendarDays },
      { href: "/routine/periods", label: "Days & periods", icon: Clock3 },
      { href: "/conflicts", label: "Validation", icon: ShieldAlert },
      { href: "/publications", label: "Publications", icon: ScrollText, required: ["approve_publication", "manage_routine"] },
    ],
  },
  {
    label: "Planning records",
    items: [
      { href: "/teachers", label: "Teachers", icon: Users },
      { href: "/workload", label: "Workload", icon: Scale },
      { href: "/courses", label: "Courses & offerings", icon: BookOpen },
      { href: "/batches", label: "Batches", icon: GraduationCap },
      { href: "/rooms", label: "Rooms", icon: DoorOpen },
      { href: "/od", label: "External commitments", icon: ArrowLeftRight, required: ["manage_external_commitments"] },
    ],
  },
  {
    label: "Classes",
    items: [
      { href: "/attendance", label: "Attendance", icon: ClipboardCheck, required: ["take_attendance", "manage_rosters"] },
      { href: "/extra-load", label: "Extra class load", icon: ReceiptText, required: ["submit_extra_load", "review_extra_load", "view_payment_reports"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/settings", label: "Decisions & settings", icon: ListChecks, required: ["manage_policy"] },
      { href: "/access", label: "People & access", icon: KeyRound, required: ["manage_users"] },
    ],
  },
];

// The most specific entry wins, so /routine/periods does not also mark the builder.
const allHrefs = () => navGroups.flatMap((group) => group.items.map((item) => item.href));
export const isActive = (href: string, pathname: string) => {
  if (href === "/") return pathname === "/";
  if (!(pathname === href || pathname.startsWith(`${href}/`))) return false;
  return !allHrefs().some((other) => other !== href && other.startsWith(`${href}/`) && (pathname === other || pathname.startsWith(`${other}/`)));
};

/** Label of the navigation entry for the current path, for the narrow top bar. */
export function currentNavLabel(pathname: string): string {
  for (const group of navGroups) {
    for (const item of group.items) if (isActive(item.href, pathname)) return item.label;
  }
  return "Academic Operations";
}

export function SidebarNav({ capabilities, linkedTeacher = false, onNavigate }: { capabilities: string[]; linkedTeacher?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const allowed = (item: NavItem) => (!item.linkedTeacher || linkedTeacher)
    && (!item.required || item.required.some((capability) => capabilities.includes(capability)));
  return (
    <nav aria-label="Main" className="flex-1 px-3 pb-3">
      {navGroups.map((group) => {
        const items = group.items.filter(allowed);
        if (items.length === 0) return null;
        return (
          <div key={group.label ?? "home"}>
            {group.label ? (
              <p className="mx-2 mb-1.5 mt-4 text-[12px] font-semibold text-[#aeb7b1]">{group.label}</p>
            ) : null}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] transition-colors ${
                        active
                          ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-gold)]"
                          : "text-[#d5dbd7] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.8} aria-hidden="true" className={active ? "text-[var(--color-gold)]" : "text-[#aeb7b1]"} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="mx-2 mb-1.5 mt-4 text-[12px] font-semibold text-[#aeb7b1]">Public</p>
      <Link
        href="/public/routine"
        target="_blank"
        className="flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] text-[#d5dbd7] hover:bg-white/5 hover:text-white"
      >
        <Globe size={16} strokeWidth={1.8} aria-hidden="true" className="text-[#aeb7b1]" />
        Public routine
        <span className="sr-only">(opens in a new tab)</span>
        <span aria-hidden="true" className="ml-auto text-[12px] text-[#aeb7b1]">↗</span>
      </Link>
    </nav>
  );
}
