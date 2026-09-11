import Link from "next/link";
import { Landmark } from "lucide-react";
import { SidebarNav, PublicLink } from "@/components/nav";
import { getActiveTerm } from "@/lib/data";
import { TERM } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let termName: string = TERM.name;
  try {
    const term = await getActiveTerm();
    termName = term.name;
  } catch {
    // DB not seeded yet — pages render the setup notice.
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col bg-[var(--color-ink)]">
        <div className="border-b border-white/10 px-4 py-4">
          <Link href="/" className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
              <Landmark size={17} strokeWidth={1.8} />
            </span>
            <span>
              <span className="font-display block text-[15px] font-semibold leading-tight text-white">
                Pundra Academic Operations
              </span>
              <span className="mt-0.5 block text-[10.5px] tracking-wide text-white/45">
                Department of CSE · Academic Portal
              </span>
            </span>
          </Link>
        </div>
        <SidebarNav />
        <PublicLink />
        <div className="border-t border-white/10 px-4 py-3 text-[10.5px] leading-relaxed text-white/40">
          Term: <span className="font-semibold text-white/70">{termName}</span>
          <br />
          Asia/Dhaka · exact-time validation
        </div>
      </aside>
      <main className="ml-[228px] min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</main>
    </div>
  );
}
