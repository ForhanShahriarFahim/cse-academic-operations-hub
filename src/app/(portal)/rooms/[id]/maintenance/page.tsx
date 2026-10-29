import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoomRecord, requireRoomEditor } from "@/lib/room-data";
import { getRoomMaintenance, getMaintenanceForEdit } from "@/lib/room-maintenance-data";
import { can, requireActor } from "@/lib/auth";
import { positiveInteger } from "@/lib/room-records";
import { dhakaToday } from "@/lib/room-lifecycle";
import { DAY_NAMES, fmtRange } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { MaintenanceForm } from "@/components/rooms/maintenance-form";
export const dynamic = "force-dynamic";
export default async function MaintenancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; edit?: string; cancel?: string; add?: string }> }) {
  const { id } = await params, query = await searchParams;
  const room = await getRoomRecord(id); if (!room) notFound();
  const editor = await can(await requireActor(), "manage_rooms");
  const editing = query.edit ?? query.cancel, form = !!editing || query.add === "1";
  if (form) await requireRoomEditor(`/rooms/${id}/maintenance`);
  const entry = editing ? await getMaintenanceForEdit(room.id, positiveInteger(editing) ?? -1) : null;
  if (editing && (!entry || entry.cancelled)) notFound();
  const list = await getRoomMaintenance(room.id, positiveInteger(query.page ?? "1") ?? 1), today = dhakaToday();
  return <div className="room-maintenance mx-auto min-w-0 max-w-[980px] break-words"><Link href={`/rooms/${id}`} className="text-sm font-semibold underline">← Room details</Link><PageHeader context="Internal room planning" title={`${room.code} · maintenance`} description={`${room.isActive ? "Active" : "Inactive"} room · finite inclusive dates in Asia/Dhaka`} actions={editor && !form ? <Link className={buttonClass.primary} href={`/rooms/${id}/maintenance?add=1`}>Add maintenance</Link> : undefined} />
    <p className="text-sm">Outages apply across all terms. Bookings remain recorded; overlapping occurrences block recurring placements and new publications. Public routines retain their saved output.</p>
    {form && <MaintenanceForm key={`${editing ?? "new"}-${query.cancel ?? ""}`} room={room} entry={entry ?? undefined} cancel={!!query.cancel} />}
    <section className="mt-5" aria-label="Maintenance records"><h2 className="font-display text-xl font-semibold">Maintenance records ({list.total})</h2>{!list.total && <p className="ruled mt-3 rounded-lg p-4 text-sm">No maintenance recorded. {editor ? "Add an outage with dates, times and an operational reason." : "Room managers can record an outage here."}</p>}
    <ol className="mt-3 grid gap-3">{list.entries.map((e) => <li key={e.id} className="ruled min-w-0 rounded-lg p-4"><h3 className="font-semibold">#{e.id} · {e.cancelled ? "Cancelled" : e.endDate < today ? "Past" : e.startDate > today ? "Upcoming" : "Current date range"}</h3><p className="mt-1 text-sm">{e.startDate}–{e.endDate} · {e.weekdays.length === 7 ? "All days" : e.weekdays.map((d) => DAY_NAMES[d]).join(", ")} · {fmtRange(e.startMinutes, e.endMinutes)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{e.reason}</p><p className="mt-1 text-xs text-muted">Revision {e.revision}. Room status is independent of this record.</p>{editor && !e.cancelled && <div className="mt-3 flex flex-wrap gap-2"><Link href={`/rooms/${id}/maintenance?edit=${e.id}`} className={buttonClass.secondary}>Correct #{e.id}</Link><Link href={`/rooms/${id}/maintenance?cancel=${e.id}`} className={buttonClass.secondary}>Cancel #{e.id}</Link></div>}</li>)}</ol>
    {list.last > 1 && <nav aria-label="Maintenance pages" className="mt-4 flex flex-wrap items-center gap-3">{list.page > 1 && <Link className={buttonClass.secondary} href={`/rooms/${id}/maintenance?page=${list.page - 1}`}>Previous</Link>}<span className="text-sm">Page {list.page} of {list.last}</span>{list.page < list.last && <Link className={buttonClass.secondary} href={`/rooms/${id}/maintenance?page=${list.page + 1}`}>Next</Link>}</nav>}
    {editor && <p className="mt-4 text-sm"><Link href={`/rooms/${id}#room-history`} className="underline">Review room change history and correction reasons</Link></p>}</section>
  </div>;
}
