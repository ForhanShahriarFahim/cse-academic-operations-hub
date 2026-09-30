import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, XCircle, type LucideIcon } from "lucide-react";

export function PageHeader({
  context,
  title,
  description,
  actions,
}: {
  /** Short orientation line above the title, e.g. "Summer 2026 · Planning records". */
  context?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:mb-3">
      <div className="min-w-0">
        {context ? <p className="text-[12.5px] text-muted print:hidden">{context}</p> : null}
        <h1 className="font-display mt-0.5 text-[25px] font-semibold leading-tight tracking-tight sm:text-[29px] print:text-[16pt]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-2 print:hidden">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "pine" | "gold" | "clay" | "neutral" | "sage";

const toneClasses: Record<Tone, string> = {
  pine: "bg-pine-tint text-[var(--color-pine)] border-[var(--color-pine)]/25",
  gold: "bg-gold-tint text-gold-text border-[var(--color-gold)]/35",
  clay: "bg-clay-tint text-[var(--color-clay)] border-[var(--color-clay)]/30",
  neutral: "bg-wash text-ink-2 border-[var(--color-line)]",
  sage: "bg-[var(--color-sage)] text-[var(--color-pine)] border-[var(--color-moss)]/30",
};

/** Compact label for a category or a status already stated in words. Sentence case, never truncated. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block max-w-full rounded-[10px] border px-2 py-px text-[11.5px] font-medium leading-[18px] first-letter:uppercase ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export type StatusTone = "ok" | "warn" | "block" | "pending" | "muted";

const statusStyle: Record<StatusTone, { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-[var(--color-pine)]" },
  warn: { icon: AlertTriangle, className: "text-gold-text" },
  block: { icon: XCircle, className: "text-[var(--color-clay)]" },
  pending: { icon: CircleDashed, className: "text-ink-2" },
  muted: { icon: Info, className: "text-muted font-normal" },
};

/** Status as icon + word + colour, so meaning never depends on colour alone. */
export function StatusText({ tone, children, className = "" }: { tone: StatusTone; children: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = statusStyle[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold ${toneClass} ${className}`}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span>{children}</span>
    </span>
  );
}

/** One figure in a ruled row. Tone adds a status icon and word, not just colour. */
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
  const valueClass = tone === "bad" ? "text-[var(--color-clay)]" : tone === "warn" ? "text-gold-text" : "";
  const statusTone: StatusTone | null = tone === "bad" ? "block" : tone === "warn" ? "warn" : tone === "good" ? "ok" : null;
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-sheet px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {statusTone ? <StatusIcon tone={statusTone} /> : null}
        {label}
      </p>
      <p className={`font-display tabular mt-1 text-[26px] font-semibold leading-none tracking-tight ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</p> : null}
    </div>
  );
}

function StatusIcon({ tone }: { tone: StatusTone }) {
  const { icon: Icon, className } = statusStyle[tone];
  const word = tone === "block" ? "Needs action" : tone === "warn" ? "Check" : "OK";
  return (
    <span className={`inline-flex ${className}`} title={word}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{word}: </span>
    </span>
  );
}

export function Panel({
  title,
  sub,
  children,
  actions,
  className = "",
  flush = false,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Remove body padding, e.g. for a full-bleed table. */
  flush?: boolean;
}) {
  return (
    <section className={`ruled rounded-lg print:border-0 print:shadow-none ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold tracking-tight">{title}</h2>
            {sub ? <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p> : null}
          </div>
          {actions ? <div className="no-print">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--color-line)] bg-wash px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
      {children}
    </p>
  );
}

const noticeStyle = {
  success: { icon: CheckCircle2, className: "border-[#b9ccb9] bg-pine-tint text-[var(--color-pine)]" },
  info: { icon: Info, className: "border-[var(--color-line)] bg-wash text-ink-2" },
  warn: { icon: AlertTriangle, className: "border-[var(--color-gold)]/40 bg-gold-tint text-gold-text" },
  error: { icon: XCircle, className: "border-[var(--color-clay)]/35 bg-clay-tint text-[var(--color-clay)]" },
} as const;

/**
 * Inline result or state message, placed next to what it reports. Errors are
 * announced assertively; everything else politely.
 */
export function Notice({ tone = "info", title, children, className = "" }: {
  tone?: keyof typeof noticeStyle;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = noticeStyle[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`no-print flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] leading-relaxed ${toneClass} ${className}`}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Wide content that scrolls inside itself instead of widening the page. The
 * region is focusable and named so keyboard users can scroll it.
 */
export function TableRegion({ label, children, className = "", maxHeight }: {
  label: string;
  children: ReactNode;
  className?: string;
  /** e.g. "70vh" to keep the sticky header in view on long ledgers. */
  maxHeight?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`table-region max-w-full overflow-auto print:max-h-none print:overflow-visible ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}
