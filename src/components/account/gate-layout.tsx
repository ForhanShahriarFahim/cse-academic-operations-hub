import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";

/** AUTH-02 pages outside the portal frame (sign in, set password): department panel and one card. */
export function GateLayout({ eyebrow, title, intro, sideHeading, sideText, sideFoot, children }: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  sideHeading: string;
  sideText: string;
  sideFoot?: string;
  children: ReactNode;
}) {
  return <div className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)] bg-paper md:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.25fr)] md:grid-rows-1">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside aria-label="About this portal" className="on-ink relative flex flex-col gap-2.5 overflow-hidden bg-[var(--color-ink)] px-4 pb-5 pt-4 text-[#e9ece8] md:gap-7 md:px-12 md:py-11">
      <div>
        <p className="font-display text-[17px] font-semibold leading-tight text-white md:text-[22px]">Pundra Academic Operations</p>
        <p className="mt-0.5 text-[12px] text-[#aeb7b1] md:mt-1 md:text-[13px]">Department of Computer Science &amp; Engineering</p>
      </div>
      <p className="font-display mt-auto hidden max-w-[16ch] text-[30px] font-medium leading-tight text-white md:block">{sideHeading}</p>
      <p className="hidden max-w-[40ch] text-[14px] leading-relaxed text-[#c3cbc6] md:block">{sideText}</p>
      <Link href="/public/routine" className="inline-flex w-fit items-center gap-2 border-b border-[#f0c98a]/40 pb-0.5 text-[13px] font-semibold text-[#f0c98a] md:text-[14px]">
        <CalendarDays size={16} aria-hidden="true" />View the published routine
      </Link>
      {sideFoot ? <p className="hidden text-[12px] text-[#8f9a93] md:block">{sideFoot}</p> : null}
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-16 hidden h-[300px] w-[300px] rounded-full border border-[#f0c98a]/20 shadow-[0_0_0_40px_rgba(240,201,138,.05),0_0_0_80px_rgba(240,201,138,.035)] md:block" />
    </aside>
    <main id="main" tabIndex={-1} className="flex items-start justify-center px-4 pb-10 pt-7 outline-none md:items-center md:px-8 md:py-12">
      <div className="w-full max-w-[420px]">
        <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-gold-text">{eyebrow}</p>
        <h1 className="font-display mb-2 mt-2 text-[27px] font-semibold leading-tight tracking-tight md:text-[32px]">{title}</h1>
        {intro ? <div className="mb-5 text-[14px] text-ink-2">{intro}</div> : null}
        {children}
      </div>
    </main>
  </div>;
}
