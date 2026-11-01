/** Generic public copy; no operational diagnostics or term identity. */
export function RoutineUnavailable() {
  return <main className="paper-grain min-h-screen px-4 py-8 print:min-h-0">
    <div className="mx-auto max-w-3xl rounded-lg border border-[var(--color-line)] bg-sheet p-6">
      <p className="text-sm font-semibold">Official Class Routine</p>
      <h1 className="font-display mt-3 text-2xl font-bold">Routine temporarily unavailable</h1>
      <p className="mt-2">The department&apos;s routine is temporarily unavailable. Please check again later.</p>
    </div>
  </main>;
}
