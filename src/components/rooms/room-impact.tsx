import Link from "next/link";
import { DAY_SHORT, fmtRange } from "@/lib/time";
import type { RoomImpactItem, RoomReferences } from "@/lib/room-records";

export function RoomImpact({ references, impact }: { references: RoomReferences; impact: RoomImpactItem[] }) {
  return <section className="ruled min-w-0 rounded-lg p-4" aria-label="Assigned use">
    <h2 className="font-display text-lg font-semibold">Assigned use · all terms</h2>
    <p className="mt-1 text-sm text-muted">{references.meetings.length} active classes · {references.externals.length} OD references. Alternatives and segments count too.</p>
    {impact.length > 0 && <ul className="mt-3 grid gap-2 text-sm" aria-live="polite">{impact.map((item, i) => <li key={i} className="rounded border border-[var(--color-line)] bg-wash p-3 break-words">
      <strong>{item.severity === "blocker" ? "Cannot save" : item.severity === "existing" ? "Existing issue remains" : "Acknowledgement required"}: {item.title}</strong>
      <p>{item.detail}</p><Link className="font-semibold underline" href={item.href}>Review {item.href === "/od" ? "OD records" : "routine"}</Link>
    </li>)}</ul>}
    <ul className="mt-3 grid gap-2 text-sm">{references.meetings.map((use) => <li key={use.id} className="border-t border-[var(--color-line-soft)] pt-2 break-words">
      <strong>{use.termName} · {use.courseCode}</strong><p>{use.audience} · {use.audienceSize ?? "unknown"} students · {DAY_SHORT[use.dayOfWeek]} {fmtRange(use.startMinutes, use.endMinutes)} · {use.roomRole}</p>
    </li>)}{references.externals.map((use) => <li key={`od-${use.id}`} className="border-t border-[var(--color-line-soft)] pt-2 break-words"><strong>{use.termName} · {use.counterpartDepartment}</strong><p>OD · {use.courseLabel ?? use.kind} · suitability unverified</p></li>)}</ul>
    {!references.meetings.length && !references.externals.length && <p className="mt-2 text-sm">No assigned use recorded.</p>}
    <p className="mt-3 text-xs text-muted">The routine and OD screens currently show the active term. Use the term and course above to identify older records.</p>
  </section>;
}
