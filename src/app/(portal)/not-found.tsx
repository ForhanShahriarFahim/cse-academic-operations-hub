import Link from "next/link";

export default function PortalNotFound() {
  return (
    <div className="max-w-xl rounded-lg border border-[var(--color-line)] bg-sheet p-5">
      <h1 className="font-display text-[22px] font-semibold leading-snug">That record could not be found</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">It may have been removed, or the link may be out of date. Use the menu to find it again.</p>
      <Link href="/" className="mt-4 inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">Go to dashboard</Link>
    </div>
  );
}
