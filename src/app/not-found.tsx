import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md rounded-lg border border-[var(--color-line)] bg-sheet p-6">
        <p className="text-[12.5px] text-muted">Pundra Academic Operations</p>
        <h1 className="font-display mt-1 text-[24px] font-semibold leading-snug">This page does not exist</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Check the address, or continue from one of these pages.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="inline-flex min-h-9 items-center rounded-md bg-[var(--color-pine)] px-4 text-[13.5px] font-semibold text-white">Portal dashboard</Link>
          <Link href="/public/routine" className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">Public routine</Link>
        </div>
      </div>
    </main>
  );
}
