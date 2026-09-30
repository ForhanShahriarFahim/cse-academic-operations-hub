import { getPortalData } from "@/lib/data";
import { fmtRange, DAY_SHORT } from "@/lib/time";
import { PageHeader, Badge, Panel, EmptyNote } from "@/components/ui";
import { Building2, FlaskConical, Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

/** Union of permitted teaching windows minus applicable breaks, in minutes/week. */
function usableWindowMinutes(data: Awaited<ReturnType<typeof getPortalData>>) {
  const byDay = new Map<number, [number, number][]>();
  // Batch-specific overrides should not inflate the institution-wide room
  // denominator; only the stream-wide timetable defines usable capacity.
  for (const w of data.windows.filter((window) => window.batchId == null)) {
    const arr = byDay.get(w.dayOfWeek) ?? [];
    arr.push([w.startMinutes, w.endMinutes]);
    byDay.set(w.dayOfWeek, arr);
  }
  let total = 0;
  for (const [day, ivs] of byDay) {
    // union windows
    ivs.sort((a, b) => a[0] - b[0]);
    let cur: [number, number] | null = null;
    const union: [number, number][] = [];
    for (const [s, e] of ivs) {
      if (!cur || s > cur[1]) { if (cur) union.push(cur); cur = [s, e]; }
      else cur[1] = Math.max(cur[1], e);
    }
    if (cur) union.push(cur);
    let dayMin = union.reduce((sum, [s, e]) => sum + (e - s), 0);
    // subtract any break overlapping the day's windows (breaks are scoped; approximate against union)
    for (const br of data.breaks) {
      if (br.dayOfWeek != null && br.dayOfWeek !== day) continue;
      for (const [s, e] of union) {
        const ov = Math.min(e, br.endMinutes) - Math.max(s, br.startMinutes);
        if (ov > 0) { dayMin -= ov; break; }
      }
    }
    total += dayMin;
  }
  return total;
}

export default async function RoomsPage() {
  const data = await getPortalData();
  const windowMinutes = usableWindowMinutes(data);

  const rows = data.rooms.map((r) => {
    const reserved = data.meetings
      .filter((m) => m.rooms.some((x) => x.id === r.id))
      .reduce((s, m) => s + (m.endMinutes - m.startMinutes), 0);
    const extReserved = data.externals
      .filter((e) => e.roomId === r.id && e.startMinutes != null)
      .reduce((s, e) => s + (e.endMinutes! - e.startMinutes!), 0);
    const meetingCount = data.meetings.filter((m) => m.rooms.some((x) => x.id === r.id)).length;
    return { r, reserved, extReserved, meetingCount, total: reserved + extReserved };
  }).sort((a, b) => b.total - a.total);

  const maxTotal = Math.max(...rows.map((x) => x.total), 1);

  return (
    <div>
      <PageHeader
        context="Planning records"
        title="Rooms & occupancy"
        description={`How much of each room's usable time is booked, out of ${windowMinutes} minutes a week in the permitted class windows (breaks excluded). CSE classes and confirmed bookings by other departments count once per class.`}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ r, reserved, extReserved, meetingCount, total }) => (
          <div key={r.id} className="ruled rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[15px] font-bold text-[var(--color-pine)]">{r.code}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  {r.roomType === "lab" ? <FlaskConical size={11} /> : <Building2 size={11} />}
                  {r.building} · {r.roomType} · seats {r.capacity ?? "unknown"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={r.owningDepartmentCode === "CSE" ? "pine" : "gold"}>
                  {r.owningDepartmentCode === "CSE" ? "CSE" : `${r.owningDepartmentCode} owned`}
                </Badge>
                {!r.isActive && <Badge tone="clay"><Wrench size={9} /> closed</Badge>}
              </div>
            </div>
            {r.capabilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.capabilities.map((capability) => <Badge key={capability} tone="neutral">{capability}</Badge>)}
              </div>
            )}
            <div className="mt-3">
              <div className="flex justify-between text-[10.5px] text-muted">
                <span>{meetingCount} meetings · {Math.round(total)} min/wk{extReserved > 0 ? ` (OD ${extReserved})` : ""}</span>
                <span className="font-mono font-semibold">{windowMinutes ? Math.round((total / windowMinutes) * 100) : 0}%</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="h-full bg-[var(--color-pine)]" style={{ width: `${Math.min(100, (reserved / maxTotal) * 100)}%` }} />
                <div className="h-full bg-[var(--color-gold)]" style={{ width: `${Math.min(100, (extReserved / maxTotal) * 100)}%` }} />
              </div>
              {r.notes && <p className="mt-2 text-[10.5px] leading-snug text-muted">{r.notes}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Panel title="Closures & external bookings" sub="Same-department ownership does not guarantee availability">
          <div className="flex flex-wrap gap-2">
            {data.externals.filter((e) => e.roomId && (e.kind === "room_reservation" || e.kind === "combined")).map((e) => (
              <span key={e.id} className="flex items-center gap-1.5 rounded-full border border-[var(--color-clay)]/25 bg-[var(--color-clay)]/5 px-2.5 py-1 text-[11px] font-medium text-[var(--color-clay)]">
                <Building2 size={11} />
                {e.roomCode} · {e.counterpartDepartment} · {e.dayOfWeek != null ? DAY_SHORT[e.dayOfWeek] : "?"}{" "}
                {e.startMinutes != null ? fmtRange(e.startMinutes, e.endMinutes!) : "time TBD"}
              </span>
            ))}
            {data.externals.filter((e) => e.roomId).length === 0 && (
              <EmptyNote>No external room reservations on record.</EmptyNote>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
