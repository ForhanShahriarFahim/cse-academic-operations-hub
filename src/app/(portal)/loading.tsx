/** Quiet placeholder while a portal page loads; the shell stays interactive. */
export default function PortalLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden="true">
        <div className="h-3 w-32 rounded bg-[var(--color-line-soft)]" />
        <div className="mt-2 h-7 w-64 rounded bg-[var(--color-line)]" />
        <div className="mt-3 h-3 w-full max-w-xl rounded bg-[var(--color-line-soft)]" />
        <div className="mt-8 h-72 rounded-lg border border-[var(--color-line)] bg-sheet" />
      </div>
    </div>
  );
}
