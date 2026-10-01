"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { SidebarNav, currentNavLabel } from "@/components/nav";

interface PortalShellProps {
  capabilities: string[];
  /** The account is linked to a teacher record, so it has a "My routine". */
  linkedTeacher: boolean;
  termName: string;
  publishedVersion: number | null;
  displayName: string;
  roleLabel: string;
  account: ReactNode;
  children: ReactNode;
}

/**
 * Portal chrome. At 1024px and wider the sidebar is always visible; below it
 * becomes a drawer opened from the top bar, with the page behind made inert.
 */
export function PortalShell({ capabilities, linkedTeacher, termName, publishedVersion, displayName, roleLabel, account, children }: PortalShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const termState = publishedVersion == null ? "Draft — not yet published" : `Version ${publishedVersion} published`;

  const restoreFocus = useRef(false);
  const close = (returnFocus = true) => {
    restoreFocus.current = returnFocus;
    setOpen(false);
  };

  // The top bar is inert while the drawer is open, so focus returns only after it re-renders.
  useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    menuButton.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a[aria-current='page'], a")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)] print:!block">
      <a href="#main" className="skip-link">Skip to content</a>

      <header inert={open} className="no-print on-ink sticky top-0 z-30 flex items-center gap-3 bg-[var(--color-ink)] px-3 py-2 text-white lg:hidden">
        <button
          ref={menuButton}
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="portal-navigation"
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-md border border-white/25"
        >
          <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="font-display min-w-0 truncate text-[15px] font-semibold">{currentNavLabel(pathname)}</span>
        <span className="ml-auto shrink-0 text-[12px] text-[#f0c98a]">{termName} · {publishedVersion == null ? "Draft" : `v${publishedVersion}`}</span>
      </header>

      {open ? <div aria-hidden="true" className="no-print fixed inset-0 z-40 bg-[rgba(16,29,22,0.5)] lg:hidden" onClick={() => close()} /> : null}

      <aside
        id="portal-navigation"
        ref={drawer}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Navigation" : "Portal"}
        className={`no-print on-ink fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col overflow-y-auto bg-[var(--color-ink)] text-[#e9ece8] transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-auto lg:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "invisible -translate-x-full lg:visible"
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
          <Link href="/" onClick={() => close(false)} className="block rounded-sm">
            <span className="font-display block text-[16px] font-semibold leading-tight text-white">Pundra Academic Operations</span>
            <span className="mt-0.5 block text-[12px] text-[#aeb7b1]">Department of CSE</span>
          </Link>
          {open ? (
            <button type="button" aria-label="Close navigation" onClick={() => close()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/25 lg:hidden">
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="mx-3 mb-1 rounded-md border border-white/15 px-3 py-2.5 text-[12.5px]">
          <span className="block font-semibold text-white">{termName}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[#f0c98a]">
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${publishedVersion == null ? "bg-[var(--color-gold)]" : "bg-[#7fbf95]"}`} />
            {termState}
          </span>
        </div>
        <SidebarNav capabilities={capabilities} linkedTeacher={linkedTeacher} onNavigate={() => close(false)} />
        <div className="border-t border-white/10 px-4 py-3 text-[12.5px] text-[#aeb7b1]">
          <span className="block truncate font-semibold text-white">{displayName}</span>
          <span className="block truncate">{roleLabel}</span>
          {account}
        </div>
      </aside>

      <main id="main" tabIndex={-1} inert={open} className="min-w-0 px-4 pb-12 pt-5 outline-none sm:px-6 lg:px-9 lg:pt-7 print:p-0">
        {children}
      </main>
    </div>
  );
}
