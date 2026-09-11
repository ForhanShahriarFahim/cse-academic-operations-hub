"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
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
} from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/routine", label: "Routine Builder", icon: CalendarDays },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/extra-load", label: "Extra Class Load", icon: ReceiptText },
  { href: "/conflicts", label: "Validation", icon: ShieldAlert },
  { href: "/teachers", label: "Teachers", icon: Users },
  { href: "/workload", label: "Workload", icon: Scale },
  { href: "/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/batches", label: "Batches", icon: GraduationCap },
  { href: "/courses", label: "Courses & Offerings", icon: BookOpen },
  { href: "/od", label: "External / OD", icon: ArrowLeftRight },
  { href: "/publications", label: "Publications", icon: ScrollText },
  { href: "/settings", label: "Decisions & Settings", icon: ListChecks },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
              active
                ? "bg-white/10 text-white shadow-[inset_2px_0_0_var(--color-gold)]"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon
              size={15}
              strokeWidth={1.8}
              className={active ? "text-[var(--color-gold)]" : "text-white/40 group-hover:text-white/70"}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PublicLink() {
  return (
    <Link
      href="/public/routine"
      target="_blank"
      className="mx-3 mb-3 flex items-center gap-2.5 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Globe size={15} strokeWidth={1.8} className="text-[var(--color-gold)]" />
      Public routine viewer
      <span className="ml-auto rounded bg-[var(--color-gold)]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gold)]">
        Live
      </span>
    </Link>
  );
}
