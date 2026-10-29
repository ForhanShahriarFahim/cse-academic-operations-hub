import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { PageHeader, Badge, EmptyNote, Notice } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { can, requireActor } from "@/lib/auth";
import { buttonClass, inputClass } from "@/components/account/styles";
import { projectRoomOccupancy, roomPlanningStamp } from "@/lib/room-occupancy";
export const dynamic = "force-dynamic";
export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; q?: string | string[]; done?: string }> }) {
  const data = await getPortalData();
  const editor = await can(await requireActor(), "manage_rooms");
  const raw = await searchParams;
  const status = typeof raw.status === "string" && ["active", "inactive", "all"].includes(raw.status) ? raw.status : "active";
  const q = typeof raw.q === "string" ? raw.q : Array.isArray(raw.q) ? raw.q.join(", ") : "";
  const query = new URLSearchParams({ status, ...(q ? { q } : {}) });
  const counts = { active: data.rooms.filter((r) => r.isActive).length, inactive: data.rooms.filter((r) => !r.isActive).length, all: data.rooms.length };
  const rows = data.rooms.filter((r) => (status === "all" || r.isActive === (status === "active")) && `${r.code} ${r.building}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.id - b.id);
  return <div className="min-w-0 break-words">
    <PageHeader context="Internal planning records" title="Rooms & occupancy" description={`Weekly planning pattern · ${data.term.name}. Recorded bookings use interval unions. Utilization is booked within common stream windows / common usable minutes, after each stream's blocking breaks.`} actions={<><PrintButton />{editor && <Link className={`${buttonClass.primary} no-print`} href="/rooms/new">Add room</Link>}</>} />
    <p className="mb-4 text-sm text-muted">Filter: {status} · {q ? `Search: ${q} · ` : ""}{rows.length} of {data.rooms.length} rooms · Generated {roomPlanningStamp()}. Active weekly records combine effective ranges; potential gaps do not resolve actual dates, incomplete OD data or maintenance.</p>
    {raw.done && <Notice tone="success">{raw.done}</Notice>}
    {raw.status && raw.status !== status && <Notice tone="warn">Unknown status filter. Showing Active rooms.</Notice>}
    <form className="no-print ruled mb-4 grid min-w-0 gap-3 rounded-lg p-4 sm:grid-cols-[1fr_2fr_auto]" action="/rooms"><div className="min-w-0"><label htmlFor="rooms-status" className="mb-1 block text-sm font-semibold">Status</label><select id="rooms-status" name="status" defaultValue={status} className={inputClass}><option value="active">Active ({counts.active})</option><option value="inactive">Inactive ({counts.inactive})</option><option value="all">All ({counts.all})</option></select></div><div className="min-w-0"><label htmlFor="rooms-search" className="mb-1 block text-sm font-semibold">Code or building</label><input id="rooms-search" name="q" defaultValue={q} className={inputClass} /></div><button type="submit" className={`${buttonClass.secondary} self-end`}>Apply filters</button></form>
    {!rows.length && <EmptyNote>{data.rooms.length ? "No rooms match these filters. Change status or clear the search." : "No rooms are recorded yet. An editor can add the room directory."}</EmptyNote>}
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((room) => {
      const p = projectRoomOccupancy(data, room);
      return <article key={room.id} className="ruled min-w-0 break-words rounded-lg p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-mono text-lg font-bold text-[var(--color-pine)]"><Link href={`/rooms/${room.id}?${query}`} className="underline">{room.code}</Link></h2><Badge tone={room.isActive ? "pine" : "clay"}>{room.isActive ? "Active" : "Inactive"}</Badge></div><p className="mt-1 text-sm">{room.building} · {room.roomType} · {room.capacity ?? "Unknown"} seats</p><p className="mt-1 text-xs text-muted">{room.capabilities.join(", ") || "No capabilities recorded"} · {room.owningDepartmentCode ?? "Owner not recorded"}</p>
        <p className="mt-4 text-sm"><strong>{p.totals.booked} recorded booked min</strong> · {p.eventCount} events</p><p className="mt-1 text-xs">{p.totals.within} booked within / {p.totals.usable} common usable min · {p.utilization == null ? "Not configured" : `${p.utilization}% utilization`}</p><div className="mt-2 h-2 overflow-hidden rounded bg-black/10" aria-hidden="true"><div className="h-full bg-[var(--color-pine)]" style={{ width: `${p.utilization ?? 0}%` }} /></div><p className="mt-2 text-xs text-muted">{p.totals.outside} booked min outside common windows · {p.uncertainty.length} unverified booking records</p>{p.days.some((d) => d.warnings.length) && <p className="mt-2 text-xs">Configuration warnings: see weekly occupancy.</p>}<Link className="no-print mt-4 inline-block text-sm font-semibold underline" href={`/rooms/${room.id}/occupancy?${query}`}>View weekly occupancy</Link>
      </article>;
    })}</div>
  </div>;
}
