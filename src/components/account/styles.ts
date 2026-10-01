/** AUTH-02 account screens: shared class names. A plain module, so server and client components both get the values. */

export const buttonClass = {
  primary: "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--color-pine)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-pine-2)] disabled:cursor-not-allowed disabled:opacity-60",
  secondary: "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium hover:bg-wash disabled:cursor-not-allowed disabled:opacity-60",
  small: "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--color-line)] bg-sheet px-2.5 text-[12.5px] font-medium hover:bg-wash disabled:cursor-not-allowed disabled:opacity-60",
  danger: "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--color-clay)]/40 bg-sheet px-3.5 text-[13.5px] font-medium text-[var(--color-clay)] hover:bg-clay-tint disabled:cursor-not-allowed disabled:opacity-60",
  dangerSmall: "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--color-clay)]/40 bg-sheet px-2.5 text-[12.5px] font-medium text-[var(--color-clay)] hover:bg-clay-tint disabled:cursor-not-allowed disabled:opacity-60",
} as const;

export const inputClass = "min-h-10 w-full rounded-md border border-[#c9c2ae] bg-white px-3 text-[13.5px] text-[var(--color-ink)] aria-[invalid=true]:border-[var(--color-clay)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--color-clay)]";
