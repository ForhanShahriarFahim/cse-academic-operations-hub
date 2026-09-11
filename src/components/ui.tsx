import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="micro-label">{kicker}</p>
        <h1 className="font-display mt-1 text-[28px] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#5c675d]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "pine" | "gold" | "clay" | "neutral" | "sage";

const toneClasses: Record<Tone, string> = {
  pine: "bg-[var(--color-pine)]/10 text-[var(--color-pine)] border-[var(--color-pine)]/25",
  gold: "bg-[var(--color-gold)]/10 text-[#8a5d16] border-[var(--color-gold)]/30",
  clay: "bg-[var(--color-clay)]/10 text-[var(--color-clay)] border-[var(--color-clay)]/25",
  neutral: "bg-black/5 text-[#4a544c] border-black/10",
  sage: "bg-[var(--color-sage)] text-[var(--color-pine)] border-[var(--color-moss)]/30",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "warn" | "bad" | "good";
}) {
  const bar =
    tone === "bad" ? "bg-[var(--color-clay)]" :
    tone === "warn" ? "bg-[var(--color-gold)]" :
    tone === "good" ? "bg-[var(--color-pine)]" : "bg-[#1c2f25]";
  return (
    <div className="ruled relative overflow-hidden rounded-lg p-4">
      <div className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="micro-label pl-2">{label}</p>
      <p className="font-display pl-2 mt-1.5 text-[30px] font-semibold leading-none tracking-tight">
        {value}
      </p>
      {sub ? <p className="pl-2 mt-1.5 text-[11.5px] leading-snug text-[#66705f]">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  sub,
  children,
  actions,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ruled rounded-lg ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
            {sub ? <p className="mt-0.5 text-[11.5px] text-[#6b7564]">{sub}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--color-line)] bg-[#faf8f1] px-3 py-2 text-[12px] leading-relaxed text-[#6b7564]">
      {children}
    </p>
  );
}
